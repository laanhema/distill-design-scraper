import { promises as dns } from "dns";

/**
 * Pre-navigation network-safety check for the URL ingestion seam (`lib/ingest.ts`).
 * Validates the *resolved* IP address, not the literal hostname string, so a
 * DNS-rebinding-style hostname (one that looks public but resolves private)
 * can't slip a headless-browser navigation into an operator's internal network.
 * Fails closed: an unresolvable hostname is rejected, never handed to
 * Playwright's own resolver unchecked.
 *
 * Known limitation (TOCTOU / DNS rebinding): validation resolves via
 * `dns.lookup` at submission time, but Chromium re-resolves independently when
 * it navigates — a rebinding DNS name can answer public here and private
 * there. That gap is out of scope for this in-process guard; the mitigation is
 * network-layer egress filtering (README "Layer 2 — network-restrict the
 * container").
 */

/** Single error type for every rejection reason so callers can key off one `instanceof` check. */
export class UnsafeUrlError extends Error {}

interface Ipv4Range {
  base: number;
  maskBits: number;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = (result << 8) | octet;
  }
  return result >>> 0;
}

function rangeToInt(cidr: string): Ipv4Range {
  const [base, bits] = cidr.split("/");
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) throw new Error(`Invalid CIDR literal: ${cidr}`);
  return { base: baseInt, maskBits: Number(bits) };
}

// Loopback, RFC1918 private ranges, and link-local.
const BLOCKED_IPV4_RANGES: Ipv4Range[] = [
  rangeToInt("127.0.0.0/8"),
  rangeToInt("10.0.0.0/8"),
  rangeToInt("172.16.0.0/12"),
  rangeToInt("192.168.0.0/16"),
  rangeToInt("169.254.0.0/16"),
  // Beyond the literal AC list: "this network" — same class of reserved
  // address as loopback/private, closing an obvious adjacent bypass.
  rangeToInt("0.0.0.0/8"),
  // Carrier-grade NAT shared address space (RFC 6598) — private in practice.
  rangeToInt("100.64.0.0/10"),
  // Multicast (224.0.0.0–239.255.255.255) — never a legitimate scrape target.
  rangeToInt("224.0.0.0/4"),
  // Reserved/future-use (240.0.0.0–255.255.255.255), includes broadcast.
  rangeToInt("240.0.0.0/4"),
];

function isBlockedIpv4Int(ipInt: number): boolean {
  for (const { base, maskBits } of BLOCKED_IPV4_RANGES) {
    const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
    if ((ipInt & mask) === (base & mask)) return true;
  }
  return false;
}

/** Checks a dotted-quad IPv4 address against the blocked-range list via 32-bit integer + mask arithmetic. */
export function isBlockedIpv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false;
  return isBlockedIpv4Int(ipInt);
}

function ipv6ToBigInt(ip: string): bigint | null {
  // Expand `::` shorthand into the full 8-group form first.
  const [head, tail] = ip.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  if (head === undefined && tail === undefined) return null;

  let groups: string[];
  if (ip.includes("::")) {
    const missing = 8 - headGroups.length - tailGroups.length;
    if (missing < 0) return null;
    groups = [...headGroups, ...Array(missing).fill("0"), ...tailGroups];
  } else {
    groups = ip.split(":");
  }
  if (groups.length !== 8) return null;

  let result = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    result = (result << 16n) | BigInt(parseInt(group, 16));
  }
  return result;
}

function extractIpv4Mapped(ip: string): string | null {
  const match = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(ip);
  return match ? match[1] : null;
}

/** Checks an IPv6 address against loopback (`::1`), unique-local (`fc00::/7`), and
 *  link-local (`fe80::/10`) ranges via BigInt-based 128-bit parsing + mask.
 *  Also normalizes IPv4-mapped addresses (`::ffff:0:0/96`) by delegating to
 *  `isBlockedIpv4` on the embedded v4 address — in both the dotted form
 *  (`::ffff:127.0.0.1`, via the regex shortcut) and the hex form
 *  (`::ffff:7f00:1`, via the parsed 128-bit value) — otherwise a mapped
 *  loopback/private target would bypass the v6 checks entirely. */
export function isBlockedIpv6(ip: string): boolean {
  const mapped = extractIpv4Mapped(ip);
  if (mapped) return isBlockedIpv4(mapped);

  if (ip === "::1") return true;

  const ipInt = ipv6ToBigInt(ip);
  if (ipInt === null) return false;

  // IPv4-mapped in hex form (`::ffff:7f00:1`) — the dotted-quad regex above
  // can't see it, but the parsed value identifies `::ffff:0:0/96` regardless
  // of textual spelling; check the embedded v4 address against the v4 ranges.
  if (ipInt >> 32n === 0xffffn) {
    return isBlockedIpv4Int(Number(ipInt & 0xffffffffn));
  }

  // fc00::/7 — unique local addresses.
  const uniqueLocalBase = ipv6ToBigInt("fc00::")!;
  const uniqueLocalMask = ((1n << 128n) - 1n) ^ ((1n << (128n - 7n)) - 1n);
  if ((ipInt & uniqueLocalMask) === (uniqueLocalBase & uniqueLocalMask)) return true;

  // fe80::/10 — link-local, the v6 analogue of 169.254.0.0/16. Not in the
  // AC's literal list but the same intent, so blocked here too.
  const linkLocalBase = ipv6ToBigInt("fe80::")!;
  const linkLocalMask = ((1n << 128n) - 1n) ^ ((1n << (128n - 10n)) - 1n);
  if ((ipInt & linkLocalMask) === (linkLocalBase & linkLocalMask)) return true;

  return false;
}

/** Reads `SSRF_ALLOWLIST_HOSTS` (comma-separated exact hostnames) into a
 *  lower-cased set — a deployer's explicit trust decision to permit an
 *  internal target (e.g. staging), documented behavior rather than a code fix. */
export function parseAllowlist(): Set<string> {
  const raw = process.env.SSRF_ALLOWLIST_HOSTS ?? "";
  return new Set(
    raw
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Throws `UnsafeUrlError` unless `rawUrl` is a public http(s) address safe to
 * navigate a headless browser to. Must be called before any navigation —
 * this is the guard, not a post-hoc check.
 */
export async function assertSafeUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`Invalid URL: must be an http(s) address, got "${rawUrl}".`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(`Invalid URL: must be an http(s) address, got "${rawUrl}".`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (parseAllowlist().has(hostname)) return;

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError(
      `Could not resolve hostname "${hostname}" — refusing to navigate without validating it's safe.`,
    );
  }

  for (const { address, family } of addresses) {
    const blocked = family === 6 ? isBlockedIpv6(address) : isBlockedIpv4(address);
    if (blocked) {
      throw new UnsafeUrlError(
        `Refusing to navigate to "${hostname}": resolves to ${address}, a blocked private/reserved address.`,
      );
    }
  }
}

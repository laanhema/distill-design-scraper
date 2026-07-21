/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright must not be bundled by Next's server compiler — it needs the
  // real node_modules on disk (it spawns a browser binary at runtime).
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;

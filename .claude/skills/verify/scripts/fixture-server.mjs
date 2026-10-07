// Verification scaffolding: serves eval/fixtures/*.html on 127.0.0.1 so the
// app can analyze a known page offline. Started and stopped by verify.sh.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";

const [, , port, dir] = process.argv;

createServer(async (req, res) => {
  const name = basename(new URL(req.url ?? "/", "http://x").pathname);
  try {
    const body = await readFile(join(dir, name));
    res.writeHead(200, { "content-type": name.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(Number(port), "127.0.0.1", () => {
  console.log(`fixture server ready on http://127.0.0.1:${port}/`);
});

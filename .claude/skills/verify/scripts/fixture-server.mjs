// Verification scaffolding: serves eval/fixtures/*.html on 127.0.0.1 so the
// app can analyze a known page offline. Started and stopped by verify.sh.
//
// A second port serves the fixtures' *.css as a second origin with no CORS
// headers, so a page that links one gets a stylesheet whose `.cssRules` throws
// and the app has to refetch it. The token __XO_ORIGIN__ in a served page is
// replaced with that origin. A sheet named *-stalled.css answers the browser's
// own load (Sec-Fetch-Dest: style) and never answers any other request, which
// is how the app's refetch of it looks to a host that has stalled.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";

const [, , port, dir, xoPort] = process.argv;
const XO_ORIGIN = `http://127.0.0.1:${xoPort}`;

function fileName(req) {
  return basename(new URL(req.url ?? "/", "http://x").pathname);
}

createServer(async (req, res) => {
  const name = fileName(req);
  try {
    const body = await readFile(join(dir, name));
    if (name.endsWith(".html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(body.toString("utf8").replaceAll("__XO_ORIGIN__", XO_ORIGIN));
      return;
    }
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(Number(port), "127.0.0.1", () => {
  console.log(`fixture server ready on http://127.0.0.1:${port}/`);
});

createServer(async (req, res) => {
  const name = fileName(req);
  const dest = req.headers["sec-fetch-dest"] ?? "-";
  console.log(`${XO_ORIGIN} ${req.method} /${name} sec-fetch-dest=${dest}`);
  if (!name.endsWith(".css")) return void res.writeHead(404).end("not found");
  if (name.endsWith("-stalled.css") && dest !== "style") return; // never answers
  try {
    const body = await readFile(join(dir, name));
    res.writeHead(200, { "content-type": "text/css; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(Number(xoPort), "127.0.0.1", () => {
  console.log(`second origin ready on ${XO_ORIGIN}/`);
});

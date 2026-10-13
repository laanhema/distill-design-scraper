#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stateFile = path.resolve(__dirname, "../.verify/current.env");

if (fs.existsSync(stateFile)) {
  const content = fs.readFileSync(stateFile, "utf8");
  const pgidMatch = content.match(/APP_PGID=(\d+)/);
  const fixtureMatch = content.match(/FIXTURE_PGID=(\d+)/);
  const appPgid = pgidMatch ? parseInt(pgidMatch[1], 10) : null;
  const fixturePgid = fixtureMatch ? parseInt(fixtureMatch[1], 10) : null;

  const isAlive = (pgid) => {
    if (!pgid) return false;
    try {
      process.kill(-pgid, 0);
      return true;
    } catch {
      return false;
    }
  };

  if (isAlive(appPgid) || isAlive(fixturePgid)) {
    console.error(
      "\n❌ Build blocked: A verify.sh instance is currently running.\n" +
      "Running 'npm run build' or 'npm run check' while Next dev is active corrupts the .next/ build directory.\n" +
      "Run '.claude/skills/verify/scripts/verify.sh down' before building.\n"
    );
    process.exit(1);
  }
}

// Works out which installer engine built each Windows download, so "Install for me" knows
// the right silent switch. It only lists engines found; the switches that ship live in
// catalog.json as `platforms.windows.install`, and each one is reviewed before it goes there.
//
//   1. cd src-tauri && cargo test --lib -- --ignored --nocapture dump_signable_windows_urls
//   2. node scripts/detect-installers.mjs
//
// It never downloads whole installers. Every engine leaves a marker near the front of the file
// (in the PE sections, the manifest or the stub right after the image), so one 6 MB range
// request per file is enough.
import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const HEAD = 6 * 1024 * 1024;

// Checked in order: the first match wins. Burn and Squirrel bundles can embed other engines'
// strings, so they come first.
const ENGINES = [
  ["wix-burn", [".wixburn"]],
  ["squirrel", ["SquirrelSetup", "Squirrel.Windows", "squirrel.windows"]],
  ["inno", ["Inno Setup Setup Data", "JR.Inno.Setup", "Inno Setup"]],
  ["nsis", ["Nullsoft.NSIS", "NullsoftInst", "Nullsoft Install System"]],
  ["installshield", ["InstallShield"]],
  ["advanced-installer", ["Advanced Installer", "Caphyon"]],
  ["7zip-sfx", ["7-Zip SFX", "7zS.sfx", ";!@Install@!UTF-8!"]],
];

async function head(url) {
  const res = await fetch(url, { headers: { Range: `bytes=0-${HEAD - 1}`, "User-Agent": UA }, redirect: "follow" });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf: buf.subarray(0, HEAD) };
}

/** The UAC level the installer's embedded manifest asks for: "requireAdministrator",
 *  "highestAvailable", "asInvoker", or "none" when there's no manifest in the head. */
function uacLevel(buf) {
  const m = buf.toString("latin1").match(/requestedExecutionLevel\s+level\s*=\s*["'](\w+)["']/);
  return m ? m[1] : "none";
}

function detect(buf) {
  const latin = buf.toString("latin1");
  const utf16 = buf.toString("utf16le");
  for (const [engine, markers] of ENGINES) {
    if (markers.some((m) => latin.includes(m) || utf16.includes(m))) return engine;
  }
  return "unknown";
}

const list = JSON.parse(readFileSync(`${ROOT}/src-tauri/target/signable-urls.json`, "utf8"));
const rows = [];
await Promise.all(
  list.map(async ({ appId, filename, url }) => {
    if (filename.endsWith(".msi")) return rows.push([appId, filename, "msi", ""]);
    try {
      const { status, buf } = await head(url);
      rows.push([appId, filename, detect(buf), uacLevel(buf) + (status === 206 ? "" : ` (HTTP ${status})`)]);
    } catch (e) {
      rows.push([appId, filename, "error", String(e.message ?? e)]);
    }
  }),
);
rows.sort((a, b) => a[2].localeCompare(b[2]) || a[0].localeCompare(b[0]));
for (const r of rows) console.log(r[2].padEnd(20), r[0].padEnd(28), r[1].padEnd(36), r[3]);

// Records the SHA-256 of every Specials vault file in `_meta/sha256.json`, inside the vault
// itself. The app downloads that list with the vault listing and deletes any download whose
// hash doesn't match (src-tauri/src/verify.rs).
//
// Run after every upload to Tweaks/:
//   node scripts/update-vault-hashes.mjs
//
// Needs the `r2:` rclone remote. Files already in the list are hashed again only when their size
// changed, so a normal run downloads just the new or replaced files. `--all` rehashes everything.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BUCKET = "r2:postwipe-specials";
const MANIFEST = "_meta/sha256.json";
const rclone = (...args) => execFileSync("rclone", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const listing = JSON.parse(rclone("lsjson", "-R", "--files-only", "--include", "Tweaks/**", BUCKET));
let previous = { files: {} };
if (!process.argv.includes("--all")) {
  try {
    previous = JSON.parse(rclone("cat", `${BUCKET}/${MANIFEST}`));
  } catch {
    // No list yet: everything gets hashed.
  }
}

const files = {};
const toHash = [];
for (const entry of listing) {
  const key = entry.Path;
  const known = previous.files?.[key];
  if (known && known.size === entry.Size) files[key] = known;
  else toHash.push(key);
}

if (toHash.length) {
  console.log(`hashing ${toHash.length} file(s) by streaming them from the vault…`);
  const dir = mkdtempSync(join(tmpdir(), "vault-hashes-"));
  const list = join(dir, "keys.txt");
  writeFileSync(list, toHash.join("\n") + "\n");
  // --download: R2 doesn't store SHA-256 for objects, so rclone streams each file and hashes it.
  const out = rclone("hashsum", "sha256", "--download", "--files-from-raw", list, BUCKET);
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
    if (!m) continue;
    const size = listing.find((e) => e.Path === m[2])?.Size ?? 0;
    files[m[2]] = { sha256: m[1], size };
  }
}

const missing = listing.filter((e) => !files[e.Path]).map((e) => e.Path);
if (missing.length) throw new Error(`no hash for: ${missing.join(", ")}`);

const manifest = { generatedAt: new Date().toISOString(), files };
const out = join(mkdtempSync(join(tmpdir(), "vault-manifest-")), "sha256.json");
writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
// The token can't create buckets, and rclone checks for the bucket before an upload unless told not to.
rclone("copyto", out, `${BUCKET}/${MANIFEST}`, "--s3-no-check-bucket");
console.log(`${Object.keys(files).length} vault files listed in ${MANIFEST} (${toHash.length} newly hashed)`);

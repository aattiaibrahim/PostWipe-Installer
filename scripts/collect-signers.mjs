// Records who signs each Windows installer, into catalog.json's `signer` fields. The app then
// deletes any download signed by someone else (src-tauri/src/verify.rs).
//
//   1. cd src-tauri && cargo test --lib -- --ignored --nocapture dump_signable_windows_urls
//   2. node scripts/collect-signers.mjs            (prints what it found)
//   3. node scripts/collect-signers.mjs --write    (updates catalog/ and public/ catalog.json)
//      node scripts/collect-signers.mjs --check    (weekly CI: exit 1 if a pinned signer changed)
//
// It never downloads whole installers. A Windows executable keeps its Authenticode signature
// in a "certificate table" the PE header points at, so two small HTTP range requests are
// enough: the header, then that table. The signer is the certificate in the signature's
// PKCS#7 bundle that is allowed to sign code.
import { readFileSync, writeFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const WRITE = process.argv.includes("--write");
const CHECK = process.argv.includes("--check");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const CODE_SIGNING = "1.3.6.1.5.5.7.3.3";

async function range(url, start, length) {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${start + length - 1}`, "User-Agent": UA }, redirect: "follow" });
  if (res.status !== 206) {
    await res.body?.cancel();
    throw new Error(`server ignored the range request (HTTP ${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Minimal DER reader: [tag, headerLength, contentLength]. */
function tlv(buf, offset) {
  const tag = buf[offset];
  let len = buf[offset + 1];
  let head = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[offset + 2 + i];
    head = 2 + n;
  }
  return { tag, head, len, start: offset + head, end: offset + head + len };
}

function children(buf, node) {
  const out = [];
  for (let p = node.start; p < node.end; ) {
    const child = tlv(buf, p);
    out.push(child);
    p = child.end;
  }
  return out;
}

/** The certificates inside a PKCS#7 SignedData blob. */
function certificates(pkcs7) {
  const contentInfo = tlv(pkcs7, 0); // SEQUENCE
  const [, explicit] = children(pkcs7, contentInfo); // OID, [0]
  const signedData = tlv(pkcs7, explicit.start); // SEQUENCE
  const certSet = children(pkcs7, signedData).find((c) => c.tag === 0xa0); // [0] IMPLICIT certificates
  if (!certSet) return [];
  return children(pkcs7, certSet)
    .filter((c) => c.tag === 0x30)
    .map((c) => new X509Certificate(pkcs7.subarray(c.start - c.head, c.end)));
}

function fieldsOf(name) {
  return Object.fromEntries(
    name.split("\n").map((line) => {
      const i = line.indexOf("=");
      // Node escapes commas and plus signs in names ("Riot Games\, Inc.").
      return [line.slice(0, i), line.slice(i + 1).replace(/\\(.)/g, "$1")];
    }),
  );
}

/** The organization, except for Certum's individual open-source certificates, whose
 *  organization is the generic "Open Source Developer": there the person's name is the signer. */
function nameOf(cert) {
  const f = fieldsOf(cert.subject);
  if (f.O && f.O !== "Open Source Developer") return f.O;
  return f.CN || f.O || null;
}

async function signerOf(url) {
  const head = await range(url, 0, 4096);
  if (head.readUInt16LE(0) !== 0x5a4d) throw new Error("not a Windows executable");
  const pe = head.readUInt32LE(0x3c);
  if (head.readUInt32LE(pe) !== 0x00004550) throw new Error("no PE header");
  const optional = pe + 24;
  const magic = head.readUInt16LE(optional);
  // Data directory 4 (certificate table): offset 128 in PE32 optional headers, 144 in PE32+.
  const dir = optional + (magic === 0x20b ? 144 : 128);
  const tableOffset = head.readUInt32LE(dir);
  const tableSize = head.readUInt32LE(dir + 4);
  if (!tableOffset || !tableSize) return { unsigned: true };
  const table = await range(url, tableOffset, Math.min(tableSize, 256 * 1024));
  const length = table.readUInt32LE(0);
  const certType = table.readUInt16LE(6);
  if (certType !== 0x0002) throw new Error(`unexpected certificate type ${certType}`);
  const certs = certificates(table.subarray(8, length));
  // Bundles carry CA and timestamping certificates too, and some carry a self-signed test
  // certificate (Firefox's "Dummy"). The signer can sign code, isn't a CA, and was issued by
  // someone else — preferably by a CA that's in the same bundle.
  const candidates = certs.filter((c) => !c.ca && c.issuer !== c.subject && (c.keyUsage ?? []).includes(CODE_SIGNING));
  const leaf = candidates.find((c) => certs.some((ca) => ca.ca && ca.subject === c.issuer)) ?? candidates[0];
  return leaf ? { signer: nameOf(leaf) } : { unsigned: true };
}

const urls = JSON.parse(readFileSync(`${ROOT}src-tauri/target/signable-urls.json`, "utf8"));
const found = {};
for (const { appId, filename, url } of urls) {
  if (!filename.endsWith(".exe")) {
    console.log(`  --   ${appId.padEnd(28)} ${filename} (MSI signatures can't be read by range; checked at download)`);
    continue;
  }
  try {
    const result = await signerOf(url);
    if (result.signer) found[appId] = result.signer;
    console.log(`  ${result.signer ? "ok " : "-- "}  ${appId.padEnd(28)} ${result.signer ?? "not signed"}`);
  } catch (err) {
    console.log(`  ??   ${appId.padEnd(28)} ${err.message}`);
  }
}

console.log(`\n${Object.keys(found).length} of ${urls.length} signers identified`);

if (CHECK) {
  // A vendor renewing its certificate under a new legal name would make the app delete every
  // download of that app, so a changed signer has to surface here before users hit it.
  // Same normalisation as signer_matches in src-tauri/src/verify.rs.
  const SUFFIXES = new Set(["inc", "corp", "corporation", "llc", "ltd", "limited", "gmbh", "co", "sa", "ab", "bv", "oy"]);
  const norm = (s) => s.toLowerCase().replace(/[,."]/g, " ").split(/\s+/).filter((w) => w && !SUFFIXES.has(w)).join(" ");
  const catalog = JSON.parse(readFileSync(`${ROOT}catalog/catalog.json`, "utf8"));
  let changed = 0;
  for (const app of catalog.categories.flatMap((c) => c.apps)) {
    const pinned = app.platforms?.windows?.signer;
    const now = found[app.id];
    if (pinned && now && norm(pinned) !== norm(now)) {
      console.log(`SIGNER CHANGED ${app.id}: catalog expects "${pinned}", installer is now signed by "${now}"`);
      changed++;
    }
  }
  if (changed) process.exit(1);
}
if (WRITE) {
  for (const path of ["catalog/catalog.json", "public/catalog.json"]) {
    const raw = readFileSync(ROOT + path, "utf8");
    const catalog = JSON.parse(raw);
    for (const app of catalog.categories.flatMap((c) => c.apps)) {
      const win = app.platforms?.windows;
      if (win && found[app.id]) win.signer = found[app.id];
    }
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    writeFileSync(ROOT + path, JSON.stringify(catalog, null, 2).replace(/\n/g, eol) + eol);
  }
  console.log("catalog updated");
}

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");

const root = __dirname;
const payloadDir = path.join(root, "payload");
const distDir = path.join(root, "dist");
const chunks = fs.readdirSync(payloadDir)
  .filter((name) => /^0[1-8]\.b64$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(payloadDir, name), "utf8").trim());
if (chunks.length !== 8) throw new Error(`Expected 8 base payload chunks, found ${chunks.length}`);

const compressedBase = Buffer.from(chunks.join(""), "base64");
const original = zlib.brotliDecompressSync(compressedBase).toString("utf8");
const sha256 = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const OLD_SHA256 = "69b3be2d6047b2c604e0a80ccc26438966305feb81eb0a765a6bf214dcea633c";
const NEW_SHA256 = "603e9cc425f88922cf5b9293561bc6ad2e7adbd7dc81a746a404d34099e63222";
if (sha256(original) !== OLD_SHA256) throw new Error("Base payload checksum mismatch; refusing to build");

const patchB64 = fs.readFileSync(path.join(payloadDir, "v3.6.patch.br.b64"), "utf8").trim();
const patchText = zlib.brotliDecompressSync(Buffer.from(patchB64, "base64")).toString("utf8");
function applyUnifiedDiff(sourceText, diffText) {
  const source = sourceText.split("\n");
  const patchLines = diffText.split("\n");
  const out = [];
  let sourceIndex = 0;
  let patchIndex = 0;
  let appliedHunks = 0;
  while (patchIndex < patchLines.length) {
    const header = patchLines[patchIndex];
    if (!header.startsWith("@@ ")) { patchIndex++; continue; }
    const match = header.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (!match) throw new Error(`Unsupported patch hunk header: ${header}`);
    const targetSourceIndex = Number(match[1]) - 1;
    if (targetSourceIndex < sourceIndex || targetSourceIndex > source.length) throw new Error("Patch hunk position is invalid");
    while (sourceIndex < targetSourceIndex) out.push(source[sourceIndex++]);
    patchIndex++;
    while (patchIndex < patchLines.length && !patchLines[patchIndex].startsWith("@@ ") && !patchLines[patchIndex].startsWith("--- ") && !patchLines[patchIndex].startsWith("+++ ")) {
      const line = patchLines[patchIndex++];
      if (!line.length) {
        if (patchIndex >= patchLines.length) break;
        throw new Error("Unexpected empty line inside patch hunk");
      }
      const prefix = line[0];
      const content = line.slice(1);
      if (prefix === " ") {
        if (source[sourceIndex] !== content) throw new Error(`Patch context mismatch at source line ${sourceIndex + 1}`);
        out.push(source[sourceIndex++]);
      } else if (prefix === "-") {
        if (source[sourceIndex] !== content) throw new Error(`Patch removal mismatch at source line ${sourceIndex + 1}`);
        sourceIndex++;
      } else if (prefix === "+") {
        out.push(content);
      } else if (prefix === "\\") {
        // Unified-diff end-of-file marker; no text to apply.
      } else {
        throw new Error(`Unsupported patch line prefix: ${prefix}`);
      }
    }
    appliedHunks++;
  }
  while (sourceIndex < source.length) out.push(source[sourceIndex++]);
  if (!appliedHunks) throw new Error("No patch hunks were applied");
  return out.join("\n");
}
const html = applyUnifiedDiff(original, patchText);
if (sha256(html) !== NEW_SHA256) throw new Error("Patched HTML checksum mismatch; refusing to build");
const compressed = zlib.brotliCompressSync(Buffer.from(html, "utf8"), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, "index.html"), compressed);
for (const file of ["manifest.webmanifest", "icon.svg", "sw.js"]) fs.copyFileSync(path.join(root, file), path.join(distDir, file));
console.log(`NetLab Studio v3.6 prepared; Brotli HTML: ${compressed.byteLength} bytes; patch hunks: verified`);

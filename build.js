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
if (sha256(html) !== NEW_SHA256) throw new Error("Patched v3.6 checksum mismatch; refusing to continue");

const v4Parts = fs.readdirSync(payloadDir)
  .filter((name) => /^v4\.patch\.(?:0[1-4]|05[ab]|06)\.b64$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(payloadDir, name), "utf8").trim());
if (v4Parts.length !== 7) throw new Error(`Expected 7 v4.0 patch segments, found ${v4Parts.length}`);
const v4PatchText = zlib.brotliDecompressSync(Buffer.from(v4Parts.join(""), "base64")).toString("utf8");
const V40_SHA256 = "485cde601120bc6c8547662c1872fef9f8a7769d7e643f133a826a4e9fd46930";
const v4Html = applyUnifiedDiff(html, v4PatchText);
if (sha256(v4Html) !== V40_SHA256) throw new Error("Patched v4.0 checksum mismatch; refusing to publish");
if (!v4Html.includes("NetLab Studio 4.0") || !v4Html.includes("QEMU/KVM") || !v4Html.includes("SIMULATION ONLY")) {
  throw new Error("Required v4.0 virtualization markers are missing");
}

const v41Parts = fs.readdirSync(payloadDir)
  .filter((name) => /^v4\.1\.patch\.\d{2}\.b64$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(payloadDir, name), "utf8").trim());
if (v41Parts.length !== 3) throw new Error(`Expected 3 v4.1 patch chunks, found ${v41Parts.length}`);
const v41PatchText = zlib.brotliDecompressSync(Buffer.from(v41Parts.join(""), "base64")).toString("utf8");
const V41_SHA256 = "fbe2814567d8c88805e093ba3abda1609e9e776f15fe22c6de03aa06c981ccc3";
const v41Html = applyUnifiedDiff(v4Html, v41PatchText);
if (sha256(v41Html) !== V41_SHA256) throw new Error("Patched v4.1 checksum mismatch; refusing to publish");
if (!v41Html.includes("Connect QEMU/KVM backend") || !v41Html.includes("CCNA Tamil playlist roadmap") || !v41Html.includes("Eject installer ISO")) {
  throw new Error("Required v4.1 Windows VM / playlist markers are missing");
}
const htmlBuffer = Buffer.from(v41Html, "utf8");
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, "index.html"), htmlBuffer);
for (const file of ["manifest.webmanifest", "icon.svg", "sw.js"]) fs.copyFileSync(path.join(root, file), path.join(distDir, file));
console.log(`NetLab Studio v4.1 prepared; plain HTML: ${htmlBuffer.byteLength} bytes; v3.5/v3.6/v4.0/v4.1 checksums verified`);

const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const payloadDir = path.join(root, "payload");
const distDir = path.join(root, "dist");

const parts = fs.readdirSync(payloadDir)
  .filter((name) => /^\d{2}\.b64$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(payloadDir, name), "utf8").trim());

if (parts.length !== 8) {
  throw new Error(`Expected 8 payload chunks, found ${parts.length}`);
}
const encoded = parts.join("");
const html = Buffer.from(encoded, "base64");
if (html.byteLength < 50000) {
  throw new Error(`Compressed app payload looks incomplete: ${html.byteLength} bytes`);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, "index.html"), html);
for (const file of ["manifest.webmanifest", "icon.svg", "sw.js"]) {
  fs.copyFileSync(path.join(root, file), path.join(distDir, file));
}
console.log(`NetLab Studio prepared; Brotli HTML: ${html.byteLength} bytes`);

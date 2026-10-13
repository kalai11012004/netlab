const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const vm = require("node:vm");

const root = __dirname;
const distDir = path.join(root, "dist");
const mainFile = path.join(distDir, "index.html");
const buildSource = fs.readFileSync(path.join(root, "build.js"), "utf8");

if (!fs.existsSync(mainFile)) {
  throw new Error("Main NetLab build output is missing; refusing to create a partial release.");
}

// build.js currently writes the eDXC page before it clears dist/. Extract the
// already-authored HTML literal, then restore it after the main build finishes.
const declaration = "const EDXC_MANAGER_HTML = ";
const start = buildSource.indexOf(declaration);
const endMarker = ";\nconst edxcOutDir";
const end = start < 0 ? -1 : buildSource.indexOf(endMarker, start + declaration.length);
if (start < 0 || end < 0) {
  throw new Error("Could not locate the eDXC manager HTML literal in build.js.");
}

const htmlLiteral = buildSource.slice(start + declaration.length, end);
let managerHtml;
try {
  managerHtml = vm.runInNewContext("(" + htmlLiteral + ")", Object.create(null), { timeout: 1000 });
} catch (error) {
  throw new Error("Could not decode eDXC manager HTML: " + error.message);
}
if (typeof managerHtml !== "string" || managerHtml.length < 10000) {
  throw new Error("Decoded eDXC manager HTML is missing or unexpectedly small.");
}

for (const marker of [
  "CCPA control / management",
  "Cross-connect planner",
  "MAP_1",
  "MAP_2",
  "Console access",
  "EDXC Training Console"
]) {
  if (!managerHtml.includes(marker)) {
    throw new Error("eDXC manager validation failed; missing marker: " + marker);
  }
}

const mainHtml = zlib.brotliDecompressSync(fs.readFileSync(mainFile)).toString("utf8");
for (const marker of [
  "ge-vernova-gridcom-edxc-modular-digital-cross-connect",
  "netlabEdxcLaunch",
  'window.open("/edxc/"'
]) {
  if (!mainHtml.includes(marker)) {
    throw new Error("Main workspace validation failed; missing eDXC integration marker: " + marker);
  }
}

const outDir = path.join(distDir, "edxc");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), managerHtml, "utf8");

const written = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
if (written !== managerHtml) {
  throw new Error("eDXC manager output did not round-trip correctly.");
}

console.log(
  "eDXC post-build repair passed: main workspace preserved; /edxc/index.html restored (" +
  Buffer.byteLength(written, "utf8") + " bytes); CCPA, MAP_1/MAP_2 and console markers verified."
);

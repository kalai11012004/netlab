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

// build.js writes the eDXC page before clearing dist/. Decode its authored HTML,
// apply guarded behavioral fixes, then restore it after the main build completes.
const declaration = "const EDXC_MANAGER_HTML = ";
const start = buildSource.indexOf(declaration);
const endMarker = ";" + String.fromCharCode(10) + "const edxcOutDir";
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

const patches = [
  {
    name: "show the CCPA console connector instead of zero traffic ports",
    before: "+(b?b.ports+' lab ports':'Select slot')+",
    after: "+(b?(t==='CCPA'?'Console: DB9 RS-232':b.ports+' lab ports'):'Select slot')+"
  },
  {
    name: "prevent silent card replacement and unsafe CCPA moves",
    before: "$('install').onclick=function(){var s=Number($('target').value),b=$('board').value;if(b==='CCPA')Object.keys(state.slots).forEach(function(k){if(state.slots[k]==='CCPA')delete state.slots[k]});if(b==='CCPA'&&state.slots[s]){var prev=state.slots[s];state.slots[s]='CCPA';var free=Array.from({length:12},function(_,i){return i+1}).find(function(n){return !state.slots[n]});if(free)state.slots[free]=prev}else state.slots[s]=b;selected=s;persist();renderAll();log('Installed '+b+' at logical slot '+s);status('slotMsg','Local inventory changed; no physical card installed.')};",
    after: "$('install').onclick=function(){var s=Number($('target').value),b=$('board').value;if(!Number.isInteger(s)||s<1||s>12||!boards[b])return status('slotMsg','Choose a valid slot and board.',true);var oldController=Object.keys(state.slots).find(function(k){return state.slots[k]==='CCPA'});if(b==='CCPA'){if(oldController&&Number(oldController)!==s&&state.slots[s])return status('slotMsg','Target slot occupied. Choose an empty slot before moving CCPA.',true);if(!oldController&&state.slots[s])return status('slotMsg','Target slot occupied. Choose an empty slot for CCPA.',true);if(oldController&&Number(oldController)!==s)delete state.slots[oldController]}else if(state.slots[s]&&state.slots[s]!==b)return status('slotMsg','Target slot occupied. Remove or move the existing card first.',true);state.slots[s]=b;selected=s;persist();renderAll();log('Installed '+b+' at logical slot '+s);status('slotMsg','Local inventory changed; no physical card installed.')};"
  },
  {
    name: "prevent reuse of an already-mapped cross-connect endpoint",
    before: "if(rows.some(function(x){return x.ds===r.ds&&x.dp===r.dp&&x.dt===r.dt}))return 'Destination timeslot is already occupied.';rows.push(r);",
    after: "if(rows.some(function(x){return (x.ss===r.ss&&x.sp===r.sp&&x.st===r.st)||(x.ds===r.ss&&x.dp===r.sp&&x.dt===r.st)||(x.ss===r.ds&&x.sp===r.dp&&x.st===r.dt)||(x.ds===r.ds&&x.dp===r.dp&&x.dt===r.dt)}))return 'Source or destination timeslot is already occupied.';rows.push(r);"
  }
];

for (const patch of patches) {
  if (!managerHtml.includes(patch.before)) {
    throw new Error("eDXC patch precondition failed (" + patch.name + "); refusing to publish a partial fix.");
  }
  managerHtml = managerHtml.replace(patch.before, patch.after);
}

for (const marker of [
  "CCPA control / management",
  "Console: DB9 RS-232",
  "Target slot occupied",
  "Source or destination timeslot is already occupied",
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
  "eDXC post-build validation passed: workspace preserved; /edxc/index.html restored; " +
  "CCPA console, safe card placement and cross-connect endpoint checks verified."
);

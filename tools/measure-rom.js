/* Measure the CURRENT roms/robbo-sfx2.gb (no rebuild): burst runs + max amp.
 * Usage: node tools/measure-rom.js [frames] */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const Interface = require("C:/dev/AI/robbo-port2/mcp-gameboy/node_modules/serverboy/src/interface.js");

const gb = new Interface();
gb.loadRom(fs.readFileSync(path.join(__dirname, "..", "roms", "robbo-sfx2.gb")));

function amp() {
  const a = gb.getAudio(); let mn = 1, mx = -1;
  for (let i = 0; i < a.length; i++) { const v = a[i] + 1; if (v < mn) mn = v; if (v > mx) mx = v; }
  return (mx - mn) / 2;
}

const frames = Number(process.argv[2] || 800);
for (let i = 0; i < 200; i++) gb.doFrame();
const runs = []; let inR = false, len = 0, maxA = 0;
for (let f = 0; f < frames; f++) {
  gb.doFrame();
  const a = amp(); if (a > maxA) maxA = a;
  if (a > 0.004) { if (!inR) { inR = true; len = 0; } len++; }
  else if (inR) { if (len >= 3) runs.push(len); inR = false; }
}
if (inR) runs.push(len);
console.log("runs=" + JSON.stringify(runs) + " maxAmp=" + maxA.toFixed(3));

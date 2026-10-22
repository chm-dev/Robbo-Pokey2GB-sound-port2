/* v2 structure verification via DEMO build + debug cells + audio gating.
 * Asserts per pattern: audible burst count, step count, total length. */
"use strict";
const fs = require("node:fs");
const Interface = require("C:/dev/AI/robbo-port2/mcp-gameboy/node_modules/serverboy/src/interface.js");
const gb = new Interface();
gb.loadRom(fs.readFileSync("C:/dev/AI/robbo-port/sound-port2/roms/robbo-sfx2.gb"));
const priv = gb[Object.getOwnPropertyNames(gb).find((k) => k.startsWith("_"))];
const g = priv.gameboy;
const cell = (i) => g.memory[0xc0f0 + i];

for (let i = 0; i < 180; i++) gb.doFrame();

function amp() {
  const a = gb.getAudio(); let mn = 1, mx = -1;
  for (let i = 0; i < a.length; i++) { const v = a[i] + 1; if (v < mn) mn = v; if (v > mx) mx = v; }
  return (mx - mn) / 2;
}

// expect: [burstCount, maxStep]
const EXPECT = {
  0x00: [1, 12], 0x01: [1, 1], 0x02: [1, 1], 0x03: [1, 15], 0x04: [1, 4],
  0x05: [1, 16], 0x06: [3, 11], 0x07: [8, 15], 0x08: [1, 3], 0x09: [1, 6],
  0x0a: [1, 4],  0x0b: [2, 16], 0x0c: [1, 15], 0x0d: [1, 16], 0x0e: [1, 16],
};

let results = [];
let curNote = -1, maxStep = 0, bursts = [], inBurst = false, blen = 0, onFrames = 0;

function closeNote() {
  if (inBurst) bursts.push(blen);
  if (curNote >= 0) results.push({ note: curNote, maxStep, bursts, onFrames });
  inBurst = false; blen = 0; bursts = []; onFrames = 0; maxStep = 0;
}

for (let f = 0; f < 4200; f++) {
  gb.doFrame();
  const n = cell(2);
  const st = cell(1);
  if (n !== curNote) { closeNote(); curNote = n; }
  if (st > maxStep) maxStep = st;
  const a = amp();
  if (a > 0.004) {
    onFrames++;
    if (!inBurst) { inBurst = true; blen = 0; }
    blen++;
  } else if (inBurst) {
    if (blen >= 2) bursts.push(blen);   // ignore single-frame blips
    inBurst = false;
  }
}
closeNote();

for (const r of results) {
  const [eb, es] = EXPECT[r.note] || ["?", "?"];
  const ok = r.bursts.length === eb && r.maxStep === es;
  console.log(
    `$${r.note.toString(16).padStart(2, "0")}: bursts=${r.bursts.length} (${JSON.stringify(r.bursts)}) ` +
    `steps=${r.maxStep} on=${r.onFrames}f  expect bursts=${eb} steps=${es}  ${ok ? "OK" : "CHECK"}`
  );
}

/* v2 duration probe: measure per-frame audio amplitude after playing a note
 * and report audible runs (frames where |signal| exceeds a threshold). */
"use strict";
const fs = require("node:fs");
const Interface = require("C:/dev/AI/robbo-port2/mcp-gameboy/node_modules/serverboy/src/interface.js");

const gb = new Interface();
gb.loadRom(fs.readFileSync("C:/dev/AI/robbo-port/sound-port2/roms/robbo-sfx2.gb"));
const priv = gb[Object.getOwnPropertyNames(gb).find((k) => k.startsWith("_"))];
const g = priv.gameboy;

for (let i = 0; i < 180; i++) gb.doFrame(); // boot + settle

const cell = (i) => g.memory[0xc0f0 + i];

function amp() {
  const a = gb.getAudio(); let mn = 1, mx = -1;
  for (let i = 0; i < a.length; i++) { const v = a[i] + 1; if (v < mn) mn = v; if (v > mx) mx = v; }
  return (mx - mn) / 2;
}

function playAndMeasure(note, frames) {
  for (let r = 0; r < 20; r++) { gb.pressKey(2); gb.doFrame(); gb.pressKey(2); gb.doFrame(); gb.doFrame(); }
  for (let k = 0; k < note; k++) { gb.pressKey(3); gb.doFrame(); gb.pressKey(3); gb.doFrame(); gb.doFrame(); gb.doFrame(); }
  gb.pressKey(4); gb.doFrame();
  const amps = []; let playF = -1, stepEnd = -1, seenStep = 0;
  for (let f = 0; f < frames; f++) {
    gb.doFrame(); amps.push(amp());
    if (cell(0) === 1 && playF < 0) playF = f;
    if (cell(0) === 1) seenStep = Math.max(seenStep, cell(1));
    if (playF >= 0 && cell(0) === 0 && stepEnd < 0) stepEnd = f;
  }
  const runs = []; let inRun = false, len = 0;
  for (const a of amps) {
    if (a > 0.005) { if (!inRun) { inRun = true; len = 0; } len++; }
    else if (inRun) { inRun = false; runs.push(len); }
  }
  if (inRun) runs.push(len);
  console.log(
    `$${note.toString(16).padStart(2, "0")}: cellPlay@${playF} stop@${stepEnd} maxStep=${seenStep} ` +
    `runs=${JSON.stringify(runs)} max=${Math.max(...amps).toFixed(3)}`
  );
}

// expected audible durations at 60f/s, step=4.8f:
// $00: ~12 steps -> ~58f   $01: 1 step -> ~8f   $06: bursts s0,s8,s10
// $0A: 4 steps -> ~22f     $0B: ~7 steps(34f) gap then 5 tones(24f)
// $0D: 16 steps -> ~77f    $0E: 16 steps -> ~77f
[0x00, 0x01, 0x02, 0x06, 0x0a, 0x0b, 0x0d, 0x0e].forEach((n) => playAndMeasure(n, 110));

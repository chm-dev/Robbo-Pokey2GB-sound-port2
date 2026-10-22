/* dbgrun.js - single decisive measurement: boot ROM, press A on pattern 0,
 * poll debug cells + APu registers + audio AC amplitude every frame.
 */
"use strict";
const fs = require("node:fs");
const Interface = require("C:/dev/AI/robbo-port2/mcp-gameboy/node_modules/serverboy/src/interface.js");
const gb = new Interface();
gb.loadRom(fs.readFileSync("C:/dev/AI/robbo-port/sound-port2/roms/robbo-sfx2.gb"));
const priv = gb[Object.getOwnPropertyNames(gb).find((k) => k.startsWith("_"))];
const g = priv.gameboy;

const note = Number(process.argv[2] || "0");

for (let i = 0; i < 120; i++) gb.doFrame();

// navigate down `note` times with generous edges
for (let k = 0; k < note; k++) {
  gb.pressKey(3); gb.doFrame(); gb.doFrame();
  gb.doFrame(); gb.doFrame();
}

// debug cells should show zeros before play
const d = (i) => g.memory[0xc0f0 + i];
console.log("pre  dbg:", d(0), d(1), d(2), " mem FF12:", g.memory[0xff12], "FF22:", g.memory[0xff22]);

gb.pressKey(4); gb.doFrame(); gb.doFrame(); // A held 2 frames
for (let f = 0; f < 90; f++) {
  gb.doFrame();
  const a = gb.getAudio();
  let mn = 1, mx = -1, sum = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i] + 1; // remove -1 DC floor
    if (v < mn) mn = v;
    if (v > mx) mx = v;
    sum += v * v;
  }
  const ac = (mx - mn) / 2;
  if (f < 20 || f % 10 === 0 || ac > 0.02) {
    console.log(
      `f${String(f).padStart(3)} dbg.play=${d(0)} step=${d(1)} note=${d(2)}` +
      ` | FF11=${g.memory[0xff11]} FF12=${g.memory[0xff12]} FF13=${g.memory[0xff13]} FF14=${g.memory[0xff14]}` +
      ` FF41?=${g.memory[0xff41]} | ch4per=${g.channel4FrequencyPeriod} ch4vol=${g.channel4envelopeVolume}` +
      ` ch1freq=${g.channel1FrequencyTracker} | audioAC=${ac.toFixed(4)}`
    );
  }
}

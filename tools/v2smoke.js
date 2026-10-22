/* v2 smoke test: navigate to a pattern, press A, and watch serverboy's
 * internal APU state to confirm the player produces & steps the right
 * channel (noise vs pulse) and stops cleanly. */
"use strict";
const fs = require("node:fs");
const Interface = require("C:/dev/AI/robbo-port2/mcp-gameboy/node_modules/serverboy/src/interface.js");

const gb = new Interface();
gb.loadRom(fs.readFileSync("C:/dev/AI/robbo-port/sound-port2/roms/robbo-sfx2.gb"));
const priv = gb[Object.getOwnPropertyNames(gb).find((k) => k.startsWith("_"))];
const g = priv.gameboy;

function apu() {
  return {
    ch1: g.channel1envelopeVolume, ch1freq: g.channel1FrequencyTracker,
    ch1on: g.channel1Enabled, ch4: g.channel4envelopeVolume, ch4per: g.channel4FrequencyPeriod,
    ch4on: g.channel4Enabled,
  };
}
function acAmp() {
  const a = gb.getAudio(); let mn = 1, mx = -1;
  for (let i = 0; i < a.length; i++) { const v = a[i] + 1; if (v < mn) mn = v; if (v > mx) mx = v; }
  return (mx - mn) / 2;
}

async function runNote(note) {
  // reset selection to top
  for (let r = 0; r < 20; r++) { gb.pressKey(2); gb.doFrame(); gb.pressKey(2); gb.doFrame(); gb.doFrame(); }
  for (let k = 0; k < note; k++) {
    gb.pressKey(3); gb.doFrame(); gb.pressKey(3); gb.doFrame();
    gb.doFrame(); gb.doFrame();
  }
  gb.pressKey(4); gb.doFrame(); gb.pressKey(4); gb.doFrame(); // A held 2 frames
  const trace = [];
  for (let f = 0; f < 90; f++) {
    gb.doFrame();
    const a = apu();
    const amp = acAmp();
    trace.push({ f, ...a, amp });
  }
  // summarise
  const noiseFrames = trace.filter((t) => t.ch4on && t.ch4 > 0);
  const pulseFrames = trace.filter((t) => t.ch1on && t.ch1 > 0);
  const maxAmp = Math.max(...trace.map((t) => t.amp));
  console.log(
    `note $${note.toString(16).padStart(2, "0")}: noise=${noiseFrames.length}f pulse=${pulseFrames.length}f ` +
    `maxAmp=${maxAmp.toFixed(3)} lastNoise=${noiseFrames.length ? noiseFrames[noiseFrames.length - 1].f : "-"}`
  );
  return trace;
}

(async () => {
  for (const n of [0x00, 0x01, 0x06, 0x0a, 0x0b, 0x0d]) {
    await runNote(n);
  }
  // screenshot the labelled menu (scroll back to top)
  for (let r = 0; r < 20; r++) { gb.pressKey(2); gb.doFrame(); gb.doFrame(); }
  fs.writeFileSync("C:/dev/AI/robbo-port/sound-port2/build/v2-menu.bin", Buffer.from(gb.getScreen()));
  console.log("done");
})();

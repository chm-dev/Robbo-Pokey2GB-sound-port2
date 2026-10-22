/* Render clean WAVs for each pattern using the DEMO_ALL build: strip the
 * serverboy -1 DC bias, normalize, write one WAV per note into build/wav2/. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const Interface = require("C:/dev/AI/robbo-port2/mcp-gameboy/node_modules/serverboy/src/interface.js");

const BUILD = path.join(__dirname, "..", "build");
const OUT = path.join(BUILD, "wav2");
fs.mkdirSync(OUT, { recursive: true });

const gb = new Interface();
gb.loadRom(fs.readFileSync(path.join(__dirname, "..", "roms", "robbo-sfx2.gb")));
const priv = gb[Object.getOwnPropertyNames(gb).find((k) => k.startsWith("_"))];
const g = priv.gameboy;
const cell = (i) => g.memory[0xc0f0 + i];

function writeWav(file, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE((v * 32767) | 0, i * 2);
  }
  const hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write("WAVE", 8);
  hdr.write("fmt ", 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(44100, 24); hdr.writeUInt32LE(44100 * 4, 28);
  hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
  hdr.write("data", 36); hdr.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([hdr, data]));
}

// The DEMO build plays notes 0..14 back-to-back, 120 frames each, tagging
// cell(2)=note.  Record continuously and split by note transitions.
const perNote = {}; // note -> Float32Array accumulator (via arrays)
let acc = [];
let curNote = -1;

for (let f = 0; f < 60; f++) gb.doFrame(); // minimal boot

for (let f = 0; f < 4500; f++) {
  gb.doFrame();
  const n = cell(2);
  const pl = cell(0);
  if (n !== curNote) {
    if (curNote >= 0) perNote[curNote] = acc;
    curNote = n; acc = [];
  }
  if (!pl && acc.length === 0) continue; // skip lead-in silence
  const b = gb.getAudio();
  for (let i = 0; i < b.length; i++) acc.push(b[i] + 1); // remove -1 DC floor -> 0..2
}
if (curNote >= 0) perNote[curNote] = acc;

// normalize each note to peak 0.9 and write
for (const [note, arr] of Object.entries(perNote)) {
  if (!arr || arr.length < 4410) continue; // skip empty/short
  let peak = 0;
  for (const v of arr) { const a = Math.abs(v - 1); if (a > peak) peak = a; } // center around 1
  if (peak === 0) continue;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = ((arr[i] - 1) / peak) * 0.9;
  const nn = Number(note);
  writeWav(path.join(OUT, `p${nn.toString(16).padStart(2, "0")}.wav`), out);
  console.log(`wav2/p${nn.toString(16).padStart(2, "0")}.wav  ${(arr.length / 88200).toFixed(2)}s peak=${peak.toFixed(2)}`);
}

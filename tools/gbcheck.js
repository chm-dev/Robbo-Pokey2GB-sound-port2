/* gbcheck.js - run robbo-sfx2.gb in serverboy headlessly and verify playback.
 *
 * For each of the 15 patterns: select it in the menu, press A, then sample
 * per-frame APU registers ($FF11-$FF14, $FF22-$FF23) and audio RMS.  The
 * player should emit one register update every ~4.8 frames (POKEY 80 ms).
 *
 * Also writes:
 *   build/gb-menu.png          - menu screenshot
 *   build/wav/pNN.wav          - rendered audio of each pattern (stereo 44k)
 *   build/gbcheck.json         - machine-readable report
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const Interface = require("C:/dev/AI/robbo-port2/mcp-gameboy/node_modules/serverboy/src/interface.js");

const ROM = path.join(__dirname, "..", "roms", "robbo-sfx2.gb");
const BUILD = path.join(__dirname, "..", "build");

const NOTE_COUNT = 15;

function priv(gb) {
  const key = Object.getOwnPropertyNames(gb).find((k) => k.startsWith("_"));
  return gb[key];
}

function memRead(gb, addr) {
  const g = priv(gb).gameboy;
  // serverboy keeps a flat 64K memory array in newer versions; IO regs live
  // in g.memory or g.IORegisters depending on the core. Try both.
  if (g.memory && g.memory.length >= 0x10000 && g.memory[0x4000] !== undefined) {
    return g.memory[addr] | 0;
  }
  if (g.IORegisters) return g.IORegisters[addr - 0xff00] | 0;
  return -1;
}

function frameWith(gb, keys, n) {
  for (let i = 0; i < n; i++) {
    if (keys) for (const k of keys) gb.pressKey(k);
    gb.doFrame();
  }
}

function pngFromScreen(gb, file) {
  const scr = gb.getScreen(); // Uint8ClampedArray RGBA 160x144
  const w = 160, h = 144;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (t, d) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const rgba = Buffer.from(scr.buffer || scr);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]));
}

function writeWav(file, samples) {
  // samples: Float32Array stereo interleaved
  const n = samples.length;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
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

async function main() {
  fs.mkdirSync(path.join(BUILD, "wav"), { recursive: true });
  const gb = new Interface();
  gb.loadRom(fs.readFileSync(ROM));

  // Boot the ROM
  frameWith(gb, null, 120);
  pngFromScreen(gb, path.join(BUILD, "gb-menu.png"));

  const report = [];
  for (let note = 0; note < NOTE_COUNT; note++) {
    // Navigate: press UP x20 to clamp at the top, then DOWN `note` times.
    frameWith(gb, ["up"], 2);
    for (let r = 0; r < 20; r++) { frameWith(gb, ["up"], 2); frameWith(gb, null, 1); }
    for (let r = 0; r < note; r++) { frameWith(gb, ["down"], 2); frameWith(gb, null, 1); }
    frameWith(gb, null, 2);

    // Press A, then record ~110 frames.
    const audio = [];
    const frames = [];
    let last = null;
    let changes = 0;
    frameWith(gb, ["a"], 2);
    frameWith(gb, null, 1);
    for (let f = 0; f < 130; f++) {
      gb.doFrame();
      const st = {
        f,
        nr12: memRead(gb, 0xff12), nr13: memRead(gb, 0xff13), nr14: memRead(gb, 0xff14),
        nr42: memRead(gb, 0xff22), nr43: memRead(gb, 0xff23),
        tone: memRead(gb, 0xff11),
      };
      const key = [st.nr12, st.nr13, st.nr14, st.nr42, st.nr43].join(",");
      st.changed = key !== last;
      if (st.changed) changes++;
      last = key;
      const buf = gb.getAudio();
      let sum = 0;
      const copy = new Float32Array(buf.length);
      for (let i = 0; i < buf.length; i++) { copy[i] = buf[i]; sum += buf[i] * buf[i]; }
      st.rms = Math.sqrt(sum / buf.length);
      audio.push(copy);
      frames.push(st);
    }
    // stop (B), small settle
    frameWith(gb, ["b"], 2);
    frameWith(gb, null, 2);

    // analyze: audible span and first-change spacing
    const active = frames.filter((s) => s.rms > 0.01);
    const firstChange = frames.findIndex((s) => s.changed);
    const lastActive = active.length ? active[active.length - 1].f : -1;
    const totalSamples = audio.length * audio[0].length;
    const all = new Float32Array(totalSamples);
    for (let i = 0; i < audio.length; i++) all.set(audio[i], i * audio[0].length);
    writeWav(path.join(BUILD, "wav", `p${String(note).padStart(2, "0")}.wav`), all);

    report.push({
      note,
      registerChanges: changes,
      firstChangeFrame: firstChange,
      lastAudibleFrame: lastActive,
      peakRms: Math.max(...frames.map((s) => s.rms)),
    });
    console.log(
      `p${String(note).padStart(2, "0")}: changes=${changes} firstchg=${firstChange} lastAud=${lastActive} rms=${Math.max(...frames.map((s) => s.rms)).toFixed(3)}`
    );
  }

  fs.writeFileSync(path.join(BUILD, "gbcheck.json"), JSON.stringify(report, null, 1));
  console.log("wrote gb-menu.png, wav/*.wav, gbcheck.json");
}

main().catch((e) => { console.error(e); process.exit(1); });

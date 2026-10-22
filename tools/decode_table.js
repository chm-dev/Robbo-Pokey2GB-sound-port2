/* Decode the POKEY note table from the dumped RAM image.
 * Engine (verified from disasm of $B806/$B84B/$B86C):
 *   trigger: A = pattern 0..14 (bit7 = stop all); voice = min(A,3);
 *            pointer = $B896 + 32*A; step counter = 16.
 *   tick: when RTCLOK&3 == 0 (12.5 Hz): for each active voice, counter--
 *            and write pair (AUDC, AUDF) = bytes [counter*2], [counter*2+1]
 *            played DOWN from pair 15 to pair 0.
 * AUDC: bits7-5 distortion, bit4 high-note (1.79MHz), bits3-0 volume.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const block = fs.readFileSync(path.join(__dirname, "..", "build", "game-live.bin"));
const base = 0x0e00;
const TABLE = 0xb896;

function byte(addr) { return block[addr - base]; }

const distName = [
  "5-bit poly (buzzy)",
  "4-bit poly (buzzy)",
  "5+4 poly noise",
  "6+4 poly noise",
  "15-bit poly",
  "17-bit poly noise",
  "hi-tone+? (6)",
  "pure tone 17-bit",
];

function rateHz(audc, audf) {
  const clock = audc & 0x10 ? 1789773 : 63921;   // PAL-ish base clocks
  const div = 16 * (audf + 1);
  const dist = (audc >> 5) & 7;
  switch (dist) {
    case 0: return clock / (div * 31 * 2);   // 15-bit poly /31, x2 stage
    case 1: return clock / (div * 15 * 2);
    case 2: return clock / div;              // noise
    case 3: return clock / div;              // noise
    case 4: return clock / (div * 31 * 2);
    case 5: return clock / (div * 17 * 2);
    case 6: return clock / (div * 9 * 2);
    default: return clock / (div * 2);       // pure tone
  }
}

function main() {
  for (let n = 0; n < 15; n++) {
    const p = TABLE + 32 * n;
    const pairs = [];
    for (let k = 0; k < 16; k++) pairs.push([byte(p + k * 2), byte(p + k * 2 + 1)]);
    const play = pairs.slice().reverse(); // engine plays 15..0
    console.log(`== pattern ${n}  @$${p.toString(16)}  (voice ${(Math.min(n,3))})`);
    for (let i = 0; i < 16; i++) {
      const [c, f] = play[i];
      if (c === 0 && f === 0) { console.log(`  s${String(i).padStart(2)}  -- silence`); continue; }
      const dist = (c >> 5) & 7;
      const hi = c & 0x10 ? " hi" : "";
      const hz = rateHz(c, f);
      console.log(`  s${String(i).padStart(2)}  AUDC=$${c.toString(16).toUpperCase().padStart(2, "0")} AUDF=$${f.toString(16).toUpperCase().padStart(2, "0")}  d${dist}${hi} vol=${c & 15}  ~${hz.toFixed(0)}Hz  ${distName[dist]}`);
    }
  }
  // also check 15th window end and beyond up to $BA80
  console.log("bytes after 15 windows:", byte(0xba76).toString(16), byte(0xba78).toString(16));
}
main();

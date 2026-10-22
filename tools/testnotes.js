/* One-off smoke: build TEST_NOTE variants and measure audio bursts. */
"use strict";
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ROM = path.join(ROOT, "roms", "robbo-sfx2.gb");
const Interface = require("C:/dev/AI/robbo-port2/mcp-gameboy/node_modules/serverboy/src/interface.js");

function build(flag) {
  execFileSync("pwsh", ["-NoProfile", "-File", path.join(ROOT, "tools", "build.ps1"),
    "-Clean", "-ExtraCFlags", flag], { stdio: "pipe" });
}

function measure(label) {
  const gb = new Interface();
  gb.loadRom(fs.readFileSync(ROM));
  function amp() {
    const a = gb.getAudio(); let mn = 1, mx = -1;
    for (let i = 0; i < a.length; i++) { const v = a[i] + 1; if (v < mn) mn = v; if (v > mx) mx = v; }
    return (mx - mn) / 2;
  }
  for (let i = 0; i < 200; i++) gb.doFrame();
  const runs = []; let inR = false, len = 0, maxA = 0;
  for (let f = 0; f < 800; f++) {
    gb.doFrame();
    const a = amp(); if (a > maxA) maxA = a;
    if (a > 0.004) { if (!inR) { inR = true; len = 0; } len++; }
    else if (inR) { if (len >= 3) runs.push(len); inR = false; }
  }
  if (inR) runs.push(len);
  console.log(label + ": runs=" + JSON.stringify(runs) + " maxAmp=" + maxA.toFixed(3));
}

build("-DTEST_NOTE=6");  measure("TEST 6 (door, must be silent)");
build("-DTEST_NOTE=10"); measure("TEST 10 (destruct, ~4 steps then stop)");
build("-DTEST_NOTE=0");  measure("TEST 0 (explosion, 12 steps)");

/* Trace 2: start the game (attract mode -> fire), then tap directions and
 * log every sound-trigger hit with caller + player position.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const a8 = require("./a8");

const TRIGGER = 0xb806;

async function waitUnpacked(api, timeoutS = 60) {
  for (let i = 0; i < timeoutS; i++) {
    await api.system.waitForTime({ ms: "1000ms" });
    const eng = await a8.readBytes(api, 0xb800, 3);
    if (eng[0] === 0x4c && eng[1] === 0x06 && eng[2] === 0xb8) return true;
  }
  return false;
}

async function main() {
  const { runtime, api } = await a8.boot({ turbo: true, shots: true });
  const out = path.join(__dirname, "..", "build");
  if (!(await waitUnpacked(api))) { console.log("TIMEOUT"); await runtime.dispose(); return; }

  const hits = [];
  let stop = false;
  let phase = "warmup";
  let seq = 0;

  async function poller() {
    while (!stop) {
      await new Promise((r) => setTimeout(r, 40));
      let ds;
      try { ds = await api.debug.getDebugState(); } catch { continue; }
      if (ds && ds.reason === "breakpoint") {
        const sp = ds.sp & 0xff;
        let ret = 0;
        try {
          const lo = await api.debug.readMemory((0x0100 + sp + 1) & 0xffff);
          const hi = await api.debug.readMemory((0x0100 + sp + 2) & 0xffff);
          ret = lo | (hi << 8);
        } catch {}
        let p = {};
        try {
          const vb = await a8.readBytes(api, 0x8e, 0x1c); // $8E-$A9
          p = {};
          for (let i = 0; i < 0x1c; i++) p["$" + (0x8e + i).toString(16)] = vb[i].toString(16).padStart(2, "0");
        } catch {}
        hits.push({ seq: seq++, phase, a: ds.a, x: ds.x, ret: (ret - 2).toString(16), vars: p });
        try { await api.system.start(); } catch {}
      }
    }
  }

  await api.debug.setBreakpoints([TRIGGER]);
  const pollPromise = poller();

  async function frames(n, label) {
    if (label) phase = label;
    await api.system.waitForFrames({ count: n, timeoutMs: 30000 }).catch(async () => {
      await api.system.start().catch(() => {});
    });
  }
  async function shot(label) {
    await a8.snap(api, path.join(out, `t2-${label}.png`));
  }

  await frames(30, "pre-start");
  // press fire to leave attract mode
  await api.input.setJoystick({ trigger: true });
  await frames(4, "start-press");
  await api.input.setJoystick({});
  await frames(120, "start-settle");
  await shot("started");

  // tap each direction repeatedly, watching player coords via hit vars
  for (let round = 0; round < 4; round++) {
    for (const [d, s] of [["up", { up: true }], ["down", { down: true }], ["left", { left: true }], ["right", { right: true }]]) {
      await api.input.setJoystick(Object.assign({ trigger: false }, s));
      await frames(3, "tap-" + d);
      await api.input.setJoystick({});
      await frames(8, "rel");
    }
  }
  await shot("after-taps");

  // hold a direction to see if continuous movement happens
  await api.input.setJoystick({ right: true });
  await frames(60, "hold-right");
  await api.input.setJoystick({});
  await frames(20, "rel");
  await shot("after-hold");

  stop = true;
  await pollPromise.catch(() => {});
  await api.debug.setBreakpoints([]);

  console.log("hits:", hits.length);
  for (const h of hits) {
    console.log(`#${h.seq} ${h.phase} A=0x${h.a.toString(16)} X=0x${h.x.toString(16)} from 0x${h.ret}`);
  }
  fs.writeFileSync(path.join(out, "trace2.json"), JSON.stringify(hits, null, 1));
  await runtime.dispose();
}

main().catch((e) => { console.error(e); process.exit(1); });

/* Trace 1: breakpoint at the sound trigger ($B806), drive the robot with
 * scripted joystick input, and record (frame, A, caller, game vars) per hit.
 *
 * Breakpoint semantics: on hit the machine pauses with reason 'breakpoint';
 * we poll, log, and resume with system.start(). Nothing is missed.
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

  // background poller
  async function poller() {
    while (!stop) {
      await new Promise((r) => setTimeout(r, 60));
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
        const vars = {};
        try {
          const vb = await a8.readBytes(api, 0x80, 0x40);
          for (let i = 0; i < 0x40; i += 4) {
            vars["$" + (0x80 + i).toString(16)] = [...vb.subarray(i, i + 4)].map(b => b.toString(16).padStart(2, "0")).join(" ");
          }
        } catch {}
        const cnt = await api.getCounters().catch(() => ({}));
        hits.push({
          seq: seq++,
          phase,
          a: ds.a,
          x: ds.x,
          ret: "0x" + (ret - 2).toString(16), // address of the JSR/JMP itself
          cycles: cnt.cycleCounter,
          vars,
        });
        try { await api.system.start(); } catch {}
      }
    }
  }

  await api.debug.setBreakpoints([TRIGGER]);
  const pollPromise = poller();

  async function frames(n, label) {
    if (label) phase = label;
    await api.system.waitForFrames({ count: n, timeoutMs: 20000 }).catch(async () => {
      // if we're parked at a breakpoint, resume so frames advance
      await api.system.start().catch(() => {});
      await api.system.waitForFrames({ count: n, timeoutMs: 20000 }).catch(() => {});
    });
  }
  async function shot(label) {
    await a8.snap(api, path.join(out, `trace-${label}.png`));
  }

  await frames(40, "idle");
  await shot("idle");

  const dirs = [
    ["up", { up: true }], ["down", { down: true }],
    ["left", { left: true }], ["right", { right: true }],
  ];

  // walk attempts in each direction
  for (const [d, s] of dirs) {
    await api.input.setJoystick(Object.assign({ trigger: false }, s));
    await frames(14, "walk-" + d);
    await api.input.setJoystick({});
    await frames(14, "walk-release");
    await shot("walk-" + d);
  }

  // push: hold against a wall each direction (longer)
  for (const [d, s] of dirs) {
    await api.input.setJoystick(Object.assign({ trigger: false }, s));
    await frames(60, "push-" + d);
    await api.input.setJoystick({});
    await frames(20, "push-release");
  }

  // shoot: trigger + direction in all four ways (may need ammo)
  for (const [d, s] of dirs) {
    await api.input.setJoystick(Object.assign({ trigger: true }, s));
    await frames(6, "fire-hold-" + d);
    await api.input.setJoystick({ trigger: true });
    await frames(20, "fire-release-dir");
    await api.input.setJoystick({});
    await frames(30, "fire-cool");
    await shot("fire-" + d);
  }

  // trigger pulses (menu / pause?)
  await api.input.setJoystick({ trigger: true });
  await frames(3, "trigger");
  await api.input.setJoystick({});
  await frames(60, "after-trigger");

  stop = true;
  await pollPromise.catch(() => {});
  await api.debug.setBreakpoints([]);

  console.log("hits:", hits.length);
  for (const h of hits) {
    console.log(
      `#${h.seq} ${h.phase} A=${a8.hex8(h.a)} X=${a8.hex8(h.x)} from ${h.ret} cyc=${h.cycles}`
    );
  }
  fs.writeFileSync(path.join(out, "trace1.json"), JSON.stringify(hits, null, 1));
  await runtime.dispose();
}

main().catch((e) => { console.error(e); process.exit(1); });

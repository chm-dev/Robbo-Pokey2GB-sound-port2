/* Trace 3: verbose debugger — watch PC/reason/screen while stepping through
 * boot -> title -> gameplay, with breakpoint tracing at the sound trigger.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const a8 = require("./a8");

async function main() {
  const { runtime, api } = await a8.boot({ turbo: true, shots: true });
  const out = path.join(__dirname, "..", "build");

  // wait for engine unpack
  for (let i = 0; i < 60; i++) {
    await api.system.waitForTime({ ms: "1000ms" });
    const eng = await a8.readBytes(api, 0xb800, 3);
    if (eng[0] === 0x4c && eng[1] === 0x06 && eng[2] === 0xb8) { console.log("unpacked at t=", i); break; }
  }

  await api.debug.setBreakpoints([0xb806]);

  const log = [];
  async function snap(n) { await a8.snap(api, path.join(out, `t3-${n}.png`)); }

  async function state(label) {
    const st = await api.getSystemState();
    const ds = st.debugState || {};
    const line = `${label}: pc=${a8.hex16(ds.pc)} a=${a8.hex8(ds.a)} x=${a8.hex8(ds.x)} running=${st.running} reason=${ds.reason || "-"}`;
    console.log(line); log.push(line);
    return ds;
  }

  // Resume-from-breakpoint helper used around waits.
  async function runFrames(n) {
    let guard = 0;
    let remaining = n;
    while (remaining > 0 && guard++ < 400) {
      const ds = await state("st");
      if (ds.reason === "breakpoint") {
        console.log("  HIT trigger A=", a8.hex8(ds.a));
        log.push(`hit A=${ds.a} pc=${ds.pc}`);
        await api.system.start().catch(() => {});
        continue;
      }
      await api.system.waitForFrames({ count: remaining, timeoutMs: 2000 }).catch(() => {});
      remaining -= 5;
    }
  }

  await state("post-unpack");
  await snap("t0");
  await new Promise((r) => setTimeout(r, 3000));
  await state("after-3s");
  await snap("t3");
  await new Promise((r) => setTimeout(r, 3000));
  await state("after-6s");
  await snap("t6");

  // press fire
  await api.input.setJoystick({ trigger: true });
  await new Promise((r) => setTimeout(r, 300));
  await api.input.setJoystick({});
  await state("after-fire");
  await new Promise((r) => setTimeout(r, 3000));
  await state("after-fire-3s");
  await snap("fire3");

  // tap right
  await api.input.setJoystick({ right: true });
  await new Promise((r) => setTimeout(r, 300));
  await api.input.setJoystick({});
  await new Promise((r) => setTimeout(r, 1500));
  await state("after-right");
  await snap("right");

  fs.writeFileSync(path.join(out, "trace3.log"), log.join("\n"));
  await runtime.dispose();
}

main().catch((e) => { console.error(e); process.exit(1); });

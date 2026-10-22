/* Probe 2: get past the crack intro and reach the title/menu,
 * then locate POKEY register stores in the loaded game block.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const a8 = require("./a8");

async function readShape(api) {
  const res = await api.debug.readRange({ start: 0x02e0, length: 4 });
  console.log("readRange typeof:", typeof res, "isArray:", Array.isArray(res),
    "ctor:", res && res.constructor && res.constructor.name,
    "len:", res && res.length,
    "bytes?", res && res.bytes && res.bytes.length);
}

async function main() {
  const { runtime, api } = await a8.boot({ turbo: true, shots: true });
  const out = path.join(__dirname, "..", "build");
  fs.mkdirSync(out, { recursive: true });
  await readShape(api);

  for (let i = 0; i < 12; i++) {
    await api.system.waitForTime({ ms: "700ms" });
    const st = await api.getSystemState();
    const pc = st.debugState.pc;
    console.log(
      `t=${i} pc=${a8.hex16(pc)} running=${st.running}` +
      (st.debugState.faultType ? ` FAULT ${st.debugState.faultType}` : "")
    );
    // Tap Space (Atari START/any key often skips intros), press joystick fire.
    await api.input.tapKey({ key: " ", code: "Space" }, { holdMs: "60ms", afterMs: "60ms" });
    if (i % 2 === 1) {
      await api.input.setJoystick({ trigger: true });
      await api.system.waitForTime({ ms: "100ms" });
      await api.input.setJoystick({ trigger: false });
    }
    if (pc >= 0x0e00 && pc < 0xc000) {
      // Game RAM: dump block and scan for POKEY stores.
      const bytes = await a8.readBytes(api, 0x0e00, 0xba80 - 0x0e00 + 1);
      console.log("game block bytes:", bytes.length);
      fs.writeFileSync(path.join(out, "game-block.bin"), Buffer.from(bytes));
      break;
    }
  }

  await a8.snap(api, path.join(out, "after-intro.png"));

  // Re-read from the dumped file (source of truth = live RAM at this moment).
  const bytes = new Uint8Array(fs.readFileSync(path.join(out, "game-block.bin")));
  const hits = [];
  for (let i = 0; i + 3 < bytes.length; i++) {
    const op = bytes[i];
    if (op !== 0x8d && op !== 0x8c) continue;
    const addr = bytes[i + 1] | (bytes[i + 2] << 8);
    if (addr >= 0xd200 && addr <= 0xd20f) hits.push({ pc: 0x0e00 + i, op, addr });
  }
  console.log("POKEY abs stores:", hits.length);
  for (const h of hits) console.log("  ", a8.hex16(h.pc), h.op === 0x8d ? "STA" : "STY", a8.hex16(h.addr));

  await runtime.dispose();
}

main().catch((e) => { console.error(e); process.exit(1); });

/* Probe 2b: boot the fast Robbo variant, wait for gameplay, dump the game
 * block, and locate POKEY register stores + the sound engine region.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const a8 = require("./a8");

async function main() {
  const { runtime, api } = await a8.boot({ turbo: true, shots: true });
  const out = path.join(__dirname, "..", "build");
  fs.mkdirSync(out, { recursive: true });

  const info = runtime.xexInfo || {};
  console.log("segments:", JSON.stringify(info.segments || null));
  console.log("init:", info.initAddress == null ? "-" : a8.hex16(info.initAddress),
    "run:", info.runAddress == null ? "-" : a8.hex16(info.runAddress));

  let inGame = false;
  for (let i = 0; i < 20; i++) {
    await api.system.waitForTime({ ms: "600ms" });
    const st = await api.getSystemState();
    const pc = st.debugState.pc;
    console.log(
      `t=${i} pc=${a8.hex16(pc)} running=${st.running}` +
      (st.debugState.faultType ? ` FAULT ${st.debugState.faultType}` : "")
    );
    if (i % 3 === 1) {
      await api.input.tapKey({ key: " ", code: "Space" }, { holdMs: "60ms", afterMs: "60ms" });
    }
    if (pc >= 0x0e00 && pc < 0xc000) inGame = true;
  }
  console.log("reached game RAM:", inGame);
  await a8.snap(api, path.join(out, "probe2b.png"));

  const bytes = await a8.readBytes(api, 0x0e00, 0xba80 - 0x0e00 + 1);
  console.log("game block bytes:", bytes.length);
  fs.writeFileSync(path.join(out, "game-block-fast.bin"), Buffer.from(bytes));

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

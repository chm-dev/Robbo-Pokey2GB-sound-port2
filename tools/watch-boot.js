/* Boot watcher: wait (with periodic key taps) until the loader finishes
 * unpacking the game and the sound engine appears at $B800 in live RAM.
 * Saves screenshots + the full game RAM image when detected.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const a8 = require("./a8");

async function main() {
  const xex = process.argv[2] === "canon" ? a8.XEX_DEFAULT : a8.XEX_FAST;
  console.log("xex:", xex);
  const { runtime, api } = await a8.boot({ turbo: true, shots: true });
  const out = path.join(__dirname, "..", "build");

  let done = false;
  for (let i = 0; i < 90 && !done; i++) {
    await api.system.waitForTime({ ms: "1000ms" });
    const st = await api.getSystemState();
    const pc = st.debugState.pc;
    const eng = await a8.readBytes(api, 0xb800, 8);
    const unpacked = eng.some((b) => b !== 0);
    console.log(
      `t=${i + 1}s pc=${a8.hex16(pc)} running=${st.running} ` +
      `B800=${[...eng].map((b) => b.toString(16).padStart(2, "0")).join(" ")} ` +
      `unpacked=${unpacked}` +
      (st.debugState.faultType ? ` FAULT ${st.debugState.faultType}` : "")
    );
    if (i % 8 === 7) {
      await api.input.tapKey({ key: " ", code: "Space" }, { holdMs: "80ms", afterMs: "80ms" });
    }
    if (unpacked) {
      done = true;
      await a8.snap(api, path.join(out, "loaded.png"));
      const block = await a8.readBytes(api, 0x0e00, 0xba80 - 0x0e00 + 1);
      fs.writeFileSync(path.join(out, "game-live.bin"), Buffer.from(block));
      console.log("saved game-live.bin", block.length);
      break;
    }
  }
  if (!done) await a8.snap(api, path.join(out, "timeout.png"));
  await runtime.dispose();
}

main().catch((e) => { console.error(e); process.exit(1); });

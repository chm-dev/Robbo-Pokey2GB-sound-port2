/* Probe 1: boot Robbo, settle, find the sound engine.
 *
 * The XEX preflight tells us the load segments. We expect the POKEY sound
 * engine somewhere in $B800-$BAFF (game RAM under BASIC shadow — BASIC must
 * be off). Dump that window, scan for STY/STA $D200-$D20F stores (8D/9D/AD...
 * i.e. opcode 8D absolute STA) to locate the register writes, and disassemble
 * around any hit.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const a8 = require("./a8");

async function main() {
  const { runtime, api } = await a8.boot({ turbo: true });
  const out = path.join(__dirname, "..", "build");
  fs.mkdirSync(out, { recursive: true });

  console.log("segments:", JSON.stringify(runtime.xexInfo && runtime.xexInfo.segments || null));
  console.log("init:", runtime.xexInfo && a8.hex16(runtime.xexInfo.initAddress));
  console.log("run:", runtime.xexInfo && a8.hex16(runtime.xexInfo.runAddress));

  // Give the game time to load the main program and draw the menu.
  await a8.settle(api, 4, true);
  await a8.settle(api, 4, true);
  const st = await api.getSystemState();
  console.log("PC:", a8.hex16(st.debugState.pc), "running:", st.running,
    "portB:", a8.hex8(st.bankState.portB));
  await a8.snap(api, path.join(out, "boot.png"));

  // Dump $0E00-$BA80 game block to file for offline analysis.
  const bytes = await a8.readBytes(api, 0x0e00, 0xba80 - 0x0e00 + 1);
  fs.writeFileSync(path.join(out, "game-block.bin"), Buffer.from(bytes));
  console.log("game block:", bytes.length, "bytes");

  // Find 16-bit STA writes into $D200..$D20F (POKEY audio regs).
  // STA abs = 8D lo hi ; STY abs = 8C ; and zero-page forms ignored.
  const hits = [];
  for (let i = 0; i + 3 < bytes.length; i++) {
    const op = bytes[i];
    if (op !== 0x8d && op !== 0x8c) continue;
    const addr = bytes[i + 1] | (bytes[i + 2] << 8);
    if (addr >= 0xd200 && addr <= 0xd20f) {
      hits.push({ pc: 0x0e00 + i, op, addr });
    }
  }
  console.log("POKEY store sites:", hits.length);
  for (const h of hits) {
    console.log("  ", a8.hex16(h.pc), h.op === 0x8d ? "STA" : "STY", a8.hex16(h.addr));
  }

  await runtime.dispose();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

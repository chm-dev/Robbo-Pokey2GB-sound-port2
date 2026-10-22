/* Probe 3: disassemble the sound engine region and hexdump the note table. */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const a8 = require("./a8");

async function main() {
  const { runtime, api } = await a8.boot({ turbo: true });
  const out = path.join(__dirname, "..", "build");

  for (const pc of [0xb800, 0xb84b, 0xb86c]) {
    const ins = await a8.disasm(api, pc, 0, pc === 0xb800 ? 20 : 40);
    console.log("== disasm from", a8.hex16(pc));
    for (const i of ins) {
      const bs = Array.isArray(i.bytes)
        ? i.bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")
        : String(i.bytes || i.hex || "");
      const text = i.text || `${i.mnemonic || "?"} ${i.operand || i.mode || ""}`;
      console.log(`  ${a8.hex16(i.address)}  ${bs.padEnd(10)}  ${text}`);
    }
  }

  // Hexdump of table region $B896-$BA80
  const bytes = await a8.readBytes(api, 0xb896, 0xba80 - 0xb896 + 1);
  fs.writeFileSync(path.join(out, "table-raw.bin"), Buffer.from(bytes));
  for (let o = 0; o < bytes.length; o += 32) {
    const addr = 0xb896 + o;
    const line = [...bytes.subarray(o, o + 32)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join(" ");
    console.log(a8.hex16(addr), line);
  }
  await runtime.dispose();
}

main().catch((e) => { console.error(e); process.exit(1); });

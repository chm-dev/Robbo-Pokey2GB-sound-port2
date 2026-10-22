/* Probe 4: disassemble around every JSR $B800 site to infer the calling
 * convention (which register carries pattern index / voice).
 */
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const a8 = require("./a8");

const SITES = [0x2468, 0x25b1, 0x28b1, 0x2a37, 0x2a60, 0x2a91, 0x2b13, 0x2b45,
  0x2b58, 0x2b7a, 0x2b9e, 0x2bc0, 0x2be0, 0x2c03, 0x2ce1, 0x2d95, 0x2dce,
  0x2ddb, 0x2e01, 0x2e27, 0x2e88, 0x2fd0, 0x325d, 0x3275, 0xa9eb, 0xaa15,
  0xaa2b, 0xaa5c, 0xaa6e, 0xaab8, 0xaae5, 0xab0a];

async function waitUnpacked(api, timeoutS = 60) {
  for (let i = 0; i < timeoutS; i++) {
    await api.system.waitForTime({ ms: "1000ms" });
    const eng = await a8.readBytes(api, 0xb800, 6);
    if (eng[0] === 0x4c && eng[1] === 0x06 && eng[2] === 0xb8) return true;
  }
  return false;
}

async function main() {
  const { runtime, api } = await a8.boot({ turbo: true });
  if (!(await waitUnpacked(api))) { console.log("TIMEOUT waiting for unpack"); await runtime.dispose(); return; }
  for (const site of SITES) {
    const ins = await a8.disasm(api, site, 10, 1);
    console.log("=== site", a8.hex16(site));
    for (const i of ins) {
      const bs = Array.isArray(i.bytes) ? i.bytes.map(b => b.toString(16).padStart(2, "0")).join(" ") : "";
      console.log(`  ${a8.hex16(i.address)}  ${bs.padEnd(8)} ${i.text || i.mnemonic || ""}`);
    }
  }
  await runtime.dispose();
}

main().catch((e) => { console.error(e); process.exit(1); });

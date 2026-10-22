/* Shared jsA8E headless harness for Robbo RE.
 * Boots an Atari 800XL PAL machine with BASIC off, launches xex/robbo.xex,
 * and exposes helpers used by the probe/trace scripts.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { createHeadlessAutomation } = require(
  path.join(__dirname, "..", "..", "A8Emulator", "headless.js")
);

const REPO = path.resolve(__dirname, "..", "..");
const XEX_DEFAULT = path.join(REPO, "xex", "robbo.xex");
const XEX_FAST = path.join(REPO, "sound-port", "tests", "robbo-fast.xex");
const ROMS = {
  os: path.join(REPO, "A8Emulator", "ATARIXL.ROM"),
  basic: path.join(REPO, "A8Emulator", "ATARIBAS.ROM"),
};

async function boot(opts = {}) {
  const xexPath = opts.xex || XEX_FAST;
  const runtime = await createHeadlessAutomation({
    roms: ROMS,
    turbo: opts.turbo !== false,
    frameDelayMs: 0,
    skipRendering: opts.shots ? false : true,
    optionOnStart: true, // BASIC off — required for Robbo
  });
  const api = runtime.api;
  const bytes = fs.readFileSync(xexPath);
  const run = await api.dev.runXex({
    bytes,
    name: path.basename(xexPath),
    resetOptions: { portB: 0xff },
    awaitEntry: false,
    start: true,
  });
  if (!run.ok) throw new Error("runXex failed: " + JSON.stringify(run));
  runtime.xexInfo = run.xexPreflight || null;
  return { runtime, api };
}

/* Wait real-time seconds and optionally tap fire to clear the intro. */
async function settle(api, seconds, tapFire) {
  await api.system.waitForTime({ ms: `${Math.round(seconds * 1000)}ms` });
  if (tapFire) {
    await api.input.setJoystick({ trigger: true });
    await api.system.waitForTime({ ms: "120ms" });
    await api.input.setJoystick({ trigger: false });
    await api.system.waitForTime({ ms: "120ms" });
  }
}

async function readRangeBytes(api, start, length) {
  const res = await api.debug.readRange(start, length, { format: "hex" });
  const hex = typeof res === "string" ? res : res.hex || res.data;
  const clean = String(hex).replace(/[^0-9a-fA-F]/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

async function readBytes(api, start, length) {
  const res = await api.debug.readRange(start, length);
  if (res && typeof res === "object" && typeof res.length === "number") {
    return new Uint8Array(res);
  }
  if (res && res.bytes) return new Uint8Array(res.bytes.buffer || res.bytes);
  if (typeof res === "string") return await readRangeBytes(api, start, length);
  throw new Error("unexpected readRange result: " + JSON.stringify(res));
}

async function disasm(api, pc, before, after) {
  const res = await api.debug.disassemble({
    pc,
    beforeInstructions: before || 0,
    afterInstructions: after || 60,
  });
  return res.instructions || res;
}

async function snap(api, file) {
  const shot = await api.artifacts.captureScreenshot({ encoding: "bytes" });
  fs.writeFileSync(file, Buffer.from(shot.bytes));
  return file;
}

async function regs(api) {
  const ds = await api.debug.getDebugState();
  return ds;
}

async function counters(api) {
  const c = await api.getCounters();
  return c;
}

function hex16(v) {
  return "$" + (v & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

function hex8(v) {
  return "$" + (v & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

module.exports = {
  boot, settle, readBytes, readRangeBytes, disasm, snap, regs, counters,
  hex16, hex8, REPO, XEX_DEFAULT, XEX_FAST,
};

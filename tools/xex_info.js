/* XEX file parser: validate header, list segments, extract raw data blocks.
 *
 * XEX layout: $FF $FF, u16 headerLength (bytes after these four), then a list
 * of u16 pairs (start, end). start==$02E2 -> INITAD (value = 'end'),
 * $02E3 -> RUNAD, $02E4 -> XEXED ('end' = count of security bytes that follow
 * in the data stream). After the header, segment data blocks appear in order,
 * each end-start+1 bytes long.
 *
 * Usage: node tools/xex_info.js <file.xex> [--dump out-dir]
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parse(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xff) {
    throw new Error("not a XEX file (bad magic)");
  }
  const headerLength = buffer.readUInt16LE(2);
  const segments = [];
  let init = null;
  let run = null;
  let securityBytes = 0;
  let o = 4;
  const headerEnd = o + headerLength;
  for (; o + 3 < headerEnd; o += 4) {
    const start = buffer.readUInt16LE(o);
    const end = buffer.readUInt16LE(o + 2);
    if (start === 0x02e2) init = end;
    else if (start === 0x02e3) run = end;
    else if (start === 0x02e4) securityBytes = end || 1;
    else segments.push({ start, end, dataOffset: 0 });
  }
  // Data blocks follow the header in order.
  o = headerEnd;
  for (const seg of segments) {
    const len = seg.end - seg.start + 1;
    seg.dataOffset = o;
    seg.data = buffer.subarray(o, o + len);
    o += len;
  }
  // RAM image with holes filled as 0, for quick lookups.
  return { headerLength, init, run, securityBytes, segments, dataEnd: o };
}

function main() {
  const args = process.argv.slice(2);
  const file = args[0];
  if (!file) throw new Error("usage: xex_info.js <file.xex> [--dump dir]");
  const buf = fs.readFileSync(file);
  const x = parse(buf);
  console.log(path.basename(file), buf.length, "bytes");
  console.log("headerLength:", x.headerLength);
  console.log("INITAD:", x.init === null ? "-" : "$" + x.init.toString(16).toUpperCase().padStart(4, "0"));
  console.log("RUNAD :", x.run === null ? "-" : "$" + x.run.toString(16).toUpperCase().padStart(4, "0"));
  console.log("security bytes:", x.securityBytes);
  for (const seg of x.segments) {
    console.log(
      `  seg $${seg.start.toString(16).toUpperCase().padStart(4, "0")}` +
        `-$${seg.end.toString(16).toUpperCase().padStart(4, "0")}` +
        `  len=${seg.end - seg.start + 1}  dataOffset=${seg.dataOffset}`
    );
  }
  console.log("dataEnd:", x.dataEnd, "(file", buf.length + ")");

  const dIdx = args.indexOf("--dump");
  if (dIdx >= 0) {
    const dir = args[dIdx + 1] || ".";
    fs.mkdirSync(dir, { recursive: true });
    // Write a 64K combined image (0-filled gaps) plus a JSON manifest.
    const ram = new Uint8Array(0x10000);
    for (const seg of x.segments) ram.set(seg.data, seg.start);
    fs.writeFileSync(path.join(dir, "loaded-ram.bin"), Buffer.from(ram));
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify(
        {
          file: path.basename(file),
          init: x.init,
          run: x.run,
          segments: x.segments.map((s) => ({ start: s.start, end: s.end, dataOffset: s.dataOffset })),
        },
        null,
        2
      )
    );
    console.log("dumped:", dir);
  }
}

main();

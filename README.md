# sound-port2 — Robbo POKEY SFX on Game Boy

Faithful port of the sound effects from the Atari 8-bit game **Robbo**
(LK Avalon, 1989; `xex/robbo.xex`) to Game Boy (GBDK-2020). The sound data is
the game's own POKEY register table; the player reproduces the original
engine's behavior. Verified by A/B listening against the original game on
SameBoy and real hardware.

Two deliverables:

- **`roms/robbo-sfx2.gb`** — a test browser (UP/DOWN select, A play, B stop;
  in-ROM title "ROBBO SFX v1R3"). Development tool only.
- **`PORTING.md`** + `src/` — the reusable sound library and the integration
  contract for wiring these effects into the Game Boy game.

## Game sound set (current)

12 patterns, named in `src/sfx.h`:

| pattern | `SFX_*` define    | game event                       |
|---------|-------------------|----------------------------------|
| $01     | `SFX_SHOT`        | laser fired                      |
| $02     | `SFX_HIT_WALL`    | laser hits a wall                |
| $03     | `SFX_TELEPORT`    | teleport                         |
| $04     | `SFX_BOLT`        | bolt collected                   |
| $05     | `SFX_EXTRA_LIFE`  | extra life                       |
| $07     | `SFX_AMMO`        | ammo collected (+9 shots)        |
| $08     | `SFX_PUSH`        | pushing a block                  |
| $09     | `SFX_KEY`         | key collected                    |
| $0B     | `SFX_LEVEL_START` | new level fanfare                |
| $0C     | `SFX_LEVEL_END`   | exit capsule / level complete    |
| $0D     | `SFX_GAME_OVER`   | lives reach 0 (call-site inferred)|
| $0E     | `SFX_MAGNET`      | magnet death                     |

$00 (EXPLOSION), $06 (DOOR OPEN) and $0A (DESTRUCT) are out of the game set:
hidden from the browser and hard-muted in `fixes[]` (in-game calls are
silent no-ops). Their raw data remains in `sfx_data.c`.

## Data provenance / extraction

- Table recovered from **live RAM** of the real game:
  `tools/watch-boot.js` boots `sound-port/tests/robbo-fast.xex` in the jsA8E
  headless emulator, waits for the crack loader to unpack (~22 s), and dumps
  $0E00–$BA80 to `build/game-live.bin`. The game block is byte-identical to
  the corresponding segment of the canonical `xex/robbo.xex`.
- Original engine (disassembled): trigger at `$B806` (A = pattern 0..14,
  bit 7 = stop all), tick at `$B84B` steps every 4th PAL frame
  (RTCLOK & 3 == 0 → 80 ms per step), register pair output at `$B86C`.
  Table at `$B896 + 32 * pattern`, 16 (AUDC, AUDF) pairs played back from
  pair 15 down to pair 0.
- `tools/export_sfx.js` regenerates `src/sfx_data.c` from the RAM dump.
  **Never hand-edit `sfx_data.c`.**

## POKEY → DMG mapping (current)

All Robbo patterns use the 64 kHz POKEY base clock (AUDC bit 4 = 0).

| AUDC distortion | DMG rendering                                        |
|---|---|
| 5 / 7 | pulse ch1, 50% duty, f = 63921 / (2·(AUDF+1)) |
| 6     | pulse ch1, 25% duty, f = 63921 / (15·(AUDF+1)) |
| 4     | ch4 noise, f = 63921 / (AUDF+1) |
| 0–3   | ch4 noise, f = 63921 / (AUDF+1) × 16/31 |

- Volume nibble (AUDC 0–15) ×2, clamped to 15 (POKEY's low steps are very
  quiet next to the DMG ladder).
- One register update per 4.8 DMG frames (80 ms grid), retriggered each
  step; trailing silent pairs stop playback early.
- Channels used: **CH1 (pulse) + CH4 (noise)** only. CH2/CH3 stay free for
  game music. `sound_init()` enables the APU (NR52 bit 7) **first** — real
  hardware ignores/zeroes APU config while it is powered down.
- Per-pattern overrides live in `fixes[]` in `sfx.c`: `len` (cap audible
  steps), `oct_dn` (lower the final NR43 shift field), `mute`. Currently the
  three out-of-set patterns are muted.
- **Landmine:** `noise_nr43()` writes the shift field as `shift << 4`. This
  bit layout is deliberate — the approved noise output depends on it. Do not
  "fix" it to `<< 3`.

## Build & tools

```
pwsh tools/build.ps1 [-Clean] [-ExtraCFlags "-DDEMO_ALL -DDEBUG_CELLS | -DTEST_NOTE=N"]
```

Atari-side RE:

- `tools/a8.js` + `tools/watch-boot.js` — boot the Atari ROM headless (jsA8E),
  dump the live game RAM to `build/game-live.bin`.
- `tools/xex_info.js` — XEX segment parser; `tools/decode_table.js` — readable
  dump of the POKEY table from the RAM image.
- `tools/probe*.js`, `tools/trace*.js` — engine disassembly and event-trace
  helpers kept for reference.

GB-side:

- `tools/export_sfx.js` — regenerate `src/sfx_data.c` from the RAM dump.
- `tools/measure-rom.js` — serverboy burst/amplitude sanity check (verifies
  that patterns trigger and stop; **serverboy's audio rendering is not a
  fidelity oracle** — timbre/timing verdicts come from SameBoy/hardware).
- Other serverboy harnesses (`gbcheck.js`, `dbgrun.js`, `v2*.js`,
  `testnotes.js`, `render_wav.js`) are superseded by `measure-rom.js`, kept
  for reference.

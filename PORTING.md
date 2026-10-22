# PORTING.md — wiring Robbo SFX into the Game Boy game

Audience: the agent integrating these sound effects into the Robbo GB port.
Everything needed is in `src/`; this file is the whole contract.

## 1. Files

| file | role |
|---|---|
| `sfx.h` | public API + `SFX_*` event defines (the game only includes this) |
| `sfx.c` | the player (POKEY->DMG mapping + per-pattern `fixes[]`) |
| `sfx_data.h` / `sfx_data.c` | the 15 authentic register patterns, generated from the Atari ROM — do not hand-edit |

Copy all four into the game project, compile `sfx.c` + `sfx_data.c` with lcc
(no special flags). `main.c` in this folder is just the test browser — do not
port it.

## 2. Integration (3 touch points)

```c
#include "sfx.h"

void main(void) {
    sound_init();                       /* once at boot */
    while (1) {
        /* game logic: */
        if (player_shot)      sfx_play_note(SFX_SHOT);
        if (picked_bolt)      sfx_play_note(SFX_BOLT);
        if (lives_zero)       sfx_play_note(SFX_GAME_OVER);
        /* ... etc, see table below ... */

        sfx_update();                   /* EXACTLY once per frame, in the */
        vsync();                        /* main loop, NOT from an ISR     */
    }
}
```

Rules:
- **Monophonic** (like the original's effect voice): a new `sfx_play_note()`
  replaces whatever is playing. That is correct behavior — the Atari game
  did the same (one voice per slot, effects share slots).
- `sfx_update()` assumes a steady 60 Hz. It derives the original's 80 ms
  POKEY step internally (4.8-frame accumulator); never call it from an ISR
  or twice per frame.
- `sfx_stop()` on pause/reset (`playing` state also resets on `sound_init`).
- The 80 ms grid is exact; total pattern length is 16 steps max (~1.28 s),
  shorter when the pattern's tail is silent (auto-stop).

## 3. Channels & mixer

The player uses **CH1 (pulse)** and **CH4 (noise)** only.
`sound_init()` sets NR50/NR51 for both to full L+R, NR52 on (must be first —
hardware ignores APU config while bit 7 is 0).
- Game music (if any) belongs on CH2/CH3, or route effects to CH2 later
  (one-line change: `NR1x` -> `NR2x` in `apply_step`).
- No banked/ROM-XM requirements; the table is ~500 bytes const.

## 4. Event table (verified by A/B listening vs the original, 2026-10-22)

| define | pattern | game event | notes |
|---|---|---|---|
| `SFX_SHOT` | $01 | laser fired | truncated to its 1st portion |
| `SFX_HIT_WALL` | $02 | laser impact on wall | |
| `SFX_TELEPORT` | $03 | teleport | |
| `SFX_BOLT` | $04 | bolt collected | |
| `SFX_EXTRA_LIFE` | $05 | extra life | |
| `SFX_AMMO` | $07 | ammo pickup (+9) | |
| `SFX_PUSH` | $08 | push / blocked action | |
| `SFX_KEY` | $09 | key collected | |
| `SFX_LEVEL_START` | $0B | new level | noise part + tone run |
| `SFX_LEVEL_END` | $0C | exit capsule / level end | |
| `SFX_GAME_OVER` | $0D | lives reached 0 | inferred from Atari code |
| `SFX_MAGNET` | $0E | magnet death | |

Removed from the set (calling them is a silent no-op, `fixes[]` mutes):
$00 EXPLOSION, $0A DESTRUCT, $06 DOOR OPEN. Raw data still present if they
ever come back — clear their `mute` flags.

## 5. Tuning / regeneration

- Per-pattern tweaks live in `fixes[]` in `sfx.c` (`len`, `oct_dn`, `mute`).
- WARNING for anyone touching `noise_nr43()`: the encoder deliberately keeps
  the original build's `shift << 4` bit layout — ears approved the output it
  produces. "Fixing" it to `<< 3` changes every noise sound.
- `sfx_data.c` is regenerated from the Atari RAM dump with
  `node tools/export_sfx.js` (provenance in README.md). Never hand-edit.
- Verification tools in `tools/` (menu builds: `build.ps1 -Clean`;
  serverboy audio measurement is unreliable — trust SameBoy/hardware ears).

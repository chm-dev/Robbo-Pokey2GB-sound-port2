#ifndef SFX_H
#define SFX_H

#include <stdint.h>

/*
 * Robbo (Atari 8-bit, LK Avalon 1989) POKEY sound effects on Game Boy.
 * Standalone library: drop sfx.c + sfx_data.c into the project, call the
 * four functions below.  No dynamic allocation, no interrupts required,
 * safe to call from a 60 Hz main loop.  See PORTING.md for integration.
 */

/* Reset the APU (assumes no music engine yet: takes over ch1 + ch4). */
void sound_init(void);

/* Start one effect by pattern index (see SFX_* names below). Monophonic:
 * playing a new effect replaces the current one. Muted/removed patterns
 * ($00, $0A, $06) do nothing. */
void sfx_play_note(uint8_t note);

/* Silence all effect channels immediately. */
void sfx_stop(void);

/* Advance the player; MUST be called exactly once per frame (60 Hz).
 * The original POKEY engine stepped every 80 ms; the player reproduces
 * that with an internal 4.8-frame accumulator. */
void sfx_update(void);

/* 1 while a pattern is still running. */
uint8_t sfx_is_playing(void);

/* Pattern index currently playing, or 0xFF. */
uint8_t sfx_current(void);

/* ---- game events (pattern numbers verified by A/B listening against the
 * ---- original; comments note confidence) ---------------------------- */

#define SFX_SHOT         0x01  /* firing the laser (short bright tick)     */
#define SFX_HIT_WALL     0x02  /* laser hitting a wall (single hiss tick)  */
#define SFX_TELEPORT     0x03  /* teleport / level-entry warp (tone run)   */
#define SFX_BOLT         0x04  /* bolt collected                           */
#define SFX_EXTRA_LIFE   0x05  /* extra life awarded                       */
#define SFX_AMMO         0x07  /* ammo collected (plus 9 shots)            */
#define SFX_PUSH         0x08  /* pushing a block / blocked action         */
#define SFX_KEY          0x09  /* key collected                            */
#define SFX_LEVEL_START  0x0B  /* new level fanfare (noise + tone run)     */
#define SFX_LEVEL_END    0x0C  /* exit capsule reached / level complete    */
#define SFX_GAME_OVER    0x0D  /* lives reached 0 (inferred from $A0 check)*/
#define SFX_MAGNET       0x0E  /* magnet hazard death (hiss/rumble alter.) */

/* Removed from the game sound set (still in the data table):
 * 0x00 EXPLOSION, 0x0A DESTRUCT, 0x06 DOOR OPEN (muted in original). */

#endif /* SFX_H */

/* sfx.c - POKEY -> Game Boy sound-effect player (v1R: faithful restore of
 * the FIRST BUILD THAT PRODUCED SOUND, 2026-10-22).
 *
 * This is the mapping from the original porting session: raw POKEY tick
 * rates straight onto the DMG channels, per-step retrigger, POKEY volume
 * x2, 80 ms step grid.  Every later experiment (v2 octave shifts, v3 7-bit
 * mode, v4 wave-channel samples, v5 pinned clocks, v6 white-hiss lock,
 * v7 ramps + rumble beds) is REVERTED OUT of this file.
 *
 * Source data: the 15 raw (AUDC, AUDF) register tables recovered from the
 * Robbo game image at $B896 (see sfx_data.c).  The Atari engine steps every
 * voice once per 4 PAL frames (RTCLOK & 3 == 0) -> 80 ms per step and
 * rewrites both AUDFn and AUDCn each step.  We reproduce that: one register
 * update every 4.8 DMG frames using a fixed-point accumulator.
 *
 * Mapping (all Robbo patterns use the 64 kHz base clock):
 *
 *   dist 5 / 7   square wave f = 63921 / (2*(AUDF+1))   -> pulse1, 50% duty
 *   dist 6       f = 63921 / (15*(AUDF+1))               -> pulse1, 25% duty
 *   dist 4       f = 63921 / (AUDF+1)   (noise)          -> ch4 noise
 *   dist 0..3    f = 63921/(AUDF+1)*16/31 (noise)        -> ch4 noise
 *   AUDC vol 0..15 -> DMG vol x2 (clamped to 15)
 *
 * Historical note: the original build also contained an APU-power bug
 * (NR52=0x11) that muted real hardware; the audible v1 shipped with the
 * power-on fix below and nothing else changed.  The noise_nr43 encoder here
 * reproduces the original build's bit-layout (shift << 4) as faithfully as
 * possible because that is the exact output the ear-tests approved.
 */
#include <gb/gb.h>
#include <stdint.h>

#include "sfx.h"
#include "sfx_data.h"

/* POKEY master clocks (PAL). */
#define POKEY_CLOCK_64K   63921UL
#define POKEY_CLOCK_179M  1789773UL

/* Minimal per-pattern fixes on top of the pure v1 mapping, from the
 * round-8 ear test: explosion -3 octaves, destruct half length,
 * door-open muted (silent in the original game). */
typedef struct {
    uint8_t len;        /* audible steps (0 = all)               */
    uint8_t oct_dn;     /* noise: lower final NR43 shift by N oct*/
    uint8_t mute;       /* 1 = pattern plays nothing             */
} PatternFix;

/* clang-format off */
static const PatternFix fixes[SFX_NOTE_COUNT] = {
    { 0, 3, 1 }, /* $00 EXPLOSION   : REMOVED from game set (was -3 oct)  */
    { 0, 0, 0 }, /* $01 SHOT        */
    { 0, 0, 0 }, /* $02 HIT WALL    */
    { 0, 0, 0 }, /* $03 TELEPORT    */
    { 0, 0, 0 }, /* $04 BOLT        */
    { 0, 0, 0 }, /* $05 EXTRA LIFE  */
    { 0, 0, 1 }, /* $06 DOOR OPEN   : REMOVED from game set                 */
    { 0, 0, 0 }, /* $07 AMMO        */
    { 0, 0, 0 }, /* $08 PUSH        */
    { 0, 0, 0 }, /* $09 KEY         */
    { 4, 0, 1 }, /* $0A DESTRUCT    : REMOVED from game set (was len 4)   */
    { 0, 0, 0 }, /* $0B LEVEL START */
    { 0, 0, 0 }, /* $0C LEVEL END   */
    { 0, 0, 0 }, /* $0D GAME OVER   */
    { 0, 0, 0 }, /* $0E MAGNET      */
};
/* clang-format on */

static uint8_t playing;
static uint8_t step;
static uint8_t sub;        /* frame*10 accumulator, steps at >= 48 (4.8f) */
static uint8_t cur_note = 0xFF;

/* POKEY volume nibble -> DMG volume (doubled, POKEY tables are quiet). */
static uint8_t vol_of(uint8_t audc)
{
    uint8_t v = (uint8_t)(audc & 0x0F) << 1;
    if (v > 15) v = 15;
    return v;
}

/* Closest DMG noise frequency code for hz.  NB: `shift << 4` reproduces
 * the ORIGINAL build's encoder (its register writes are what the ears
 * approved); do not "fix" it without re-listening. */
static uint8_t noise_nr43(uint32_t hz)
{
    uint8_t best = 0;
    uint32_t best_err = 0xFFFFFFFFUL;
    uint8_t shift, code;

    for (shift = 0; shift < 14; shift++) {
        for (code = 0; code < 4; code++) {
            uint32_t f = 524288UL >> shift;
            f >>= (code + 1);
            {
                uint32_t err = (f > hz) ? (f - hz) : (hz - f);
                if (err < best_err) {
                    best_err = err;
                    best = (uint8_t)((shift << 4) | code);
                }
            }
        }
    }
    return best;
}

static void pulse_off(void)
{
    NR12_REG = 0x00;
    NR14_REG = 0x80;
}

static void noise_off(void)
{
    NR42_REG = 0x00;
    NR44_REG = 0x80;
}

static void silence_all(void)
{
    pulse_off();
    noise_off();
}

static void apply_step(uint8_t index)
{
    const SfxStep *s = &sfx_notes[cur_note][index];
    uint8_t audc = s->audc;
    uint8_t vol;
    uint8_t dist;
    uint32_t clock;
    uint32_t div;
    uint32_t hz;

    if (audc == 0) {
        silence_all();
        return;
    }

    vol = vol_of(audc);
    if (vol == 0) {
        silence_all();
        return;
    }

    dist = (uint8_t)(audc >> 5);
    clock = (audc & 0x10) ? POKEY_CLOCK_179M : POKEY_CLOCK_64K;
    div = (uint32_t)s->audf + 1UL;

    switch (dist) {
    case 5:
    case 7:
    default: {
        /* square wave */
        uint32_t period;
        uint16_t t;
        hz = clock / (2UL * div);
        if (hz < 31UL) hz = 31UL;
        if (hz > 65535UL) hz = 65535UL;
        period = 2048UL - (131072UL / hz);
        if (period > 2047UL) period = 2047UL;
        t = (uint16_t)period;
        noise_off();
        NR11_REG = (uint8_t)(2 << 6);           /* 50% duty */
        NR12_REG = (uint8_t)(vol << 4);
        NR13_REG = (uint8_t)(t & 0xFF);
        NR14_REG = (uint8_t)(0x80 | (t >> 8));
        break;
    }
    case 6: {
        /* 4-bit poly sampled per tick: buzzy tone */
        uint32_t period;
        uint16_t t;
        hz = clock / (15UL * div);
        if (hz < 31UL) hz = 31UL;
        if (hz > 65535UL) hz = 65535UL;
        period = 2048UL - (131072UL / hz);
        if (period > 2047UL) period = 2047UL;
        t = (uint16_t)period;
        noise_off();
        NR11_REG = (uint8_t)(1 << 6);           /* 25% duty */
        NR12_REG = (uint8_t)(vol << 4);
        NR13_REG = (uint8_t)(t & 0xFF);
        NR14_REG = (uint8_t)(0x80 | (t >> 8));
        break;
    }
    case 4:
    case 1:
    case 2:
    case 3:
    case 0: {
        /* 17-bit poly noise; 0-3 are additionally gated by the 5-bit poly */
        uint8_t nr43;
        uint8_t oct = fixes[cur_note].oct_dn;

        hz = clock / div;
        if (dist <= 3) hz = (hz * 16UL) / 31UL;
        if (hz < 4UL) hz = 4UL;
        if (hz > 262144UL) hz = 262144UL;
        pulse_off();
        NR41_REG = 0x00;                        /* infinite length */
        NR42_REG = (uint8_t)(vol << 4);
        nr43 = noise_nr43(hz);
        if (oct) {
            /* -N octaves at the OUTPUT: tweak the hardware shift field
             * (NR43 bits 6-3) directly; the encoder above is quirky, so
             * dividing the input hz would NOT shift uniformly. */
            uint8_t sh = (uint8_t)(((nr43 >> 3) & 0x0F) + oct);
            if (sh > 13) sh = 13;
            nr43 = (uint8_t)((nr43 & 0x87) | (sh << 3));
        }
        NR43_REG = nr43;
        NR44_REG = 0x80;                        /* retrigger */
        break;
    }
    }
}

static uint8_t has_sound(uint8_t from)
{
    uint8_t limit = fixes[cur_note].len ? fixes[cur_note].len : SFX_STEPS;
    uint8_t i;
    for (i = from; i < limit; i++) {
        if (sfx_notes[cur_note][i].audc != 0) return 1;
    }
    return 0;
}

void sound_init(void)
{
    NR52_REG = 0x80;            /* APU ON first: real hardware ignores the
                                 * rest of the config while bit 7 is 0. */
    NR10_REG = 0x00;
    NR11_REG = 0x00;
    NR12_REG = 0x00;
    NR13_REG = 0x00;
    NR14_REG = 0x00;
    NR41_REG = 0x00;
    NR42_REG = 0x00;
    NR43_REG = 0x00;
    NR44_REG = 0x00;
    NR51_REG = 0xFF;            /* ch1 + ch4 to both speakers */
    NR50_REG = 0xFF;            /* max master volume */
    playing = 0;
    step = 0;
    sub = 0;
    cur_note = 0xFF;
}

void sfx_play_note(uint8_t note)
{
    if (note >= SFX_NOTE_COUNT) return;
    if (fixes[note].mute) return;
    cur_note = note;
    step = 0;
    sub = 0;
    playing = 1;
    if (!has_sound(0)) { sfx_stop(); return; }
    apply_step(0);
}

void sfx_stop(void)
{
    playing = 0;
    cur_note = 0xFF;
    silence_all();
}

void sfx_update(void)
{
    if (!playing) return;

    sub += 10;                  /* 10 = 1 frame in units of 0.1 frame */
    if (sub < 48) return;       /* 4.8 DMG frames per POKEY step */
    sub -= 48;

    step++;
    if (step >= SFX_STEPS || !has_sound(step)) {
        sfx_stop();
        return;
    }
    apply_step(step);
}

uint8_t sfx_is_playing(void)
{
    return playing;
}

uint8_t sfx_current(void)
{
    return cur_note;
}

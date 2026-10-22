/*
 * Robbo (LK Avalon, 1989) - POKEY SFX on Game Boy, pattern browser.
 *
 * Sound data: the 15 POKEY register tables ($B896-$BA75) recovered from the
 * live RAM of xex/robbo.xex after the crack loader unpacked the game.
 * Playback order and the 80 ms step rate follow the original engine
 * (trigger $B806, per-frame tick $B84B, voice output $B86C).
 *
 * The screen lists the 12 sound-set patterns (EXPLOSION, DESTRUCT and DOOR
 * OPEN removed) with labels from A/B listening tests plus call-site inference.
 *
 *   UP/DOWN  select pattern
 *   A        play
 *   B        stop
 */
#include <gb/gb.h>
#include <gbdk/console.h>
#include <stdint.h>
#include <stdio.h>

#include "sfx.h"
#include "sfx_data.h"

#define LIST_Y 2

/*
 * Labels: verified by A/B listening against the original game (2026-10-22).
 * Where the tester was unsure, inferred from call-site context:
 *   $0D fires when the lives byte ($A0) reaches 0   -> GAME OVER
 * $00 EXPLOSION, $0A DESTRUCT and $06 DOOR OPEN were removed from the game
 * sound set (fixes[] mutes them; the raw data stays in sfx_data.c).
 */
static const char *const labels[SFX_NOTE_COUNT] = {
    "EXPLOSION",  /* $00 : removed from set */
    "SHOT",       /* $01 */
    "HIT WALL",   /* $02 */
    "TELEPORT",   /* $03 */
    "BOLT",       /* $04 */
    "EXTRA LIFE", /* $05 */
    "DOOR OPEN",  /* $06 : muted */
    "AMMO",       /* $07 */
    "PUSH",       /* $08 */
    "KEY",        /* $09 */
    "DESTRUCT",   /* $0A : removed from set */
    "LEVEL START",/* $0B */
    "LEVEL END",  /* $0C */
    "GAME OVER",  /* $0D */
    "MAGNET",     /* $0E */
};

/* Patterns offered by this browser ($00, $0A and $06 removed from the set). */
static const uint8_t play_list[] = {
    0x01, 0x02, 0x03, 0x04, 0x05, 0x07, 0x08, 0x09, 0x0B, 0x0C, 0x0D, 0x0E
};
#define LIST_COUNT (uint8_t)(sizeof(play_list) / sizeof(play_list[0]))

static uint8_t selected;
static uint8_t dirty = 1;
static uint8_t was_playing;

static void draw_item(uint8_t row)
{
    static const char hex[] = "0123456789ABCDEF";
    char line[19];
    uint8_t i = 0;
    uint8_t pattern = play_list[row];
    const char *t;

    line[i++] = (row == selected) ? '>' : ' ';
    line[i++] = '$';
    line[i++] = hex[(pattern >> 4) & 0x0F];
    line[i++] = hex[pattern & 0x0F];
    line[i++] = ' ';
    t = labels[pattern];
    while (*t != 0 && i < 17) line[i++] = *t++;
    while (i < 18) line[i++] = ' ';
    line[i] = 0;

    gotoxy(0, (uint8_t)(LIST_Y + row));
    printf("%s", line);
}

static void draw_status(void)
{
    static const char hex[] = "0123456789ABCDEF";
    char line[20];
    uint8_t i = 0;
    uint8_t n;
    uint8_t note;

    if (sfx_is_playing()) {
        const char *label = "PLAYING $";
        note = sfx_current();
        while (label[i] != 0) { line[i] = label[i]; i++; }
        line[i++] = hex[(note >> 4) & 0x0F];
        line[i++] = hex[note & 0x0F];
    } else {
        const char *label = "A=PLAY B=STOP";
        while (label[i] != 0) { line[i] = label[i]; i++; }
    }
    for (n = i; n < 19; n++) line[n] = ' ';
    line[19] = 0;

    gotoxy(0, 17);
    printf("%s", line);
}

static void draw_screen(void)
{
    uint8_t row;

    cls();
    gotoxy(0, 0);
    printf("ROBBO SFX v1R3");

    for (row = 0; row < LIST_COUNT; row++) draw_item(row);
    draw_status();
    dirty = 0;
    was_playing = sfx_is_playing();
}

void main(void)
{
    uint8_t keys;
    uint8_t previous = 0;

    DISPLAY_ON;
    SHOW_BKG;
    sound_init();

#ifdef DEMO_ALL
    /* Verification build: play every pattern once back to back. */
    {
        uint8_t n, f;
        for (n = 0; n < SFX_NOTE_COUNT; n++) {
            cls();
            gotoxy(0, 0);
            printf("DEMO $%02X", (int)n);
            sfx_play_note(n);
            for (f = 0; f < 120; f++) {
                sfx_update();
                vsync();
            }
        }
        while (1) { sfx_update(); vsync(); }
    }
#endif

#ifdef TEST_NOTE
    {
        cls();
        gotoxy(0, 0);
        printf("TEST $%02X", (int)TEST_NOTE);
        sfx_play_note(TEST_NOTE);
        while (1) {
            sfx_update();
            vsync();
        }
    }
#endif

    draw_screen();

    while (1) {
        keys = joypad();

        if ((keys & J_UP) && !(previous & J_UP)) {
            if (selected > 0) {
                uint8_t old = selected;
                selected--;
                draw_item(old);
                draw_item(selected);
            }
        }
        if ((keys & J_DOWN) && !(previous & J_DOWN)) {
            if (selected + 1 < LIST_COUNT) {
                uint8_t old = selected;
                selected++;
                draw_item(old);
                draw_item(selected);
            }
        }
        if ((keys & J_A) && !(previous & J_A)) {
            sfx_play_note(play_list[selected]);
            draw_status();
        }
        if ((keys & J_B) && !(previous & J_B)) {
            sfx_stop();
            draw_status();
        }
        previous = keys;

        sfx_update();

        if (sfx_is_playing() != was_playing) {
            was_playing = sfx_is_playing();
            draw_status();
        }
        if (dirty) draw_screen();

        vsync();
    }
}

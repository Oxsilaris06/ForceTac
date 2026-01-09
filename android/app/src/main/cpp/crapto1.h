#ifndef CRAPTO1_H
#define CRAPTO1_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

struct Crypto1State {
    uint32_t odd;
    uint32_t even;
};

// Fonctions principales de l'attaque
struct Crypto1State* lfsr_recovery32(uint32_t ks2, uint32_t in);
struct Crypto1State* lfsr_recovery64(uint32_t ks2, uint32_t ks3);
uint32_t lfsr_rollback_word(struct Crypto1State *s, uint32_t in, int fb);
struct Crypto1State* lfsr_common_prefix(uint32_t pfx, uint32_t rr, uint8_t ks[8], uint8_t par[8][8]);

// Macros utiles pour la manipulation de bits (si pas déjà définies)
#ifndef BIT
#define BIT(x, n) ((x) >> (n) & 1)
#endif
#ifndef BEBIT
#define BEBIT(x, n) BIT(x, (n) ^ 24)
#endif

// Constantes du polynôme LFSR
#define LF_POLY_ODD  0x29CE5C
#define LF_POLY_EVEN 0x870804

static inline uint8_t parity(uint32_t x) {
#if !defined LOWMEM && (defined __i386__ || defined __x86_64__)
    return __builtin_parity(x);
#else
    x ^= x >> 16;
    x ^= x >> 8;
    x ^= x >> 4;
    return (0x6996 >> (x & 0xf)) & 1;
#endif
}

static inline uint8_t filter(uint32_t const x) {
    uint32_t f;
    f  = 0xf22c0 >> (x       & 0xf) & 16;
    f |= 0x6c9c0 >> (x >> 4  & 0xf) & 8;
    f |= 0x3c8a0 >> (x >> 8  & 0xf) & 4;
    f |= 0x1e4a0 >> (x >> 12 & 0xf) & 2;
    f |= 0x0d240 >> (x >> 16 & 0xf) & 1;
    return 0xEC57E80A >> f & 1;
}

#ifdef __cplusplus
}
#endif

#endif // CRAPTO1_H

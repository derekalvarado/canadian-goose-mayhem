/**
 * Project color palette, sampled and normalized from the game's visual references.
 *
 * Keep scene colors here rather than in individual meshes. Values are intentionally
 * muted and mid-value so the world retains its flat, screen-printed storybook look.
 */
export const PALETTE = {
  goose: {
    white: 0xf3f2e9,
    shade: 0xd9ddd5,
    highlight: 0xfffdf3,
    orange: 0xee8b2d,
    orangeShade: 0xd97524,
    black: 0x202523,
    canadaBrown: 0x756854,
    canadaBrownLight: 0x95836a,
    canadaBrownDark: 0x5b554a,
  },
  green: {
    deciduous: 0x71915b,
    lawn: 0x739b7d,
    grass: 0x668d6f,
    leaf: 0x477653,
    hedge: 0x356445,
    deep: 0x294f39,
    shadow: 0x203f31,
  },
  earth: {
    pathLight: 0xa6987d,
    path: 0x8b7d67,
    pathShade: 0x756957,
    woodLight: 0xa27650,
    wood: 0x76533b,
    woodDark: 0x594331,
  },
  stone: {
    light: 0x999b91,
    mid: 0x7f827b,
    dark: 0x676d68,
  },
  plaza: {
    paverLight: 0xb59676,
    paver: 0x9b775d,
    paverDark: 0x765c4d,
    brickLight: 0xb96750,
    brick: 0x9e4f43,
    brickDark: 0x733f38,
    sandstone: 0xb7795d,
    concrete: 0x9c9588,
    concreteShade: 0x77756f,
    window: 0x334f55,
    awningBlue: 0x27758c,
    awningGreen: 0x366c61,
    rubber: 0x477a79,
    water: 0x69a6ad,
    waterLight: 0x8fc4c3,
    bronze: 0x47736b,
    iron: 0x263d3b,
  },
  oldTown: {
    paving: 0xc3af98,
    pavingLight: 0xcbb9a3,
    pavingShade: 0xbca58d,
  },
  building1: {
    brick: 0xb77961,
    brickAccent: 0xc28b72,
    limestone: 0xd6c9b5,
    glass: 0x455d61,
    frames: 0x866e57,
    awning: 0x648a78,
    awningSeams: 0x567868,
    roof: 0x85827c,
  },
  trashCan: {
    body: 0x414647,
    ribs: 0x55595a,
    lid: 0x626668,
    opening: 0x262d2d,
  },
  flower: {
    coral: 0xd86650,
    yellow: 0xe0b84e,
    pink: 0xc75d76,
  },
  accent: {
    brick: 0xa95043,
    red: 0xc63d36,
    navy: 0x2f4059,
    cream: 0xd8c58f,
    sunlight: 0xf1d38b,
  },
  workwear: {
    safetyVest: 0xb8d83a,
    skin: 0xe3b375,
    trousers: 0x586f7b,
    reflective: 0xdadbd0,
  },
  atmosphere: {
    sky: 0xa9b9ae,
    fog: 0x829b86,
    shadow: 0x183025,
  },
} as const;

export type GamePalette = typeof PALETTE;

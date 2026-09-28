/** Coffee-shop people's speeds and timings, shared by their routines and their walk clips. */
export const BARISTA_WALK_SPEED = 1.9;
/** Faster than a goose weighed down by the tip jar, slower than a goose hurrying empty-beaked. */
export const BARISTA_JOG_SPEED = 3.6;
export const CUSTOMER_WALK_SPEED = 1.5;

export const BARISTA_TUNING = {
  walkSpeed: BARISTA_WALK_SPEED, jogSpeed: BARISTA_JOG_SPEED,
  noticeRadius: 6.5, shooReach: 1.1, chaseSeconds: 7,
  brewSeconds: 4, fixSeconds: 2.2, greetSeconds: 2, wipeSeconds: 2.6, shooSeconds: 0.8, startleRadius: 2.4, evictSeconds: 12,
} as const;

export type CafeVariant = "barista" | "laptop" | "reader" | "student" | "baker";
export const CAFE_VARIANTS: readonly CafeVariant[] = ["barista", "laptop", "reader", "student", "baker"];

export const CUSTOMER_TUNING: Readonly<Record<Exclude<CafeVariant, "barista" | "baker">, { workSeconds: number; guardsTable: boolean; temperament: "timid" | "bold" }>> = {
  laptop: { workSeconds: 6, guardsTable: false, temperament: "bold" },
  reader: { workSeconds: 6.5, guardsTable: true, temperament: "timid" },
  student: { workSeconds: 4.5, guardsTable: false, temperament: "timid" },
};
export const CUSTOMER_SHARED_TUNING = { sipSeconds: 2.2, sipsPerOrder: 3, startleRadius: 2.6, guardRadius: 1.65, shooReach: 1.9, walkSpeed: CUSTOMER_WALK_SPEED } as const;

export function cafeVariantOf(assetId: string): CafeVariant | undefined {
  const variant = assetId.replace(/^coffee\.person-/, "");
  return (CAFE_VARIANTS as readonly string[]).includes(variant) ? variant as CafeVariant : undefined;
}

/** The baker's loop around the kitchen: seconds at each station, and how close the goose may come. */
export const BAKER_TUNING = { walkSpeed: CUSTOMER_WALK_SPEED, stationSeconds: 5, guardRadius: 1.6, shooReach: 1.9, startleRadius: 2.6, shooSeconds: 0.9 } as const;

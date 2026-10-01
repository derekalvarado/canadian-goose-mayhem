import type { TownActivity } from "./simulation/townsfolk.ts";

/**
 * Townsfolk numbers shared by gameplay (`worldLevel.ts`) and the clips built in
 * `TownsfolkModel.ts`, so walk clips always match the speed the simulation moves
 * each person at. Renderer-free.
 */

/** Splash-pad parents, plaza passers-by, and café regulars who come and go through the front door. */
export type TownsfolkLook =
  | "sunhat-mom" | "cap-dad" | "phone-mom" | "beard-dad"
  | "jogger" | "grandpa" | "teen" | "commuter" | "artist"
  | "red-coat" | "bucket-hat" | "raincoat" | "bow-tie";
export const TOWNSFOLK_LOOKS: readonly TownsfolkLook[] = [
  "sunhat-mom", "cap-dad", "phone-mom", "beard-dad",
  "jogger", "grandpa", "teen", "commuter", "artist",
  "red-coat", "bucket-hat", "raincoat", "bow-tie",
];

/** Walking pace in m/s; the jogger's is a run. Everyone strolls a little slower than the barista. */
export const TOWNSFOLK_WALK_SPEEDS: Readonly<Record<TownsfolkLook, number>> = {
  "sunhat-mom": 1.35, "cap-dad": 1.45, "phone-mom": 1.35, "beard-dad": 1.45,
  jogger: 3.1, grandpa: 1.05, teen: 1.4, commuter: 1.75, artist: 1.25,
  "red-coat": 1.3, "bucket-hat": 1.5, raincoat: 1.45, "bow-tie": 1.25,
};
/** The jogger runs instead of walking. */
export const TOWNSFOLK_RUNNERS: readonly TownsfolkLook[] = ["jogger"];

/** How long each sitting or standing pastime lasts before they switch to another, seconds. */
export const TOWNSFOLK_PASTIME_SECONDS = { min: 4, max: 9 } as const;
/**
 * Reactions to the goose: a honk or flapped wings within `startleRadius` makes them
 * jump; a goose closer than `personalRadius` makes standing people step back
 * `stepBack` metres and seated people wave it off. They carry on after `eyeSeconds`.
 */
export const TOWNSFOLK_REACTIONS = { startleRadius: 3.6, personalRadius: 1.35, stepBack: 1.4, startleSeconds: 0.9, eyeSeconds: 1.8, shooSeconds: 1.1 } as const;

/** Passers-by: how long they sit, look at something, or stay inside a shop. */
export const TOWNSFOLK_WALKER = { sitSeconds: { min: 14, max: 30 }, lookSeconds: { min: 4, max: 8 }, insideSeconds: { min: 8, max: 18 } } as const;

/** Café regulars: time at the counter, how long they stay seated, and the gap before the next one comes in. */
export const CAFE_PATRON = { orderSeconds: 3.5, staySeconds: { min: 24, max: 40 }, awaySeconds: { min: 6, max: 16 } } as const;

/** The small white dog: notices the goose, and barks if it comes close or honks. */
export const DOG_TUNING = { noticeRadius: 7, barkRadius: 3.4, honkRadius: 7, barkSeconds: 2.4, settleSeconds: 2.5, restSeconds: { min: 6, max: 12 } } as const;

export function townsfolkLookOf(assetId: string): TownsfolkLook | undefined {
  const look = assetId.replace(/^(plaza\.parent-|plaza\.walker-|coffee\.patron-)/, "");
  return (TOWNSFOLK_LOOKS as readonly string[]).includes(look) ? look as TownsfolkLook : undefined;
}

/** Top of the Old Town bench slats (`createTownBench`), where seated people and the dog rest. */
export const BENCH_SEAT_HEIGHT = 0.555;

/**
 * What each person does to pass the time. Standing and seated pastimes are listed
 * together; the routine picks from whichever fit. Repeats make a pastime likelier.
 */
export const TOWNSFOLK_PASTIMES: Readonly<Record<TownsfolkLook, readonly TownActivity[]>> = {
  "sunhat-mom": ["watching", "watching", "waving", "calling", "sit-looking", "sit-looking", "sit-petting", "sit-petting", "sitting", "sit-relaxing"],
  "cap-dad": ["watching", "clapping", "calling", "waving", "idle", "sit-looking", "sitting", "sit-phoning"],
  "phone-mom": ["filming", "filming", "phoning", "watching", "waving", "sit-phoning", "sit-looking", "sitting"],
  "beard-dad": ["watching", "phoning", "clapping", "sit-sipping", "sit-sipping", "sit-looking", "sitting", "sit-phoning"],
  jogger: ["idle", "looking", "sit-looking"],
  grandpa: ["looking", "idle", "sit-relaxing", "sit-relaxing", "sit-looking", "sitting"],
  teen: ["phoning", "phoning", "looking", "sit-phoning", "sit-phoning", "sit-looking"],
  commuter: ["phoning", "looking", "sit-phoning", "sit-sipping", "sit-looking"],
  artist: ["looking", "idle", "sit-looking", "sit-relaxing", "sitting"],
  "red-coat": ["idle", "looking", "sit-sipping", "sit-looking", "sitting"],
  "bucket-hat": ["idle", "phoning", "sit-sipping", "sit-phoning", "sit-looking"],
  raincoat: ["idle", "looking", "sit-sipping", "sit-phoning", "sit-looking"],
  "bow-tie": ["idle", "looking", "sit-sipping", "sit-sipping", "sit-looking", "sitting"],
};

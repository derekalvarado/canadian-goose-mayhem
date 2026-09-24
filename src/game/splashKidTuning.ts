/**
 * Splash-kid numbers shared by gameplay (`worldLevel.ts`) and the clips generated in
 * `SplashKidModel.ts`, so locomotion clips always match the speed the simulation moves
 * each kid at. Renderer-free.
 */

/** Milo the runner, June in yellow boots, and little Ari in water wings. */
export type SplashKidVariant = "runner" | "boots" | "floaties";
export const SPLASH_KID_VARIANTS: readonly SplashKidVariant[] = ["runner", "boots", "floaties"];

/** Skipping between splash spots, and walking away/back, in m/s. The littlest is slowest. */
export const SPLASH_KID_PLAY_SPEEDS: Readonly<Record<SplashKidVariant, number>> = { runner: 1.45, boots: 1.4, floaties: 1.3 };
/** Running from the goose, m/s. */
export const SPLASH_KID_FLEE_SPEED = 3.15;

export function splashKidVariantOf(assetId: string): SplashKidVariant | undefined {
  const variant = assetId.replace(/^plaza\.splash-kid-/, "");
  return (SPLASH_KID_VARIANTS as readonly string[]).includes(variant) ? variant as SplashKidVariant : undefined;
}

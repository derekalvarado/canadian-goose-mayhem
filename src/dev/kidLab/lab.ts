/// <reference types="vite/client" />
import { createSplashKidModel, SPLASH_KID_COLORS, SPLASH_KID_MOUTHS, type SplashKidVariant } from "../../game/SplashKidModel.ts";
import { startAnimationLab, type LabVariant } from "../animLab/lab.ts";
import { VARIANTS } from "./variants.ts";

/** Dev-only side-by-side animation comparison; see assets/characters/kids/anim-lab.html. */

startAnimationLab({
  storageKey: "kid-lab", defaultGroup: "splash",
  createModel: (model) => createSplashKidModel((model ?? "runner") as SplashKidVariant),
  colors: (model) => SPLASH_KID_COLORS[(model ?? "runner") as SplashKidVariant],
  focusY: 0.62, frameHalf: 0.85, gameCameraDistance: 5.2,
  dress: (rig, variant) => {
    // Scared and crying kids wail; everyone else smiles. SplashKidView does the same by activity.
    const wail = variant.group === "flee" || variant.group === "cry";
    rig.getObjectByName(SPLASH_KID_MOUTHS.smile)!.visible = !wail;
    rig.getObjectByName(SPLASH_KID_MOUTHS.wail)!.visible = wail;
  },
}, VARIANTS, (accept) => {
  if (import.meta.hot) import.meta.hot.accept("./variants.ts", (module) => { if (module) accept(module.VARIANTS as LabVariant[]); });
});

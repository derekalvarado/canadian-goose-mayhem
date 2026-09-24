/// <reference types="vite/client" />
import { createJanitorModel, JANITOR_COLORS } from "../../game/JanitorModel.ts";
import { startAnimationLab, type LabVariant } from "../animLab/lab.ts";
import { VARIANTS } from "./variants.ts";

/** Dev-only side-by-side animation comparison; see assets/characters/janitor/anim-lab.html. */

startAnimationLab({
  storageKey: "janitor-lab", defaultGroup: "walk",
  createModel: () => createJanitorModel(), colors: () => JANITOR_COLORS,
  focusY: 1.3, frameHalf: 1.6, gameCameraDistance: 9.6,
}, VARIANTS, (accept) => {
  if (import.meta.hot) import.meta.hot.accept("./variants.ts", (module) => { if (module) accept(module.VARIANTS as LabVariant[]); });
});

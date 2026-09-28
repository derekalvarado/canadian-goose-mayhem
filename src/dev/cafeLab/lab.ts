/// <reference types="vite/client" />
import { CAFE_PERSON_COLORS, createCafePersonModel, type CafeVariant } from "../../game/CafePersonModel.ts";
import { createCoffeeChair } from "../../game/CoffeeFurnitureView.ts";
import { startAnimationLab, type LabVariant } from "../animLab/lab.ts";
import { VARIANTS } from "./variants.ts";

/** Dev-only side-by-side animation review; see assets/characters/cafe/anim-lab.html. */

startAnimationLab({
  storageKey: "cafe-lab", defaultGroup: "people",
  createModel: (model) => createCafePersonModel((model ?? "barista") as CafeVariant),
  colors: (model) => CAFE_PERSON_COLORS[(model ?? "barista") as CafeVariant],
  focusY: 1.25, frameHalf: 1.45, gameCameraDistance: 9.6,
  dress: (rig, variant) => {
    // Seated clips sit on the real café chair; surprised clips open the mouth, as CafePersonView does.
    if (variant.clip.name.startsWith("sit")) rig.add(createCoffeeChair());
    const open = /startle|shoo|greet/.test(variant.clip.name);
    rig.getObjectByName("cafe-mouth")!.visible = !open;
    rig.getObjectByName("cafe-mouth-open")!.visible = open;
  },
}, VARIANTS, (accept) => {
  if (import.meta.hot) import.meta.hot.accept("./variants.ts", (module) => { if (module) accept(module.VARIANTS as LabVariant[]); });
});

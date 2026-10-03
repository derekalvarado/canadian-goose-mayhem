/// <reference types="vite/client" />
import { createDogModel, DOG_COLORS } from "../../game/DogModel.ts";
import { createTownBench } from "../../game/OldTownViews.ts";
import { createTownsfolkModel, TOWNSFOLK_COLORS, type TownsfolkLook } from "../../game/TownsfolkModel.ts";
import { createCoffeeChair } from "../../game/CoffeeFurnitureView.ts";
import { startAnimationLab, type LabVariant } from "../animLab/lab.ts";
import { VARIANTS } from "./variants.ts";

/** Dev-only side-by-side animation review; see assets/characters/townsfolk/anim-lab.html. */

startAnimationLab({
  storageKey: "town-lab", defaultGroup: "people",
  createModel: (model) => model === "dog" ? createDogModel() : createTownsfolkModel((model ?? "sunhat-mom") as TownsfolkLook),
  colors: (model) => model === "dog" ? DOG_COLORS : TOWNSFOLK_COLORS[(model ?? "sunhat-mom") as TownsfolkLook],
  focusY: 1.25, frameHalf: 1.45, gameCameraDistance: 9.6,
  dress: (rig, variant) => {
    if (variant.model === "dog") return;
    // Seated clips sit on a plaza bench (a café chair for the regulars), with the dog alongside for petting.
    if (variant.clip.name.startsWith("sit")) {
      if (["red-coat", "bucket-hat", "raincoat", "bow-tie"].includes(variant.model ?? "")) rig.add(createCoffeeChair());
      else { const bench = createTownBench(); bench.rotation.y = Math.PI; bench.position.x = 0.45; rig.add(bench); }
      if (variant.clip.name === "sit-pet") {
        const dog = createDogModel(); dog.position.set(0.95, 0.555, -0.05);
        dog.traverse((object) => { object.frustumCulled = false; });
        rig.add(dog);
      }
    }
    const open = /startle|shoo|call|clap/.test(variant.clip.name);
    rig.getObjectByName("town-mouth")!.visible = !open;
    rig.getObjectByName("town-mouth-open")!.visible = open;
  },
}, VARIANTS, (accept) => {
  if (import.meta.hot) import.meta.hot.accept("./variants.ts", (module) => { if (module) accept(module.VARIANTS as LabVariant[]); });
});

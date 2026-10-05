/// <reference types="vite/client" />
import * as THREE from "three";
import { createAcousticGuitar, createMusicianModel, MUSICIAN_COLORS } from "../../game/MusicianModel.ts";
import { toonMaterial } from "../../game/toonMaterial.ts";
import { startAnimationLab, type LabVariant } from "../animLab/lab.ts";
import { VARIANTS, type Variant } from "./variants.ts";

/** Dev-only look and pose review for the street musician; see assets/characters/musician/anim-lab.html. */

startAnimationLab({
  storageKey: "musician-lab", defaultGroup: "musician",
  createModel: () => createMusicianModel(),
  colors: () => MUSICIAN_COLORS,
  focusY: 1.25, frameHalf: 1.45, gameCameraDistance: 9.6,
  dress: (rig, variant) => {
    const holding = (variant as Variant).guitar;
    rig.getObjectByName("town-bag")!.visible = holding;
    if (!holding) return;
    const guitar = createAcousticGuitar();
    guitar.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const name = (object.material as THREE.Material).name as keyof typeof MUSICIAN_COLORS;
      object.material = toonMaterial(MUSICIAN_COLORS[name]); object.frustumCulled = false;
    });
    rig.getObjectByName("guitar_socket")!.add(guitar);
  },
}, VARIANTS, (accept) => {
  if (import.meta.hot) import.meta.hot.accept("./variants.ts", (module) => { if (module) accept(module.VARIANTS as LabVariant[]); });
});

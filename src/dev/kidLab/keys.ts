import * as THREE from "three";
import { createSplashKidModel, splashKidLegs, type SplashKidVariant } from "../../game/SplashKidModel.ts";
import { cycleClip as sharedCycleClip, walkClip as sharedWalkClip, type Pose, type WalkStyle } from "../../game/janitorGaits.ts";
import type { LabVariant } from "../animLab/lab.ts";

/** Dev-only helpers for sketching splash-kid clips as functions of loop phase. */

export interface Variant extends LabVariant {
  group: "model" | "play" | "splash" | "flee" | "cry" | "walk" | "react";
  model: SplashKidVariant;
}

const bindCache = new Map<SplashKidVariant, Map<string, THREE.Vector3>>();
function bindPositions(kid: SplashKidVariant): Map<string, THREE.Vector3> {
  let bind = bindCache.get(kid);
  if (!bind) {
    bind = new Map();
    createSplashKidModel(kid).traverse((object) => {
      if (object instanceof THREE.Bone) bind!.set(object.name, object.position.clone());
    });
    bindCache.set(kid, bind);
  }
  return bind;
}

/** `cycleClip` bound to a kid's bind pose. */
export function cycleClip(kid: SplashKidVariant, name: string, duration: number, pose: (p: number) => Pose, samples = 60): THREE.AnimationClip {
  return sharedCycleClip(name, duration, pose, bindPositions(kid), samples);
}
/** `walkClip` bound to a kid's bind pose. */
export function walkClip(kid: SplashKidVariant, name: string, style: WalkStyle): THREE.AnimationClip {
  return sharedWalkClip(name, style, bindPositions(kid));
}
export const legsOf = splashKidLegs;

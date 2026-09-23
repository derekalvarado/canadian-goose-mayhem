import * as THREE from "three";
import { createJanitorModel } from "../../game/JanitorModel.ts";
import { cycleClip as sharedCycleClip, walkClip as sharedWalkClip, type Pose, type WalkStyle } from "../../game/janitorGaits.ts";

/** Dev-only helpers for sketching janitor clips as functions of loop phase. */

export type { BoneName, Pose, Vec3 } from "../../game/janitorGaits.ts";
export { TAU, wave, pulse } from "../../game/janitorGaits.ts";

export interface Variant {
  /** Short label shown on the card. */
  name: string;
  /** What this variant is trying, so feedback can reference it. */
  notes: string;
  group: "walk" | "chase" | "shoo" | "react" | "idle" | "model";
  clip: THREE.AnimationClip;
  /** Ground speed for the treadmill, m/s. Game values: walk 1.76, jog 3. */
  travelSpeed?: number;
}

let bindCache: Map<string, THREE.Vector3> | undefined;
function bindPositions(): Map<string, THREE.Vector3> {
  if (!bindCache) {
    bindCache = new Map();
    createJanitorModel().traverse((object) => {
      if (object instanceof THREE.Bone) bindCache!.set(object.name, object.position.clone());
    });
  }
  return bindCache;
}

/** `cycleClip` bound to the janitor rig's bind pose. */
export function cycleClip(name: string, duration: number, pose: (p: number) => Pose, samples = 48): THREE.AnimationClip {
  return sharedCycleClip(name, duration, pose, bindPositions(), samples);
}

/** `walkClip` bound to the janitor rig's bind pose. */
export function walkClip(name: string, style: WalkStyle): THREE.AnimationClip {
  return sharedWalkClip(name, style, bindPositions());
}

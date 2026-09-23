import { createJanitorModel } from "../../game/JanitorModel.ts";
import { JANITOR_CHASE, JANITOR_WALK } from "../../game/janitorGaits.ts";
import { cycleClip, type Variant } from "./keys.ts";

/**
 * Edit freely: the lab page hot-reloads on save. Walks are sets of knobs on
 * `walkClip` from ./keys.ts, e.g. `walkClip("try", { ...JANITOR_WALK, bob: 0.08 })`
 * (see WalkStyle in src/game/janitorGaits.ts). Cards named "In game"
 * show the clips exported in the GLB, built from JanitorModel.ts.
 */

const inGame = (name: string) => {
  const clip = createJanitorModel().animations.find((candidate) => candidate.name === name);
  if (!clip) throw new Error(`No in-game clip named ${name}`);
  return clip;
};

export const VARIANTS: Variant[] = [
  {
    name: "Rest pose", group: "model", clip: cycleClip("rest", 1, () => ({})),
    notes: "Bind pose for checking the mesh itself.",
  },
  {
    name: "Arms swinging", group: "model",
    clip: cycleClip("arm-test", 2, (p) => ({ rot: {
      left_shoulder: [0.9 * Math.sin(p * Math.PI * 2), 0, -0.1], right_shoulder: [-0.9 * Math.sin(p * Math.PI * 2), 0, 0.5 * Math.max(0, Math.sin(p * Math.PI * 2))],
    } })),
    notes: "Stress test for sleeves and armholes: full forward/back swing and a sideways raise.",
  },
  {
    name: "In game: walk", group: "walk", travelSpeed: JANITOR_WALK.speed, clip: inGame("walk"),
    notes: "Bouncy shuffle, slowed 20%. Copy its knobs into a new card below to try changes.",
  },
  {
    name: "In game: chase", group: "chase", travelSpeed: JANITOR_CHASE.speed, clip: inGame("chase"),
    notes: "Furious stomp with quicker legs at 3 m/s, used while chasing the goose or a stolen tool.",
  },
  ...(["shoo", "inspect", "scratch", "look", "idle"] as const).map((name): Variant => ({
    name: `In game: ${name}`, group: "react", clip: inGame(name),
    notes: "One-shot/idle clip as exported; knees and elbows now bend the right way.",
  })),
];

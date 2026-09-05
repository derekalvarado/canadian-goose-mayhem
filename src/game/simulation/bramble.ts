import { EXIT_Z, isOnPath, resolveLevelMovement } from "../level.ts";
import type { WorldRules } from "./Simulation.ts";

export const TRAIL_OBJECTIVE_ID = "bramble.find-north-trail";

export const brambleRules: WorldRules = {
  spawn: { x: 0, y: 0.02, z: 7.4 },
  spawnHeading: Math.PI,
  resolveMovement: resolveLevelMovement,
  objectives: [{
    id: TRAIL_OBJECTIVE_ID,
    description: "Find the path out of the forest",
    isSatisfied: ({ position }) => position.z < EXIT_Z && isOnPath(position.x, position.z),
  }],
};

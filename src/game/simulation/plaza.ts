import { resolvePlazaMovement } from "../plazaLevel.ts";
import { CANONICAL_PLAZA_LAYOUT, type PlazaLayout } from "../plazaLayout.ts";
import type { WorldRules } from "./Simulation.ts";

export function createPlazaRules(layout: PlazaLayout): WorldRules {
  return {
    spawn: { x: 11.5, y: 0.02, z: 10.5 },
    spawnHeading: Math.PI * 0.75,
    resolveMovement: (current, proposed, output) => {
      resolvePlazaMovement(current, proposed, output, layout);
    },
    objectives: [],
  };
}

export const plazaRules = createPlazaRules(CANONICAL_PLAZA_LAYOUT);

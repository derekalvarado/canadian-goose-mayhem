export interface ObjectiveDefinition<State> {
  readonly id: string;
  readonly description: string;
  /** Observe authoritative state; never move objects or script a solution here. */
  readonly isSatisfied: (state: State) => boolean;
}

/** Every objective is eligible independently. Completion is permanent until reset. */
export class Objectives<State> {
  private readonly completed = new Set<string>();
  private readonly definitions: readonly ObjectiveDefinition<State>[];

  constructor(definitions: readonly ObjectiveDefinition<State>[]) {
    const ids = definitions.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate objective ID");
    this.definitions = [...definitions];
  }

  evaluate(state: State): string[] {
    const newlyCompleted: string[] = [];
    for (const objective of this.definitions) {
      if (!this.completed.has(objective.id) && objective.isSatisfied(state)) {
        this.completed.add(objective.id);
        newlyCompleted.push(objective.id);
      }
    }
    return newlyCompleted;
  }

  isComplete(id: string): boolean {
    return this.completed.has(id);
  }

  reset(): void {
    this.completed.clear();
  }
}

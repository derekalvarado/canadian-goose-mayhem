export interface ObjectiveDefinition<State> {
  readonly id: string;
  readonly description: string;
  /** The level whose to-do list shows this task. Completion is still checked wherever the goose is. */
  readonly areaId?: string;
  /** Only listed when two geese are playing; one goose alone cannot do it. */
  readonly needsTwoGeese?: boolean;
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

  /** Marks previously earned objectives complete without reporting them again; unknown IDs are ignored. */
  restore(ids: Iterable<string>): void {
    const known = new Set(this.definitions.map(({ id }) => id));
    for (const id of ids) if (known.has(id)) this.completed.add(id);
  }

  get completedIds(): string[] {
    return this.definitions.filter(({ id }) => this.completed.has(id)).map(({ id }) => id);
  }

  isComplete(id: string): boolean {
    return this.completed.has(id);
  }

  reset(): void {
    this.completed.clear();
  }
}

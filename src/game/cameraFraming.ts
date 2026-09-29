// When an important character is near the goose, aim the camera between them so
// both fit in the shot. Once the character drifts far enough that it would sit
// near the edge of the frame, let go and return to centering the goose.

export interface FramingSubject { id: string; x: number; z: number }

const ENTER_RADIUS = 6;
// Hysteresis keeps the shot from flickering when the character hovers at the boundary.
const EXIT_RADIUS = 8.5;
const SHARE_TOWARD_SUBJECT = 0.42;

export class SubjectFraming {
  private framedId?: string;
  private readonly releasedIds = new Set<string>();

  get framedSubjectId(): string | undefined { return this.framedId; }

  /** Returns the ground point the camera should look at. */
  focus(goose: { x: number; z: number }, subjects: readonly FramingSubject[]): { x: number; z: number } {
    const distance = (subject: FramingSubject) => Math.hypot(subject.x - goose.x, subject.z - goose.z);
    for (const subject of subjects) {
      if (this.releasedIds.has(subject.id) && distance(subject) > EXIT_RADIUS) this.releasedIds.delete(subject.id);
    }
    const current = subjects.find((subject) => subject.id === this.framedId);
    if (!current || distance(current) > EXIT_RADIUS) {
      const nearest = subjects.filter((subject) => !this.releasedIds.has(subject.id) && distance(subject) <= ENTER_RADIUS)
        .sort((a, b) => distance(a) - distance(b))[0];
      this.framedId = nearest?.id;
    }
    const framed = subjects.find((subject) => subject.id === this.framedId);
    if (!framed) return { x: goose.x, z: goose.z };
    return { x: goose.x + (framed.x - goose.x) * SHARE_TOWARD_SUBJECT, z: goose.z + (framed.z - goose.z) * SHARE_TOWARD_SUBJECT };
  }

  /** Stop framing a character after they shoo the goose, until they are well away. */
  release(id: string): void {
    this.releasedIds.add(id);
    if (this.framedId === id) this.framedId = undefined;
  }

  reset(): void { this.framedId = undefined; this.releasedIds.clear(); }
}

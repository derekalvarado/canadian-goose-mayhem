// Authored "sky tracks" for the follow camera. A track is a smooth curve through
// hand-placed points above an area; during play the camera rides the curve to
// the spot nearest the goose and looks at it, so bends in the track swing the
// view around corners. This module is renderer-independent so it can be tested.

export interface CameraTrackPoint { x: number; y: number; z: number; zoom: number }
export interface CameraZonePoint { x: number; z: number }
/**
 * A track with a zone is used while the goose stands inside that zone (drawn on
 * the ground); a track without one covers everywhere else in the area.
 */
export interface CameraTrack { id: string; label: string; points: CameraTrackPoint[]; zone?: CameraZonePoint[] }
export interface CameraTrackSample { x: number; y: number; z: number; zoom: number }

export const CAMERA_BASE_FOV = 38;
// The camera aims this far above the goose's feet.
export const CAMERA_FOCUS_HEIGHT = 0.55;
// On a track, how far (horizontally) the camera may sit from the goose before leaning in.
export const CAMERA_TRACK_MAX_REACH = 13;
export const CAMERA_TRACK_MIN_ZOOM = 0.5;
export const CAMERA_TRACK_MAX_ZOOM = 2.5;
export const CAMERA_TRACK_MIN_HEIGHT = 1;
export const CAMERA_TRACK_MAX_HEIGHT = 80;
const SAMPLES_PER_SEGMENT = 16;

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function finite(value: unknown, path: string): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`); return value; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }

export function clampCameraTrackPoint(point: CameraTrackPoint): CameraTrackPoint {
  point.y = clamp(point.y, CAMERA_TRACK_MIN_HEIGHT, CAMERA_TRACK_MAX_HEIGHT);
  point.zoom = clamp(point.zoom, CAMERA_TRACK_MIN_ZOOM, CAMERA_TRACK_MAX_ZOOM);
  return point;
}

/** Returns undefined for a missing track; throws on malformed data like the rest of the world schema. */
export function validateCameraTrack(value: unknown, path: string, fallbackId = "main"): CameraTrack | undefined {
  if (value === undefined) return undefined;
  if (!record(value) || !Array.isArray(value.points)) throw new Error(`${path}.points must be an array`);
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : fallbackId;
  const label = typeof value.label === "string" && value.label.trim() ? value.label.trim().slice(0, 60) : "Main track";
  const points = value.points.map((point, index) => {
    if (!record(point)) throw new Error(`${path}.points[${index}] must be an object`);
    return clampCameraTrackPoint({
      x: finite(point.x, `${path}.points[${index}].x`),
      y: finite(point.y, `${path}.points[${index}].y`),
      z: finite(point.z, `${path}.points[${index}].z`),
      zoom: point.zoom === undefined ? 1 : finite(point.zoom, `${path}.points[${index}].zoom`),
    });
  });
  let zone: CameraZonePoint[] | undefined;
  if (value.zone !== undefined) {
    if (!Array.isArray(value.zone)) throw new Error(`${path}.zone must be an array`);
    zone = value.zone.map((corner, index) => {
      if (!record(corner)) throw new Error(`${path}.zone[${index}] must be an object`);
      return { x: finite(corner.x, `${path}.zone[${index}].x`), z: finite(corner.z, `${path}.zone[${index}].z`) };
    });
    // Fewer than three corners encloses nothing; treat the track as covering everywhere else.
    if (zone.length < 3) zone = undefined;
  }
  // A single point cannot describe a path; drop it rather than rejecting the whole world.
  return points.length >= 2 ? { id, label, points, ...(zone ? { zone } : {}) } : undefined;
}

/** An area's tracks, accepting the older single `cameraTrack` field too. */
export function validateCameraTracks(value: unknown, legacy: unknown, path: string): CameraTrack[] | undefined {
  const list = value === undefined ? (legacy === undefined ? [] : [legacy]) : value;
  if (!Array.isArray(list)) throw new Error(`${path} must be an array`);
  const ids = new Set<string>();
  const tracks = list.flatMap((entry, index) => {
    const track = validateCameraTrack(entry, `${path}[${index}]`, `track-${index + 1}`);
    if (!track) return [];
    if (record(entry) && entry.label === undefined && index > 0) track.label = `Track ${index + 1}`;
    while (ids.has(track.id)) track.id = `${track.id}-${index + 1}`;
    ids.add(track.id);
    return [track];
  });
  return tracks.length ? tracks : undefined;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t; const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** A track pre-sampled into a dense polyline with arc lengths for fast nearest-point lookup. */
export class SampledCameraTrack {
  readonly samples: CameraTrackSample[] = [];
  private readonly distances: number[] = [];

  constructor(track: { points: CameraTrackPoint[] }) {
    const points = track.points;
    for (let segment = 0; segment < points.length - 1; segment += 1) {
      const p0 = points[Math.max(0, segment - 1)]; const p1 = points[segment];
      const p2 = points[segment + 1]; const p3 = points[Math.min(points.length - 1, segment + 2)];
      for (let step = segment === 0 ? 0 : 1; step <= SAMPLES_PER_SEGMENT; step += 1) {
        const t = step / SAMPLES_PER_SEGMENT;
        this.samples.push({
          x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
          y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
          z: catmullRom(p0.z, p1.z, p2.z, p3.z, t),
          // Zoom eases linearly so it never overshoots the authored values.
          zoom: p1.zoom + (p2.zoom - p1.zoom) * t,
        });
      }
    }
    let total = 0;
    this.samples.forEach((sample, index) => {
      if (index > 0) { const previous = this.samples[index - 1]; total += Math.hypot(sample.x - previous.x, sample.y - previous.y, sample.z - previous.z); }
      this.distances.push(total);
    });
  }

  get length(): number { return this.distances[this.distances.length - 1] ?? 0; }

  /**
   * Distance along the track whose ground shadow is nearest to (x, z). With
   * `around`, only the stretch within `window` of that distance is searched.
   */
  nearestDistance(x: number, z: number, around?: number, window = Infinity): number {
    let bestDistance = around ?? 0; let bestSquared = Infinity;
    for (let index = 0; index < this.samples.length - 1; index += 1) {
      if (around !== undefined && (this.distances[index + 1] < around - window || this.distances[index] > around + window)) continue;
      const a = this.samples[index]; const b = this.samples[index + 1];
      const dx = b.x - a.x; const dz = b.z - a.z; const lengthSquared = dx * dx + dz * dz;
      const t = lengthSquared > 0 ? clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSquared, 0, 1) : 0;
      const px = a.x + dx * t; const pz = a.z + dz * t;
      const squared = (px - x) ** 2 + (pz - z) ** 2;
      if (squared < bestSquared) {
        bestSquared = squared;
        bestDistance = this.distances[index] + (this.distances[index + 1] - this.distances[index]) * t;
      }
    }
    return bestDistance;
  }

  sampleAt(distance: number): CameraTrackSample {
    const target = clamp(distance, 0, this.length);
    let low = 0; let high = this.distances.length - 1;
    while (high - low > 1) { const middle = (low + high) >> 1; if (this.distances[middle] <= target) low = middle; else high = middle; }
    const a = this.samples[low]; const b = this.samples[high] ?? a;
    const span = this.distances[high] - this.distances[low];
    const t = span > 0 ? (target - this.distances[low]) / span : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, zoom: a.zoom + (b.zoom - a.zoom) * t };
  }
}

/**
 * Keeps the goose readable when it wanders far from the track: past the limit the
 * camera leans in horizontally, keeping its viewing direction and track height.
 */
export function limitCameraReach(camera: { x: number; y: number; z: number }, focus: { x: number; z: number }, maxHorizontal: number): { x: number; y: number; z: number } {
  const dx = camera.x - focus.x; const dz = camera.z - focus.z;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal <= maxHorizontal || horizontal === 0) return { x: camera.x, y: camera.y, z: camera.z };
  const scale = maxHorizontal / horizontal;
  return { x: focus.x + dx * scale, y: camera.y, z: focus.z + dz * scale };
}

/**
 * Slides the camera along the track toward the spot nearest the goose. It only
 * searches the stretch of track around where it already is, so when two distant
 * stretches are about equally near the goose the camera stays put instead of
 * leaping across; it follows the curve around a bend as the goose walks it.
 */
export class CameraTrackRider {
  private position?: number;
  readonly track: SampledCameraTrack;
  private readonly searchWindow: number;
  constructor(track: SampledCameraTrack, searchWindow = 12) { this.track = track; this.searchWindow = searchWindow; }

  update(focusX: number, focusZ: number, delta: number, response: number): CameraTrackSample {
    if (this.position === undefined) return this.snap(focusX, focusZ);
    const target = this.track.nearestDistance(focusX, focusZ, this.position, this.searchWindow);
    this.position += (target - this.position) * (1 - Math.exp(-response * delta));
    return this.track.sampleAt(this.position);
  }

  snap(focusX: number, focusZ: number): CameraTrackSample {
    this.position = this.track.nearestDistance(focusX, focusZ);
    return this.track.sampleAt(this.position);
  }
}

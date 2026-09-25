import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import { CAMERA_BASE_FOV, CAMERA_FOCUS_HEIGHT, CAMERA_TRACK_MAX_ZOOM, CAMERA_TRACK_MIN_ZOOM, cameraTrackPose, clampCameraTrackPoint, SampledCameraTrack, type CameraTrackPoint } from "./cameraTrack.ts";
import type { WorldArea } from "./worldLayout.ts";
import { getWorldGroundHeight } from "./worldLevel.ts";

const SNAP = 0.25;
const TRACK_COLOR = 0xb9a6ff;
const SELECTED_COLOR = 0xf1d38b;
const CAMERA_COLOR = 0x8f84f0;
const NEW_TRACK_HEIGHT = 12;

export interface CameraTrackEditorHost {
  readonly area: WorldArea;
  mutate(message: string, change: () => void): void;
  setStatus(message: string, error?: boolean): void;
}

function editorOnly(object: THREE.Object3D): void {
  object.traverse((node) => { node.userData.editorIgnore = true; node.renderOrder = 30; });
}

/**
 * Builder mode for an area's sky camera track: shows the track as balls on a
 * line in the sky, lets the author drag, add, and remove points, and previews
 * the camera for a stand-in goose placed anywhere on the ground.
 */
export class CameraTrackEditor {
  readonly tools = document.createElement("div");
  active = false;
  private readonly helpers = new THREE.Group();
  private readonly markers: THREE.Mesh[] = [];
  private readonly markerGeometry = new THREE.SphereGeometry(0.85, 18, 14);
  private readonly previewCamera = new THREE.PerspectiveCamera(CAMERA_BASE_FOV, 1, 0.5, 20);
  private readonly previewHelper = new THREE.CameraHelper(this.previewCamera);
  private readonly sightLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: CAMERA_COLOR, depthTest: false, transparent: true }));
  private trackLine?: THREE.Mesh;
  private readonly standIn = new THREE.Vector3();
  private readonly fallbackStandIn = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  private selected = 0;
  private zoomBefore?: number;
  private savedView?: { position: THREE.Vector3; target: THREE.Vector3; fov: number };
  private readonly pointLabel = document.createElement("p");
  private readonly heightInput = document.createElement("input");
  private readonly zoomInput = document.createElement("input");
  private readonly zoomValue = document.createElement("span");
  private readonly lookButton: HTMLButtonElement;
  private readonly pointTools = document.createElement("div");
  private readonly camera: THREE.PerspectiveCamera;
  private readonly transform: TransformControls;
  private readonly orbit: OrbitControls;
  private readonly host: CameraTrackEditorHost;
  private readonly goose: THREE.Object3D;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, transform: TransformControls, orbit: OrbitControls, host: CameraTrackEditorHost, goose?: THREE.Object3D) {
    this.camera = camera; this.transform = transform; this.orbit = orbit; this.host = host;
    this.goose = goose ?? this.fallbackStandIn;
    if (!goose) { this.fallbackStandIn.visible = false; scene.add(this.fallbackStandIn); }
    const color = new THREE.Color(CAMERA_COLOR);
    this.previewHelper.setColors(color, color, color, color, color);
    (this.previewHelper.material as THREE.LineBasicMaterial).depthTest = false;
    this.helpers.add(this.previewHelper, this.sightLine);
    editorOnly(this.helpers);
    this.helpers.visible = false;
    scene.add(this.helpers);
    this.lookButton = this.button("Look through camera", () => this.toggleLook());
    this.buildTools();
  }

  get looking(): boolean { return this.savedView !== undefined; }
  private get points(): CameraTrackPoint[] | undefined { return this.host.area.cameraTrack?.points; }

  private button(text: string, handler: () => void): HTMLButtonElement { const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.addEventListener("click", handler); return button; }

  private buildTools(): void {
    this.tools.className = "plaza-editor__track"; this.tools.hidden = true;
    this.pointLabel.className = "plaza-editor__track-point";
    const stepper = document.createElement("div"); stepper.className = "plaza-editor__actions";
    stepper.append(this.button("Previous point", () => this.select(this.selected - 1)), this.button("Next point", () => this.select(this.selected + 1)));
    const fields = document.createElement("div"); fields.className = "plaza-editor__track-fields";
    const height = document.createElement("label"); height.textContent = "Height";
    this.heightInput.type = "number"; this.heightInput.step = "0.5"; this.heightInput.addEventListener("change", this.commitHeight);
    const unit = document.createElement("span"); unit.className = "plaza-editor__suffix"; unit.textContent = "m"; height.append(this.heightInput, unit);
    const zoom = document.createElement("label"); zoom.textContent = "Zoom ";
    this.zoomInput.type = "range"; this.zoomInput.min = String(CAMERA_TRACK_MIN_ZOOM * 100); this.zoomInput.max = String(CAMERA_TRACK_MAX_ZOOM * 100); this.zoomInput.step = "5";
    this.zoomInput.addEventListener("input", this.previewZoom); this.zoomInput.addEventListener("change", this.commitZoom);
    this.zoomValue.className = "plaza-editor__track-zoom-value"; zoom.append(this.zoomValue, this.zoomInput);
    fields.append(height, zoom);
    const edits = document.createElement("div"); edits.className = "plaza-editor__actions";
    edits.append(this.button("Add point", () => this.addPoint()), this.button("Delete point", () => this.deletePoint()));
    this.pointTools.append(stepper, fields);
    const look = document.createElement("div"); look.className = "plaza-editor__actions plaza-editor__actions--single"; look.append(this.lookButton);
    const help = document.createElement("p"); help.className = "plaza-editor__help";
    help.textContent = "Click a ball to select it and drag its arrows to move it; the green arrow sets its height. Click the ground to move the stand-in goose: the purple frame shows where the player's camera would be. Keep the track to the side of where the goose walks, not straight above it. Areas without a track use the standard camera.";
    this.tools.append(this.pointLabel, this.pointTools, edits, look, help);
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    if (!active && this.looking) this.toggleLook();
    this.active = active; this.tools.hidden = !active; this.helpers.visible = active; this.goose.visible = active;
    if (active) {
      this.standIn.set(this.orbit.target.x, 0, this.orbit.target.z);
      this.transform.setMode("translate"); this.transform.showX = true; this.transform.showY = true; this.transform.showZ = true;
      this.refresh();
    } else {
      this.transform.detach();
    }
  }

  /** Rebuild visuals and fields from the area data, e.g. after undo or switching areas. */
  refresh(): void {
    for (const marker of this.markers) this.helpers.remove(marker);
    this.markers.length = 0;
    const points = this.points ?? [];
    this.selected = Math.min(Math.max(this.selected, 0), Math.max(points.length - 1, 0));
    points.forEach((point, index) => {
      const marker = new THREE.Mesh(this.markerGeometry, new THREE.MeshBasicMaterial({ color: TRACK_COLOR, depthTest: false, transparent: true }));
      marker.position.set(point.x, point.y, point.z); marker.userData.trackPointIndex = index;
      const drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -point.y, 0)]), new THREE.LineDashedMaterial({ color: TRACK_COLOR, dashSize: 0.5, gapSize: 0.4, transparent: true, opacity: 0.55 }));
      drop.computeLineDistances(); marker.add(drop);
      editorOnly(marker); this.markers.push(marker); this.helpers.add(marker);
    });
    this.rebuildLine();
    this.updateSelection();
  }

  /** Handles a click in the world while this mode is active. */
  handleClick(raycaster: THREE.Raycaster, ground: THREE.Vector3 | undefined): void {
    if (!this.looking) {
      const hit = raycaster.intersectObjects(this.markers, false)[0];
      if (hit) { this.select(hit.object.userData.trackPointIndex as number); return; }
    }
    if (ground) { this.standIn.set(ground.x, 0, ground.z); this.updatePreview(); }
  }

  /** Called while the gizmo drags the selected ball. */
  onTransformChange(): void {
    const point = this.points?.[this.selected]; const marker = this.markers[this.selected];
    if (!point || !marker) return;
    point.x = Math.round(marker.position.x / SNAP) * SNAP; point.y = Math.round(marker.position.y / SNAP) * SNAP; point.z = Math.round(marker.position.z / SNAP) * SNAP;
    clampCameraTrackPoint(point);
    marker.position.set(point.x, point.y, point.z);
    const drop = marker.children[0] as THREE.Line;
    drop.geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -point.y, 0)]); drop.computeLineDistances();
    this.heightInput.value = point.y.toFixed(1);
    this.rebuildLine();
  }

  private select(index: number): void {
    const count = this.points?.length ?? 0; if (count === 0) return;
    this.selected = (index + count) % count;
    this.updateSelection();
  }

  private updateSelection(): void {
    const points = this.points;
    this.markers.forEach((marker, index) => (marker.material as THREE.MeshBasicMaterial).color.setHex(index === this.selected ? SELECTED_COLOR : TRACK_COLOR));
    this.pointTools.hidden = !points;
    if (!points) {
      this.pointLabel.textContent = "This area uses the standard camera. Add a point to start a track here.";
      this.transform.detach();
    } else {
      const point = points[this.selected];
      this.pointLabel.textContent = `Point ${this.selected + 1} of ${points.length}`;
      this.heightInput.value = point.y.toFixed(1);
      this.zoomInput.value = String(Math.round(point.zoom * 100)); this.zoomValue.textContent = `${Math.round(point.zoom * 100)}%`;
      if (this.active && !this.looking) this.transform.attach(this.markers[this.selected]);
    }
    this.updatePreview();
  }

  private rebuildLine(): void {
    if (this.trackLine) { this.helpers.remove(this.trackLine); this.trackLine.geometry.dispose(); this.trackLine = undefined; }
    const points = this.points;
    if (points && points.length >= 2) {
      const samples = new SampledCameraTrack({ points }).samples.map((sample) => new THREE.Vector3(sample.x, sample.y, sample.z));
      const path = new THREE.CatmullRomCurve3(samples);
      this.trackLine = new THREE.Mesh(new THREE.TubeGeometry(path, samples.length * 2, 0.18, 8, false), new THREE.MeshBasicMaterial({ color: TRACK_COLOR, depthTest: false, transparent: true, opacity: 0.85 }));
      editorOnly(this.trackLine); this.helpers.add(this.trackLine);
    }
    this.updatePreview();
  }

  private focusPoint(): THREE.Vector3 {
    const ground = getWorldGroundHeight(this.host.area, this.standIn.x, this.standIn.z) ?? 0;
    return new THREE.Vector3(this.standIn.x, ground + CAMERA_FOCUS_HEIGHT, this.standIn.z);
  }

  private updatePreview(): void {
    const focus = this.focusPoint();
    this.goose.position.set(focus.x, focus.y - CAMERA_FOCUS_HEIGHT, focus.z);
    const points = this.points;
    this.previewHelper.visible = Boolean(points); this.sightLine.visible = Boolean(points);
    if (!points || points.length < 2) return;
    const pose = cameraTrackPose(new SampledCameraTrack({ points }), focus);
    this.previewCamera.position.set(pose.x, pose.y, pose.z);
    this.previewCamera.fov = CAMERA_BASE_FOV / pose.zoom;
    this.previewCamera.aspect = this.camera.aspect;
    this.previewCamera.far = this.previewCamera.position.distanceTo(focus) + 1;
    this.previewCamera.lookAt(focus);
    this.previewCamera.updateProjectionMatrix(); this.previewCamera.updateMatrixWorld();
    this.previewHelper.update();
    this.sightLine.geometry.setFromPoints([this.previewCamera.position, focus]);
    if (this.looking) {
      this.camera.position.copy(this.previewCamera.position);
      this.camera.fov = this.previewCamera.fov; this.camera.updateProjectionMatrix();
      this.camera.lookAt(focus);
    }
  }

  private toggleLook(): void {
    if (this.savedView) {
      this.camera.position.copy(this.savedView.position); this.orbit.target.copy(this.savedView.target);
      this.camera.fov = this.savedView.fov; this.camera.updateProjectionMatrix();
      this.savedView = undefined; this.orbit.enabled = true; this.orbit.update();
      this.helpers.visible = true; this.lookButton.textContent = "Look through camera"; this.lookButton.classList.remove("is-active");
      this.updateSelection();
      return;
    }
    if (!this.points) { this.host.setStatus("Add points to make a track first.", true); return; }
    this.savedView = { position: this.camera.position.clone(), target: this.orbit.target.clone(), fov: this.camera.fov };
    this.orbit.enabled = false; this.transform.detach(); this.helpers.visible = false;
    this.lookButton.textContent = "Back to editing"; this.lookButton.classList.add("is-active");
    this.host.setStatus("Showing the player's view. Click the ground to move the stand-in goose; Esc goes back.");
    this.updatePreview();
  }

  exitLook(): boolean { if (!this.looking) return false; this.toggleLook(); return true; }

  private addPoint(): void {
    this.host.mutate("Camera track point added.", () => {
      const area = this.host.area;
      if (!area.cameraTrack) {
        const x = Math.round(this.orbit.target.x); const z = Math.round(this.orbit.target.z);
        area.cameraTrack = { points: [{ x: x - 8, y: NEW_TRACK_HEIGHT, z: z - 10, zoom: 1 }, { x: x + 8, y: NEW_TRACK_HEIGHT, z: z - 10, zoom: 1 }] };
        this.selected = 1;
      } else {
        const points = area.cameraTrack.points; const current = points[this.selected];
        const next = points[this.selected + 1];
        let point: CameraTrackPoint;
        if (next) point = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2, z: (current.z + next.z) / 2, zoom: (current.zoom + next.zoom) / 2 };
        else {
          const previous = points[this.selected - 1];
          const dx = current.x - previous.x; const dz = current.z - previous.z; const length = Math.hypot(dx, dz) || 1;
          const step = Math.min(length, 10);
          point = { x: current.x + (dx / length) * step, y: current.y, z: current.z + (dz / length) * step, zoom: current.zoom };
        }
        point.x = Math.round(point.x / SNAP) * SNAP; point.z = Math.round(point.z / SNAP) * SNAP;
        points.splice(this.selected + 1, 0, point);
        this.selected += 1;
      }
      this.refresh();
    });
  }

  deletePoint(): void {
    const points = this.points; if (!points) return;
    if (points.length <= 2) {
      if (!window.confirm("Remove this area's camera track? The area will go back to the standard camera.")) return;
      this.host.mutate("Camera track removed.", () => { delete this.host.area.cameraTrack; this.selected = 0; this.refresh(); });
      return;
    }
    this.host.mutate("Camera track point deleted.", () => { points.splice(this.selected, 1); this.selected = Math.max(0, this.selected - 1); this.refresh(); });
  }

  private readonly commitHeight = (): void => {
    const point = this.points?.[this.selected]; const height = Number(this.heightInput.value);
    if (!point || !Number.isFinite(height)) return;
    this.host.mutate("Camera height saved.", () => { point.y = height; clampCameraTrackPoint(point); this.refresh(); });
  };

  private readonly previewZoom = (): void => {
    const point = this.points?.[this.selected]; if (!point) return;
    this.zoomBefore ??= point.zoom;
    this.zoomValue.textContent = `${this.zoomInput.value}%`;
    point.zoom = Number(this.zoomInput.value) / 100; this.updatePreview();
  };

  private readonly commitZoom = (): void => {
    const point = this.points?.[this.selected]; if (!point) return;
    const zoom = Number(this.zoomInput.value) / 100;
    // The slider previewed live; put the old value back so the change is recorded as one undo step.
    point.zoom = this.zoomBefore ?? point.zoom; this.zoomBefore = undefined;
    this.host.mutate("Camera zoom saved.", () => { point.zoom = zoom; clampCameraTrackPoint(point); this.refresh(); });
  };
}

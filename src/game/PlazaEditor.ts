import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  PLAZA_GROUP_COLLIDERS,
  PLAZA_STATIC_COLLIDERS,
  clampPlazaGroupPlacement,
  findPlazaGroupOverlaps,
  findPlazaStaticOverlaps,
} from "./plazaLevel";
import {
  PLAZA_GROUP_IDS,
  replacePlazaLayout,
  resetPlazaLayout,
  savePlazaLayout,
  serializePlazaLayout,
  validatePlazaLayout,
  type PlazaGroupId,
  type PlazaLayout,
} from "./plazaLayout";
import type { PlazaWorld } from "./PlazaWorld";

const TRANSLATION_SNAP = 0.25;
const ROTATION_SNAP = THREE.MathUtils.degToRad(5);
const CLICK_DISTANCE_PX = 4;
const FRAME_PADDING = 1.25;

function downloadText(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function findLayoutGroupId(object: THREE.Object3D | null): PlazaGroupId | undefined {
  let current = object;
  while (current) {
    const id = current.userData.layoutGroupId as PlazaGroupId | undefined;
    if (id && PLAZA_GROUP_IDS.includes(id)) return id;
    current = current.parent;
  }
  return undefined;
}

function addCollisionOverlays(world: PlazaWorld): void {
  const material = new THREE.MeshBasicMaterial({
    color: 0xf1d38b,
    depthTest: false,
    opacity: 0.72,
    transparent: true,
    wireframe: true,
  });
  for (const id of PLAZA_GROUP_IDS) {
    const parent = world.editableGroups.get(id);
    if (!parent) continue;
    for (const collider of PLAZA_GROUP_COLLIDERS[id]) {
      let preview: THREE.Mesh;
      if (collider.shape === "circle") {
        preview = new THREE.Mesh(
          new THREE.CylinderGeometry(collider.radius, collider.radius, 0.08, 32, 1, true),
          material,
        );
      } else {
        preview = new THREE.Mesh(
          new THREE.BoxGeometry(collider.halfWidth * 2, 0.08, collider.halfDepth * 2),
          material,
        );
      }
      preview.position.set(collider.x, 0.1, collider.z);
      preview.name = `${collider.id} collision preview`;
      preview.userData.editorIgnore = true;
      parent.add(preview);
    }
  }
  for (const collider of PLAZA_STATIC_COLLIDERS) {
    const preview = new THREE.Mesh(
      new THREE.BoxGeometry(collider.halfWidth * 2, 0.08, collider.halfDepth * 2),
      material,
    );
    preview.position.set(collider.x, 0.1, collider.z);
    preview.name = `${collider.id} collision preview`;
    preview.userData.editorIgnore = true;
    world.add(preview);
  }
}

export class PlazaEditor {
  private readonly layout: PlazaLayout;
  private readonly world: PlazaWorld;
  private readonly camera: THREE.Camera;
  private readonly canvas: HTMLCanvasElement;
  private readonly orbit: OrbitControls;
  private readonly transform: TransformControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pointerDown = new THREE.Vector2();
  private readonly selectionOutline = new THREE.BoxHelper(new THREE.Object3D(), 0xf1d38b);
  private readonly panel = document.createElement("aside");
  private readonly select = document.createElement("select");
  private readonly xInput = document.createElement("input");
  private readonly zInput = document.createElement("input");
  private readonly rotationInput = document.createElement("input");
  private readonly status = document.createElement("p");
  private readonly warnings = document.createElement("p");
  private readonly moveButton = document.createElement("button");
  private readonly rotateButton = document.createElement("button");
  private selectedId: PlazaGroupId;
  private selectionPointerActive = false;
  private selectionPointerMoved = false;
  private transformedDuringPointer = false;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    canvas: HTMLCanvasElement,
    world: PlazaWorld,
    layout: PlazaLayout,
  ) {
    this.layout = layout;
    this.world = world;
    this.camera = camera;
    this.canvas = canvas;
    this.selectedId = PLAZA_GROUP_IDS[0];

    this.orbit = new OrbitControls(camera, canvas);
    this.orbit.target.set(0, 0, 0);
    this.orbit.update();
    this.orbit.saveState();

    this.transform = new TransformControls(camera, canvas);
    this.transform.setSpace("world");
    this.transform.setTranslationSnap(TRANSLATION_SNAP);
    this.transform.setRotationSnap(ROTATION_SNAP);
    this.transform.setSize(0.82);
    scene.add(this.transform.getHelper());

    this.selectionOutline.userData.editorIgnore = true;
    const outlineMaterial = this.selectionOutline.material;
    if (Array.isArray(outlineMaterial)) {
      for (const material of outlineMaterial) material.depthTest = false;
    } else {
      outlineMaterial.depthTest = false;
    }
    this.selectionOutline.renderOrder = 20;
    scene.add(this.selectionOutline);
    addCollisionOverlays(world);

    this.buildPanel();
    this.setMode("translate");
    this.selectGroup(this.selectedId);
    this.canvas.addEventListener("pointerdown", this.handleCanvasPointerDown);
    this.canvas.addEventListener("pointermove", this.handleCanvasPointerMove);
    this.canvas.addEventListener("pointerup", this.handleCanvasPointerUp);
    this.transform.addEventListener("objectChange", this.handleObjectChange);
    this.transform.addEventListener("dragging-changed", this.handleTransformDraggingChanged);
    this.transform.addEventListener("mouseDown", this.handleTransformMouseDown);
    this.transform.addEventListener("mouseUp", this.handleTransformMouseUp);
    document.addEventListener("keydown", this.handleKeyDown);
    document.body.classList.add("editor-mode");
  }

  private buildPanel(): void {
    this.panel.className = "plaza-editor";
    this.panel.setAttribute("aria-label", "Plaza layout editor");

    const heading = document.createElement("div");
    heading.className = "plaza-editor__heading";
    heading.innerHTML = "<p>World builder</p><h1>Central Plaza</h1>";

    const playLink = document.createElement("a");
    playLink.href = window.location.pathname;
    playLink.textContent = "Play mode";
    playLink.className = "plaza-editor__play-link";
    heading.append(playLink);

    const selectLabel = document.createElement("label");
    selectLabel.textContent = "Selected group";
    for (const id of PLAZA_GROUP_IDS) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = this.layout.groups[id].label;
      this.select.append(option);
    }
    this.select.addEventListener("change", () => this.selectGroup(this.select.value as PlazaGroupId));
    selectLabel.append(this.select);

    const modes = document.createElement("div");
    modes.className = "plaza-editor__modes";
    this.moveButton.type = "button";
    this.moveButton.textContent = "Move";
    this.moveButton.addEventListener("click", () => this.setMode("translate"));
    this.rotateButton.type = "button";
    this.rotateButton.textContent = "Rotate";
    this.rotateButton.addEventListener("click", () => this.setMode("rotate"));
    modes.append(this.moveButton, this.rotateButton);

    const fields = document.createElement("div");
    fields.className = "plaza-editor__fields";
    fields.append(
      this.createNumberField("X", this.xInput, TRANSLATION_SNAP),
      this.createNumberField("Z", this.zInput, TRANSLATION_SNAP),
      this.createNumberField("Rotation", this.rotationInput, 5, "°"),
    );
    for (const input of [this.xInput, this.zInput, this.rotationInput]) {
      input.addEventListener("change", this.handleNumericChange);
    }

    const actions = document.createElement("div");
    actions.className = "plaza-editor__actions";
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.textContent = "Export layout";
    exportButton.addEventListener("click", () => {
      downloadText("old-town-square-plaza-layout.json", serializePlazaLayout(this.layout));
      this.setStatus("Complete layout exported.");
    });

    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".json,application/json";
    importInput.hidden = true;
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        const imported = validatePlazaLayout(JSON.parse(await file.text()) as unknown);
        for (const id of PLAZA_GROUP_IDS) clampPlazaGroupPlacement(imported, id);
        replacePlazaLayout(this.layout, imported);
        this.world.applyLayout(this.layout);
        savePlazaLayout(this.layout);
        this.selectGroup(this.selectedId);
        this.setStatus(`Imported ${file.name}.`);
      } catch (error) {
        this.setStatus(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.", true);
      } finally {
        importInput.value = "";
      }
    });
    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.textContent = "Import layout";
    importButton.addEventListener("click", () => importInput.click());

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset defaults";
    resetButton.className = "plaza-editor__reset";
    resetButton.addEventListener("click", () => {
      replacePlazaLayout(this.layout, resetPlazaLayout());
      this.world.applyLayout(this.layout);
      this.selectGroup(this.selectedId);
      this.setStatus("Restored the canonical layout.");
    });

    const resetViewButton = document.createElement("button");
    resetViewButton.type = "button";
    resetViewButton.textContent = "Reset view";
    resetViewButton.addEventListener("click", this.resetView);
    actions.append(exportButton, importButton, importInput, resetButton, resetViewButton);

    this.status.className = "plaza-editor__status";
    this.status.setAttribute("aria-live", "polite");
    this.warnings.className = "plaza-editor__warnings";
    this.warnings.setAttribute("aria-live", "polite");

    const help = document.createElement("p");
    help.className = "plaza-editor__help";
    help.textContent = "Left-drag to orbit, right-drag to pan, and scroll or pinch to zoom. Click a feature or choose it above; press F to frame it. Reset view restores the plaza view. Position snaps to 0.25 m; rotation snaps to 5°. Changes save automatically.";

    this.panel.append(heading, selectLabel, modes, fields, actions, this.status, this.warnings, help);
    document.querySelector("#game-shell")?.append(this.panel);
  }

  private createNumberField(labelText: string, input: HTMLInputElement, step: number, suffix = "m"): HTMLLabelElement {
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = labelText;
    input.type = "number";
    input.step = String(step);
    const suffixElement = document.createElement("span");
    suffixElement.textContent = suffix;
    suffixElement.className = "plaza-editor__suffix";
    label.append(text, input, suffixElement);
    return label;
  }

  private setMode(mode: "translate" | "rotate"): void {
    this.transform.setMode(mode);
    this.transform.showX = mode === "translate";
    this.transform.showY = mode === "rotate";
    this.transform.showZ = mode === "translate";
    this.moveButton.classList.toggle("is-active", mode === "translate");
    this.rotateButton.classList.toggle("is-active", mode === "rotate");
  }

  private selectGroup(id: PlazaGroupId): void {
    const group = this.world.editableGroups.get(id);
    if (!group) return;
    this.selectedId = id;
    this.select.value = id;
    this.transform.attach(group);
    this.selectionOutline.setFromObject(group);
    this.updateFields();
    this.updateWarnings();
  }

  private readonly handleCanvasPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.transform.dragging) return;
    this.pointerDown.set(event.clientX, event.clientY);
    this.selectionPointerActive = true;
    this.selectionPointerMoved = false;
  };

  private readonly handleCanvasPointerMove = (event: PointerEvent): void => {
    if (!this.selectionPointerActive) return;
    if (Math.hypot(
      event.clientX - this.pointerDown.x,
      event.clientY - this.pointerDown.y,
    ) > CLICK_DISTANCE_PX) {
      this.selectionPointerMoved = true;
    }
  };

  private readonly handleCanvasPointerUp = (event: PointerEvent): void => {
    const shouldSelect = this.selectionPointerActive
      && !this.selectionPointerMoved
      && !this.transformedDuringPointer
      && event.button === 0;
    this.selectionPointerActive = false;
    this.transformedDuringPointer = false;
    if (!shouldSelect) return;

    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.world.editableGroups.values()], true)
      .find((intersection) => !intersection.object.userData.editorIgnore);
    const id = findLayoutGroupId(hit?.object ?? null);
    if (id) this.selectGroup(id);
  };

  private readonly handleTransformDraggingChanged = (event: { value: unknown }): void => {
    this.orbit.enabled = event.value !== true;
  };

  private readonly handleTransformMouseDown = (): void => {
    this.transformedDuringPointer = true;
    this.panel.classList.add("plaza-editor--dragging");
  };

  private readonly handleTransformMouseUp = (): void => {
    this.panel.classList.remove("plaza-editor--dragging");
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "KeyF" || this.isTextEntry(event.target)) return;
    event.preventDefault();
    this.frameSelectedGroup();
  };

  private readonly resetView = (): void => {
    this.orbit.reset();
  };

  private frameSelectedGroup(): void {
    const group = this.world.editableGroups.get(this.selectedId);
    if (!group) return;

    const bounds = new THREE.Box3().setFromObject(group);
    if (bounds.isEmpty()) return;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const viewDirection = this.camera.position.clone().sub(this.orbit.target);
    if (viewDirection.lengthSq() === 0) viewDirection.set(1, 1, 1);
    viewDirection.normalize();

    const verticalFov = this.camera instanceof THREE.PerspectiveCamera
      ? THREE.MathUtils.degToRad(this.camera.fov)
      : THREE.MathUtils.degToRad(38);
    const distance = Math.max(
      1,
      (sphere.radius * FRAME_PADDING) / Math.sin(verticalFov / 2),
    );
    this.orbit.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(viewDirection, distance);
    this.orbit.update();
  }

  private isTextEntry(target: EventTarget | null): boolean {
    return target instanceof HTMLElement
      && target.matches("input, select, textarea, [contenteditable='true']");
  }

  private readonly handleObjectChange = (): void => {
    const group = this.world.editableGroups.get(this.selectedId);
    if (!group) return;
    const definition = this.layout.groups[this.selectedId];
    definition.position.x = group.position.x;
    definition.position.y = 0;
    definition.position.z = group.position.z;
    definition.rotationY = group.rotation.y;
    clampPlazaGroupPlacement(this.layout, this.selectedId);
    group.position.set(definition.position.x, 0, definition.position.z);
    group.rotation.set(0, definition.rotationY, 0);
    this.selectionOutline.setFromObject(group);
    this.updateFields();
    this.updateWarnings();
    this.setStatus(savePlazaLayout(this.layout) ? "Saved automatically." : "Browser storage is unavailable.", false);
  };

  private readonly handleNumericChange = (): void => {
    const definition = this.layout.groups[this.selectedId];
    const x = Number(this.xInput.value);
    const z = Number(this.zInput.value);
    const degrees = Number(this.rotationInput.value);
    if (![x, z, degrees].every(Number.isFinite)) {
      this.setStatus("Enter valid numeric values.", true);
      this.updateFields();
      return;
    }
    definition.position.x = x;
    definition.position.z = z;
    definition.rotationY = THREE.MathUtils.degToRad(degrees);
    clampPlazaGroupPlacement(this.layout, this.selectedId);
    this.world.applyLayout(this.layout);
    this.selectGroup(this.selectedId);
    this.setStatus(savePlazaLayout(this.layout) ? "Saved automatically." : "Browser storage is unavailable.");
  };

  private updateFields(): void {
    const definition = this.layout.groups[this.selectedId];
    this.xInput.value = definition.position.x.toFixed(2);
    this.zInput.value = definition.position.z.toFixed(2);
    this.rotationInput.value = THREE.MathUtils.radToDeg(definition.rotationY).toFixed(1);
  }

  private updateWarnings(): void {
    const overlaps = findPlazaGroupOverlaps(this.layout).filter((pair) => pair.includes(this.selectedId));
    const staticOverlaps = findPlazaStaticOverlaps(this.layout, this.selectedId);
    if (overlaps.length === 0 && staticOverlaps.length === 0) {
      this.warnings.textContent = "No feature overlaps detected.";
      this.warnings.classList.remove("has-warning");
      return;
    }
    const otherIds = overlaps.map(([left, right]) => left === this.selectedId ? right : left);
    const labels = [
      ...otherIds.map((id) => this.layout.groups[id].label),
      ...staticOverlaps.map((id) => id.replace("plaza.", "").replaceAll("-", " ")),
    ];
    this.warnings.textContent = `Possible overlap with ${labels.join(", ")}.`;
    this.warnings.classList.add("has-warning");
  }

  private setStatus(message: string, error = false): void {
    this.status.textContent = message;
    this.status.classList.toggle("has-error", error);
  }
}

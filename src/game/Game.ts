import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ViewSunShadow } from "./ViewSunShadow.ts";
import * as THREE from "three";
import { WorldView } from "./WorldView";
import { Goose } from "./Goose";
import { InputController, type InputDevice } from "./InputController";
import { TouchControls } from "./TouchControls";
import { PauseReasons, parseTouchControlsPreference, shouldPauseForPortrait, shouldShowTouchControls, TOUCH_CONTROLS_STORAGE_KEY, type TouchControlsPreference } from "./mobileControls";
import { GameAudio } from "./GameAudio";
import { Simulation, HURRY_SPEED, type GameplayEvent } from "./simulation/Simulation";
import { PALETTE } from "./palette";
import { WorldEditor } from "./WorldEditor";
import { COFFEE_SHOP_AREA_ID, getWorldArea, loadWorldLayout, resolveStartAreaId } from "./worldLayout";
import { createWorldRules } from "./worldLevel";
import { GooseOcclusionFader } from "./GooseOcclusionFader";
import { toonMaterial, STORYBOOK_LIGHTING } from "./toonMaterial";
import { CAMERA_BASE_FOV, CAMERA_FOCUS_HEIGHT, CAMERA_TRACK_MAX_REACH, limitCameraReach } from "./cameraTrack";
import { CAMERA_TRACK_BLEND_SECONDS, CameraTrackDirector } from "./cameraDirector";
import { SubjectFraming } from "./cameraFraming";
import { ControlHeadingLock } from "./controlHeading";
import { LEVEL_NAMES } from "./challenges";
import { clearProgress, loadProgress, saveProgress, sessionStateFromProgress } from "./progress";

// A closer follow camera keeps the smaller goose readable and makes the plaza
// landmarks feel larger without changing their gameplay dimensions.
const CAMERA_FOLLOW_ZOOM = 1.3;
const CAMERA_AXIS_OFFSET = 9.6 / CAMERA_FOLLOW_ZOOM;
const CAMERA_LEAD_SECONDS = 0.2;
// How quickly the camera glides along its track toward the goose.
const CAMERA_TRACK_RESPONSE = 3.2;

function createPoopView(): THREE.Group {
  const poop = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.052, 0.06, 0.18, 10),
    toonMaterial(PALETTE.green.deep),
  );
  // CylinderGeometry is vertical by default; lay the small dropping along the ground.
  body.rotation.z = Math.PI / 2;
  body.scale.y = 0.46;
  body.position.y = 0.03;
  body.castShadow = true;
  body.receiveShadow = true;
  poop.add(body);

  const whiteDab = new THREE.Mesh(
    new THREE.SphereGeometry(0.034, 10, 7),
    toonMaterial(PALETTE.goose.white),
  );
  whiteDab.scale.set(1.1, 0.34, 0.75);
  whiteDab.position.set(0.025, 0.061, -0.008);
  whiteDab.castShadow = true;
  whiteDab.receiveShadow = true;
  poop.add(whiteDab);

  return poop;
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing interface element: ${selector}`);
  return element;
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly sunShadow = new ViewSunShadow();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_BASE_FOV, 1, 0.1, 300);
  private readonly query = new URLSearchParams(window.location.search);
  private readonly overviewMode = this.query.has("overview");
  private readonly editorMode = this.query.has("edit");
  private readonly devMode = this.query.has("dev");
  private readonly worldLayout = loadWorldLayout();
  private readonly startAreaId = resolveStartAreaId(this.worldLayout, this.devMode, this.query.get("start"));
  private worldArea = getWorldArea(this.worldLayout, this.startAreaId);
  private rules = createWorldRules(this.worldArea, this.worldLayout.transitions);
  private readonly world = new WorldView(this.worldArea, !this.editorMode && !this.overviewMode);
  private readonly goose = new Goose();
  private readonly gazeRay = new THREE.Raycaster();
  private readonly gazeOrigin = new THREE.Vector3();
  private readonly gazeDirection = new THREE.Vector3();
  private gazeRefresh = 0;
  private readonly poopViews = new Map<string, THREE.Group>();
  private readonly gooseOcclusionFader = new GooseOcclusionFader(this.world.occlusionFadeGroups);
  private readonly input: InputController;
  private readonly clock = new THREE.Clock();
  private readonly velocity = new THREE.Vector3();
  // Crossed-off tasks come back after a reload; `?dev&fresh` starts a clean list without erasing it.
  private simulation = new Simulation(this.rules, this.devMode && this.query.has("fresh") ? undefined : sessionStateFromProgress(loadProgress()));
  private readonly audio = new GameAudio();
  private readonly moveDirection = new THREE.Vector3();
  private readonly cameraForward = new THREE.Vector3();
  private readonly controlHeading = new ControlHeadingLock();
  private readonly framing = new SubjectFraming();
  private cameraTrack?: CameraTrackDirector;
  // Equal ground axes give a 45° diagonal; √2 vertical keeps a 45° downward pitch.
  private readonly cameraOffset = new THREE.Vector3();
  private readonly cameraFocus = new THREE.Vector3();
  private readonly desiredCameraFocus = new THREE.Vector3();
  private readonly controlsCard = requireElement<HTMLElement>("#controls-card");
  private readonly keyboardControls = requireElement<HTMLElement>("#keyboard-controls");
  private readonly gamepadControls = requireElement<HTMLElement>("#gamepad-controls");
  private readonly touchControlsRoot = requireElement<HTMLElement>("#touch-controls");
  private readonly settingsMenu = requireElement<HTMLElement>("#settings-menu");
  private readonly rotateMessage = requireElement<HTMLElement>("#rotate-message");
  private readonly settingsButton = requireElement<HTMLButtonElement>("#settings-button");
  private readonly installButton = requireElement<HTMLButtonElement>("#install-button");
  private readonly installMenu = requireElement<HTMLElement>("#install-menu");
  private readonly fullscreenButton = requireElement<HTMLButtonElement>("#fullscreen-button");
  private readonly touchPreferenceSelect = requireElement<HTMLSelectElement>("#touch-controls-preference");
  private readonly todoToggle = requireElement<HTMLButtonElement>("#todo-toggle");
  private readonly todoCount = requireElement<HTMLElement>("#todo-count");
  private readonly objectiveList = requireElement<HTMLUListElement>("#objective-list");
  private readonly interactionPrompt = requireElement<HTMLElement>("#interaction-prompt");
  private readonly interactionKey = requireElement<HTMLElement>("#interaction-key");
  private readonly interactionLabel = requireElement<HTMLElement>("#interaction-label");
  private readonly allDone = requireElement<HTMLElement>("#all-done");
  private readonly allDoneLevel = requireElement<HTMLElement>("#all-done-level");
  private readonly todoList = requireElement<HTMLElement>("#todo-list");
  private readonly todoTitle = requireElement<HTMLElement>("#todo-title");
  private readonly startOverButton = requireElement<HTMLButtonElement>("#start-over");
  private todoTimer = 0;
  private highlightedObjectiveId: string | undefined;
  private startOverArmed = false;
  private readonly pauseReasons = new PauseReasons();
  private touchControls: TouchControls | null = null;
  private paused = false;
  private touchPreference: TouchControlsPreference = "auto";
  private coarseTouchDevice = window.matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 0;
  private disposed = false;
  private transitioning = false;
  private readonly transitionCurtain: HTMLDivElement;
  private lastInputTime = performance.now();
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private readonly canvasResizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.transitionCurtain = document.createElement("div");
    this.transitionCurtain.className = "area-transition-curtain";
    document.querySelector("#game-shell")?.append(this.transitionCurtain);

    this.scene.background = new THREE.Color(PALETTE.atmosphere.sky);
    this.scene.add(this.world, this.goose);
    if (this.devMode) {
      // Dev-only handle for playtesting from the browser console.
      (window as unknown as { gooseGame?: Game }).gooseGame = this;
      const banner = document.createElement("div");
      banner.className = "dev-mode-banner";
      banner.textContent = `DEV START · ${this.worldArea.label}`;
      document.querySelector("#game-shell")?.append(banner);
    }
    this.syncPlayerView();
    this.world.syncGameplay(this.simulation.world, this.goose.getMouthSocket());
    this.renderObjectives();

    this.setupLighting();
    this.setupCamera();
    this.input = new InputController(this.handleDeviceChanged);

    if (this.editorMode) {
      this.camera.position.set(-37, 58, -65);
      this.camera.lookAt(0, 0, 0);
      this.goose.visible = false;
      new WorldEditor(this.scene, this.camera, canvas, this.worldLayout, this.world, this.startAreaId, this.goose);
    }

    if (this.overviewMode && !this.editorMode) {
      this.camera.position.set(-55, 78, 82); this.camera.lookAt(-5, 0, 0);
      this.goose.visible = false;
      const orbit = new OrbitControls(this.camera, canvas); orbit.target.set(-5, 0, 0); orbit.update();
      document.body.classList.add("overview-mode");
      const links = document.createElement("nav"); links.className = "square-overview";
      links.innerHTML = '<strong>Old Town Square</strong><span>Drag to orbit · scroll to zoom</span><a href="?">Walk the square</a><a href="?edit">Edit the square</a>';
      document.querySelector("#game-shell")?.append(links);
    }

    if (!this.editorMode && !this.overviewMode) this.setupMobileControls();
    this.canvasResizeObserver = new ResizeObserver(this.resize);
    this.canvasResizeObserver.observe(canvas);
    window.addEventListener("resize", this.resize);
    window.visualViewport?.addEventListener("resize", this.resize);
    window.addEventListener("blur", this.handleBlur);
    window.addEventListener("focus", this.handleFocus);
    document.addEventListener("visibilitychange", this.handleVisibility);
    document.addEventListener("fullscreenchange", this.syncFullscreenLabel);
    window.addEventListener("pagehide", this.dispose, { once: true });
    this.resize();
  }

  start(): void {
    this.clock.start();
    this.renderer.setAnimationLoop(this.animate);
  }

  private setupLighting(): void {
    // Broad flat colors, with faint grounding shadows from a low-contrast sun.
    this.scene.add(new THREE.AmbientLight(0xffffff, STORYBOOK_LIGHTING.ambient));

    this.scene.add(this.sunShadow.light, this.sunShadow.light.target);
  }

  private setupCamera(): void {
    this.useAreaCameraTrack();
    this.snapCameraToGoose();
    this.scene.add(this.camera);
  }

  private useAreaCameraTrack(): void {
    const tracks = this.worldArea.cameraTracks;
    this.cameraTrack = tracks?.length ? new CameraTrackDirector(tracks) : undefined;
    if (!this.cameraTrack) this.setCameraZoom(1);
  }

  private readonly animate = (): void => {
    let delta = Math.min(this.clock.getDelta(), 8 / 60);
    if (this.paused) delta = 0;

    if (this.transitioning) {
      this.world.updatePresentation(delta);
      this.sunShadow.update(this.camera);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.editorMode || this.overviewMode) {
      this.world.updatePresentation(delta);
      this.sunShadow.update(this.camera);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const frame = this.input.sample();
    this.touchControls?.syncPoseState(frame.wingsSpread, frame.sneaking, frame.threatening);
    if (delta > 0) {
      if (frame.move.lengthSq() > 0.001 || frame.hurry || frame.interactPressed || frame.wingsSpread || frame.sneaking || frame.threatening) {
        this.lastInputTime = performance.now();
        this.controlsCard.classList.remove("controls-card--quiet");
      }

      this.camera.getWorldDirection(this.cameraForward);
      const cameraYaw = Math.atan2(this.cameraForward.x, this.cameraForward.z);
      const controlYaw = this.controlHeading.update(frame.move.x, frame.move.y, cameraYaw, delta);
      const forwardX = Math.sin(controlYaw); const forwardZ = Math.cos(controlYaw);
      // Screen-right is forward × up: (-forwardZ, 0, forwardX).
      this.moveDirection.set(
        forwardX * frame.move.y - forwardZ * frame.move.x,
        0,
        forwardZ * frame.move.y + forwardX * frame.move.x,
      );
      if (this.moveDirection.lengthSq() > 1) this.moveDirection.normalize();

      const events = this.simulation.advance(delta, {
        moveX: this.moveDirection.x,
        moveZ: this.moveDirection.z,
        hurry: frame.hurry,
        honkPressed: frame.honkPressed,
        interactPressed: frame.interactPressed,
        wingsSpread: frame.wingsSpread,
        sneaking: frame.sneaking,
        threatening: frame.threatening,
      });
      this.syncPlayerView();
      this.syncPoopViews();
      this.world.syncGameplay(this.simulation.world, this.goose.getMouthSocket());
      for (const event of events) {
        if (event.type === "goose-honked") {
          this.goose.honk();
          void this.audio.playHonk();
          this.lastInputTime = performance.now();
        }
        if (event.type === "goose-shooed") {
          this.goose.spook();
          this.framing.release(event.actorId);
        }
        if ((event.type === "entity-grabbed" || event.type === "entity-dropped") && event.actorId === "goose") this.goose.grab();
        if (event.type === "objective-completed") this.celebrateTask(event.objectiveId);
        if (event.type === "device-state-changed" && event.active && this.simulation.world.entities.find((entity) => entity.id === event.targetId)?.tags.includes("bell")) this.audio.playBell();
        if (event.type === "order-called") this.audio.playOrderCalled();
        if (event.type === "area-transition-requested") {
          this.beginAreaTransition(event);
          return;
        }
      }
    }

    const player = this.simulation.player;
    this.updateGooseAttention(delta);
    this.goose.update(
      delta,
      this.simulation.elapsed,
      player.speed / HURRY_SPEED,
      player.turnAmount,
      player.wingsSpread || player.threatening,
      player.sneaking || player.threatening,
    );
    if (this.goose.stepped) void this.audio.playFootstep();
    this.audio.setCafeMusic(this.simulation.world.entities.some((entity) => entity.tags.includes("music") && entity.active === true));
    this.updateInteractionPrompt(frame.device);

    if (performance.now() - this.lastInputTime > 6200) {
      this.controlsCard.classList.add("controls-card--quiet");
    }

    this.updateCamera(delta);
    this.world.updatePresentation(delta);
    this.gooseOcclusionFader.update(this.world, this.camera, this.goose, delta);
    this.sunShadow.update(this.camera);
    this.renderer.render(this.scene, this.camera);
  };

  private beginAreaTransition(event: Extract<GameplayEvent, { type: "area-transition-requested" }>): void {
    if (this.transitioning) return;
    const nextArea = this.worldLayout.areas.find((area) => area.id === event.toAreaId);
    if (!nextArea) return;
    this.transitioning = true;
    this.input.clear();
    this.touchControls?.clear();
    this.touchControls?.syncPoseState(false, false, false);
    this.simulation.suspend();
    this.transitionCurtain.classList.remove("area-transition-curtain--revealing");
    this.transitionCurtain.classList.add("area-transition-curtain--covered");
    this.audio.setCafeMusic(false);
    window.setTimeout(() => {
      if (this.disposed) return;
      const sessionState = this.simulation.sessionState;
      saveProgress(sessionState);
      this.worldArea = nextArea;
      this.rules = createWorldRules(this.worldArea, this.worldLayout.transitions);
      this.simulation = new Simulation(this.rules, sessionState);
      this.simulation.setPlayerTransform(event.targetPosition, event.targetHeading);
      this.world.applyArea(this.worldArea);
      this.velocity.set(0, 0, 0);
      this.syncPlayerView();
      this.world.syncGameplay(this.simulation.world, this.goose.getMouthSocket());
      this.syncPoopViews();
      this.renderObjectives();
      this.useAreaCameraTrack();
      this.controlHeading.reset();
      this.framing.reset();
      this.snapCameraToGoose();
      this.transitionCurtain.classList.remove("area-transition-curtain--covered");
      this.transitionCurtain.classList.add("area-transition-curtain--revealing");
      window.setTimeout(() => {
        this.transitionCurtain.classList.remove("area-transition-curtain--revealing");
        this.transitioning = false;
        this.clock.getDelta();
      }, 220);
    }, 180);
  }

  private updateCamera(delta: number): void {
    const leadSeconds = this.reducedMotion ? 0 : CAMERA_LEAD_SECONDS;
    this.setDesiredCameraFocus(leadSeconds);
    const cameraDamping = 1 - Math.exp(-(this.reducedMotion ? 12 : 6.3) * delta);
    this.cameraFocus.lerp(this.desiredCameraFocus, cameraDamping);
    if (this.cameraTrack) {
      const sample = this.cameraTrack.update(this.cameraFocus.x, this.cameraFocus.z, delta, this.reducedMotion ? 12 : CAMERA_TRACK_RESPONSE, this.reducedMotion ? 0.35 : CAMERA_TRACK_BLEND_SECONDS);
      this.placeCameraOnTrack(sample);
    } else {
      this.camera.position.copy(this.cameraFocus).add(this.getCameraOffset());
    }
    this.camera.lookAt(this.cameraFocus);
  }

  private snapCameraToGoose(): void {
    this.setDesiredCameraFocus(0);
    this.cameraFocus.copy(this.desiredCameraFocus);
    if (this.cameraTrack) this.placeCameraOnTrack(this.cameraTrack.snap(this.cameraFocus.x, this.cameraFocus.z));
    else this.camera.position.copy(this.cameraFocus).add(this.getCameraOffset());
    this.camera.lookAt(this.cameraFocus);
  }

  private setDesiredCameraFocus(leadSeconds: number): void {
    const world = this.simulation.world;
    const janitor = world.janitor;
    const barista = world.cafePeople.find((person) => person.role === "barista");
    const framed = this.framing.focus(
      { x: this.goose.position.x, z: this.goose.position.z },
      [...(janitor ? [{ id: janitor.id, x: janitor.position.x, z: janitor.position.z }] : []),
        ...(barista ? [{ id: barista.id, x: barista.position.x, z: barista.position.z }] : [])],
    );
    this.desiredCameraFocus.set(
      framed.x + this.velocity.x * leadSeconds,
      this.goose.position.y + CAMERA_FOCUS_HEIGHT,
      framed.z + this.velocity.z * leadSeconds,
    );
  }

  private placeCameraOnTrack(sample: { x: number; y: number; z: number; zoom: number }): void {
    const reach = limitCameraReach(sample, this.cameraFocus, CAMERA_TRACK_MAX_REACH);
    this.camera.position.set(reach.x, reach.y, reach.z);
    this.setCameraZoom(sample.zoom);
  }

  private setCameraZoom(zoom: number): void {
    const fov = CAMERA_BASE_FOV / zoom;
    if (Math.abs(this.camera.fov - fov) < 0.001) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  private getCameraOffset(): THREE.Vector3 {
    const reversed = this.worldArea.id === COFFEE_SHOP_AREA_ID;
    this.cameraOffset.set(
      reversed ? CAMERA_AXIS_OFFSET : -CAMERA_AXIS_OFFSET,
      CAMERA_AXIS_OFFSET * Math.SQRT2,
      reversed ? CAMERA_AXIS_OFFSET : -CAMERA_AXIS_OFFSET,
    );
    return this.cameraOffset;
  }

  private syncPlayerView(): void {
    const player = this.simulation.player;
    const previous = this.simulation.previousPlayerTransform;
    const alpha = this.simulation.interpolationAlpha;
    this.goose.position.copy(previous.position).lerp(player.position, alpha);
    const angle = Math.atan2(Math.sin(player.heading - previous.heading), Math.cos(player.heading - previous.heading));
    this.goose.rotation.y = previous.heading + angle * alpha;
    this.velocity.copy(player.velocity);
  }

  private updateGooseAttention(delta: number): void {
    this.gazeRefresh -= delta;
    if (delta <= 0 || this.gazeRefresh > 0) return;
    this.gazeRefresh = 0.18;
    const snapshot = this.simulation.world;
    const player = snapshot.player;
    // Cosmetic attention only. Visibility is checked against rendered obstacles;
    // this does not supply perception or interaction decisions to simulation.
    const candidates = [
      ...snapshot.entities.filter((entity) => !entity.holderId && !entity.containedBy)
        .map((entity) => ({ id: entity.id, position: { ...entity.position, y: entity.position.y + 0.28 } })),
      ...(snapshot.janitor ? [{ id: snapshot.janitor.id,
        position: { ...snapshot.janitor.position, y: snapshot.janitor.position.y + 1.25 } }] : []),
      ...snapshot.splashKids.map((child) => ({ id: child.id, position: { ...child.position, y: child.position.y + 0.8 } })),
      ...snapshot.cafePeople.map((person) => ({ id: person.id, position: { ...person.position, y: person.position.y + (person.seated ? 1.5 : 2.1) } })),
    ].map((candidate) => ({ ...candidate,
      distance: Math.hypot(candidate.position.x - player.position.x, candidate.position.z - player.position.z),
      angle: Math.atan2(-(candidate.position.x - player.position.x), -(candidate.position.z - player.position.z)) - player.heading,
    })).filter((candidate) => candidate.distance > 0.4 && candidate.distance < 3.2
      && Math.cos(candidate.angle) > 0.45).sort((a, b) => a.distance - b.distance);
    this.gazeOrigin.copy(player.position).y += 0.78;
    this.world.updateMatrixWorld(true);
    for (const candidate of candidates.slice(0, 3)) {
      this.gazeDirection.copy(candidate.position).sub(this.gazeOrigin);
      const distance = this.gazeDirection.length();
      this.gazeRay.set(this.gazeOrigin, this.gazeDirection.normalize());
      this.gazeRay.far = Math.max(0, distance - 0.25);
      const hit = this.gazeRay.intersectObjects(this.world.children, true)[0];
      let object: THREE.Object3D | null | undefined = hit?.object;
      while (object && !object.userData.worldInstanceId) object = object.parent;
      if (!hit || object?.userData.worldInstanceId === candidate.id) {
        this.goose.setLookTarget(candidate.position);
        return;
      }
    }
    this.goose.setLookTarget();
  }

  private syncPoopViews(): void {
    const currentIds = new Set<string>();
    for (const poop of this.simulation.goosePoops) {
      currentIds.add(poop.id);
      let view = this.poopViews.get(poop.id);
      if (!view) {
        view = createPoopView();
        this.poopViews.set(poop.id, view);
        this.scene.add(view);
      }
      view.position.copy(poop.position);
    }
    for (const [id, view] of this.poopViews) {
      if (currentIds.has(id)) continue;
      this.scene.remove(view);
      this.poopViews.delete(id);
    }
  }

  private celebrateTask(objectiveId: string): void {
    this.highlightedObjectiveId = objectiveId;
    this.renderObjectives();
    saveProgress(this.simulation.sessionState);
    this.audio.playTaskComplete();
    const task = this.simulation.objectiveList.find((objective) => objective.id === objectiveId);
    this.revealTodoList();
    // Finishing a level's last task, wherever the goose happens to be, earns that level's card.
    const level = task?.areaId;
    const levelTasks = this.simulation.objectiveList.filter((objective) => objective.areaId === level);
    if (level && levelTasks.every((objective) => objective.completed)) {
      window.setTimeout(() => {
        this.allDoneLevel.textContent = LEVEL_NAMES[level] ?? "To-do list";
        this.allDone.hidden = false;
        window.setTimeout(() => { this.allDone.hidden = true; }, 7000);
      }, 1600);
    }
  }

  private readonly toggleTodoList = (): void => {
    if (this.todoList.hidden) this.openTodoList(); else this.closeTodoList();
  };

  private readonly handleTodoShortcut = (event: KeyboardEvent): void => {
    if (event.code !== "KeyT" || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    this.toggleTodoList();
  };

  private openTodoList(): void {
    window.clearTimeout(this.todoTimer);
    this.todoTimer = 0;
    this.todoList.hidden = false;
    this.todoToggle.setAttribute("aria-expanded", "true");
  }

  private closeTodoList(): void {
    window.clearTimeout(this.todoTimer);
    this.todoTimer = 0;
    this.todoList.hidden = true;
    this.todoList.classList.remove("todo-list--reveal");
    this.todoToggle.setAttribute("aria-expanded", "false");
    this.highlightedObjectiveId = undefined;
    this.objectiveList.querySelector(".is-newly-complete")?.classList.remove("is-newly-complete");
  }

  private revealTodoList(): void {
    this.openTodoList();
    // Re-trigger the reveal animation for back-to-back completed tasks.
    this.todoList.classList.remove("todo-list--reveal"); void this.todoList.offsetWidth; this.todoList.classList.add("todo-list--reveal");
    this.todoTimer = window.setTimeout(() => this.closeTodoList(), 3600);
  }

  private readonly startOver = (): void => {
    if (!this.startOverArmed) {
      this.startOverArmed = true;
      this.startOverButton.textContent = "Press again to clear your list";
      window.setTimeout(() => { this.startOverArmed = false; this.startOverButton.textContent = "Start over"; }, 4000);
      return;
    }
    clearProgress();
    // Skip the pagehide save so the old list is not written straight back.
    this.progressCleared = true;
    window.location.reload();
  };
  private progressCleared = false;

  /** The normal list is local to this level; a just-finished remote task is briefly included for its completion reveal. */
  private renderObjectives(): void {
    const tasks = this.simulation.objectiveList.filter((objective) => !objective.areaId || objective.areaId === this.worldArea.id);
    const highlightedTask = this.highlightedObjectiveId
      ? this.simulation.objectiveList.find((objective) => objective.id === this.highlightedObjectiveId)
      : undefined;
    const visibleTasks = highlightedTask && !tasks.some((objective) => objective.id === highlightedTask.id)
      ? [highlightedTask, ...tasks]
      : tasks;
    this.todoToggle.hidden = visibleTasks.length === 0;
    if (visibleTasks.length === 0) this.closeTodoList();
    this.todoCount.textContent = String(tasks.filter((objective) => !objective.completed).length);
    this.todoTitle.textContent = LEVEL_NAMES[this.worldArea.id] ? `To do · ${LEVEL_NAMES[this.worldArea.id]}` : "To do";
    this.objectiveList.replaceChildren(...visibleTasks.map((objective) => {
      const item = document.createElement("li"); item.textContent = objective.description;
      item.dataset.objectiveId = objective.id; item.classList.toggle("is-complete", objective.completed); item.classList.toggle("is-newly-complete", objective.id === this.highlightedObjectiveId);
      return item;
    }));
  }

  private updateInteractionPrompt(device: InputDevice): void {
    const hint = this.simulation.interactionHint;
    this.interactionPrompt.hidden = !hint;
    if (!hint) return;
    this.interactionKey.textContent = device === "gamepad" ? "B" : "F";
    this.interactionLabel.textContent = hint;
  }

  private readonly handleDeviceChanged = (device: InputDevice): void => {
    const usingGamepad = device === "gamepad";
    this.keyboardControls.hidden = usingGamepad;
    this.gamepadControls.hidden = !usingGamepad;
    this.lastInputTime = performance.now();
    this.controlsCard.classList.remove("controls-card--quiet");
  };

  private readonly resize = (): void => {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 700 ? 1.25 : 1.5));
    this.renderer.setSize(width, height, false);
    this.updateOrientationPause();
  };

  private setupMobileControls(): void {
    this.touchPreference = this.loadTouchPreference();
    this.touchPreferenceSelect.value = this.touchPreference;
    this.touchControls = new TouchControls(
      requireElement<HTMLElement>("#touch-movement-area"),
      requireElement<HTMLElement>("#touch-stick"),
      requireElement<HTMLElement>("#touch-knob"),
      requireElement<HTMLButtonElement>("#honk-button"),
      requireElement<HTMLButtonElement>("#interact-button"),
      requireElement<HTMLButtonElement>("#wings-button"),
      requireElement<HTMLButtonElement>("#sneak-button"),
      requireElement<HTMLButtonElement>("#threat-button"),
      {
        onMove: ({ moveX, moveY, hurry }) => this.input.setTouchMovement(moveX, moveY, hurry),
        onHonk: () => this.input.queueTouchHonk(),
        onInteract: () => this.input.queueTouchInteraction(),
        onWings: () => this.input.toggleTouchPose("wings"),
        onSneak: () => this.input.toggleTouchPose("sneak"),
        onThreatening: (held) => this.input.setTouchThreatening(held),
        onTouchUsed: () => { this.coarseTouchDevice = true; },
      },
    );
    this.settingsButton.addEventListener("click", this.openSettings);
    this.todoToggle.addEventListener("click", this.toggleTodoList);
    window.addEventListener("keydown", this.handleTodoShortcut);
    this.startOverButton.addEventListener("click", this.startOver);
    this.installButton.addEventListener("click", this.openInstallHelp);
    requireElement<HTMLButtonElement>("#install-close").addEventListener("click", this.closeInstallHelp);
    requireElement<HTMLButtonElement>("#settings-close").addEventListener("click", this.closeSettings);
    this.touchPreferenceSelect.addEventListener("change", this.updateTouchPreference);
    this.fullscreenButton.addEventListener("click", this.toggleFullscreen);
    this.updateTouchControlsVisibility();
    this.syncFullscreenLabel();
    this.installButton.hidden = !this.isIPhoneSafariTab();
  }

  private loadTouchPreference(): TouchControlsPreference {
    try { return parseTouchControlsPreference(window.localStorage.getItem(TOUCH_CONTROLS_STORAGE_KEY)); }
    catch { return "auto"; }
  }

  private readonly updateTouchPreference = (): void => {
    this.touchPreference = parseTouchControlsPreference(this.touchPreferenceSelect.value);
    try { window.localStorage.setItem(TOUCH_CONTROLS_STORAGE_KEY, this.touchPreference); } catch { /* Storage is optional. */ }
    this.touchControls?.clear();
    this.updateTouchControlsVisibility();
  };

  private updateTouchControlsVisibility(): void {
    const showTouchControls = shouldShowTouchControls(this.touchPreference, this.coarseTouchDevice)
      && !this.pauseReasons.paused;
    this.touchControlsRoot.hidden = !showTouchControls;
    this.controlsCard.classList.toggle("controls-card--touch-visible", showTouchControls);
  }

  private readonly openSettings = (): void => {
    this.settingsMenu.hidden = false;
    this.setPauseReason("settings", true);
    this.touchPreferenceSelect.focus({ preventScroll: true });
  };

  private readonly closeSettings = (): void => {
    this.settingsMenu.hidden = true;
    this.setPauseReason("settings", false);
    this.settingsButton.focus({ preventScroll: true });
  };

  private isIPhoneSafariTab(): boolean {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isIPadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return !standalone && (/iPad|iPhone|iPod/.test(navigator.userAgent) || isIPadDesktopMode)
      && /Safari/.test(navigator.userAgent);
  }

  private readonly openInstallHelp = (): void => {
    this.installMenu.hidden = false;
    this.setPauseReason("install-help", true);
    requireElement<HTMLButtonElement>("#install-close").focus({ preventScroll: true });
  };

  private readonly closeInstallHelp = (): void => {
    this.installMenu.hidden = true;
    this.setPauseReason("install-help", false);
    this.installButton.focus({ preventScroll: true });
  };

  private readonly toggleFullscreen = async (): Promise<void> => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await requireElement<HTMLElement>("#game-shell").requestFullscreen();
    } catch { /* Fullscreen is optional; normal play remains available. */ }
    this.syncFullscreenLabel();
  };

  private readonly syncFullscreenLabel = (): void => {
    this.fullscreenButton.hidden = !document.fullscreenEnabled && !document.fullscreenElement;
    this.fullscreenButton.textContent = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
  };

  private updateOrientationPause(): void {
    const portrait = shouldPauseForPortrait(this.coarseTouchDevice, window.innerWidth, window.innerHeight);
    this.rotateMessage.hidden = !portrait;
    this.setPauseReason("portrait", portrait);
  }

  private setPauseReason(reason: string, active: boolean): void {
    const changed = this.pauseReasons.set(reason, active);
    this.paused = this.pauseReasons.paused;
    if (changed) {
      this.simulation.suspend();
      this.input.clear();
      this.touchControls?.clear();
      this.touchControls?.syncPoseState(false, false, false);
      this.audio.setPaused(this.paused);
      this.clock.getDelta();
    }
    this.updateTouchControlsVisibility();
  }

  private readonly handleBlur = (): void => { this.setPauseReason("focus", true); };
  private readonly handleFocus = (): void => { this.setPauseReason("focus", document.hidden); };
  private readonly handleVisibility = (): void => {
    this.setPauseReason("hidden", document.hidden || !document.hasFocus());
    if (document.hidden && !this.progressCleared) saveProgress(this.simulation.sessionState);
  };

  /** Explicitly release the GPU context before a Play/Edit page transition. */
  private readonly dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    window.clearTimeout(this.todoTimer);
    if (!this.progressCleared && !this.editorMode && !this.overviewMode) saveProgress(this.simulation.sessionState);
    this.audio.setCafeMusic(false);
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.resize);
    window.visualViewport?.removeEventListener("resize", this.resize);
    this.canvasResizeObserver.disconnect();
    window.removeEventListener("blur", this.handleBlur);
    window.removeEventListener("focus", this.handleFocus);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    document.removeEventListener("fullscreenchange", this.syncFullscreenLabel);
    window.removeEventListener("keydown", this.handleTodoShortcut);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  };
}

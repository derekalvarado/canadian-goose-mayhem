import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ViewSunShadow } from "./ViewSunShadow.ts";
import * as THREE from "three";
import { WorldView } from "./WorldView";
import { Goose } from "./Goose";
import { InputController, type InputDevice } from "./InputController";
import { TouchControls } from "./TouchControls";
import { PauseReasons, parseTouchControlsPreference, shouldPauseForPortrait, shouldShowTouchControls, TOUCH_CONTROLS_STORAGE_KEY, type TouchControlsPreference } from "./mobileControls";
import { GameAudio } from "./GameAudio";
import { Simulation, HURRY_SPEED } from "./simulation/Simulation";
import { PALETTE } from "./palette";
import { WorldEditor } from "./WorldEditor";
import { getWorldArea, loadWorldLayout } from "./worldLayout";
import { createCentralPlazaRules } from "./worldLevel";
import { GooseOcclusionFader } from "./GooseOcclusionFader";
import { toonMaterial } from "./toonMaterial";

const CAMERA_FOCUS_HEIGHT = 0.55;
// A closer follow camera keeps the smaller goose readable and makes the plaza
// landmarks feel larger without changing their gameplay dimensions.
const CAMERA_AXIS_OFFSET = 9.6;
const CAMERA_LEAD_SECONDS = 0.2;

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
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
  private readonly overviewMode = new URLSearchParams(window.location.search).has("overview");
  private readonly editorMode = new URLSearchParams(window.location.search).has("edit");
  private readonly worldLayout = loadWorldLayout();
  private readonly worldArea = getWorldArea(this.worldLayout);
  private readonly rules = createCentralPlazaRules(this.worldArea);
  private readonly world = new WorldView(this.worldArea, !this.editorMode && !this.overviewMode);
  private readonly goose = new Goose();
  private readonly poopViews = new Map<string, THREE.Group>();
  private readonly gooseOcclusionFader = new GooseOcclusionFader(this.world.occlusionFadeGroups);
  private readonly input: InputController;
  private readonly clock = new THREE.Clock();
  private readonly velocity = new THREE.Vector3();
  private readonly simulation = new Simulation(this.rules);
  private readonly audio = new GameAudio();
  private readonly moveDirection = new THREE.Vector3();
  private readonly cameraForward = new THREE.Vector3();
  private readonly cameraRight = new THREE.Vector3();
  // Equal ground axes give a 45° diagonal; √2 vertical keeps a 45° downward pitch.
  private readonly cameraOffset = new THREE.Vector3(
    CAMERA_AXIS_OFFSET,
    CAMERA_AXIS_OFFSET * Math.SQRT2,
    CAMERA_AXIS_OFFSET,
  );
  private readonly cameraFocus = new THREE.Vector3();
  private readonly desiredCameraFocus = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly controlsCard = requireElement<HTMLElement>("#controls-card");
  private readonly keyboardControls = requireElement<HTMLElement>("#keyboard-controls");
  private readonly gamepadControls = requireElement<HTMLElement>("#gamepad-controls");
  private readonly deviceLabel = requireElement<HTMLElement>("#device-label");
  private readonly touchControlsRoot = requireElement<HTMLElement>("#touch-controls");
  private readonly settingsMenu = requireElement<HTMLElement>("#settings-menu");
  private readonly rotateMessage = requireElement<HTMLElement>("#rotate-message");
  private readonly settingsButton = requireElement<HTMLButtonElement>("#settings-button");
  private readonly installButton = requireElement<HTMLButtonElement>("#install-button");
  private readonly installMenu = requireElement<HTMLElement>("#install-menu");
  private readonly fullscreenButton = requireElement<HTMLButtonElement>("#fullscreen-button");
  private readonly touchPreferenceSelect = requireElement<HTMLSelectElement>("#touch-controls-preference");
  private readonly pauseReasons = new PauseReasons();
  private touchControls: TouchControls | null = null;
  private paused = false;
  private touchPreference: TouchControlsPreference = "auto";
  private coarseTouchDevice = window.matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 0;
  private disposed = false;
  private lastInputTime = performance.now();
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

    this.scene.background = new THREE.Color(PALETTE.atmosphere.sky);
    this.scene.add(this.world, this.goose);
    this.syncPlayerView();

    this.setupLighting();
    this.setupCamera();
    this.input = new InputController(this.handleDeviceChanged);

    if (this.editorMode) {
      this.camera.position.set(37, 58, 65);
      this.camera.lookAt(0, 0, 0);
      this.goose.visible = false;
      new WorldEditor(this.scene, this.camera, canvas, this.worldLayout, this.world);
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
    window.addEventListener("resize", this.resize);
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
    // Uniform ambient + one sun preserve the material's three discrete tones.
    // Hemisphere lights and colored fills introduce gradients between the bands.
    this.scene.add(new THREE.AmbientLight(0xffffff, Math.PI * 0.55));

    this.scene.add(this.sunShadow.light, this.sunShadow.light.target);
  }

  private setupCamera(): void {
    this.snapCameraToGoose();
    this.scene.add(this.camera);
  }

  private readonly animate = (): void => {
    let delta = Math.min(this.clock.getDelta(), 8 / 60);
    if (this.paused) delta = 0;

    if (this.editorMode || this.overviewMode) {
      this.world.updatePresentation(delta);
      this.sunShadow.update(this.camera);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const frame = this.input.sample();
    if (delta > 0) {
      if (frame.move.lengthSq() > 0.001 || frame.hurry) {
        this.lastInputTime = performance.now();
        this.controlsCard.classList.remove("controls-card--quiet");
      }

      this.camera.getWorldDirection(this.cameraForward);
      this.cameraForward.y = 0;
      this.cameraForward.normalize();
      this.cameraRight.crossVectors(this.cameraForward, this.up).normalize();

      this.moveDirection
        .copy(this.cameraForward)
        .multiplyScalar(frame.move.y)
        .addScaledVector(this.cameraRight, frame.move.x);
      if (this.moveDirection.lengthSq() > 1) this.moveDirection.normalize();

      const events = this.simulation.advance(delta, {
        moveX: this.moveDirection.x,
        moveZ: this.moveDirection.z,
        hurry: frame.hurry,
        honkPressed: frame.honkPressed,
      });
      this.syncPlayerView();
      this.syncPoopViews();
      for (const event of events) {
        if (event.type === "goose-honked") {
          this.goose.honk();
          void this.audio.playHonk();
          this.lastInputTime = performance.now();
        }
      }
    }

    const player = this.simulation.player;
    this.goose.update(delta, this.simulation.elapsed, player.speed / HURRY_SPEED, player.turnAmount);

    if (performance.now() - this.lastInputTime > 6200) {
      this.controlsCard.classList.add("controls-card--quiet");
    }

    this.updateCamera(delta);
    this.world.updatePresentation(delta);
    this.gooseOcclusionFader.update(this.world, this.camera, this.goose, delta);
    this.sunShadow.update(this.camera);
    this.renderer.render(this.scene, this.camera);
  };

  private updateCamera(delta: number): void {
    const leadSeconds = this.reducedMotion ? 0 : CAMERA_LEAD_SECONDS;
    this.desiredCameraFocus
      .copy(this.goose.position)
      .addScaledVector(this.velocity, leadSeconds);
    this.desiredCameraFocus.y = this.goose.position.y + CAMERA_FOCUS_HEIGHT;

    const cameraDamping = 1 - Math.exp(-(this.reducedMotion ? 12 : 6.3) * delta);
    this.cameraFocus.lerp(this.desiredCameraFocus, cameraDamping);
    this.camera.position.copy(this.cameraFocus).add(this.cameraOffset);
    this.camera.lookAt(this.cameraFocus);
  }

  private snapCameraToGoose(): void {
    this.cameraFocus.copy(this.goose.position);
    this.cameraFocus.y = this.goose.position.y + CAMERA_FOCUS_HEIGHT;
    this.desiredCameraFocus.copy(this.cameraFocus);
    this.camera.position.copy(this.cameraFocus).add(this.cameraOffset);
    this.camera.lookAt(this.cameraFocus);
  }

  private syncPlayerView(): void {
    const player = this.simulation.player;
    this.goose.position.copy(player.position);
    this.goose.rotation.y = player.heading;
    this.velocity.copy(player.velocity);
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

  private readonly handleDeviceChanged = (device: InputDevice, controllerConnected: boolean): void => {
    const usingGamepad = device === "gamepad";
    this.keyboardControls.hidden = usingGamepad;
    this.gamepadControls.hidden = !usingGamepad;
    this.deviceLabel.textContent = device === "touch"
      ? "Touch controls active"
      : usingGamepad
      ? "Controller active"
      : controllerConnected
        ? "Keyboard · controller ready"
        : "Keyboard ready";
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
      {
        onMove: ({ moveX, moveY, hurry }) => this.input.setTouchMovement(moveX, moveY, hurry),
        onHonk: () => this.input.queueTouchHonk(),
        onTouchUsed: () => { this.coarseTouchDevice = true; },
      },
    );
    this.settingsButton.addEventListener("click", this.openSettings);
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
    this.touchControlsRoot.hidden = !shouldShowTouchControls(this.touchPreference, this.coarseTouchDevice)
      || this.pauseReasons.paused;
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
      this.audio.setPaused(this.paused);
      this.clock.getDelta();
    }
    this.updateTouchControlsVisibility();
  }

  private readonly handleBlur = (): void => { this.setPauseReason("focus", true); };
  private readonly handleFocus = (): void => { this.setPauseReason("focus", document.hidden); };
  private readonly handleVisibility = (): void => {
    this.setPauseReason("hidden", document.hidden || !document.hasFocus());
  };

  /** Explicitly release the GPU context before a Play/Edit page transition. */
  private readonly dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("blur", this.handleBlur);
    window.removeEventListener("focus", this.handleFocus);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    document.removeEventListener("fullscreenchange", this.syncFullscreenLabel);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  };
}

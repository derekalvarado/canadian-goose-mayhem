import * as THREE from "three";
import { PlazaWorld } from "./PlazaWorld";
import { Goose } from "./Goose";
import { InputController, type InputDevice } from "./InputController";
import { GameAudio } from "./GameAudio";
import { Simulation, HURRY_SPEED } from "./simulation/Simulation";
import { FOUNTAIN_OBJECTIVE_ID, createPlazaRules } from "./simulation/plaza";
import { PALETTE } from "./palette";
import { PlazaEditor } from "./PlazaEditor";
import { loadPlazaLayout } from "./plazaLayout";
import { GooseOcclusionFader } from "./GooseOcclusionFader";

const CAMERA_FOCUS_HEIGHT = 0.55;
// A closer follow camera keeps the smaller goose readable and makes the plaza
// landmarks feel larger without changing their gameplay dimensions.
const CAMERA_AXIS_OFFSET = 9.6;
const CAMERA_LEAD_SECONDS = 0.2;

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing interface element: ${selector}`);
  return element;
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 130);
  private readonly editorMode = new URLSearchParams(window.location.search).has("edit");
  private readonly layout = loadPlazaLayout();
  private readonly rules = createPlazaRules(this.layout);
  private readonly world = new PlazaWorld(this.layout);
  private readonly goose = new Goose();
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
  private readonly chapterComplete = requireElement<HTMLElement>("#chapter-complete");
  private readonly controlsCard = requireElement<HTMLElement>("#controls-card");
  private readonly keyboardControls = requireElement<HTMLElement>("#keyboard-controls");
  private readonly gamepadControls = requireElement<HTMLElement>("#gamepad-controls");
  private readonly deviceLabel = requireElement<HTMLElement>("#device-label");
  private paused = false;
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
      this.camera.position.set(30, 36, 30);
      this.camera.lookAt(0, 0, 0);
      this.goose.visible = false;
      new PlazaEditor(this.scene, this.camera, canvas, this.world, this.layout);
    }

    requireElement<HTMLButtonElement>("#restart-button").addEventListener("click", this.restart);
    window.addEventListener("resize", this.resize);
    window.addEventListener("blur", this.handleBlur);
    window.addEventListener("focus", this.handleFocus);
    document.addEventListener("visibilitychange", this.handleVisibility);
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

    const sun = new THREE.DirectionalLight(0xffffff, Math.PI * 0.45);
    sun.position.set(-9, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 24;
    sun.shadow.camera.bottom = -24;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 52;
    sun.shadow.bias = -0.00018;
    sun.shadow.normalBias = 0.025;
    this.scene.add(sun);
  }

  private setupCamera(): void {
    this.snapCameraToGoose();
    this.scene.add(this.camera);
  }

  private readonly animate = (): void => {
    let delta = Math.min(this.clock.getDelta(), 8 / 60);
    if (this.paused) delta = 0;

    if (this.editorMode) {
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
      for (const event of events) {
        if (event.type === "goose-honked") {
          this.goose.honk();
          void this.audio.playHonk();
          this.lastInputTime = performance.now();
        } else if (event.objectiveId === FOUNTAIN_OBJECTIVE_ID) {
          this.showFountainMilestone();
        }
      }
    }

    const player = this.simulation.player;
    this.goose.update(delta, this.simulation.elapsed, player.speed / HURRY_SPEED, player.turnAmount);

    if (performance.now() - this.lastInputTime > 6200) {
      this.controlsCard.classList.add("controls-card--quiet");
    }

    this.updateCamera(delta);
    this.gooseOcclusionFader.update(this.world, this.camera, this.goose, delta);
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

  private showFountainMilestone(): void {
    this.chapterComplete.hidden = false;
    requireElement<HTMLElement>("#objective").textContent = "✓ Find the goose fountain";
  }

  private readonly restart = (): void => {
    this.simulation.reset();
    this.input.clear();
    this.syncPlayerView();
    this.snapCameraToGoose();
    this.chapterComplete.hidden = true;
    requireElement<HTMLElement>("#objective").textContent = this.rules.objectives[0].description;
    this.lastInputTime = performance.now();
    this.controlsCard.classList.remove("controls-card--quiet");
    this.canvas.focus({ preventScroll: true });
  };

  private readonly handleDeviceChanged = (device: InputDevice, controllerConnected: boolean): void => {
    const usingGamepad = device === "gamepad";
    this.keyboardControls.hidden = usingGamepad;
    this.gamepadControls.hidden = !usingGamepad;
    this.deviceLabel.textContent = usingGamepad
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
  };

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.simulation.suspend();
    this.input.clear();
    this.audio.setPaused(paused);
    this.clock.getDelta();
  }

  private readonly handleBlur = (): void => { this.setPaused(true); };
  private readonly handleFocus = (): void => { this.setPaused(document.hidden); };
  private readonly handleVisibility = (): void => {
    this.setPaused(document.hidden || !document.hasFocus());
  };
}

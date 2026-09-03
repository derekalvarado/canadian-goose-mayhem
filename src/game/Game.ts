import * as THREE from "three";
import { ForestWorld } from "./ForestWorld";
import { Goose } from "./Goose";
import { InputController, type InputDevice } from "./InputController";
import { EXIT_Z, isOnPath, resolveLevelMovement } from "./level";

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing interface element: ${selector}`);
  return element;
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 1, 0.1, 130);
  private readonly world = new ForestWorld();
  private readonly goose = new Goose();
  private readonly input: InputController;
  private readonly clock = new THREE.Clock();
  private readonly velocity = new THREE.Vector3();
  private readonly proposedPosition = new THREE.Vector3();
  private readonly resolvedPosition = new THREE.Vector3();
  private readonly moveDirection = new THREE.Vector3();
  private readonly cameraForward = new THREE.Vector3();
  private readonly cameraRight = new THREE.Vector3();
  private readonly cameraOffset = new THREE.Vector3();
  private readonly cameraTarget = new THREE.Vector3();
  private readonly desiredCameraPosition = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly chapterComplete = requireElement<HTMLElement>("#chapter-complete");
  private readonly controlsCard = requireElement<HTMLElement>("#controls-card");
  private readonly keyboardControls = requireElement<HTMLElement>("#keyboard-controls");
  private readonly gamepadControls = requireElement<HTMLElement>("#gamepad-controls");
  private readonly deviceLabel = requireElement<HTMLElement>("#device-label");
  private readonly wayfinder = requireElement<HTMLElement>("#wayfinder");
  private elapsed = 0;
  private cameraYaw = 0;
  private gooseHeading = Math.PI;
  private previousHeading = Math.PI;
  private paused = false;
  private complete = false;
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.scene.background = new THREE.Color(0xa9bda0);
    this.scene.fog = new THREE.FogExp2(0x82977a, 0.0215);
    this.scene.add(this.world, this.goose);
    this.goose.position.set(0, 0.02, 7.4);
    this.goose.rotation.y = this.gooseHeading;

    this.setupLighting();
    this.setupCamera();
    this.input = new InputController(this.handleDeviceChanged);

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
    const hemisphere = new THREE.HemisphereLight(0xe6efdc, 0x263520, 2.35);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xffe2a3, 3.7);
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

    const softFill = new THREE.DirectionalLight(0x99b7a7, 0.65);
    softFill.position.set(11, 8, -12);
    this.scene.add(softFill);
  }

  private setupCamera(): void {
    this.camera.position.set(8.8, 7.2, 17.2);
    this.cameraTarget.copy(this.goose.position).add(new THREE.Vector3(0, 1.05, -0.3));
    this.camera.lookAt(this.cameraTarget);
    this.scene.add(this.camera);
  }

  private readonly animate = (): void => {
    let delta = Math.min(this.clock.getDelta(), 1 / 30);
    if (this.paused) delta = 0;
    this.elapsed += delta;

    const frame = this.input.sample();
    if (!this.complete && delta > 0) {
      if (frame.move.lengthSq() > 0.001 || Math.abs(frame.camera) > 0.01 || frame.hurry) {
        this.lastInputTime = performance.now();
        this.controlsCard.classList.remove("controls-card--quiet");
      }

      this.cameraYaw -= frame.camera * delta * 1.35;
      this.camera.getWorldDirection(this.cameraForward);
      this.cameraForward.y = 0;
      this.cameraForward.normalize();
      this.cameraRight.crossVectors(this.cameraForward, this.up).normalize();

      this.moveDirection
        .copy(this.cameraForward)
        .multiplyScalar(frame.move.y)
        .addScaledVector(this.cameraRight, frame.move.x);
      if (this.moveDirection.lengthSq() > 1) this.moveDirection.normalize();

      const targetSpeed = frame.hurry ? 5.7 : 3.45;
      const hasInput = this.moveDirection.lengthSq() > 0.001;
      const targetVelocityX = hasInput ? this.moveDirection.x * targetSpeed : 0;
      const targetVelocityZ = hasInput ? this.moveDirection.z * targetSpeed : 0;
      const smoothing = 1 - Math.exp(-(hasInput ? 11 : 16) * delta);
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVelocityX, smoothing);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVelocityZ, smoothing);

      this.proposedPosition.copy(this.goose.position).addScaledVector(this.velocity, delta);
      resolveLevelMovement(this.goose.position, this.proposedPosition, this.resolvedPosition);
      if (Math.abs(this.resolvedPosition.x - this.proposedPosition.x) > 0.001) this.velocity.x *= 0.12;
      if (Math.abs(this.resolvedPosition.z - this.proposedPosition.z) > 0.001) this.velocity.z *= 0.12;
      this.goose.position.copy(this.resolvedPosition);

      const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      let turnAmount = 0;
      if (horizontalSpeed > 0.08) {
        const targetHeading = Math.atan2(-this.velocity.x, -this.velocity.z);
        const headingDifference = Math.atan2(
          Math.sin(targetHeading - this.gooseHeading),
          Math.cos(targetHeading - this.gooseHeading),
        );
        this.gooseHeading += headingDifference * Math.min(1, delta * 10.5);
        turnAmount = THREE.MathUtils.clamp(headingDifference * 1.8, -1, 1);
        this.goose.rotation.y = this.gooseHeading;
      }

      if (frame.honkPressed) {
        this.goose.honk();
        this.playHonk();
        this.lastInputTime = performance.now();
      }

      const angularVelocity = Math.atan2(
        Math.sin(this.gooseHeading - this.previousHeading),
        Math.cos(this.gooseHeading - this.previousHeading),
      ) / Math.max(delta, 0.001);
      this.previousHeading = this.gooseHeading;
      this.goose.update(
        delta,
        this.elapsed,
        horizontalSpeed / 5.7,
        turnAmount + THREE.MathUtils.clamp(angularVelocity * 0.02, -0.25, 0.25),
      );

      this.wayfinder.classList.toggle("wayfinder--visible", this.goose.position.z < 0.5);
      if (this.goose.position.z < EXIT_Z && isOnPath(this.goose.position.x, this.goose.position.z, 0)) {
        this.finishLevel();
      }
    } else {
      this.velocity.multiplyScalar(Math.max(0, 1 - delta * 8));
      this.goose.update(delta, this.elapsed, 0, 0);
    }

    if (performance.now() - this.lastInputTime > 6200) {
      this.controlsCard.classList.add("controls-card--quiet");
    }

    this.updateCamera(delta);
    this.world.update(delta, this.elapsed);
    this.renderer.render(this.scene, this.camera);
  };

  private updateCamera(delta: number): void {
    const offsetDistance = this.goose.position.z < -8 ? 8.7 : 9.5;
    this.cameraOffset.set(7.2, 6.9, offsetDistance).applyAxisAngle(this.up, this.cameraYaw);
    this.desiredCameraPosition.copy(this.goose.position).add(this.cameraOffset);
    this.desiredCameraPosition.y = Math.max(5.8, this.desiredCameraPosition.y);
    this.cameraTarget.copy(this.goose.position).addScaledVector(this.velocity, 0.16);
    this.cameraTarget.y += 0.95;
    const cameraDamping = 1 - Math.exp(-(this.reducedMotion ? 12 : 6.3) * delta);
    this.camera.position.lerp(this.desiredCameraPosition, cameraDamping);
    this.camera.lookAt(this.cameraTarget);
  }

  private finishLevel(): void {
    if (this.complete) return;
    this.complete = true;
    this.velocity.set(0, 0, 0);
    this.wayfinder.classList.remove("wayfinder--visible");
    this.chapterComplete.hidden = false;
    requireElement<HTMLButtonElement>("#restart-button").focus({ preventScroll: true });
  }

  private readonly restart = (): void => {
    this.complete = false;
    this.goose.position.set(0, 0.02, 7.4);
    this.velocity.set(0, 0, 0);
    this.gooseHeading = Math.PI;
    this.previousHeading = Math.PI;
    this.goose.rotation.y = this.gooseHeading;
    this.cameraYaw = 0;
    this.camera.position.set(8.8, 7.2, 17.2);
    this.chapterComplete.hidden = true;
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

  private playHonk(): void {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;

    try {
      const context = new AudioContextClass();
      const now = context.currentTime;
      const master = context.createGain();
      const resonator = context.createBiquadFilter();
      resonator.type = "bandpass";
      resonator.frequency.setValueAtTime(710, now);
      resonator.Q.setValueAtTime(2.4, now);
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.16, now + 0.025);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      resonator.connect(master);
      master.connect(context.destination);

      [0, 1].forEach((index) => {
        const oscillator = context.createOscillator();
        oscillator.type = index === 0 ? "sawtooth" : "triangle";
        oscillator.frequency.setValueAtTime(index === 0 ? 390 : 478, now);
        oscillator.frequency.exponentialRampToValueAtTime(index === 0 ? 305 : 360, now + 0.34);
        oscillator.detune.value = index === 0 ? -7 : 9;
        oscillator.connect(resonator);
        oscillator.start(now + index * 0.012);
        oscillator.stop(now + 0.43);
      });
      window.setTimeout(() => void context.close(), 650);
    } catch {
      // Audio can be blocked until a browser recognizes the input as a user gesture.
    }
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 700 ? 1.25 : 1.5));
    this.renderer.setSize(width, height, false);
  };

  private readonly handleBlur = (): void => {
    this.paused = true;
    this.input.clear();
  };

  private readonly handleFocus = (): void => {
    this.paused = false;
    this.clock.getDelta();
  };

  private readonly handleVisibility = (): void => {
    this.paused = document.hidden;
    if (document.hidden) this.input.clear();
  };
}

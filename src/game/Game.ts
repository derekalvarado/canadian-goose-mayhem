import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ViewSunShadow } from "./ViewSunShadow.ts";
import * as THREE from "three";
import { WorldView } from "./WorldView";
import { Goose } from "./Goose";
import { InputController, type GamepadLayout, type InputDevice, type InputFrame } from "./InputController";
import { TouchControls } from "./TouchControls";
import { PauseReasons, parseTouchControlsPreference, shouldShowTouchControls, TOUCH_CONTROLS_STORAGE_KEY, type TouchControlsPreference } from "./mobileControls";
import { GameAudio } from "./GameAudio";
import { Simulation, FIXED_STEP, HURRY_SPEED, WALK_SPEED, type GameplayEvent, type PlayerCommand, type WorldSnapshot } from "./simulation/Simulation";
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
import { formatGamepadDiagnostics, type GamepadLike } from "./gamepads";
import { MultiplayerMenu, type MultiplayerConnectionIdentity, type MultiplayerRole } from "./multiplayer/MultiplayerMenu.ts";
import type { WebRtcPeer } from "./multiplayer/WebRtcPeer.ts";
import {
  decodeGuestMessage,
  decodeHostMessage,
  encodeGuestMessage,
  encodeHostMessage,
  GuestCommandGate,
  MULTIPLAYER_PROTOCOL_VERSION,
  readSharedObjectives,
  type AuthoritativeGameSnapshot,
  type NetworkPlayerCommand,
  type SharedObjective,
} from "./multiplayer/protocol.ts";
import { NetworkMotionSmoother } from "./multiplayer/networkMotion.ts";

// A closer follow camera keeps the smaller goose readable and makes the plaza
// landmarks feel larger without changing their gameplay dimensions.
const CAMERA_FOLLOW_ZOOM = 1.3;
const CAMERA_AXIS_OFFSET = 9.6 / CAMERA_FOLLOW_ZOOM;
const CAMERA_LEAD_SECONDS = 0.2;
// How quickly the camera glides along its track toward the goose.
const CAMERA_TRACK_RESPONSE = 3.2;
// Sending once per display frame overwhelms the host-side flood guard on 120 Hz
// iPads. Movement is continuous between these updates, while button edges send
// immediately so honks and interactions still feel responsive.
const GUEST_COMMAND_SEND_INTERVAL = 1 / 30;
// The guest repeats its hello until the host welcomes it; one hello can arrive before the host is listening.
const GUEST_HELLO_RETRY_MS = 1_000;
// Long enough for a guest's goodbye to leave before the page reloads into its own game.
const GUEST_GOODBYE_RELOAD_MS = 350;

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

function idleInputFrame(): InputFrame {
  return { move: new THREE.Vector2(), hurry: false, honkPressed: false, interactPressed: false,
    wingsSpread: false, sneaking: false, threatening: false, device: "gamepad" };
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
  private readonly goose2 = new Goose();
  private readonly gazeRay = new THREE.Raycaster();
  private readonly gazeOrigin = new THREE.Vector3();
  private readonly gazeDirection = new THREE.Vector3();
  private gazeRefresh = 0;
  private readonly poopViews = new Map<string, THREE.Group>();
  private readonly gooseOcclusionFader = new GooseOcclusionFader(this.world.occlusionFadeGroups);
  private readonly goose2OcclusionFader = new GooseOcclusionFader(this.world.occlusionFadeGroups);
  private readonly input: InputController;
  private readonly clock = new THREE.Clock();
  private readonly velocity = new THREE.Vector3();
  private readonly velocity2 = new THREE.Vector3();
  // Crossed-off tasks come back after a reload; `?dev&fresh` starts a clean list without erasing it.
  private simulation = new Simulation(this.rules, this.devMode && this.query.has("fresh") ? undefined : sessionStateFromProgress(loadProgress()));
  private readonly audio = new GameAudio();
  private readonly moveDirection = new THREE.Vector3();
  private readonly moveDirection2 = new THREE.Vector3();
  private readonly cameraForward = new THREE.Vector3();
  private readonly controlHeading = new ControlHeadingLock();
  private readonly controlHeading2 = new ControlHeadingLock();
  private readonly framing = new SubjectFraming();
  private cameraTrack?: CameraTrackDirector;
  // Equal ground axes give a 45° diagonal; √2 vertical keeps a 45° downward pitch.
  private readonly cameraOffset = new THREE.Vector3();
  private readonly cameraFocus = new THREE.Vector3();
  private readonly desiredCameraFocus = new THREE.Vector3();
  private readonly controlsCard = requireElement<HTMLElement>("#controls-card");
  private readonly keyboardControls = requireElement<HTMLElement>("#keyboard-controls");
  private readonly gamepadControls = requireElement<HTMLElement>("#gamepad-controls");
  private readonly gamepadMoveKey = requireElement<HTMLElement>("#gamepad-move-key");
  private readonly gamepadHurryKey = requireElement<HTMLElement>("#gamepad-hurry-key");
  private readonly gamepadHonkKey = requireElement<HTMLElement>("#gamepad-honk-key");
  private readonly gamepadWingsKey = requireElement<HTMLElement>("#gamepad-wings-key");
  private readonly gamepadSneakKey = requireElement<HTMLElement>("#gamepad-sneak-key");
  private readonly gamepadThreatKey = requireElement<HTMLElement>("#gamepad-threat-key");
  private readonly gamepadInteractKey = requireElement<HTMLElement>("#gamepad-interact-key");
  private readonly touchControlsRoot = requireElement<HTMLElement>("#touch-controls");
  private readonly settingsMenu = requireElement<HTMLElement>("#settings-menu");
  private readonly settingsButton = requireElement<HTMLButtonElement>("#settings-button");
  private readonly installButton = requireElement<HTMLButtonElement>("#install-button");
  private readonly installMenu = requireElement<HTMLElement>("#install-menu");
  private readonly fullscreenButton = requireElement<HTMLButtonElement>("#fullscreen-button");
  private readonly touchPreferenceSelect = requireElement<HTMLSelectElement>("#touch-controls-preference");
  private readonly controllerDiagnostics = requireElement<HTMLDetailsElement>("#controller-diagnostics");
  private readonly controllerDiagnosticsOutput = requireElement<HTMLPreElement>("#controller-diagnostics-output");
  private readonly controllerLobby = requireElement<HTMLElement>("#controller-lobby");
  private readonly controllerLobbyStatus = requireElement<HTMLElement>("#controller-lobby-status");
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
  private currentGamepadLayout: GamepadLayout = "standard";
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
  private controllerDiagnosticsRefresh = 0;
  private localMultiplayer = false;
  private onlineRole?: MultiplayerRole;
  private onlinePeer?: WebRtcPeer;
  private onlineIdentity?: MultiplayerConnectionIdentity;
  private onlineAuthenticated = false;
  private guestCommandGate = new GuestCommandGate();
  private remoteCommand?: NetworkPlayerCommand;
  private remoteCommandReceivedAt = 0;
  private remoteSnapshot?: AuthoritativeGameSnapshot;
  private networkSequence = 0;
  private snapshotSendAccumulator = 0;
  private readonly guestMotion = new NetworkMotionSmoother();
  private readonly hostMotion = new NetworkMotionSmoother();
  private guestCommandSendAccumulator = 0;
  private guestHonkQueued = false;
  private guestInteractionQueued = false;
  private guestHelloSentAt = 0;
  // The host's to-do list while this device is a guest; its own saved list stays untouched.
  private remoteObjectives?: readonly SharedObjective[];
  private multiplayerMenu?: MultiplayerMenu;

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
    this.goose2.name = "goose-2";
    this.goose2.visible = false;
    this.scene.add(this.world, this.goose, this.goose2);
    if (this.devMode) {
      // Dev-only handle for playtesting from the browser console.
      (window as unknown as { gooseGame?: Game }).gooseGame = this;
      this.world.showSightLines = true;
      const banner = document.createElement("div");
      banner.className = "dev-mode-banner";
      banner.textContent = `DEV START · ${this.worldArea.label}`;
      document.querySelector("#game-shell")?.append(banner);
    }
    this.syncPlayerView();
    this.world.syncGameplay(this.simulation.world, this.goose.getMouthSocket(), this.goose2.getMouthSocket());
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
    if (!this.editorMode && !this.overviewMode) {
      this.multiplayerMenu = new MultiplayerMenu({
        onOpenChange: (open) => this.setPauseReason("multiplayer", open),
        onLocalStart: this.startLocalMultiplayer,
        onConnected: this.handleOnlineConnected,
        onDisconnected: this.handleOnlineDisconnected,
        onMessage: this.handleOnlineMessage,
        onSessionEnd: this.handleOnlineSessionEnd,
      });
    }
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

    const localInput = this.localMultiplayer ? this.input.sampleLocalGamepads() : undefined;
    if (localInput) this.updateControllerLobby(localInput.assignments);
    const frame = localInput?.player1 ?? (this.localMultiplayer ? idleInputFrame() : this.input.sample());
    const secondFrame = localInput?.player2;
    this.updateGamepadLayout(frame.gamepadLayout);
    this.updateControllerDiagnostics(delta);
    this.touchControls?.syncPoseState(frame.wingsSpread, frame.sneaking, frame.threatening);
    // A disconnected guest must remain in the read-only network view. Falling
    // through here would move the unrelated local simulation while the camera
    // and Goose 2 view remain at their final authoritative positions.
    if (this.onlineRole === "guest") {
      this.animateOnlineGuest(delta, frame);
      return;
    }
    if (delta > 0) {
      if (frame.move.lengthSq() > 0.001 || frame.hurry || frame.interactPressed || frame.wingsSpread || frame.sneaking || frame.threatening) {
        this.lastInputTime = performance.now();
        this.controlsCard.classList.remove("controls-card--quiet");
      }

      const command = this.commandForFrame(frame, this.controlHeading, this.moveDirection, delta);
      const localSecondCommand = secondFrame ? this.commandForFrame(secondFrame, this.controlHeading2, this.moveDirection2, delta) : undefined;
      const secondCommand = localSecondCommand ?? this.consumeRemoteCommand();
      const events = this.simulation.advancePlayers(delta, command, secondCommand);
      this.syncPlayerView();
      this.syncPoopViews();
      this.world.syncGameplay(this.simulation.world, this.goose.getMouthSocket(), this.goose2.getMouthSocket());
      for (const event of events) {
        if (event.type === "goose-honked") {
          (event.actorId === "goose-2" ? this.goose2 : this.goose).honk();
          void this.audio.playHonk();
          this.lastInputTime = performance.now();
        }
        if (event.type === "goose-shooed") {
          (event.targetId === "goose-2" ? this.goose2 : this.goose).spook();
          this.framing.release(event.actorId);
        }
        if ((event.type === "entity-grabbed" || event.type === "entity-dropped")
          && (event.actorId === "goose" || event.actorId === "goose-2")) {
          (event.actorId === "goose-2" ? this.goose2 : this.goose).grab();
        }
        if (event.type === "objective-completed") this.celebrateTask(event.objectiveId);
        if (event.type === "device-state-changed" && event.active && this.simulation.world.entities.find((entity) => entity.id === event.targetId)?.tags.includes("bell")) this.audio.playBell();
        if (event.type === "order-called") this.audio.playOrderCalled();
        if (event.type === "instrument-twanged") this.audio.playTwang();
        if (event.type === "dog-barked") {
          const away = Math.hypot(event.position.x - this.simulation.player.position.x, event.position.z - this.simulation.player.position.z);
          this.audio.playDogBark(Math.max(0.25, 1 - away / 14));
        }
        if (event.type === "area-transition-requested") {
          this.beginAreaTransition(event);
          return;
        }
      }
      if (this.onlineRole === "host" && this.onlineAuthenticated) this.sendHostSnapshot(delta);
    }

    const player = this.simulation.player;
    this.updateGooseAttention(delta);
    this.goose.update(
      delta,
      this.simulation.elapsed,
      player.speed / HURRY_SPEED,
      player.turnAmount,
      player.wingsSpread || player.threatening,
      player.sneaking || player.threatening || player.dragging,
      player.dragging,
    );
    const secondPlayer = this.simulation.secondaryPlayer;
    if (secondPlayer) {
      this.goose2.update(delta, this.simulation.elapsed, secondPlayer.speed / HURRY_SPEED, secondPlayer.turnAmount,
        secondPlayer.wingsSpread || secondPlayer.threatening, secondPlayer.sneaking || secondPlayer.threatening || secondPlayer.dragging, secondPlayer.dragging);
    }
    if (this.goose.stepped) void this.audio.playFootstep();
    if (this.goose2.visible && this.goose2.stepped) void this.audio.playFootstep();
    this.audio.setCafeMusic(this.simulation.world.entities.some((entity) => entity.tags.includes("music") && entity.active === true));
    this.updateStreetSounds(this.simulation.world, this.goose.visible ? this.goose.position : this.goose2.position);
    this.updateInteractionPrompt(frame.device, frame.gamepadLayout);

    if (performance.now() - this.lastInputTime > 6200) {
      this.controlsCard.classList.add("controls-card--quiet");
    }

    this.updateCamera(delta);
    this.world.updatePresentation(delta);
    this.gooseOcclusionFader.update(this.world, this.camera, this.goose, delta);
    if (this.goose2.visible) this.goose2OcclusionFader.update(this.world, this.camera, this.goose2, delta);
    this.sunShadow.update(this.camera);
    this.renderer.render(this.scene, this.camera);
  };

  /** The musician's playing, and the scrape of a dragged guitar, both quieter with distance from the listening goose. */
  private updateStreetSounds(world: WorldSnapshot, listener: Readonly<{ x: number; z: number }>): void {
    const away = (point: Readonly<{ x: number; z: number }>) => Math.hypot(point.x - listener.x, point.z - listener.z);
    const musician = world.musician;
    this.audio.setStreetMusic(musician?.activity === "playing" ? Math.max(0, 1 - away(musician.position) / 26) ** 1.5 : 0);
    const scraping = world.players.filter((player) => player.dragging && player.speed > 0.3)
      // Louder on each tug, when the guitar is moving fastest.
      .map((player) => Math.max(0, 1 - away(player.position) / 18) * Math.min(1, player.speed / 1.6));
    this.audio.setScrape(scraping.length > 0 ? Math.max(...scraping) : 0);
  }

  private commandForFrame(frame: InputFrame, headingLock: ControlHeadingLock, output: THREE.Vector3, delta: number): PlayerCommand {
    this.camera.getWorldDirection(this.cameraForward);
    const cameraYaw = Math.atan2(this.cameraForward.x, this.cameraForward.z);
    const controlYaw = headingLock.update(frame.move.x, frame.move.y, cameraYaw, delta);
    const forwardX = Math.sin(controlYaw); const forwardZ = Math.cos(controlYaw);
    // Screen-right is forward × up: (-forwardZ, 0, forwardX).
    output.set(
      forwardX * frame.move.y - forwardZ * frame.move.x,
      0,
      forwardZ * frame.move.y + forwardX * frame.move.x,
    );
    if (output.lengthSq() > 1) output.normalize();
    return { moveX: output.x, moveZ: output.z, hurry: frame.hurry, honkPressed: frame.honkPressed,
      interactPressed: frame.interactPressed, wingsSpread: frame.wingsSpread, sneaking: frame.sneaking,
      threatening: frame.threatening };
  }

  private readonly handleOnlineConnected = (role: MultiplayerRole, peer: WebRtcPeer, identity: MultiplayerConnectionIdentity): void => {
    // A repeated report for the same link must not undo a finished handshake.
    if (this.onlinePeer === peer && this.onlineRole === role && this.onlineIdentity?.sessionId === identity.sessionId) return;
    // The guest's own game stops advancing while it shows the host's world; keep its list safe first.
    if (role === "guest" && this.onlineRole !== "guest" && !this.progressCleared) saveProgress(this.simulation.sessionState);
    this.onlineRole = role;
    this.onlinePeer = peer;
    this.onlineIdentity = identity;
    this.onlineAuthenticated = false;
    this.remoteCommand = undefined;
    this.remoteSnapshot = undefined;
    this.networkSequence = 0;
    this.guestCommandSendAccumulator = 0;
    this.guestHonkQueued = false;
    this.guestInteractionQueued = false;
    this.guestMotion.clear();
    this.hostMotion.clear();
    this.guestCommandGate = new GuestCommandGate();
    if (role === "host") {
      this.localMultiplayer = false;
      this.controllerLobby.hidden = true;
      this.simulation.enableSecondPlayer();
      this.goose2.visible = true;
      this.syncPlayerView();
      this.renderObjectives();
    } else {
      this.sendGuestHello();
      this.goose2.visible = true;
      // Until the host's list arrives, show none rather than this device's own saved list.
      this.remoteObjectives ??= [];
      this.renderObjectives();
    }
    this.updateTouchControlsVisibility();
  };

  private sendGuestHello(): void {
    const identity = this.onlineIdentity;
    if (!identity || !this.onlinePeer) return;
    this.guestHelloSentAt = performance.now();
    this.onlinePeer.send(encodeGuestMessage({ type: "hello", version: MULTIPLAYER_PROTOCOL_VERSION,
      sessionId: identity.sessionId, reconnectToken: identity.reconnectToken }));
  }

  private sendHostPauseStatus(): void {
    if (this.onlineRole !== "host" || !this.onlineAuthenticated) return;
    this.onlinePeer?.send(encodeHostMessage({ type: "status", version: 1, paused: this.paused }));
  }

  /** The player ended (host) or left (guest) the shared game on purpose. */
  private readonly handleOnlineSessionEnd = (role: MultiplayerRole): void => {
    if (role === "host") this.onlinePeer?.send(encodeHostMessage({ type: "bye", version: 1 }));
    else this.onlinePeer?.send(encodeGuestMessage({ type: "bye", version: 1 }));
    if (role === "guest") {
      // The guest's own game sat untouched behind the host's world; reopening restores it exactly.
      window.setTimeout(() => window.location.reload(), GUEST_GOODBYE_RELOAD_MS);
      return;
    }
    this.simulation.disableSecondPlayer();
    this.onlineRole = undefined;
    this.onlinePeer = undefined;
    this.onlineIdentity = undefined;
    this.onlineAuthenticated = false;
    this.remoteCommand = undefined;
    this.goose2.visible = false;
    this.syncPlayerView();
    this.world.syncGameplay(this.simulation.world, this.goose.getMouthSocket(), this.goose2.getMouthSocket());
    this.renderObjectives();
    this.updateTouchControlsVisibility();
  };

  private readonly handleOnlineDisconnected = (role: MultiplayerRole): void => {
    if (role === "guest" && this.remoteSnapshot) {
      const guest = this.remoteSnapshot.players.find((player) => player.id === "goose-2");
      const host = this.remoteSnapshot.players.find((player) => player.id === "goose-1"
        && player.areaId === guest?.areaId);
      if (guest) {
        this.goose2.position.copy(guest.state.position);
        this.goose2.rotation.y = guest.state.heading;
      }
      if (host) {
        this.goose.position.copy(host.state.position);
        this.goose.rotation.y = host.state.heading;
      }
      this.velocity.set(0, 0, 0);
      this.velocity2.set(0, 0, 0);
    }
    this.onlineAuthenticated = false;
    this.remoteCommand = undefined;
    this.remoteSnapshot = undefined;
    this.guestCommandSendAccumulator = 0;
    this.guestHonkQueued = false;
    this.guestInteractionQueued = false;
    this.guestMotion.clear();
    this.hostMotion.clear();
    if (role === "guest") this.onlinePeer = undefined;
  };

  private readonly handleOnlineMessage = (role: MultiplayerRole, raw: string): void => {
    try {
      if (role === "host") {
        const message = decodeGuestMessage(raw);
        if (message.type === "hello") {
          const valid = message.sessionId === this.onlineIdentity?.sessionId
            && message.reconnectToken === this.onlineIdentity?.reconnectToken;
          if (!valid) {
            this.onlinePeer?.send(encodeHostMessage({ type: "error", version: 1, code: "session", message: "This invitation is no longer active." }));
            return;
          }
          this.onlineAuthenticated = true;
          this.onlinePeer?.send(encodeHostMessage({ type: "welcome", version: 1, sessionId: message.sessionId, playerId: "goose-2" }));
          this.sendHostPauseStatus();
        } else if (message.type === "command" && this.onlineAuthenticated) {
          const command = this.guestCommandGate.accept(message, performance.now());
          if (command) { this.remoteCommand = command; this.remoteCommandReceivedAt = performance.now(); }
        } else if (message.type === "bye") {
          this.multiplayerMenu?.handlePeerGoodbye();
        } else if (message.type === "pong") {
          // Reserved for latency display; the ordered channel is already alive.
        }
        return;
      }

      const message = decodeHostMessage(raw);
      if (message.type === "welcome") {
        this.onlineAuthenticated = message.sessionId === this.onlineIdentity?.sessionId;
      } else if (message.type === "snapshot" && this.onlineAuthenticated) {
        if (!this.remoteSnapshot || message.sequence > this.remoteSnapshot.tick) {
          this.remoteSnapshot = message.snapshot;
          this.syncRemoteObjectives(readSharedObjectives(message.snapshot.objectiveList));
        }
      } else if (message.type === "status") {
        this.multiplayerMenu?.setHostPaused(message.paused);
      } else if (message.type === "bye") {
        this.multiplayerMenu?.handlePeerGoodbye();
      } else if (message.type === "ping") {
        this.onlinePeer?.send(encodeGuestMessage({ type: "pong", version: 1, nonce: message.nonce }));
      }
    } catch (error) {
      console.warn("Ignored an invalid multiplayer message.", error);
    }
  };

  /** Follows the host's to-do list on a guest, crossing off tasks the shared game finished. */
  private syncRemoteObjectives(objectives: readonly SharedObjective[] | undefined): void {
    if (!objectives) return;
    const previous = this.remoteObjectives;
    this.remoteObjectives = objectives;
    const finished = previous && previous.length > 0
      ? objectives.filter((objective) => objective.completed && previous.some((old) => old.id === objective.id && !old.completed))
      : [];
    if (finished.length > 0) {
      for (const objective of finished) this.celebrateTask(objective.id);
    } else if (!previous || previous.length !== objectives.length
      || objectives.some((objective, index) => objective.id !== previous[index]?.id || objective.completed !== previous[index]?.completed)) {
      this.renderObjectives();
    }
  }

  private consumeRemoteCommand(): PlayerCommand | undefined {
    if (this.onlineRole !== "host" || !this.onlineAuthenticated || !this.remoteCommand
      || performance.now() - this.remoteCommandReceivedAt > 500) return undefined;
    const command = this.remoteCommand;
    this.remoteCommand = { ...command, honkPressed: false, interactPressed: false };
    return command;
  }

  private sendHostSnapshot(delta: number): void {
    this.snapshotSendAccumulator += delta;
    if (this.snapshotSendAccumulator < 1 / 15) return;
    this.snapshotSendAccumulator %= 1 / 15;
    const players = this.simulation.players.map((state) => ({
      id: state.id === "goose" ? "goose-1" as const : "goose-2" as const,
      areaId: this.worldArea.id,
      state,
    }));
    const snapshot: AuthoritativeGameSnapshot = {
      tick: Math.round(this.simulation.elapsed / FIXED_STEP),
      players,
      areas: [{ areaId: this.worldArea.id, world: this.simulation.world }],
      objectiveList: this.simulation.objectiveList,
    };
    this.onlinePeer?.send(encodeHostMessage({ type: "snapshot", version: 1, sequence: snapshot.tick,
      sentAt: performance.now(), snapshot }));
  }

  private animateOnlineGuest(delta: number, frame: InputFrame): void {
    if (!this.onlineAuthenticated && this.onlinePeer && performance.now() - this.guestHelloSentAt >= GUEST_HELLO_RETRY_MS) {
      this.sendGuestHello();
    }
    let command: PlayerCommand | undefined;
    if (delta > 0 && this.onlineAuthenticated) {
      command = this.commandForFrame(frame, this.controlHeading2, this.moveDirection2, delta);
      this.guestHonkQueued ||= command.honkPressed;
      this.guestInteractionQueued ||= command.interactPressed === true;
      this.guestCommandSendAccumulator += delta;
      if (this.guestCommandSendAccumulator >= GUEST_COMMAND_SEND_INTERVAL
        || this.guestHonkQueued || this.guestInteractionQueued) {
        const sent = this.onlinePeer?.send(encodeGuestMessage({ type: "command", version: 1, playerId: "goose-2",
          command: { ...command, honkPressed: this.guestHonkQueued, interactPressed: this.guestInteractionQueued,
            sequence: this.networkSequence } }));
        if (sent) {
          this.networkSequence += 1;
          this.guestCommandSendAccumulator %= GUEST_COMMAND_SEND_INTERVAL;
          this.guestHonkQueued = false;
          this.guestInteractionQueued = false;
        }
      }
    }
    const snapshot = this.remoteSnapshot;
    const guest = snapshot?.players.find((player) => player.id === "goose-2");
    const area = guest ? snapshot?.areas.find((candidate) => candidate.areaId === guest.areaId) : undefined;
    if (snapshot && guest && area) {
      const areaChanged = area.areaId !== this.worldArea.id;
      if (areaChanged) {
        this.worldArea = getWorldArea(this.worldLayout, area.areaId);
        this.world.applyArea(this.worldArea);
        this.useAreaCameraTrack();
        this.controlHeading2.reset();
      }
      this.guestMotion.push({ sequence: snapshot.tick, position: guest.state.position,
        velocity: guest.state.velocity, heading: guest.state.heading }, areaChanged);
      const guestView = this.guestMotion.update(delta, command ? {
        moveX: command.moveX,
        moveZ: command.moveZ,
        speed: command.hurry ? HURRY_SPEED : WALK_SPEED,
      } : undefined);
      this.goose2.visible = true;
      if (guestView) {
        this.goose2.position.copy(guestView.position);
        this.goose2.rotation.y = guestView.heading;
        this.velocity2.copy(guestView.velocity);
      }
      const host = snapshot.players.find((player) => player.id === "goose-1" && player.areaId === area.areaId);
      this.goose.visible = Boolean(host);
      if (host) {
        this.hostMotion.push({ sequence: snapshot.tick, position: host.state.position,
          velocity: host.state.velocity, heading: host.state.heading }, areaChanged);
        const hostView = this.hostMotion.update(delta);
        if (hostView) {
          this.goose.position.copy(hostView.position);
          this.goose.rotation.y = hostView.heading;
          this.velocity.copy(hostView.velocity);
        }
      } else {
        this.hostMotion.clear();
        this.velocity.set(0, 0, 0);
      }
      this.goose2.update(delta, snapshot.tick * FIXED_STEP, this.velocity2.length() / HURRY_SPEED, guest.state.turnAmount,
        guest.state.wingsSpread || guest.state.threatening, guest.state.sneaking || guest.state.threatening || guest.state.dragging === true, guest.state.dragging === true);
      if (host) this.goose.update(delta, snapshot.tick * FIXED_STEP, this.velocity.length() / HURRY_SPEED, host.state.turnAmount,
        host.state.wingsSpread || host.state.threatening, host.state.sneaking || host.state.threatening || host.state.dragging === true, host.state.dragging === true);
      this.world.syncGameplay(area.world, this.goose.getMouthSocket(), this.goose2.getMouthSocket());
      this.audio.setCafeMusic(area.world.entities.some((entity) => entity.tags.includes("music") && entity.active === true));
      this.updateStreetSounds(area.world, this.goose2.position);
    }
    this.interactionPrompt.hidden = true;
    this.updateCamera(delta);
    this.world.updatePresentation(delta);
    if (this.goose.visible) this.gooseOcclusionFader.update(this.world, this.camera, this.goose, delta);
    this.goose2OcclusionFader.update(this.world, this.camera, this.goose2, delta);
    this.sunShadow.update(this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  private readonly startLocalMultiplayer = (): void => {
    if (this.localMultiplayer) return;
    this.localMultiplayer = true;
    this.input.clear();
    this.input.resetLocalGamepads();
    this.simulation.enableSecondPlayer();
    this.goose2.visible = true;
    this.renderObjectives();
    this.controllerLobby.hidden = false;
    this.controllerLobbyStatus.textContent = "Press any button on the first sideways Joy-Con.";
    this.touchControls?.clear();
    this.updateTouchControlsVisibility();
    this.syncPlayerView();
    this.world.syncGameplay(this.simulation.world, this.goose.getMouthSocket(), this.goose2.getMouthSocket());
  };

  private updateControllerLobby(assignments: Readonly<{ player1?: number; player2?: number }>): void {
    if (assignments.player1 === undefined) {
      this.controllerLobby.hidden = false;
      this.controllerLobbyStatus.textContent = "Press any button on the first sideways Joy-Con.";
    } else if (assignments.player2 === undefined) {
      this.controllerLobby.hidden = false;
      this.controllerLobbyStatus.textContent = `Goose 1 joined on controller ${assignments.player1 + 1}. Press any button on the second Joy-Con.`;
    } else {
      this.controllerLobbyStatus.textContent = `Goose 1 · controller ${assignments.player1 + 1}   Goose 2 · controller ${assignments.player2 + 1}`;
      this.controllerLobby.hidden = true;
    }
  }

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
    this.audio.setStreetMusic(0); this.audio.setScrape(0);
    window.setTimeout(() => {
      if (this.disposed) return;
      const sessionState = this.simulation.sessionState;
      saveProgress(sessionState);
      // Goose 2 comes along, whether its player shares this device or joined from another one.
      const bringSecondGoose = this.simulation.secondaryPlayer !== undefined;
      this.worldArea = nextArea;
      this.rules = createWorldRules(this.worldArea, this.worldLayout.transitions);
      this.simulation = new Simulation(this.rules, sessionState);
      this.simulation.setPlayerTransform(event.targetPosition, event.targetHeading);
      if (bringSecondGoose) {
        this.simulation.enableSecondPlayer({ x: event.targetPosition.x + 0.9, y: event.targetPosition.y, z: event.targetPosition.z }, event.targetHeading);
      }
      this.world.applyArea(this.worldArea);
      this.velocity.set(0, 0, 0);
      this.syncPlayerView();
      this.world.syncGameplay(this.simulation.world, this.goose.getMouthSocket(), this.goose2.getMouthSocket());
      this.syncPoopViews();
      this.renderObjectives();
      this.useAreaCameraTrack();
      this.controlHeading.reset();
      this.controlHeading2.reset();
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
    const second = this.localMultiplayer ? this.simulation.secondaryPlayer : undefined;
    const guestView = this.onlineRole === "guest";
    const playerFocus = guestView
      ? { x: this.goose2.position.x, z: this.goose2.position.z }
      : second
      ? { x: (this.goose.position.x + this.goose2.position.x) * 0.5, z: (this.goose.position.z + this.goose2.position.z) * 0.5 }
      : { x: this.goose.position.x, z: this.goose.position.z };
    const framed = this.framing.focus(
      playerFocus,
      [...(janitor ? [{ id: janitor.id, x: janitor.position.x, z: janitor.position.z }] : []),
        ...(barista ? [{ id: barista.id, x: barista.position.x, z: barista.position.z }] : [])],
    );
    const leadVelocity = guestView ? this.velocity2 : second ? this.velocity.clone().add(this.velocity2).multiplyScalar(0.5) : this.velocity;
    this.desiredCameraFocus.set(
      framed.x + leadVelocity.x * leadSeconds,
      (guestView ? this.goose2.position.y : second ? (this.goose.position.y + this.goose2.position.y) * 0.5 : this.goose.position.y) + CAMERA_FOCUS_HEIGHT,
      framed.z + leadVelocity.z * leadSeconds,
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
    const second = this.simulation.secondaryPlayer;
    const previousSecond = this.simulation.previousSecondaryPlayerTransform;
    if (second && previousSecond) {
      this.goose2.position.copy(previousSecond.position).lerp(second.position, alpha);
      const secondAngle = Math.atan2(Math.sin(second.heading - previousSecond.heading), Math.cos(second.heading - previousSecond.heading));
      this.goose2.rotation.y = previousSecond.heading + secondAngle * alpha;
      this.velocity2.copy(second.velocity);
    } else {
      this.velocity2.set(0, 0, 0);
    }
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
      ...snapshot.cafePeople.filter((person) => person.activity !== "away")
        .map((person) => ({ id: person.id, position: { ...person.position, y: person.position.y + (person.seated ? 1.5 : 2.1) } })),
      ...(snapshot.townsfolk ?? []).filter((person) => !person.hidden)
        .map((person) => ({ id: person.id, position: { ...person.position, y: person.position.y + (person.seated ? 1.5 : 2.1) } })),
      ...(snapshot.dogs ?? []).map((dog) => ({ id: dog.id, position: { ...dog.position, y: dog.position.y + 0.6 } })),
      ...(snapshot.musician ? [{ id: snapshot.musician.id, position: { ...snapshot.musician.position, y: snapshot.musician.position.y + 1.65 } }] : []),
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
    // Shared progress is saved on the host only; a guest just sees the tick.
    if (this.onlineRole !== "guest") saveProgress(this.simulation.sessionState);
    this.audio.playTaskComplete();
    const task = this.listedObjectives().find((objective) => objective.id === objectiveId);
    this.revealTodoList();
    // Finishing a level's last task, wherever the goose happens to be, earns that level's card.
    const level = task?.areaId;
    const levelTasks = this.listedObjectives().filter((objective) => objective.areaId === level);
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

  /** Tasks on the to-do list: two-goose tasks appear only while a second goose is playing. */
  private listedObjectives(): readonly SharedObjective[] {
    const guest = this.onlineRole === "guest";
    const twoGeese = this.simulation.secondaryPlayer !== undefined || guest;
    const objectives = guest && this.remoteObjectives ? this.remoteObjectives : this.simulation.objectiveList;
    return objectives.filter((objective) => twoGeese || !objective.needsTwoGeese);
  }

  /** The normal list is local to this level; a just-finished remote task is briefly included for its completion reveal. */
  private renderObjectives(): void {
    const tasks = this.listedObjectives().filter((objective) => !objective.areaId || objective.areaId === this.worldArea.id);
    const highlightedTask = this.highlightedObjectiveId
      ? this.listedObjectives().find((objective) => objective.id === this.highlightedObjectiveId)
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

  private updateInteractionPrompt(device: InputDevice, layout?: GamepadLayout): void {
    const hint = this.simulation.interactionHint;
    this.interactionPrompt.hidden = !hint;
    if (!hint) return;
    this.interactionKey.textContent = device === "gamepad" ? layout === "single-right-joycon" ? "X" : "B" : "F";
    this.interactionLabel.textContent = hint;
  }

  private updateControllerDiagnostics(delta: number): void {
    if (!this.controllerDiagnostics.open) return;
    void delta;
    const now = performance.now();
    if (now < this.controllerDiagnosticsRefresh) return;
    this.controllerDiagnosticsRefresh = now + 120;
    this.controllerDiagnosticsOutput.textContent = formatGamepadDiagnostics(
      Array.from(navigator.getGamepads?.() ?? []) as readonly (GamepadLike | null)[],
    );
  }

  private updateGamepadLayout(layout: GamepadLayout | undefined): void {
    const nextLayout = layout ?? "standard";
    if (nextLayout === this.currentGamepadLayout) return;
    this.currentGamepadLayout = nextLayout;
    const joyCon = nextLayout === "single-right-joycon";
    this.gamepadMoveKey.textContent = joyCon ? "●" : "L";
    this.gamepadHurryKey.textContent = joyCon ? "SR" : "RT";
    this.gamepadHonkKey.textContent = "A";
    this.gamepadWingsKey.textContent = joyCon ? "B" : "X";
    this.gamepadSneakKey.textContent = "Y";
    this.gamepadThreatKey.textContent = joyCon ? "SL" : "LB";
    this.gamepadInteractKey.textContent = joyCon ? "X" : "B";
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
    requireElement<HTMLButtonElement>("#settings-controls-row").addEventListener("click", this.openControlsSettings);
    requireElement<HTMLButtonElement>("#settings-back").addEventListener("click", this.backToSettings);
    requireElement<HTMLButtonElement>("#settings-play-together").addEventListener("click", this.closeSettingsForMultiplayer);
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
      && !this.pauseReasons.paused && !this.localMultiplayer;
    this.touchControlsRoot.hidden = !showTouchControls;
    this.controlsCard.classList.toggle("controls-card--touch-visible", showTouchControls);
  }

  private readonly openSettings = (): void => {
    requireElement<HTMLElement>("#settings-home").hidden = false;
    requireElement<HTMLElement>("#settings-controls").hidden = true;
    this.settingsMenu.setAttribute("aria-labelledby", "settings-title");
    this.settingsMenu.hidden = false;
    this.setPauseReason("settings", true);
    requireElement<HTMLElement>("#settings-title").focus({ preventScroll: true });
  };

  private readonly openControlsSettings = (): void => {
    requireElement<HTMLElement>("#settings-home").hidden = true;
    requireElement<HTMLElement>("#settings-controls").hidden = false;
    this.settingsMenu.setAttribute("aria-labelledby", "settings-controls-title");
    requireElement<HTMLElement>("#settings-controls-title").focus({ preventScroll: true });
  };

  private readonly backToSettings = (): void => {
    requireElement<HTMLElement>("#settings-controls").hidden = true;
    requireElement<HTMLElement>("#settings-home").hidden = false;
    this.settingsMenu.setAttribute("aria-labelledby", "settings-title");
    requireElement<HTMLButtonElement>("#settings-controls-row").focus({ preventScroll: true });
  };

  private readonly closeSettings = (): void => {
    this.settingsMenu.hidden = true;
    this.setPauseReason("settings", false);
    this.settingsButton.focus({ preventScroll: true });
  };

  private readonly closeSettingsForMultiplayer = (): void => {
    this.settingsMenu.hidden = true;
    this.setPauseReason("settings", false);
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

  private setPauseReason(reason: string, active: boolean): void {
    const changed = this.pauseReasons.set(reason, active);
    this.applyPauseState(changed);
  }

  private syncPageActivityPause(): void {
    const changed = this.pauseReasons.syncPageActivity(document.hidden, document.hasFocus());
    this.applyPauseState(changed);
  }

  private applyPauseState(changed: boolean): void {
    this.paused = this.pauseReasons.paused;
    if (changed) {
      this.simulation.suspend();
      this.input.clear();
      this.touchControls?.clear();
      this.touchControls?.syncPoseState(false, false, false);
      this.audio.setPaused(this.paused);
      this.clock.getDelta();
      // A paused host stops sending the world; tell the guest why it froze.
      this.sendHostPauseStatus();
    }
    this.updateTouchControlsVisibility();
  }

  private readonly handleBlur = (): void => { this.syncPageActivityPause(); };
  private readonly handleFocus = (): void => { this.syncPageActivityPause(); };
  private readonly handleVisibility = (): void => {
    this.syncPageActivityPause();
    if (document.hidden && !this.progressCleared && this.onlineRole !== "guest") saveProgress(this.simulation.sessionState);
  };

  /** Explicitly release the GPU context before a Play/Edit page transition. */
  private readonly dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    window.clearTimeout(this.todoTimer);
    if (!this.progressCleared && !this.editorMode && !this.overviewMode && this.onlineRole !== "guest") saveProgress(this.simulation.sessionState);
    this.audio.setCafeMusic(false);
    this.audio.setStreetMusic(0); this.audio.setScrape(0);
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

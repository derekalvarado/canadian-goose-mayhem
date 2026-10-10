import {
  FamilyPairingClient,
  FamilyPairingServiceError,
  type PairingCodeSession,
  type PairingJoinSession,
} from "./FamilyPairingClient.ts";
import {
  clearStoredFamilyPairing,
  createFamilyToken,
  familyPairingForDevice,
  loadFamilyPlayerName,
  loadHandledJoinRequests,
  loadOrCreateFamilyDeviceId,
  loadStoredFamilyPairing,
  normalizeFamilyPlayerName,
  peerJoinRequestToPrompt,
  pairingWithUpdatedDevices,
  parseFamilyPairingCode,
  rememberHandledJoinRequest,
  saveFamilyPlayerName,
  saveStoredFamilyPairing,
  type FamilyDeviceIdentity,
  type FamilyPairStatus,
  type FamilyPairingCredential,
} from "./familyPairingProtocol.ts";
import { WebRtcPeer, type WebRtcPeerStatus } from "./WebRtcPeer.ts";
import {
  RoomSignalingClient,
  type RoomInvitation,
} from "./RoomSignalingClient.ts";
import type { RoomSignalMessage } from "./roomSignalingProtocol.ts";

export type MultiplayerRole = "host" | "guest";
export interface MultiplayerConnectionIdentity { readonly sessionId: string; readonly reconnectToken: string }

const ROOM_SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL?.trim() as string | undefined;
const SETUP_POLL_MS = 1_250;
const PRESENCE_POLL_MS = 2_000;
const IDLE_STATUS_POLL_MS = 3_000;
const HOST_HEARTBEAT_MS = 10_000;
const JOIN_REFRESH_MS = 60_000;
// Same-network links connect within a few seconds; past this, explain what to check instead of waiting forever.
const CONNECT_TIMEOUT_MS = 20_000;
// How long a host waits for the joining device to pick up the private room it opened.
const ROOM_PICKUP_TIMEOUT_MS = 30_000;
// A weak link often recovers by itself; only call it lost after this long.
const INTERRUPTION_GRACE_MS = 8_000;
// Missed host heartbeats tolerated before giving up; the server lease outlasts this many.
const MAX_MISSED_HEARTBEATS = 2;
const TOAST_MS = 4_500;
// Problems come with advice to read, so they stay up longer.
const PROBLEM_TOAST_MS = 9_000;
const SAME_WIFI_HINT = "Same Wi‑Fi?";
const NOT_CONFIGURED = "Online play isn't set up here. Two controllers still work.";

/** Where this device is in a shared game, which decides the paired panel's text and buttons. */
type SessionView = "idle" | "hosting" | "joining" | "connected-host" | "connected-guest" | "guest-ended";
type StatusTone = "info" | "error";

export interface MultiplayerMenuOptions {
  readonly onOpenChange?: (open: boolean) => void;
  readonly onLocalStart?: () => void;
  readonly onConnected?: (role: MultiplayerRole, peer: WebRtcPeer, identity: MultiplayerConnectionIdentity) => void;
  readonly onDisconnected?: (role: MultiplayerRole) => void;
  readonly onMessage?: (role: MultiplayerRole, message: string) => void;
  /**
   * The host ended the shared game, the guest left it, or a disconnected guest chose to
   * play on their own. The game says goodbye over any open link, then tears its side down.
   */
  readonly onSessionEnd?: (role: MultiplayerRole) => void;
}

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing multiplayer interface element: ${selector}`);
  return element;
}

function loadHandledJoinRequestsSafely(): string[] {
  try { return loadHandledJoinRequests(); } catch { return []; }
}

export class MultiplayerMenu {
  private readonly menu = required<HTMLElement>("#multiplayer-menu");
  private readonly title = required<HTMLElement>("#multiplayer-title");
  private readonly status = required<HTMLElement>("#multiplayer-status");
  private readonly joinDebug = required<HTMLElement>("#multiplayer-join-debug");
  private readonly choicePanel = required<HTMLElement>("#multiplayer-choice-panel");
  private readonly choiceIntro = required<HTMLElement>("#multiplayer-choice-intro");
  private readonly pairingChoices = required<HTMLElement>("#multiplayer-pairing-choices");
  private readonly localChoice = required<HTMLElement>("#multiplayer-choice-local");
  private readonly chooseHostButton = required<HTMLButtonElement>("#multiplayer-choose-host");
  private readonly chooseJoinButton = required<HTMLButtonElement>("#multiplayer-choose-join");
  private readonly chooseLocalButton = required<HTMLButtonElement>("#multiplayer-choose-local");
  private readonly backOptionsButton = required<HTMLButtonElement>("#multiplayer-back-options");
  private readonly gameHelp = required<HTMLElement>("#multiplayer-game-help");
  private readonly hostButton = required<HTMLButtonElement>("#multiplayer-host");
  private readonly joinButton = required<HTMLButtonElement>("#multiplayer-family-join");
  private readonly pairedPanel = required<HTMLElement>("#multiplayer-family-paired");
  private readonly pairedLabel = required<HTMLElement>("#multiplayer-family-label");
  private readonly familyPresence = required<HTMLElement>("#multiplayer-family-presence");
  private readonly familyActions = required<HTMLElement>("#multiplayer-family-actions");
  private readonly sessionActions = required<HTMLElement>("#multiplayer-session-actions");
  private readonly sessionEndButton = required<HTMLButtonElement>("#multiplayer-session-end");
  private readonly playSoloButton = required<HTMLButtonElement>("#multiplayer-play-solo");
  private readonly pairDifferentButton = required<HTMLButtonElement>("#multiplayer-pair-different");
  private readonly setupPanel = required<HTMLElement>("#multiplayer-family-setup");
  private readonly hostSetup = required<HTMLElement>("#multiplayer-host-setup");
  private readonly joinSetup = required<HTMLElement>("#multiplayer-join-setup");
  private readonly localPanel = required<HTMLElement>("#multiplayer-local-panel");
  private readonly setupName = required<HTMLInputElement>("#multiplayer-family-name");
  private readonly createCodeButton = required<HTMLButtonElement>("#multiplayer-family-create");
  private readonly codeInput = required<HTMLInputElement>("#multiplayer-family-code");
  private readonly requestPairingButton = required<HTMLButtonElement>("#multiplayer-family-request");
  private readonly codePanel = required<HTMLElement>("#multiplayer-code-panel");
  private readonly codeDisplay = required<HTMLElement>("#multiplayer-family-code-display");
  private readonly codeExpiry = required<HTMLElement>("#multiplayer-code-expiry");
  private readonly cancelCodeButton = required<HTMLButtonElement>("#multiplayer-family-cancel");
  private readonly approvalPanel = required<HTMLElement>("#multiplayer-approval");
  private readonly approvalQuestion = required<HTMLElement>("#multiplayer-approval-question");
  private readonly approveButton = required<HTMLButtonElement>("#multiplayer-family-approve");
  private readonly denyButton = required<HTMLButtonElement>("#multiplayer-family-deny");
  private readonly replacementNote = required<HTMLElement>("#multiplayer-replacement-note");
  private readonly localButton = required<HTMLButtonElement>("#multiplayer-local");
  private readonly openButton = required<HTMLButtonElement>("#settings-play-together");
  private readonly closeButton = required<HTMLButtonElement>("#multiplayer-close");
  private readonly settingsPairing = required<HTMLElement>("#settings-family-pairing");
  private readonly settingsPeer = required<HTMLElement>("#settings-family-peer");
  private readonly settingsName = required<HTMLInputElement>("#settings-family-name");
  private readonly settingsSaveName = required<HTMLButtonElement>("#settings-family-save-name");
  private readonly settingsFamilyStatus = required<HTMLElement>("#settings-family-status");
  private readonly settingsForget = required<HTMLButtonElement>("#settings-family-forget");
  private readonly joinNotice = required<HTMLElement>("#multiplayer-join-notice");
  private readonly joinNoticeTitle = required<HTMLElement>("#multiplayer-join-notice-title");
  private readonly joinAcceptButton = required<HTMLButtonElement>("#multiplayer-join-accept");
  private readonly joinDismissButton = required<HTMLButtonElement>("#multiplayer-join-dismiss");
  private readonly toast = required<HTMLElement>("#multiplayer-toast");

  private readonly deviceId = loadOrCreateFamilyDeviceId();
  private readonly familyClient = ROOM_SIGNALING_URL ? new FamilyPairingClient(ROOM_SIGNALING_URL) : undefined;
  private pairing = loadStoredFamilyPairing();
  private lastPeerName = this.pairing?.peerName;
  private flowView: "choose" | "host" | "join" | "local" = "choose";
  private showReplacementSetup = false;
  private codeSession?: PairingCodeSession;
  private joinSession?: PairingJoinSession;
  private pendingCandidate?: FamilyDeviceIdentity;
  private setupPollTimer?: number;
  private setupPollRunning = false;
  private codeCountdownTimer?: number;
  private familyMode?: "host" | "join";
  private idleStatusPollTimer?: number;
  private idleStatusPollRunning = false;
  private idleStatusPollGeneration = 0;
  private pendingJoinRequestId?: string;
  private dismissedJoinRequestId?: string;
  private handledJoinRequests = loadHandledJoinRequestsSafely();
  private peerPresence = "";
  private presencePollTimer?: number;
  private heartbeatTimer?: number;
  private missedHeartbeats = 0;
  private presencePollRunning = false;
  private joinRequestId?: string;
  private joinRefreshAt = 0;
  // The peer's join request the currently open room answers.
  private attemptRequestId?: string;
  private familyRoomOpening = false;
  private familyRoomJoining = false;

  private peer?: WebRtcPeer;
  private role?: MultiplayerRole;
  // Set when a shared game starts; stays set after a drop (Goose 2 waits, or the guest's view is frozen)
  // until a player ends the game on purpose.
  private activeRole?: MultiplayerRole;
  private sessionId?: string;
  private reconnectToken?: string;
  private roomSignaling?: RoomSignalingClient;
  private peerConnected = false;
  private answerExchanged = false;
  private connectTimer?: number;
  private pickupTimer?: number;
  private interruptionTimer?: number;
  private reconnecting = false;
  private hostPaused = false;
  private toastTimer?: number;
  private bannerText?: string;

  constructor(private readonly options: MultiplayerMenuOptions = {}) {
    this.openButton.addEventListener("click", this.open);
    this.closeButton.addEventListener("click", this.close);
    this.chooseHostButton.addEventListener("click", () => this.showFlow("host"));
    this.chooseJoinButton.addEventListener("click", () => this.showFlow("join"));
    this.chooseLocalButton.addEventListener("click", () => this.showFlow("local"));
    this.backOptionsButton.addEventListener("click", this.backToChoices);
    this.hostButton.addEventListener("click", () => { void this.startFamilyHost(); });
    this.joinButton.addEventListener("click", () => { void this.startFamilyJoin(); });
    this.sessionEndButton.addEventListener("click", this.handleSessionEndButton);
    this.playSoloButton.addEventListener("click", () => this.endSharedGame());
    this.pairDifferentButton.addEventListener("click", this.showReplacementPairing);
    this.createCodeButton.addEventListener("click", () => { void this.startPairingCode(); });
    this.requestPairingButton.addEventListener("click", () => { void this.requestFamilyPairing(); });
    this.cancelCodeButton.addEventListener("click", () => { void this.cancelPairingSetup(); });
    this.approveButton.addEventListener("click", () => { void this.approveFamilyPairing(); });
    this.denyButton.addEventListener("click", () => { void this.denyFamilyPairing(); });
    this.localButton.addEventListener("click", () => {
      this.hideJoinNotice();
      this.stopFamilyPresence(true);
      this.startIdleStatusPolling();
      this.options.onLocalStart?.();
      this.close();
    });
    this.joinAcceptButton.addEventListener("click", () => { void this.acceptPendingJoin(); });
    this.joinDismissButton.addEventListener("click", this.dismissPendingJoin);
    this.settingsSaveName.addEventListener("click", () => { void this.updateFamilyName(); });
    this.settingsForget.addEventListener("click", () => { void this.forgetFamilyPairing(); });
    this.codeInput.addEventListener("input", () => {
      this.codeInput.value = this.codeInput.value.replace(/\D/gu, "").slice(0, 4);
    });
    window.addEventListener("pagehide", this.releaseFamilyHost, { once: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      if (this.familyMode === "join") void this.pollFamilyJoin();
      else if (this.idleStatusPollTimer !== undefined) void this.pollIdleFamilyStatus();
    });
    if (import.meta.env.DEV) {
      this.joinDebug.hidden = false;
      this.joinDebug.textContent = "Join alerts: waiting for the first check…";
    }
    this.updateFamilyUi();

    if (!ROOM_SIGNALING_URL) {
      this.createCodeButton.disabled = true;
      this.requestPairingButton.disabled = true;
      this.setStatus(NOT_CONFIGURED);
    } else {
      this.startIdleStatusPolling();
    }
  }

  /** The host's game paused (or resumed); the guest sees why the world stopped moving. */
  setHostPaused(paused: boolean): void {
    this.hostPaused = paused;
    this.refreshBanner();
  }

  /** The other device said goodbye before closing: it left or ended the game on purpose. */
  handlePeerGoodbye(): void {
    const role = this.activeRole ?? this.role;
    if (role && this.peer) this.handlePeerLost(role, "goodbye");
  }

  private readonly open = (): void => {
    this.updateFamilyUi();
    this.menu.hidden = false;
    this.options.onOpenChange?.(true);
    if (this.pairing && this.familyClient) {
      if (this.familyMode === "join") void this.pollFamilyJoin();
      else if (!this.familyMode && !this.activeRole) {
        this.startIdleStatusPolling();
        void this.pollIdleFamilyStatus();
      }
    }
    this.title.focus({ preventScroll: true });
  };

  private readonly close = (): void => {
    this.menu.hidden = true;
    this.options.onOpenChange?.(false);
    required<HTMLButtonElement>("#settings-button").focus({ preventScroll: true });
  };

  private showFlow(flow: "host" | "join" | "local"): void {
    this.flowView = flow;
    if (flow === "local") this.setStatus("");
    else if (!this.familyClient) this.setStatus(NOT_CONFIGURED);
    else this.setStatus("");
    this.updateFamilyUi();
    this.backOptionsButton.focus({ preventScroll: true });
  }

  private readonly backToChoices = (): void => {
    if (this.codeSession || this.joinSession) {
      void this.abandonPairingSetup();
      this.stopPairingSetupUi();
    }
    this.showReplacementSetup = false;
    this.flowView = "choose";
    this.setStatus("");
    this.updateFamilyUi();
    this.title.focus({ preventScroll: true });
  };

  private sessionView(): SessionView {
    if (this.activeRole === "guest" && this.peerConnected) return "connected-guest";
    if (this.familyMode === "join") return "joining";
    if (this.activeRole === "guest") return "guest-ended";
    if (this.activeRole === "host") return this.peerConnected ? "connected-host" : "hosting";
    if (this.familyMode === "host") return "hosting";
    return "idle";
  }

  private peerName(): string {
    return this.pairing?.peerName ?? this.lastPeerName ?? "the other player";
  }

  private updateFamilyUi(): void {
    const pairing = this.pairing;
    if (pairing) this.lastPeerName = pairing.peerName;
    const view = this.flowView;
    const session = this.sessionView();
    const setupView = view === "host" || view === "join";
    // Once paired, one panel starts, follows, and ends a shared game; codes are only for pairing.
    const pairedChoice = view === "choose" && Boolean(pairing || this.activeRole) && !this.showReplacementSetup;
    const peerName = this.peerName();
    this.title.textContent = view === "host" ? "Host"
      : view === "join" ? "Join"
        : view === "local" ? "Two controllers"
          : session === "connected-host" ? `Playing with ${peerName}`
            : session === "connected-guest" ? `In ${peerName}'s game` : "Play together";
    this.choicePanel.hidden = view !== "choose";
    this.choiceIntro.hidden = pairedChoice || !this.showReplacementSetup;
    this.choiceIntro.textContent = "Replaces your old pairing";
    this.pairingChoices.hidden = pairedChoice;
    this.localChoice.hidden = session !== "idle";
    this.backOptionsButton.hidden = view === "choose";
    this.joinDebug.hidden = !import.meta.env.DEV || view === "local";
    this.gameHelp.hidden = !(setupView || pairedChoice);
    this.localPanel.hidden = view !== "local";
    this.pairedPanel.hidden = !pairedChoice;
    this.setupPanel.hidden = !setupView;
    this.hostSetup.hidden = view !== "host";
    this.joinSetup.hidden = view !== "join";
    this.replacementNote.hidden = !pairing;
    this.settingsPairing.hidden = !pairing;

    this.pairedLabel.textContent = pairing ? `paired with ${peerName}` : `playing with ${peerName}`;
    this.familyActions.hidden = !(session === "idle" || session === "guest-ended");
    this.hostButton.hidden = session !== "idle";
    this.joinButton.textContent = session === "guest-ended" ? `join ${peerName} again` : `join ${peerName}`;
    this.sessionActions.hidden = session === "idle";
    this.sessionEndButton.hidden = session === "guest-ended";
    this.sessionEndButton.textContent = session === "joining" ? "cancel"
      : session === "connected-guest" ? "leave game"
        : session === "hosting" && !this.activeRole ? "stop hosting" : "end game";
    this.playSoloButton.hidden = session !== "guest-ended";
    this.pairDifferentButton.hidden = session !== "idle" || !pairing;
    this.renderPresence();

    if (pairing) {
      this.settingsPeer.textContent = `paired with ${pairing.peerName}`;
      if (document.activeElement !== this.setupName) this.setupName.value = pairing.selfName;
      if (document.activeElement !== this.settingsName) this.settingsName.value = pairing.selfName;
    } else {
      const savedName = loadFamilyPlayerName();
      if (document.activeElement !== this.setupName) this.setupName.value = savedName;
      this.settingsName.value = savedName;
      this.settingsFamilyStatus.textContent = "";
    }
    this.status.hidden = view === "local" || !this.status.textContent;
  }

  /** What the other paired device is doing right now, shown only while this one is idle. */
  private renderPresence(): void {
    this.familyPresence.textContent = this.sessionView() === "idle" ? this.peerPresence : "";
    this.familyPresence.hidden = !this.familyPresence.textContent;
  }

  private readonly showReplacementPairing = (): void => {
    this.showReplacementSetup = true;
    this.flowView = "choose";
    this.setStatus("");
    this.updateFamilyUi();
    this.chooseHostButton.focus({ preventScroll: true });
  };

  private localDevice(): FamilyDeviceIdentity {
    const name = normalizeFamilyPlayerName(this.setupName.value);
    saveFamilyPlayerName(name);
    return { deviceId: this.deviceId, name };
  }

  private async startPairingCode(): Promise<void> {
    if (!this.familyClient) return this.fail(new Error("Family pairing is unavailable in this build."));
    this.createCodeButton.disabled = true;
    try {
      const device = this.localDevice();
      await this.abandonPairingSetup();
      this.codeSession = await this.familyClient.createCode(device);
      this.codeDisplay.textContent = this.codeSession.code;
      this.startCodeCountdown(this.codeSession.expiresAt);
      this.createCodeButton.hidden = true;
      this.codePanel.hidden = false;
      this.approvalPanel.hidden = true;
      this.setStatus("");
      this.startSetupPolling();
    } catch (error) {
      this.fail(error);
    } finally {
      this.createCodeButton.disabled = false;
    }
  }

  private async requestFamilyPairing(): Promise<void> {
    if (!this.familyClient) return this.fail(new Error("Family pairing is unavailable in this build."));
    this.requestPairingButton.disabled = true;
    try {
      const device = this.localDevice();
      const code = parseFamilyPairingCode(this.codeInput.value);
      await this.abandonPairingSetup();
      this.joinSession = await this.familyClient.requestPairing(code, device);
      this.codePanel.hidden = true;
      this.approvalPanel.hidden = true;
      this.setStatus("Waiting for the host to say yes…");
      this.startSetupPolling();
    } catch (error) {
      this.fail(error);
    } finally {
      this.requestPairingButton.disabled = false;
    }
  }

  private startCodeCountdown(expiresAt: number): void {
    this.stopCodeCountdown();
    const render = (): void => {
      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1_000));
      this.codeExpiry.textContent = seconds > 0
        ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
        : "expired";
    };
    render();
    this.codeCountdownTimer = window.setInterval(render, 1_000);
  }

  private stopCodeCountdown(): void {
    if (this.codeCountdownTimer !== undefined) window.clearInterval(this.codeCountdownTimer);
    this.codeCountdownTimer = undefined;
  }

  private startSetupPolling(): void {
    if (this.setupPollTimer !== undefined) window.clearInterval(this.setupPollTimer);
    this.setupPollTimer = window.setInterval(() => { void this.pollPairingSetup(); }, SETUP_POLL_MS);
    void this.pollPairingSetup();
  }

  private async pollPairingSetup(): Promise<void> {
    if (!this.familyClient || this.setupPollRunning) return;
    const creatorSession = this.codeSession;
    const requesterSession = this.joinSession;
    if (!creatorSession && !requesterSession) return;
    this.setupPollRunning = true;
    try {
      const result = creatorSession
        ? await this.familyClient.pairingCodeStatus(creatorSession, "creator")
        : await this.familyClient.pairingCodeStatus(requesterSession!, "joiner");
      // Approving, cancelling, or a newer code may have replaced this session while the check was out.
      if (this.codeSession !== creatorSession || this.joinSession !== requesterSession) return;
      if (result.state === "paired" && result.pairing) {
        await this.completeFamilyPairing(result.pairing, creatorSession ? "host" : "join");
      } else if (creatorSession && result.state === "approval-needed" && result.candidate) {
        this.pendingCandidate = result.candidate;
        this.approvalQuestion.textContent = `Pair with ${result.candidate.name}?`;
        this.codePanel.hidden = true;
        this.approvalPanel.hidden = false;
        this.setStatus("");
      } else if (result.state === "denied") {
        this.stopSetupPolling();
        this.joinSession = undefined;
        this.setStatus("The host said no.", "error");
      } else if (result.state === "expired") {
        this.stopPairingSetupUi();
        this.setStatus(creatorSession
          ? "Code expired. Show a new one."
          : "Code expired. Ask for a new one.", "error");
      }
    } catch (error) {
      this.stopPairingSetupUi();
      this.fail(error);
    } finally {
      this.setupPollRunning = false;
    }
  }

  private async approveFamilyPairing(): Promise<void> {
    if (!this.familyClient || !this.codeSession || !this.pendingCandidate) return;
    this.approveButton.disabled = true;
    try {
      const result = await this.familyClient.approvePairing(this.codeSession, this.pendingCandidate.deviceId);
      await this.completeFamilyPairing(result.pairing, "host");
    } catch (error) {
      this.fail(error);
    } finally {
      this.approveButton.disabled = false;
    }
  }

  private async denyFamilyPairing(): Promise<void> {
    if (!this.familyClient || !this.codeSession || !this.pendingCandidate) return;
    this.denyButton.disabled = true;
    try {
      await this.familyClient.denyPairing(this.codeSession, this.pendingCandidate.deviceId);
      this.pendingCandidate = undefined;
      this.approvalPanel.hidden = true;
      this.codePanel.hidden = false;
      this.setStatus("Said no. The code still works.");
    } catch (error) {
      this.fail(error);
    } finally {
      this.denyButton.disabled = false;
    }
  }

  private async completeFamilyPairing(credential: FamilyPairingCredential, continueAs: "host" | "join"): Promise<void> {
    const nextPairing = familyPairingForDevice(credential, this.deviceId);
    const previousPairing = this.pairing;
    if (previousPairing?.pairId === nextPairing.pairId && (this.familyMode || this.activeRole)) return;
    this.stopIdleStatusPolling();
    this.hideJoinNotice();
    this.dismissedJoinRequestId = undefined;
    this.peerPresence = "";
    saveStoredFamilyPairing(nextPairing);
    this.pairing = nextPairing;
    this.stopPairingSetupUi();
    this.showReplacementSetup = false;
    this.flowView = "choose";
    this.setStatus(`Paired with ${nextPairing.peerName}.`);
    this.updateFamilyUi();
    if (previousPairing && previousPairing.pairId !== nextPairing.pairId && this.familyClient) {
      void this.familyClient.forget(previousPairing).catch(() => { /* The new pairing is already safely stored. */ });
    }
    // Each player already chose to host or join, so carry straight on instead of asking again.
    if (continueAs === "host") await this.startFamilyHost();
    else await this.startFamilyJoin();
  }

  private async cancelPairingSetup(): Promise<void> {
    await this.abandonPairingSetup();
    this.stopPairingSetupUi();
    if (this.pairing) {
      this.showReplacementSetup = false;
      this.flowView = "choose";
      this.setStatus(`Still paired with ${this.pairing.peerName}.`);
    } else {
      this.setStatus("Code cancelled.");
    }
    this.updateFamilyUi();
  }

  private async abandonPairingSetup(): Promise<void> {
    const oldSession = this.codeSession;
    this.stopSetupPolling();
    this.codeSession = undefined;
    this.joinSession = undefined;
    this.pendingCandidate = undefined;
    if (oldSession && this.familyClient) {
      try { await this.familyClient.cancelPairingCode(oldSession); } catch { /* It may already have expired. */ }
    }
  }

  private stopPairingSetupUi(): void {
    this.stopSetupPolling();
    this.stopCodeCountdown();
    this.codeSession = undefined;
    this.joinSession = undefined;
    this.pendingCandidate = undefined;
    this.codePanel.hidden = true;
    this.createCodeButton.hidden = false;
    this.approvalPanel.hidden = true;
  }

  private stopSetupPolling(): void {
    if (this.setupPollTimer !== undefined) window.clearInterval(this.setupPollTimer);
    this.setupPollTimer = undefined;
  }

  private startIdleStatusPolling(): void {
    if (!this.familyClient) return this.reportJoinCheck("Pairing service is not configured");
    if (!this.pairing) return this.reportJoinCheck("No saved device pairing");
    if (this.activeRole) return this.reportJoinCheck("Playing together; idle alerts paused");
    if (this.idleStatusPollTimer !== undefined) return;
    this.idleStatusPollTimer = window.setInterval(() => { void this.pollIdleFamilyStatus(); }, IDLE_STATUS_POLL_MS);
    void this.pollIdleFamilyStatus();
  }

  private stopIdleStatusPolling(): void {
    if (this.idleStatusPollTimer !== undefined) window.clearInterval(this.idleStatusPollTimer);
    this.idleStatusPollTimer = undefined;
    this.idleStatusPollGeneration += 1;
    this.idleStatusPollRunning = false;
  }

  private async pollIdleFamilyStatus(): Promise<void> {
    if (!this.familyClient || !this.pairing || this.idleStatusPollRunning) return;
    if (this.familyMode || this.activeRole) {
      this.reportJoinCheck("Hosting, joining, or playing; idle alerts paused");
      return;
    }
    if (document.hidden) {
      this.reportJoinCheck("App is hidden; checks resume when it opens");
      return;
    }
    this.idleStatusPollRunning = true;
    const generation = this.idleStatusPollGeneration;
    try {
      const status = await this.familyClient.pairStatus(this.pairing);
      if (generation !== this.idleStatusPollGeneration || this.familyMode || this.activeRole || !this.pairing) return;
      this.syncPairingNames(status);
      this.syncJoinNotice(status);
      const peerName = this.pairing.peerName;
      this.peerPresence = status.activeHost?.deviceId === this.pairing.peerDeviceId
        ? `${peerName} is hosting a game now. Tap “Join ${peerName}” to play together.`
        : this.pendingJoinRequestId ? `${peerName} wants to join. Tap “Host game” to start.` : "";
      this.renderPresence();
      const request = status.joinRequest;
      this.reportJoinCheck(!request
        ? "No pending Join request"
        : request.deviceId !== this.pairing.peerDeviceId
          ? "Join request does not match this paired player"
          : this.handledJoinRequests.includes(request.requestId)
            ? "Join request was already answered"
            : request.requestId === this.dismissedJoinRequestId
              ? "Join request was dismissed"
              : this.joinNotice.hidden
                ? "Join request received, but popup is hidden"
                : "Join request received; popup shown");
    } catch (error) {
      if (generation === this.idleStatusPollGeneration) {
        this.reportJoinCheck(`Check failed: ${error instanceof Error ? error.message : "unknown error"}`, error);
        if (error instanceof FamilyPairingServiceError && error.code === "pairing-missing") this.handleFamilyError(error);
      }
    } finally {
      if (generation === this.idleStatusPollGeneration) this.idleStatusPollRunning = false;
    }
  }

  private reportJoinCheck(message: string, error?: unknown): void {
    if (!import.meta.env.DEV) return;
    this.joinDebug.textContent = `Join alerts · ${new Date().toLocaleTimeString()}: ${message}`;
    if (error) console.warn("[Goose join alerts]", message, error);
    else console.info("[Goose join alerts]", message);
  }

  private syncJoinNotice(status: FamilyPairStatus): void {
    if (!this.pairing || this.familyMode === "host" || this.activeRole) return this.hideJoinNotice();
    const request = peerJoinRequestToPrompt(status, this.pairing, this.dismissedJoinRequestId, this.handledJoinRequests);
    if (!request) return this.hideJoinNotice();
    this.pendingJoinRequestId = request.requestId;
    this.joinNoticeTitle.textContent = `${this.pairing.peerName} wants to join`;
    this.joinNotice.hidden = false;
  }

  private hideJoinNotice(): void {
    this.pendingJoinRequestId = undefined;
    this.joinNotice.hidden = true;
  }

  private readonly dismissPendingJoin = (): void => {
    this.dismissedJoinRequestId = this.pendingJoinRequestId;
    this.hideJoinNotice();
    this.peerPresence = "";
    this.renderPresence();
  };

  private async acceptPendingJoin(): Promise<void> {
    if (!this.pendingJoinRequestId) return;
    this.hideJoinNotice();
    this.showReplacementSetup = false;
    this.flowView = "choose";
    this.open();
    await this.startFamilyHost();
  }

  private markJoinRequestHandled(requestId: string): void {
    try {
      this.handledJoinRequests = rememberHandledJoinRequest(requestId);
    } catch {
      // Storage is unavailable; remember it for as long as the app stays open.
      if (!this.handledJoinRequests.includes(requestId)) this.handledJoinRequests = [requestId, ...this.handledJoinRequests].slice(0, 12);
    }
  }

  private hostingWaitText(): string {
    const pairing = this.pairing;
    return pairing
      ? `Hosting. ${pairing.peerName} taps “join ${pairing.selfName}”.`
      : "Hosting.";
  }

  private async startFamilyHost(): Promise<void> {
    const pairing = this.pairing;
    if (!this.familyClient || !pairing) return this.fail(new Error("Pair this device with the other player first."));
    if (this.familyMode === "host") {
      this.setStatus(this.peerConnected ? `${pairing.peerName} already joined.` : this.hostingWaitText());
      return;
    }
    // A guest's screen shows the host's world; it has to go back to its own game before it can host.
    if (this.activeRole === "guest") return;
    this.stopIdleStatusPolling();
    this.hideJoinNotice();
    this.stopFamilyPresence(true);
    this.closePeer();
    this.hostButton.disabled = true;
    this.setStatus("Starting…");
    try {
      const pairStatus = await this.familyClient.claimHost(pairing);
      this.familyMode = "host";
      this.attemptRequestId = undefined;
      this.syncPairingNames(pairStatus);
      this.startHostPresence();
      this.setStatus(this.hostingWaitText());
      this.updateFamilyUi();
      await this.handleHostStatus(pairStatus);
    } catch (error) {
      if (error instanceof FamilyPairingServiceError && error.code === "already-hosting") {
        this.setStatus(`${error.hostName ?? pairing.peerName} is hosting. Joining…`);
        await this.startFamilyJoin();
      } else {
        this.handleFamilyError(error);
      }
    } finally {
      this.hostButton.disabled = false;
      if (!this.familyMode && !this.activeRole) this.startIdleStatusPolling();
      this.updateFamilyUi();
    }
  }

  private startHostPresence(): void {
    if (this.presencePollTimer !== undefined) window.clearInterval(this.presencePollTimer);
    if (this.heartbeatTimer !== undefined) window.clearInterval(this.heartbeatTimer);
    this.missedHeartbeats = 0;
    this.presencePollTimer = window.setInterval(() => { void this.pollFamilyHost(); }, PRESENCE_POLL_MS);
    this.heartbeatTimer = window.setInterval(() => { void this.heartbeatFamilyHost(); }, HOST_HEARTBEAT_MS);
  }

  private async heartbeatFamilyHost(): Promise<void> {
    if (this.familyMode !== "host" || !this.pairing || !this.familyClient) return;
    try {
      const status = await this.familyClient.heartbeatHost(this.pairing);
      this.missedHeartbeats = 0;
      this.syncPairingNames(status);
    } catch (error) {
      const transient = error instanceof FamilyPairingServiceError && (error.code === "network" || error.code === "timeout");
      if (transient && ++this.missedHeartbeats <= MAX_MISSED_HEARTBEATS) return;
      if (error instanceof FamilyPairingServiceError && error.code === "host-lost") return this.reclaimHost();
      this.stopFamilyPresence(false);
      if (!this.activeRole) this.startIdleStatusPolling();
      this.handleFamilyError(error);
      this.updateFamilyUi();
    }
  }

  /** The service forgot this host (say the app slept past its lease); take the spot back if it is free. */
  private async reclaimHost(): Promise<void> {
    const pairing = this.pairing;
    if (!pairing || !this.familyClient || this.familyMode !== "host") return;
    try {
      const status = await this.familyClient.claimHost(pairing);
      this.missedHeartbeats = 0;
      this.syncPairingNames(status);
    } catch (error) {
      this.stopFamilyPresence(false);
      if (!this.activeRole) this.startIdleStatusPolling();
      if (error instanceof FamilyPairingServiceError && error.code === "already-hosting") {
        this.setStatus(`${error.hostName ?? pairing.peerName} is hosting now.`);
      } else {
        this.handleFamilyError(error);
      }
      this.updateFamilyUi();
    }
  }

  private async pollFamilyHost(): Promise<void> {
    if (this.familyMode !== "host" || !this.pairing || !this.familyClient || this.presencePollRunning) return;
    this.presencePollRunning = true;
    try {
      const status = await this.familyClient.pairStatus(this.pairing);
      if (this.familyMode !== "host") return;
      this.reportJoinCheck(this.peerConnected
        ? "Hosting; the paired player is in the game"
        : status.joinRequest ? "Hosting; checking the paired player's Join request" : "Hosting; waiting for the paired player");
      await this.handleHostStatus(status);
    } catch (error) {
      this.reportJoinCheck(`Host check failed: ${error instanceof Error ? error.message : "unknown error"}`, error);
      // A missed check is retried two seconds later; only a forgotten pairing ends hosting here.
      if (error instanceof FamilyPairingServiceError && error.code === "pairing-missing") this.handleFamilyError(error);
    } finally {
      this.presencePollRunning = false;
    }
  }

  private async handleHostStatus(status: FamilyPairStatus): Promise<void> {
    this.syncPairingNames(status);
    const pairing = this.pairing;
    if (!pairing) return;
    if (status.activeHost?.deviceId !== pairing.deviceId) {
      if (!status.activeHost) return this.reclaimHost();
      this.stopFamilyPresence(false);
      if (!this.activeRole) this.startIdleStatusPolling();
      this.setStatus(`${pairing.peerName} is hosting now.`);
      this.updateFamilyUi();
      return;
    }
    const request = status.joinRequest;
    if (request && request.deviceId === pairing.peerDeviceId && request.requestId !== this.attemptRequestId
      && !this.handledJoinRequests.includes(request.requestId)) {
      await this.openFamilyRoom(request.requestId);
    }
  }

  private async openFamilyRoom(requestId: string): Promise<void> {
    if (this.familyRoomOpening || !this.familyClient || !this.pairing || this.familyMode !== "host") return;
    this.familyRoomOpening = true;
    const peerName = this.pairing.peerName;
    this.setStatus(`${peerName} is joining…`);
    try {
      // The other device asked again, so the old link is no longer in use; Goose 2 waits meanwhile.
      if (this.peerConnected && this.role) this.options.onDisconnected?.(this.role);
      const invitation = await this.createHostedRoom();
      await this.familyClient.publishRoom(this.pairing, requestId, invitation);
      this.attemptRequestId = requestId;
      this.setStatus(`Connecting to ${peerName}…`);
      this.startPickupTimer();
    } catch (error) {
      this.closePeer();
      if (error instanceof FamilyPairingServiceError && error.code === "join-request-missing") {
        this.markJoinRequestHandled(requestId);
        this.setStatus(this.hostingWaitText());
      } else {
        this.handleFamilyError(error);
      }
    } finally {
      this.familyRoomOpening = false;
      this.updateFamilyUi();
    }
  }

  private async startFamilyJoin(): Promise<void> {
    const pairing = this.pairing;
    if (!this.familyClient || !pairing) return this.fail(new Error("Pair this device with the other player first."));
    if (this.peerConnected) return;
    const wasHosting = this.familyMode === "host";
    this.stopIdleStatusPolling();
    this.hideJoinNotice();
    this.stopFamilyPresence(false);
    this.closePeer();
    this.joinButton.disabled = true;
    this.reportJoinCheck("Sending Join request to the pairing service");
    const requestId = createFamilyToken();
    try {
      if (wasHosting) await this.familyClient.releaseHost(pairing);
      this.familyMode = "join";
      this.joinRequestId = requestId;
      this.joinRefreshAt = Date.now() + JOIN_REFRESH_MS;
      this.setStatus(`Asking ${pairing.peerName} to host…`);
      this.updateFamilyUi();
      const status = await this.familyClient.requestJoin(pairing, requestId);
      if (this.joinRequestId !== requestId) return;
      this.reportJoinCheck("Join request accepted; waiting for the paired player");
      this.syncPairingNames(status);
      this.describeJoinWait(status);
      this.presencePollTimer = window.setInterval(() => { void this.pollFamilyJoin(); }, PRESENCE_POLL_MS);
      await this.handleJoinStatus(status);
    } catch (error) {
      this.reportJoinCheck(`Join request failed: ${error instanceof Error ? error.message : "unknown error"}`, error);
      if (this.joinRequestId === requestId) this.stopFamilyPresence(false);
      this.handleFamilyError(error);
    } finally {
      this.joinButton.disabled = false;
      if (!this.familyMode && !this.activeRole) this.startIdleStatusPolling();
      this.updateFamilyUi();
    }
  }

  private async pollFamilyJoin(): Promise<void> {
    if (this.familyMode !== "join" || !this.pairing || !this.familyClient || !this.joinRequestId || this.presencePollRunning) return;
    const requestId = this.joinRequestId;
    this.presencePollRunning = true;
    try {
      if (Date.now() >= this.joinRefreshAt) {
        await this.familyClient.requestJoin(this.pairing, requestId);
        this.joinRefreshAt = Date.now() + JOIN_REFRESH_MS;
      }
      const status = await this.familyClient.pairStatus(this.pairing, requestId);
      if (this.familyMode !== "join" || this.joinRequestId !== requestId) return;
      this.syncJoinNotice(status);
      this.reportJoinCheck(this.joinNotice.hidden
        ? "Waiting to join; no request from the paired player"
        : "Paired player also wants to join; popup shown");
      await this.handleJoinStatus(status);
    } catch (error) {
      this.reportJoinCheck(`Join wait check failed: ${error instanceof Error ? error.message : "unknown error"}`, error);
      if (error instanceof FamilyPairingServiceError && error.code === "pairing-missing") this.handleFamilyError(error);
      else if (this.familyMode === "join") this.setStatus("Can't connect. Still trying…");
    } finally {
      this.presencePollRunning = false;
    }
  }

  private async handleJoinStatus(status: FamilyPairStatus): Promise<void> {
    this.syncPairingNames(status);
    const pairing = this.pairing;
    if (!pairing || !this.joinRequestId || this.familyRoomJoining || this.peerConnected) return;
    if (status.room?.requestId === this.joinRequestId && status.room.hostDeviceId === pairing.peerDeviceId) {
      this.familyRoomJoining = true;
      // The room already holds the host's offer; the connect timer takes over from here.
      if (this.presencePollTimer !== undefined) window.clearInterval(this.presencePollTimer);
      this.presencePollTimer = undefined;
      try {
        await this.joinRoom(status.room.invitation);
      } catch {
        this.handlePeerLost("guest", "unreachable", "Couldn't reach the connection service. Check the internet connection, then try again.");
      }
    } else {
      this.describeJoinWait(status);
    }
  }

  private describeJoinWait(status: FamilyPairStatus): void {
    const pairing = this.pairing;
    if (!pairing) return;
    this.setStatus(status.activeHost?.deviceId === pairing.peerDeviceId
      ? `${pairing.peerName} is hosting. Connecting…`
      : `Waiting for ${pairing.peerName} to host…`);
  }

  private readonly handleSessionEndButton = (): void => {
    const session = this.sessionView();
    if (session === "joining") void this.cancelJoin();
    else if (session === "hosting" && !this.activeRole) this.stopHosting();
    else if (this.activeRole) this.endSharedGame();
  };

  private stopHosting(): void {
    this.stopFamilyPresence(true);
    this.closePeer();
    this.clearConnectTimers();
    this.setStatus("Stopped hosting.");
    this.startIdleStatusPolling();
    this.updateFamilyUi();
  }

  private async cancelJoin(): Promise<void> {
    const pairing = this.pairing;
    this.stopFamilyPresence(false);
    this.closePeer();
    this.clearConnectTimers();
    this.setStatus("Stopped asking to join.");
    this.updateFamilyUi();
    if (pairing && this.familyClient) {
      // The service has no "withdraw", but claiming and releasing the host spot clears this
      // device's own request when nobody is hosting, so the other player gets no stale popup.
      try {
        await this.familyClient.claimHost(pairing);
        await this.familyClient.releaseHost(pairing);
      } catch { /* Someone is hosting; they will see the request expire or go unanswered. */ }
    }
    if (!this.familyMode && !this.activeRole) this.startIdleStatusPolling();
  }

  /** Host: end the shared game and send Goose 2 home. Guest: leave and go back to their own game. */
  private endSharedGame(): void {
    const role = this.activeRole;
    if (!role) return;
    const peerName = this.peerName();
    this.options.onSessionEnd?.(role);
    // The game's goodbye is already queued on the link; give it a moment to arrive.
    this.peer?.closeSoon();
    this.peer = undefined;
    this.roomSignaling?.close();
    this.roomSignaling = undefined;
    this.clearConnectTimers();
    this.clearInterruption();
    this.peerConnected = false;
    this.activeRole = undefined;
    this.hostPaused = false;
    this.refreshBanner();
    this.stopFamilyPresence(true);
    if (role === "host") {
      this.setStatus(`${peerName}'s goose went home.`);
      this.showToast(`${peerName}'s goose went home.`);
      this.startIdleStatusPolling();
      this.updateFamilyUi();
      if (!this.menu.hidden) this.close();
    }
  }

  private stopFamilyPresence(releaseHost: boolean): void {
    const wasHosting = this.familyMode === "host";
    const pairing = this.pairing;
    // A request this device was still answering is abandoned with it; never offer it again.
    if (this.attemptRequestId) this.markJoinRequestHandled(this.attemptRequestId);
    if (this.presencePollTimer !== undefined) window.clearInterval(this.presencePollTimer);
    if (this.heartbeatTimer !== undefined) window.clearInterval(this.heartbeatTimer);
    this.presencePollTimer = undefined;
    this.heartbeatTimer = undefined;
    this.familyMode = undefined;
    this.joinRequestId = undefined;
    this.attemptRequestId = undefined;
    this.familyRoomOpening = false;
    this.familyRoomJoining = false;
    this.missedHeartbeats = 0;
    if (releaseHost && wasHosting && pairing && this.familyClient) {
      void this.familyClient.releaseHost(pairing).catch(() => { /* The short server lease is the fallback. */ });
    }
  }

  private readonly releaseFamilyHost = (): void => {
    if (this.familyMode === "host" && this.pairing && this.familyClient) {
      void this.familyClient.releaseHost(this.pairing, true).catch(() => { /* The host lease expires by itself. */ });
    }
  };

  private syncPairingNames(status: FamilyPairStatus): void {
    if (!this.pairing) return;
    const updated = pairingWithUpdatedDevices(this.pairing, status.devices);
    if (updated.selfName === this.pairing.selfName && updated.peerName === this.pairing.peerName) return;
    this.pairing = updated;
    saveStoredFamilyPairing(updated);
    this.updateFamilyUi();
  }

  private async updateFamilyName(): Promise<void> {
    if (!this.pairing || !this.familyClient) return;
    this.settingsSaveName.disabled = true;
    try {
      const name = normalizeFamilyPlayerName(this.settingsName.value);
      const status = await this.familyClient.updateName(this.pairing, name);
      this.syncPairingNames(status);
      this.settingsFamilyStatus.textContent = `Saved as ${name}.`;
    } catch (error) {
      this.settingsFamilyStatus.textContent = error instanceof Error ? error.message : "The player name could not be saved.";
    } finally {
      this.settingsSaveName.disabled = false;
    }
  }

  private async forgetFamilyPairing(): Promise<void> {
    const pairing = this.pairing;
    if (!pairing || !window.confirm(`Forget ${pairing.peerName} as the paired player? Both devices will need a new code.`)) return;
    this.settingsForget.disabled = true;
    this.stopIdleStatusPolling();
    this.hideJoinNotice();
    try {
      if (this.familyClient) await this.familyClient.forget(pairing);
    } catch { /* Clear this device even if the old pairing is already gone. */ }
    // Ending a shared game sends a goodbye; a guest's game then reloads into its own.
    if (this.activeRole) this.endSharedGame();
    this.stopFamilyPresence(true);
    this.closePeer();
    clearStoredFamilyPairing();
    this.pairing = undefined;
    this.peerPresence = "";
    this.showReplacementSetup = false;
    this.flowView = "choose";
    this.setStatus("Paired player forgotten.");
    this.updateFamilyUi();
    this.settingsForget.disabled = false;
  }

  private handleFamilyError(error: unknown): void {
    if (error instanceof FamilyPairingServiceError && error.code === "pairing-missing") {
      this.stopFamilyPresence(false);
      this.stopIdleStatusPolling();
      this.hideJoinNotice();
      clearStoredFamilyPairing();
      this.pairing = undefined;
      this.peerPresence = "";
      this.showReplacementSetup = false;
      this.setStatus("The other device forgot you. Pair again.", "error");
      this.updateFamilyUi();
      return;
    }
    this.fail(error);
  }

  private async createHostedRoom(): Promise<RoomInvitation> {
    this.closePeer();
    this.role = "host";
    const invitation: RoomInvitation = {
      roomId: createFamilyToken(),
      reconnectToken: createFamilyToken(),
    };
    this.sessionId = invitation.roomId;
    this.reconnectToken = invitation.reconnectToken;
    try {
      this.roomSignaling = this.createRoomSignaling("host", invitation);
      await this.roomSignaling.connect();
      this.peer = this.createPeer("host");
      const description = await this.peer.createHostOffer();
      if (description.type !== "offer" || !description.sdp) throw new Error("WebRTC did not create a host offer.");
      this.roomSignaling.sendDescription({ type: "offer", sdp: description.sdp });
      return invitation;
    } catch (error) {
      this.roomSignaling?.close();
      this.roomSignaling = undefined;
      throw error;
    }
  }

  private async joinRoom(invitation: RoomInvitation): Promise<void> {
    this.closePeer();
    this.role = "guest";
    this.sessionId = invitation.roomId;
    this.reconnectToken = invitation.reconnectToken;
    this.setStatus(`Joining ${this.peerName()}…`);
    this.startConnectTimer("guest");
    this.roomSignaling = this.createRoomSignaling("guest", invitation);
    await this.roomSignaling.connect();
  }

  private createRoomSignaling(role: MultiplayerRole, invitation: RoomInvitation): RoomSignalingClient {
    return new RoomSignalingClient({
      serviceUrl: ROOM_SIGNALING_URL!,
      invitation,
      role,
      onMessage: (message) => { void this.handleRoomSignal(role, message); },
      onClose: () => {
        // Once offer and answer are exchanged the direct link decides; the other device closes
        // its room the moment it connects, which can arrive here first.
        if (this.peerConnected || this.answerExchanged || role !== "guest" || this.role !== "guest") return;
        this.handlePeerLost("guest", "unreachable", "The connection setup was interrupted. Try joining again.");
      },
    });
  }

  private async handleRoomSignal(role: MultiplayerRole, message: RoomSignalMessage): Promise<void> {
    try {
      if (message.type === "error") throw new Error(message.message);
      if (role === "guest" && message.type === "offer") {
        this.peer?.close();
        this.peer = this.createPeer("guest");
        this.setStatus(`Connecting to ${this.peerName()}…`);
        const description = await this.peer.acceptOfferAndCreateAnswer(message.description);
        if (description.type !== "answer" || !description.sdp) throw new Error("WebRTC did not create a guest answer.");
        this.roomSignaling?.sendDescription({ type: "answer", sdp: description.sdp });
        this.answerExchanged = true;
      } else if (role === "host" && message.type === "answer") {
        if (!this.peer) throw new Error("The host connection is no longer open.");
        window.clearTimeout(this.pickupTimer);
        this.pickupTimer = undefined;
        this.answerExchanged = true;
        this.startConnectTimer("host");
        await this.peer.acceptGuestAnswer(message.description);
      } else if (message.type === "peer-left" && role === "guest" && !this.peerConnected && !this.answerExchanged) {
        this.handlePeerLost("guest", "unreachable", `${this.peerName()}'s game closed before you could join. Try joining again.`);
      }
      // A host ignores the guest leaving the room: before an answer the pickup timer decides,
      // after it the direct link and connect timer do.
    } catch (error) {
      if (role === "guest" && !this.peerConnected) this.handlePeerLost("guest", "unreachable");
      else this.fail(error);
    }
  }

  private createPeer(role: MultiplayerRole): WebRtcPeer {
    const peer: WebRtcPeer = new WebRtcPeer({
      // A replaced or closed link must not change the current one's state.
      onStatus: (status) => { if (peer === this.peer) this.handlePeerStatus(role, peer, status); },
      onMessage: (message) => { if (peer === this.peer) this.options.onMessage?.(role, message); },
    });
    return peer;
  }

  private handlePeerStatus(role: MultiplayerRole, peer: WebRtcPeer, status: WebRtcPeerStatus): void {
    if (status === "connected") {
      if (this.peerConnected) {
        this.clearInterruption();
        return;
      }
      this.peerConnected = true;
      this.clearConnectTimers();
      // Signaling is finished; the room closing or expiring later must not read as a problem.
      this.roomSignaling?.close();
      this.roomSignaling = undefined;
      this.activeRole = role;
      this.hostPaused = false;
      const peerName = this.peerName();
      if (role === "host") {
        if (this.attemptRequestId) this.markJoinRequestHandled(this.attemptRequestId);
        this.setStatus(`${peerName} joined!`);
        this.showToast(`${peerName} joined your game!`);
      } else {
        // The join request is answered; stop asking for a room.
        this.stopFamilyPresence(false);
        this.setStatus(`You're in ${peerName}'s game.`);
        this.showToast(`You joined ${peerName}'s game!`);
      }
      this.stopIdleStatusPolling();
      if (this.sessionId && this.reconnectToken) {
        this.options.onConnected?.(role, peer, { sessionId: this.sessionId, reconnectToken: this.reconnectToken });
      }
      this.updateFamilyUi();
      if (!this.menu.hidden) this.close();
    } else if (status === "interrupted") {
      this.startInterruption(role);
    } else {
      this.handlePeerLost(role, peer.everConnected ? "lost" : "unreachable");
    }
  }

  private startConnectTimer(role: MultiplayerRole): void {
    window.clearTimeout(this.connectTimer);
    this.connectTimer = window.setTimeout(() => {
      this.connectTimer = undefined;
      if (!this.peerConnected && this.role === role) this.handlePeerLost(role, "unreachable");
    }, CONNECT_TIMEOUT_MS);
  }

  private startPickupTimer(): void {
    window.clearTimeout(this.pickupTimer);
    this.pickupTimer = window.setTimeout(() => {
      this.pickupTimer = undefined;
      if (this.peerConnected || this.role !== "host") return;
      const pairing = this.pairing;
      if (this.attemptRequestId) this.markJoinRequestHandled(this.attemptRequestId);
      this.attemptRequestId = undefined;
      this.closePeer();
      this.notify(pairing
        ? `${pairing.peerName} didn't connect. They can tap “Join ${pairing.selfName}” on their device to try again.`
        : "The other player didn't connect.", "error");
    }, ROOM_PICKUP_TIMEOUT_MS);
  }

  private clearConnectTimers(): void {
    window.clearTimeout(this.connectTimer);
    window.clearTimeout(this.pickupTimer);
    this.connectTimer = undefined;
    this.pickupTimer = undefined;
  }

  private startInterruption(role: MultiplayerRole): void {
    if (this.interruptionTimer !== undefined) return;
    this.reconnecting = true;
    this.refreshBanner();
    this.interruptionTimer = window.setTimeout(() => {
      this.interruptionTimer = undefined;
      this.handlePeerLost(role, "lost");
    }, INTERRUPTION_GRACE_MS);
  }

  private clearInterruption(): void {
    window.clearTimeout(this.interruptionTimer);
    this.interruptionTimer = undefined;
    if (!this.reconnecting) return;
    this.reconnecting = false;
    this.refreshBanner();
  }

  /**
   * One place that decides what each player is told when a link ends, so the words match
   * what happened: never connected, dropped, or left on purpose.
   */
  private handlePeerLost(role: MultiplayerRole, kind: "lost" | "unreachable" | "goodbye", message?: string): void {
    const wasConnected = this.peerConnected;
    const peerName = this.peerName();
    this.clearConnectTimers();
    this.clearInterruption();
    this.closePeer();
    this.hostPaused = false;
    this.refreshBanner();
    if (role === "host") {
      if (this.attemptRequestId) this.markJoinRequestHandled(this.attemptRequestId);
      this.attemptRequestId = undefined;
      if (wasConnected) {
        this.options.onDisconnected?.("host");
        this.notify(kind === "goodbye"
          ? `${peerName} left the game. Their goose will wait here if they come back.`
          : `${peerName} disconnected. Their goose will wait here until they rejoin.`);
      } else {
        this.notify(message ?? `Can't reach ${peerName}. ${SAME_WIFI_HINT}`, "error");
      }
      // Still hosting, so the other player can simply tap Join again.
      return;
    }
    this.stopFamilyPresence(false);
    if (wasConnected) {
      this.options.onDisconnected?.("guest");
      if (kind === "goodbye") this.setStatus(`${peerName} ended the game.`);
      else this.setStatus(`Lost ${peerName}'s game.`, "error");
    } else {
      this.setStatus(message ?? `Can't reach ${peerName}. ${SAME_WIFI_HINT}`, "error");
    }
    if (!this.activeRole) this.startIdleStatusPolling();
    this.showReplacementSetup = false;
    this.flowView = "choose";
    this.updateFamilyUi();
    if (this.menu.hidden) this.open();
  }

  private closePeer(): void {
    this.peer?.close();
    this.peer = undefined;
    this.roomSignaling?.close();
    this.roomSignaling = undefined;
    this.peerConnected = false;
    this.answerExchanged = false;
  }

  private refreshBanner(): void {
    const peerName = this.peerName();
    const playing = this.peerConnected && this.activeRole !== undefined;
    this.setBanner(!playing ? undefined
      : this.reconnecting ? (this.activeRole === "guest" ? `Reconnecting to ${peerName}'s game…` : `${peerName}'s connection is weak…`)
        : this.hostPaused && this.activeRole === "guest" ? `${peerName} paused the game.` : undefined);
  }

  /** A short in-game message for things that happen while the menu is closed. */
  private showToast(text: string, durationMs = TOAST_MS): void {
    window.clearTimeout(this.toastTimer);
    this.toast.textContent = text;
    this.toast.hidden = false;
    this.toastTimer = window.setTimeout(() => {
      this.toastTimer = undefined;
      this.renderBanner();
    }, durationMs);
  }

  /** A message that stays up while a state lasts (paused host, weak link); toasts briefly cover it. */
  private setBanner(text: string | undefined): void {
    this.bannerText = text;
    if (this.toastTimer === undefined) this.renderBanner();
  }

  private renderBanner(): void {
    this.toast.textContent = this.bannerText ?? "";
    this.toast.hidden = !this.bannerText;
  }

  /** Shows the outcome in the menu, and in the game too when the menu is closed. */
  private notify(text: string, tone: StatusTone = "info"): void {
    this.setStatus(text, tone);
    if (this.menu.hidden) this.showToast(text, tone === "error" ? PROBLEM_TOAST_MS : TOAST_MS);
    this.updateFamilyUi();
  }

  private setStatus(text: string, tone: StatusTone = "info"): void {
    const error = tone === "error";
    if (this.status.textContent !== text || this.status.classList.contains("multiplayer-status--error") !== error) {
      this.status.textContent = text;
      this.status.classList.toggle("multiplayer-status--error", error);
      this.status.setAttribute("role", error ? "alert" : "status");
      this.status.setAttribute("aria-live", error ? "assertive" : "polite");
    }
    this.status.hidden = this.flowView === "local" || !text;
  }

  private fail(error: unknown): void {
    this.setStatus(error instanceof Error ? error.message : "Pairing failed.", "error");
  }
}

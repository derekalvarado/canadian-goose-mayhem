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
  loadOrCreateFamilyDeviceId,
  loadStoredFamilyPairing,
  normalizeFamilyPlayerName,
  pairingWithUpdatedDevices,
  parseFamilyPairingCode,
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
const HOST_HEARTBEAT_MS = 10_000;
const JOIN_REFRESH_MS = 60_000;

export interface MultiplayerMenuOptions {
  readonly onOpenChange?: (open: boolean) => void;
  readonly onLocalStart?: () => void;
  readonly onConnected?: (role: MultiplayerRole, peer: WebRtcPeer, identity: MultiplayerConnectionIdentity) => void;
  readonly onDisconnected?: (role: MultiplayerRole) => void;
  readonly onMessage?: (role: MultiplayerRole, message: string) => void;
}

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing multiplayer interface element: ${selector}`);
  return element;
}

export class MultiplayerMenu {
  private readonly menu = required<HTMLElement>("#multiplayer-menu");
  private readonly status = required<HTMLElement>("#multiplayer-status");
  private readonly hostButton = required<HTMLButtonElement>("#multiplayer-host");
  private readonly joinButton = required<HTMLButtonElement>("#multiplayer-family-join");
  private readonly pairedPanel = required<HTMLElement>("#multiplayer-family-paired");
  private readonly pairedLabel = required<HTMLElement>("#multiplayer-family-label");
  private readonly pairDifferentButton = required<HTMLButtonElement>("#multiplayer-pair-different");
  private readonly setupPanel = required<HTMLElement>("#multiplayer-family-setup");
  private readonly setupName = required<HTMLInputElement>("#multiplayer-family-name");
  private readonly createCodeButton = required<HTMLButtonElement>("#multiplayer-family-create");
  private readonly codeInput = required<HTMLInputElement>("#multiplayer-family-code");
  private readonly requestPairingButton = required<HTMLButtonElement>("#multiplayer-family-request");
  private readonly codePanel = required<HTMLElement>("#multiplayer-code-panel");
  private readonly codeDisplay = required<HTMLElement>("#multiplayer-family-code-display");
  private readonly cancelCodeButton = required<HTMLButtonElement>("#multiplayer-family-cancel");
  private readonly approvalPanel = required<HTMLElement>("#multiplayer-approval");
  private readonly approvalQuestion = required<HTMLElement>("#multiplayer-approval-question");
  private readonly approveButton = required<HTMLButtonElement>("#multiplayer-family-approve");
  private readonly denyButton = required<HTMLButtonElement>("#multiplayer-family-deny");
  private readonly replacementNote = required<HTMLElement>("#multiplayer-replacement-note");
  private readonly localButton = required<HTMLButtonElement>("#multiplayer-local");
  private readonly openButton = required<HTMLButtonElement>("#multiplayer-button");
  private readonly closeButton = required<HTMLButtonElement>("#multiplayer-close");
  private readonly settingsPairing = required<HTMLElement>("#settings-family-pairing");
  private readonly settingsPeer = required<HTMLElement>("#settings-family-peer");
  private readonly settingsName = required<HTMLInputElement>("#settings-family-name");
  private readonly settingsSaveName = required<HTMLButtonElement>("#settings-family-save-name");
  private readonly settingsFamilyStatus = required<HTMLElement>("#settings-family-status");
  private readonly settingsForget = required<HTMLButtonElement>("#settings-family-forget");

  private readonly deviceId = loadOrCreateFamilyDeviceId();
  private readonly familyClient = ROOM_SIGNALING_URL ? new FamilyPairingClient(ROOM_SIGNALING_URL) : undefined;
  private pairing = loadStoredFamilyPairing();
  private showReplacementSetup = false;
  private codeSession?: PairingCodeSession;
  private joinSession?: PairingJoinSession;
  private pendingCandidate?: FamilyDeviceIdentity;
  private setupPollTimer?: number;
  private setupPollRunning = false;
  private familyMode?: "host" | "join";
  private presencePollTimer?: number;
  private heartbeatTimer?: number;
  private presencePollRunning = false;
  private joinRequestId?: string;
  private joinRefreshAt = 0;
  private handledJoinRequestId?: string;
  private familyRoomOpening = false;
  private familyRoomJoining = false;

  private peer?: WebRtcPeer;
  private role?: MultiplayerRole;
  private sessionId?: string;
  private reconnectToken?: string;
  private roomSignaling?: RoomSignalingClient;
  private peerConnected = false;

  constructor(private readonly options: MultiplayerMenuOptions = {}) {
    this.openButton.addEventListener("click", this.open);
    this.closeButton.addEventListener("click", this.close);
    this.hostButton.addEventListener("click", () => { void this.startFamilyHost(); });
    this.joinButton.addEventListener("click", () => { void this.startFamilyJoin(); });
    this.pairDifferentButton.addEventListener("click", this.showReplacementPairing);
    this.createCodeButton.addEventListener("click", () => { void this.startPairingCode(); });
    this.requestPairingButton.addEventListener("click", () => { void this.requestFamilyPairing(); });
    this.cancelCodeButton.addEventListener("click", () => { void this.cancelPairingSetup(); });
    this.approveButton.addEventListener("click", () => { void this.approveFamilyPairing(); });
    this.denyButton.addEventListener("click", () => { void this.denyFamilyPairing(); });
    this.localButton.addEventListener("click", () => { this.stopFamilyPresence(true); this.options.onLocalStart?.(); this.close(); });
    this.settingsSaveName.addEventListener("click", () => { void this.updateFamilyName(); });
    this.settingsForget.addEventListener("click", () => { void this.forgetFamilyPairing(); });
    this.codeInput.addEventListener("input", () => {
      this.codeInput.value = this.codeInput.value.replace(/\D/gu, "").slice(0, 4);
    });
    window.addEventListener("pagehide", this.releaseFamilyHost, { once: true });
    this.updateFamilyUi();

    if (!ROOM_SIGNALING_URL) {
      this.createCodeButton.disabled = true;
      this.requestPairingButton.disabled = true;
      this.status.textContent = "Online pairing is not configured in this build. Local two-controller play is still available.";
    }
  }

  get connectedRole(): MultiplayerRole | undefined { return this.role; }
  send(message: string): boolean { return this.peer?.send(message) ?? false; }

  private readonly open = (): void => {
    this.menu.hidden = false;
    this.options.onOpenChange?.(true);
    if (this.pairing && this.familyClient) void this.refreshFamilyStatus();
    this.closeButton.focus({ preventScroll: true });
  };

  private readonly close = (): void => {
    this.menu.hidden = true;
    this.options.onOpenChange?.(false);
    this.openButton.focus({ preventScroll: true });
  };

  private updateFamilyUi(): void {
    const pairing = this.pairing;
    this.pairedPanel.hidden = !pairing;
    this.setupPanel.hidden = Boolean(pairing && !this.showReplacementSetup);
    this.replacementNote.hidden = !pairing;
    this.pairDifferentButton.hidden = this.showReplacementSetup;
    this.settingsPairing.hidden = !pairing;
    if (pairing) {
      this.pairedLabel.textContent = `Paired with ${pairing.peerName}`;
      this.hostButton.textContent = "Host game";
      this.joinButton.textContent = `Join ${pairing.peerName}`;
      this.settingsPeer.textContent = `This device is paired with ${pairing.peerName}.`;
      if (document.activeElement !== this.setupName) this.setupName.value = pairing.selfName;
      if (document.activeElement !== this.settingsName) this.settingsName.value = pairing.selfName;
    } else {
      const savedName = loadFamilyPlayerName();
      if (document.activeElement !== this.setupName) this.setupName.value = savedName;
      this.settingsName.value = savedName;
      this.settingsFamilyStatus.textContent = "";
    }
  }

  private readonly showReplacementPairing = (): void => {
    this.showReplacementSetup = true;
    this.updateFamilyUi();
    this.status.textContent = "Use a new code only when both players are ready. The new pairing will replace this one.";
    this.setupName.focus({ preventScroll: true });
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
      this.codePanel.hidden = false;
      this.approvalPanel.hidden = true;
      this.status.textContent = "Enter this code on the other device, then approve the player here.";
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
      this.status.textContent = "Pairing request sent. Ask the other player to approve it.";
      this.startSetupPolling();
    } catch (error) {
      this.fail(error);
    } finally {
      this.requestPairingButton.disabled = false;
    }
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
      if (result.state === "paired" && result.pairing) {
        await this.completeFamilyPairing(result.pairing);
      } else if (creatorSession && result.state === "approval-needed" && result.candidate) {
        this.pendingCandidate = result.candidate;
        this.approvalQuestion.textContent = `Pair with ${result.candidate.name}?`;
        this.codePanel.hidden = true;
        this.approvalPanel.hidden = false;
        this.status.textContent = `${result.candidate.name} entered your code. Only approve if they are beside you.`;
      } else if (result.state === "denied") {
        this.stopSetupPolling();
        this.joinSession = undefined;
        this.status.textContent = "The other player did not approve this pairing request.";
      } else if (result.state === "expired") {
        this.stopPairingSetupUi();
        this.status.textContent = "That pairing code expired. Make a new one and try again.";
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
      await this.completeFamilyPairing(result.pairing);
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
      this.status.textContent = "Request denied. The code still works until it expires or you cancel it.";
    } catch (error) {
      this.fail(error);
    } finally {
      this.denyButton.disabled = false;
    }
  }

  private async completeFamilyPairing(credential: FamilyPairingCredential): Promise<void> {
    const nextPairing = familyPairingForDevice(credential, this.deviceId);
    const previousPairing = this.pairing;
    saveStoredFamilyPairing(nextPairing);
    this.pairing = nextPairing;
    this.stopPairingSetupUi();
    this.showReplacementSetup = false;
    this.updateFamilyUi();
    this.status.textContent = `Paired with ${nextPairing.peerName}. Either player can host now.`;
    if (previousPairing && previousPairing.pairId !== nextPairing.pairId && this.familyClient) {
      try { await this.familyClient.forget(previousPairing); } catch { /* The new pairing is already safely stored. */ }
    }
  }

  private async cancelPairingSetup(): Promise<void> {
    await this.abandonPairingSetup();
    this.stopPairingSetupUi();
    if (this.pairing) {
      this.showReplacementSetup = false;
      this.updateFamilyUi();
      this.status.textContent = `Still paired with ${this.pairing.peerName}.`;
    } else {
      this.status.textContent = "Pair these two devices once. After that, either player can host.";
    }
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
    this.codeSession = undefined;
    this.joinSession = undefined;
    this.pendingCandidate = undefined;
    this.codePanel.hidden = true;
    this.approvalPanel.hidden = true;
  }

  private stopSetupPolling(): void {
    if (this.setupPollTimer !== undefined) window.clearInterval(this.setupPollTimer);
    this.setupPollTimer = undefined;
  }

  private async refreshFamilyStatus(): Promise<void> {
    if (!this.familyClient || !this.pairing || this.familyMode) return;
    try {
      const status = await this.familyClient.pairStatus(this.pairing);
      this.syncPairingNames(status);
    } catch (error) {
      this.handleFamilyError(error);
    }
  }

  private async startFamilyHost(): Promise<void> {
    const pairing = this.pairing;
    if (!this.familyClient || !pairing) return this.fail(new Error("Pair this device with the other player first."));
    if (this.familyMode === "host") {
      this.status.textContent = `This device is already hosting. Waiting for ${pairing.peerName} to join…`;
      return;
    }
    this.stopFamilyPresence(true);
    this.closePeer();
    this.hostButton.disabled = true;
    this.status.textContent = `Starting ${pairing.selfName}'s game…`;
    try {
      const pairStatus = await this.familyClient.claimHost(pairing);
      this.familyMode = "host";
      this.handledJoinRequestId = undefined;
      this.syncPairingNames(pairStatus);
      this.startHostPresence();
      this.status.textContent = `Hosting. Waiting for ${this.pairing?.peerName ?? "the other player"} to join…`;
      await this.handleHostStatus(pairStatus);
    } catch (error) {
      if (error instanceof FamilyPairingServiceError && error.code === "already-hosting") {
        this.status.textContent = `${error.hostName ?? pairing.peerName} is already hosting. Joining their game…`;
        await this.startFamilyJoin();
      } else {
        this.handleFamilyError(error);
      }
    } finally {
      this.hostButton.disabled = false;
    }
  }

  private startHostPresence(): void {
    if (this.presencePollTimer !== undefined) window.clearInterval(this.presencePollTimer);
    if (this.heartbeatTimer !== undefined) window.clearInterval(this.heartbeatTimer);
    this.presencePollTimer = window.setInterval(() => { void this.pollFamilyHost(); }, PRESENCE_POLL_MS);
    this.heartbeatTimer = window.setInterval(() => { void this.heartbeatFamilyHost(); }, HOST_HEARTBEAT_MS);
  }

  private async heartbeatFamilyHost(): Promise<void> {
    if (this.familyMode !== "host" || !this.pairing || !this.familyClient) return;
    try {
      const status = await this.familyClient.heartbeatHost(this.pairing);
      this.syncPairingNames(status);
    } catch (error) {
      this.stopFamilyPresence(false);
      this.handleFamilyError(error);
    }
  }

  private async pollFamilyHost(): Promise<void> {
    if (this.familyMode !== "host" || !this.pairing || !this.familyClient || this.presencePollRunning) return;
    this.presencePollRunning = true;
    try {
      await this.handleHostStatus(await this.familyClient.pairStatus(this.pairing));
    } catch (error) {
      this.handleFamilyError(error);
    } finally {
      this.presencePollRunning = false;
    }
  }

  private async handleHostStatus(status: FamilyPairStatus): Promise<void> {
    this.syncPairingNames(status);
    if (!this.pairing || status.activeHost?.deviceId !== this.pairing.deviceId) {
      this.stopFamilyPresence(false);
      this.status.textContent = "This device is no longer hosting. Tap Host game to try again.";
      return;
    }
    const request = status.joinRequest;
    if (request && request.deviceId === this.pairing.peerDeviceId && request.requestId !== this.handledJoinRequestId) {
      await this.openFamilyRoom(request.requestId);
    } else if (!this.peerConnected && !this.familyRoomOpening && !request) {
      this.status.textContent = `Hosting. Waiting for ${this.pairing.peerName} to join…`;
    }
  }

  private async openFamilyRoom(requestId: string): Promise<void> {
    if (this.familyRoomOpening || !this.familyClient || !this.pairing || this.familyMode !== "host") return;
    this.familyRoomOpening = true;
    this.status.textContent = `${this.pairing.peerName} is joining. Opening a private room…`;
    try {
      const invitation = await this.createHostedRoom();
      await this.familyClient.publishRoom(this.pairing, requestId, invitation);
      this.handledJoinRequestId = requestId;
      this.status.textContent = `Room ready. Connecting ${this.pairing.peerName}…`;
    } catch (error) {
      this.handleFamilyError(error);
    } finally {
      this.familyRoomOpening = false;
    }
  }

  private async startFamilyJoin(): Promise<void> {
    const pairing = this.pairing;
    if (!this.familyClient || !pairing) return this.fail(new Error("Pair this device with the other player first."));
    const wasHosting = this.familyMode === "host";
    this.stopFamilyPresence(false);
    this.closePeer();
    this.joinButton.disabled = true;
    try {
      if (wasHosting) await this.familyClient.releaseHost(pairing);
      this.familyMode = "join";
      this.joinRequestId = createFamilyToken();
      this.joinRefreshAt = Date.now() + JOIN_REFRESH_MS;
      const status = await this.familyClient.requestJoin(pairing, this.joinRequestId);
      this.syncPairingNames(status);
      this.describeJoinWait(status);
      this.presencePollTimer = window.setInterval(() => { void this.pollFamilyJoin(); }, PRESENCE_POLL_MS);
      await this.handleJoinStatus(status);
    } catch (error) {
      this.stopFamilyPresence(false);
      this.handleFamilyError(error);
    } finally {
      this.joinButton.disabled = false;
    }
  }

  private async pollFamilyJoin(): Promise<void> {
    if (this.familyMode !== "join" || !this.pairing || !this.familyClient || !this.joinRequestId || this.presencePollRunning) return;
    this.presencePollRunning = true;
    try {
      if (Date.now() >= this.joinRefreshAt) {
        await this.familyClient.requestJoin(this.pairing, this.joinRequestId);
        this.joinRefreshAt = Date.now() + JOIN_REFRESH_MS;
      }
      await this.handleJoinStatus(await this.familyClient.pairStatus(this.pairing, this.joinRequestId));
    } catch (error) {
      this.handleFamilyError(error);
    } finally {
      this.presencePollRunning = false;
    }
  }

  private async handleJoinStatus(status: FamilyPairStatus): Promise<void> {
    this.syncPairingNames(status);
    if (!this.pairing || !this.joinRequestId || this.familyRoomJoining || this.peerConnected) return;
    if (status.room?.requestId === this.joinRequestId && status.room.hostDeviceId === this.pairing.peerDeviceId) {
      this.familyRoomJoining = true;
      this.status.textContent = `Found ${this.pairing.peerName}'s game. Connecting…`;
      try {
        await this.joinRoom(status.room.invitation);
        if (this.presencePollTimer !== undefined) window.clearInterval(this.presencePollTimer);
        this.presencePollTimer = undefined;
      } catch (error) {
        this.familyRoomJoining = false;
        throw error;
      }
    } else {
      this.describeJoinWait(status);
    }
  }

  private describeJoinWait(status: FamilyPairStatus): void {
    if (!this.pairing) return;
    this.status.textContent = status.activeHost?.deviceId === this.pairing.peerDeviceId
      ? `${this.pairing.peerName} is hosting. Preparing the connection…`
      : `Waiting for ${this.pairing.peerName} to tap Host game. You can leave this screen open.`;
  }

  private stopFamilyPresence(releaseHost: boolean): void {
    const wasHosting = this.familyMode === "host";
    const pairing = this.pairing;
    if (this.presencePollTimer !== undefined) window.clearInterval(this.presencePollTimer);
    if (this.heartbeatTimer !== undefined) window.clearInterval(this.heartbeatTimer);
    this.presencePollTimer = undefined;
    this.heartbeatTimer = undefined;
    this.familyMode = undefined;
    this.joinRequestId = undefined;
    this.handledJoinRequestId = undefined;
    this.familyRoomOpening = false;
    this.familyRoomJoining = false;
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
      this.status.textContent = `Your player name is now ${name}.`;
    } catch (error) {
      this.settingsFamilyStatus.textContent = error instanceof Error ? error.message : "The player name could not be saved.";
      this.fail(error);
    } finally {
      this.settingsSaveName.disabled = false;
    }
  }

  private async forgetFamilyPairing(): Promise<void> {
    const pairing = this.pairing;
    if (!pairing || !window.confirm(`Forget ${pairing.peerName} as the paired player? Both devices will need a new code.`)) return;
    this.settingsForget.disabled = true;
    this.stopFamilyPresence(true);
    this.closePeer();
    try {
      if (this.familyClient) await this.familyClient.forget(pairing);
    } catch { /* Clear this device even if the old pairing is already gone. */ }
    clearStoredFamilyPairing();
    this.pairing = undefined;
    this.showReplacementSetup = false;
    this.updateFamilyUi();
    this.status.textContent = "Paired player forgotten. Open Play together to pair again.";
    this.settingsForget.disabled = false;
  }

  private handleFamilyError(error: unknown): void {
    if (error instanceof FamilyPairingServiceError && error.code === "pairing-missing") {
      this.stopFamilyPresence(false);
      clearStoredFamilyPairing();
      this.pairing = undefined;
      this.showReplacementSetup = false;
      this.updateFamilyUi();
      this.status.textContent = "This pairing was forgotten on the other device. Pair the devices again.";
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
    this.status.textContent = "Opening a private room…";
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
    this.status.textContent = "Joining the private room…";
    try {
      this.roomSignaling = this.createRoomSignaling("guest", invitation);
      await this.roomSignaling.connect();
      this.status.textContent = "Found the room. Waiting for the host…";
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  private createRoomSignaling(role: MultiplayerRole, invitation: RoomInvitation): RoomSignalingClient {
    return new RoomSignalingClient({
      serviceUrl: ROOM_SIGNALING_URL!,
      invitation,
      role,
      onMessage: (message) => { void this.handleRoomSignal(role, message); },
      onClose: () => {
        if (!this.peerConnected) this.status.textContent = "The private room closed before the geese connected.";
      },
    });
  }

  private async handleRoomSignal(role: MultiplayerRole, message: RoomSignalMessage): Promise<void> {
    try {
      if (message.type === "error") throw new Error(message.message);
      if (role === "guest" && message.type === "offer") {
        this.peer?.close();
        this.peer = this.createPeer("guest");
        this.status.textContent = "Connecting to the host…";
        const description = await this.peer.acceptOfferAndCreateAnswer(message.description);
        if (description.type !== "answer" || !description.sdp) throw new Error("WebRTC did not create a guest answer.");
        this.roomSignaling?.sendDescription({ type: "answer", sdp: description.sdp });
      } else if (role === "host" && message.type === "answer") {
        if (!this.peer) throw new Error("The host connection is no longer open.");
        this.status.textContent = "Goose 2 found the room. Connecting…";
        await this.peer.acceptGuestAnswer(message.description);
      } else if (message.type === "peer-left" && !this.peerConnected) {
        this.status.textContent = message.role === "host" ? "The host left the room." : "Goose 2 left before connecting.";
      }
    } catch (error) { this.fail(error); }
  }

  private createPeer(role: MultiplayerRole): WebRtcPeer {
    return new WebRtcPeer({
      onStatus: (status) => this.handlePeerStatus(role, status),
      onMessage: (message) => this.options.onMessage?.(role, message),
    });
  }

  private handlePeerStatus(role: MultiplayerRole, status: WebRtcPeerStatus): void {
    if (status === "connected") {
      this.peerConnected = true;
      const peerName = this.pairing?.peerName;
      this.status.textContent = role === "host"
        ? `${peerName ?? "Goose 2"} connected.`
        : `Connected to ${peerName ?? "the host"} as Goose 2.`;
      if (this.sessionId && this.reconnectToken) {
        this.options.onConnected?.(role, this.peer!, { sessionId: this.sessionId, reconnectToken: this.reconnectToken });
      }
      this.close();
    } else if (status === "disconnected" || status === "failed") {
      this.peerConnected = false;
      if (this.familyMode === "host") {
        this.status.textContent = `${this.pairing?.peerName ?? "Goose 2"} disconnected. Their goose will stand still until they rejoin.`;
      } else if (this.familyMode === "join") {
        this.status.textContent = `Connection lost. Open Play together and tap Join ${this.pairing?.peerName ?? "host"} to reconnect.`;
        this.open();
      } else {
        this.status.textContent = "Connection lost. Open Play together to reconnect.";
        if (role === "guest") this.open();
      }
      this.options.onDisconnected?.(role);
    }
  }

  private closePeer(): void {
    this.peer?.close();
    this.peer = undefined;
    this.roomSignaling?.close();
    this.roomSignaling = undefined;
    this.peerConnected = false;
  }

  private fail(error: unknown): void {
    this.status.textContent = error instanceof Error ? error.message : "Pairing could not be completed.";
  }
}

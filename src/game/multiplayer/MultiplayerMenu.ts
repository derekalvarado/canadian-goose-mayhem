import { toCanvas } from "qrcode";
import { WebRtcPeer, type WebRtcPeerStatus } from "./WebRtcPeer.ts";
import {
  RoomSignalingClient,
  roomInvitationFromUrl,
  roomInvitationUrl,
  type RoomInvitation,
} from "./RoomSignalingClient.ts";
import type { RoomSignalMessage } from "./roomSignalingProtocol.ts";
import {
  createPairingToken,
  decodeManualSignal,
  pairingUrl,
  PAIRING_ANSWER_CHANNEL,
  pendingAnswerStorageKey,
  signalFromUrl,
  type ManualSignal,
} from "./signaling.ts";

export type MultiplayerRole = "host" | "guest";
export interface MultiplayerConnectionIdentity { readonly sessionId: string; readonly reconnectToken: string }

const ROOM_SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL?.trim() as string | undefined;

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
  private readonly manualHostButton = required<HTMLButtonElement>("#multiplayer-manual-host");
  private readonly manualFallback = required<HTMLDetailsElement>("#multiplayer-manual-fallback");
  private readonly localButton = required<HTMLButtonElement>("#multiplayer-local");
  private readonly useLinkButton = required<HTMLButtonElement>("#multiplayer-use-link");
  private readonly input = required<HTMLTextAreaElement>("#multiplayer-link-input");
  private readonly sharePanel = required<HTMLElement>("#multiplayer-share-panel");
  private readonly shareInstruction = required<HTMLElement>("#multiplayer-share-instruction");
  private readonly shareLink = required<HTMLTextAreaElement>("#multiplayer-share-link");
  private readonly shareButton = required<HTMLButtonElement>("#multiplayer-share");
  private readonly copyButton = required<HTMLButtonElement>("#multiplayer-copy");
  private readonly qrCanvas = required<HTMLCanvasElement>("#multiplayer-qr");
  private readonly openButton = required<HTMLButtonElement>("#multiplayer-button");
  private readonly closeButton = required<HTMLButtonElement>("#multiplayer-close");
  private peer?: WebRtcPeer;
  private role?: MultiplayerRole;
  private sessionId?: string;
  private reconnectToken?: string;
  private pendingJoin?: ManualSignal;
  private answerChannel?: BroadcastChannel;
  private roomSignaling?: RoomSignalingClient;
  private peerConnected = false;

  constructor(private readonly options: MultiplayerMenuOptions = {}) {
    this.openButton.addEventListener("click", this.open);
    this.closeButton.addEventListener("click", this.close);
    this.hostButton.addEventListener("click", () => { void (ROOM_SIGNALING_URL ? this.startRoomHost() : this.startManualHost()); });
    this.manualHostButton.addEventListener("click", () => { void this.startManualHost(); });
    this.localButton.addEventListener("click", () => { this.options.onLocalStart?.(); this.close(); });
    this.useLinkButton.addEventListener("click", () => { void this.usePairingLink(); });
    this.shareButton.addEventListener("click", () => { void this.shareCurrentLink(); });
    this.copyButton.addEventListener("click", () => { void this.copyCurrentLink(); });
    document.addEventListener("visibilitychange", this.consumeStoredAnswer);
    this.input.addEventListener("input", () => { this.pendingJoin = undefined; this.useLinkButton.textContent = "Use pairing link"; });

    try {
      const roomInvitation = roomInvitationFromUrl(window.location.href);
      if (roomInvitation) {
        this.prepareGuestMenu("Joining the host as Goose 2…");
        if (!ROOM_SIGNALING_URL) throw new Error("Online rooms are not configured in this build.");
        void this.joinRoom(roomInvitation);
        return;
      }
      const inbound = signalFromUrl(window.location.href);
      if (inbound?.mode === "join") {
        this.pendingJoin = inbound.signal;
        this.hostButton.hidden = true;
        this.localButton.hidden = true;
        this.status.textContent = "Ready to join the nearby host as Goose 2.";
        this.open();
        this.manualFallback.open = true;
        this.useLinkButton.textContent = "Join host game";
      }
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : "This pairing link is damaged.";
      this.open();
    }
    if (!ROOM_SIGNALING_URL) {
      this.hostButton.textContent = "Host this game (manual setup)";
      this.manualHostButton.hidden = true;
      this.manualFallback.open = true;
    }
  }

  get connectedRole(): MultiplayerRole | undefined { return this.role; }
  send(message: string): boolean { return this.peer?.send(message) ?? false; }

  private readonly open = (): void => {
    this.menu.hidden = false;
    this.options.onOpenChange?.(true);
    this.closeButton.focus({ preventScroll: true });
  };

  private readonly close = (): void => {
    this.menu.hidden = true;
    this.options.onOpenChange?.(false);
    this.openButton.focus({ preventScroll: true });
  };

  private async startRoomHost(): Promise<void> {
    this.closePeer();
    this.role = "host";
    const invitation: RoomInvitation = {
      roomId: createPairingToken(16),
      reconnectToken: createPairingToken(16),
    };
    this.sessionId = invitation.roomId;
    this.reconnectToken = invitation.reconnectToken;
    this.status.textContent = "Opening a private room…";
    this.hostButton.disabled = true;
    try {
      this.roomSignaling = this.createRoomSignaling("host", invitation);
      await this.roomSignaling.connect();
      await this.showShareLink(
        roomInvitationUrl(window.location.href, invitation),
        "Player 2 only needs to open this link. Keep this game open.",
      );
      this.peer = this.createPeer("host");
      const description = await this.peer.createHostOffer();
      if (description.type !== "offer" || !description.sdp) throw new Error("WebRTC did not create a host offer.");
      this.roomSignaling.sendDescription({ type: "offer", sdp: description.sdp });
      this.status.textContent = "Waiting for Goose 2 to open the link…";
      this.hostButton.textContent = "Create a new room";
    } catch (error) {
      this.fail(error);
      this.roomSignaling?.close();
      this.roomSignaling = undefined;
    } finally {
      this.hostButton.disabled = false;
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
    } catch (error) { this.fail(error); }
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

  private prepareGuestMenu(status: string): void {
    this.hostButton.hidden = true;
    this.localButton.hidden = true;
    this.manualFallback.hidden = true;
    this.status.textContent = status;
    this.open();
  }

  private async startManualHost(): Promise<void> {
    this.closePeer();
    this.role = "host";
    this.sessionId ??= createPairingToken(12);
    this.reconnectToken ??= createPairingToken(16);
    this.status.textContent = "Preparing a private nearby link…";
    this.hostButton.disabled = true;
    this.hostButton.hidden = false;
    try {
      this.peer = this.createPeer("host");
      const description = await this.peer.createHostOffer();
      const signal: ManualSignal = { version: 1, sessionId: this.sessionId, reconnectToken: this.reconnectToken, description };
      await this.showShareLink(pairingUrl(window.location.href, "join", signal), "Send this link to Goose 2. Then keep this game open.");
      this.status.textContent = "Waiting for Goose 2's response…";
      this.hostButton.textContent = "Create a new reconnect link";
      this.hostButton.disabled = false;
      this.watchForAnswer();
    } catch (error) {
      this.fail(error);
      this.hostButton.disabled = false;
    }
  }

  private async usePairingLink(): Promise<void> {
    try {
      const inbound = this.pendingJoin ? { mode: "join" as const, signal: this.pendingJoin } : signalFromUrl(this.input.value.trim());
      if (!inbound) throw new Error("Paste the complete pairing link first.");
      if (inbound.mode === "join") await this.joinHost(inbound.signal);
      else await this.acceptAnswer(inbound.signal);
    } catch (error) { this.fail(error); }
  }

  private async joinHost(signal: ManualSignal): Promise<void> {
    if (signal.description.type !== "offer") throw new Error("This is not a host invitation.");
    this.closePeer();
    this.role = "guest";
    this.sessionId = signal.sessionId;
    this.reconnectToken = signal.reconnectToken;
    this.status.textContent = "Preparing Goose 2's response…";
    this.useLinkButton.disabled = true;
    this.peer = this.createPeer("guest");
    const description = await this.peer.acceptOfferAndCreateAnswer(signal.description);
    const answer: ManualSignal = { version: 1, sessionId: signal.sessionId, reconnectToken: signal.reconnectToken, description };
    await this.showShareLink(pairingUrl(window.location.href, "answer", answer), "Send this response back to the host iPad.");
    this.status.textContent = "Response ready. Share it back, then keep this game open.";
    this.useLinkButton.disabled = false;
  }

  private async acceptAnswer(signal: ManualSignal): Promise<void> {
    if (this.role !== "host" || !this.peer || !this.sessionId || !this.reconnectToken) throw new Error("Start hosting in the original game before using a response.");
    if (signal.description.type !== "answer" || signal.sessionId !== this.sessionId || signal.reconnectToken !== this.reconnectToken) {
      throw new Error("That response belongs to a different host link.");
    }
    await this.peer.acceptGuestAnswer(signal.description);
    try { window.localStorage.removeItem(pendingAnswerStorageKey(signal.sessionId)); } catch { /* Storage is optional. */ }
    this.status.textContent = "Response accepted. Connecting to Goose 2…";
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
      this.status.textContent = role === "host" ? "Goose 2 connected." : "Connected to the host as Goose 2.";
      this.sharePanel.hidden = true;
      if (this.sessionId && this.reconnectToken) {
        this.options.onConnected?.(role, this.peer!, { sessionId: this.sessionId, reconnectToken: this.reconnectToken });
      }
      this.close();
    } else if (status === "disconnected" || status === "failed") {
      this.peerConnected = false;
      this.status.textContent = role === "host"
        ? "Goose 2 disconnected. They will stand still; create a reconnect link when ready."
        : "Connection to the host was lost.";
      if (role === "host") this.hostButton.hidden = false;
      this.options.onDisconnected?.(role);
    }
  }

  private async showShareLink(link: string, instruction: string): Promise<void> {
    this.shareInstruction.textContent = instruction;
    this.shareLink.value = link;
    this.sharePanel.hidden = false;
    this.shareButton.hidden = typeof navigator.share !== "function";
    try {
      await toCanvas(this.qrCanvas, link, { errorCorrectionLevel: "L", margin: 2, width: 300 });
      this.qrCanvas.hidden = false;
    } catch {
      this.qrCanvas.hidden = true;
      this.status.textContent = "The pairing link is ready, but it is too large for a QR code. Use Share or Copy.";
    }
  }

  private async shareCurrentLink(): Promise<void> {
    if (!this.shareLink.value || typeof navigator.share !== "function") return;
    try { await navigator.share({ title: "Goose Game Two", text: this.shareInstruction.textContent ?? "Pair with my game", url: this.shareLink.value }); }
    catch { /* Cancelling the native share sheet changes nothing. */ }
  }

  private async copyCurrentLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareLink.value);
      this.copyButton.textContent = "Copied";
      window.setTimeout(() => { this.copyButton.textContent = "Copy link"; }, 1_500);
    } catch {
      this.shareLink.hidden = false;
      this.shareLink.select();
      this.status.textContent = "Copy the selected pairing link.";
    }
  }

  private watchForAnswer(): void {
    this.answerChannel?.close();
    if (typeof BroadcastChannel !== "undefined") {
      this.answerChannel = new BroadcastChannel(PAIRING_ANSWER_CHANNEL);
      this.answerChannel.addEventListener("message", this.receiveBroadcastAnswer);
    }
    this.consumeStoredAnswer();
  }

  private readonly receiveBroadcastAnswer = (event: MessageEvent<unknown>): void => {
    if (typeof event.data !== "string") return;
    void this.acceptEncodedAnswer(event.data);
  };

  private readonly consumeStoredAnswer = (): void => {
    if (!this.sessionId || this.role !== "host") return;
    try {
      const encoded = window.localStorage.getItem(pendingAnswerStorageKey(this.sessionId));
      if (encoded) void this.acceptEncodedAnswer(encoded);
    } catch { /* Paste remains available when storage is blocked. */ }
  };

  private async acceptEncodedAnswer(encoded: string): Promise<void> {
    try { await this.acceptAnswer(decodeManualSignal(encoded)); }
    catch (error) { this.fail(error); }
  }

  private closePeer(): void {
    this.peer?.close();
    this.peer = undefined;
    this.roomSignaling?.close();
    this.roomSignaling = undefined;
    this.peerConnected = false;
    this.answerChannel?.close();
    this.answerChannel = undefined;
  }

  private fail(error: unknown): void {
    this.status.textContent = error instanceof Error ? error.message : "Pairing could not be completed.";
  }
}

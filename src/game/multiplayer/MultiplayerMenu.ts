import { toCanvas } from "qrcode";
import { WebRtcPeer, type WebRtcPeerStatus } from "./WebRtcPeer.ts";
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

export interface MultiplayerMenuOptions {
  readonly onOpenChange?: (open: boolean) => void;
  readonly onLocalStart?: () => void;
  readonly onConnected?: (role: MultiplayerRole, peer: WebRtcPeer) => void;
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

  constructor(private readonly options: MultiplayerMenuOptions = {}) {
    this.openButton.addEventListener("click", this.open);
    this.closeButton.addEventListener("click", this.close);
    this.hostButton.addEventListener("click", () => { void this.startHost(); });
    this.localButton.addEventListener("click", () => { this.options.onLocalStart?.(); this.close(); });
    this.useLinkButton.addEventListener("click", () => { void this.usePairingLink(); });
    this.shareButton.addEventListener("click", () => { void this.shareCurrentLink(); });
    this.copyButton.addEventListener("click", () => { void this.copyCurrentLink(); });
    document.addEventListener("visibilitychange", this.consumeStoredAnswer);
    this.input.addEventListener("input", () => { this.pendingJoin = undefined; this.useLinkButton.textContent = "Use pairing link"; });

    try {
      const inbound = signalFromUrl(window.location.href);
      if (inbound?.mode === "join") {
        this.pendingJoin = inbound.signal;
        this.hostButton.hidden = true;
        this.localButton.hidden = true;
        this.input.hidden = true;
        this.useLinkButton.textContent = "Join host game";
        this.status.textContent = "Ready to join the nearby host as Goose 2.";
        this.open();
      }
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : "This pairing link is damaged.";
      this.open();
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

  private async startHost(): Promise<void> {
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
      this.status.textContent = role === "host" ? "Goose 2 connected." : "Connected to the host as Goose 2.";
      this.sharePanel.hidden = true;
      this.options.onConnected?.(role, this.peer!);
    } else if (status === "disconnected" || status === "failed") {
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
    this.answerChannel?.close();
    this.answerChannel = undefined;
  }

  private fail(error: unknown): void {
    this.status.textContent = error instanceof Error ? error.message : "Pairing could not be completed.";
  }
}

import { PeerStatusTracker, type PeerStatus, type PeerTransportEvent } from "./peerStatus.ts";

export type WebRtcPeerStatus = PeerStatus;

export interface WebRtcPeerOptions {
  readonly iceServers?: readonly RTCIceServer[];
  readonly iceGatheringTimeoutMs?: number;
  readonly onStatus?: (status: WebRtcPeerStatus) => void;
  readonly onMessage?: (message: string) => void;
}

const DEFAULT_ICE_TIMEOUT_MS = 12_000;

/**
 * Data-channel transport only. The Cloudflare room adapter moves offers and
 * answers between paired browsers before gameplay goes peer to peer.
 */
export class WebRtcPeer {
  private readonly connection: RTCPeerConnection;
  private readonly tracker = new PeerStatusTracker();
  private channel?: RTCDataChannel;
  private closed = false;

  constructor(private readonly options: WebRtcPeerOptions = {}) {
    // No third-party ICE service is silently assumed. Host candidates support
    // the intended nearby/same-network play; a future server can inject STUN/TURN.
    this.connection = new RTCPeerConnection({ iceServers: [...(options.iceServers ?? [])] });
    this.connection.addEventListener("connectionstatechange", () => {
      this.forward({ type: "connection-state", state: this.connection.connectionState });
    });
  }

  /** True once game messages could flow, so a later loss means "lost" rather than "never reached". */
  get everConnected(): boolean { return this.tracker.everConnected; }

  async createHostOffer(): Promise<RTCSessionDescriptionInit> {
    this.ensureOpen();
    this.attachChannel(this.connection.createDataChannel("goose-game", { ordered: true }));
    await this.connection.setLocalDescription(await this.connection.createOffer());
    await this.waitForIceGathering();
    if (!this.connection.localDescription) throw new Error("WebRTC did not create a host offer.");
    return this.connection.localDescription.toJSON();
  }

  async acceptOfferAndCreateAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    this.ensureOpen();
    this.connection.addEventListener("datachannel", (event) => this.attachChannel(event.channel), { once: true });
    await this.connection.setRemoteDescription(offer);
    await this.connection.setLocalDescription(await this.connection.createAnswer());
    await this.waitForIceGathering();
    if (!this.connection.localDescription) throw new Error("WebRTC did not create a guest answer.");
    return this.connection.localDescription.toJSON();
  }

  async acceptGuestAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    this.ensureOpen();
    await this.connection.setRemoteDescription(answer);
  }

  send(message: string): boolean {
    if (this.channel?.readyState !== "open") return false;
    try {
      this.channel.send(message);
      return true;
    } catch {
      // A full or closing channel must not break the caller's frame loop.
      return false;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.channel?.close();
    this.connection.close();
  }

  /** Stops reporting now, but lets an already-sent goodbye reach the other device before closing. */
  closeSoon(delayMs = 300): void {
    if (this.closed) return;
    this.closed = true;
    window.setTimeout(() => {
      this.channel?.close();
      this.connection.close();
    }, delayMs);
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.addEventListener("open", () => this.forward({ type: "channel-open" }));
    channel.addEventListener("close", () => this.forward({ type: "channel-closed" }));
    channel.addEventListener("error", () => this.forward({ type: "channel-error" }));
    channel.addEventListener("message", (event) => {
      if (!this.closed && typeof event.data === "string") this.options.onMessage?.(event.data);
    });
  }

  private forward(event: PeerTransportEvent): void {
    if (this.closed) return;
    const status = this.tracker.next(event);
    if (status) this.options.onStatus?.(status);
  }

  private async waitForIceGathering(): Promise<void> {
    if (this.connection.iceGatheringState === "complete") return;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Timed out while preparing the nearby connection."));
      }, this.options.iceGatheringTimeoutMs ?? DEFAULT_ICE_TIMEOUT_MS);
      const onChange = (): void => {
        if (this.connection.iceGatheringState !== "complete") return;
        cleanup();
        resolve();
      };
      const cleanup = (): void => {
        window.clearTimeout(timeout);
        this.connection.removeEventListener("icegatheringstatechange", onChange);
      };
      this.connection.addEventListener("icegatheringstatechange", onChange);
    });
  }

  private ensureOpen(): void { if (this.closed) throw new Error("WebRTC connection is closed."); }
}

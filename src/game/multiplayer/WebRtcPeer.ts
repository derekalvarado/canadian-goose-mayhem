export type WebRtcPeerStatus = "new" | "pairing" | "connected" | "disconnected" | "failed" | "closed";

export interface WebRtcPeerOptions {
  readonly iceServers?: readonly RTCIceServer[];
  readonly iceGatheringTimeoutMs?: number;
  readonly onStatus?: (status: WebRtcPeerStatus) => void;
  readonly onMessage?: (message: string) => void;
}

const DEFAULT_ICE_TIMEOUT_MS = 12_000;

/**
 * Data-channel transport only. Offer/answer movement belongs to the manual
 * signaling adapter today and can be replaced by a server later.
 */
export class WebRtcPeer {
  private readonly connection: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private closed = false;

  constructor(private readonly options: WebRtcPeerOptions = {}) {
    // No third-party ICE service is silently assumed. Host candidates support
    // the intended nearby/same-network play; a future server can inject STUN/TURN.
    this.connection = new RTCPeerConnection({ iceServers: [...(options.iceServers ?? [])] });
    this.connection.addEventListener("connectionstatechange", this.handleConnectionState);
  }

  async createHostOffer(): Promise<RTCSessionDescriptionInit> {
    this.ensureOpen();
    this.setStatus("pairing");
    this.attachChannel(this.connection.createDataChannel("goose-game", { ordered: true }));
    await this.connection.setLocalDescription(await this.connection.createOffer());
    await this.waitForIceGathering();
    if (!this.connection.localDescription) throw new Error("WebRTC did not create a host offer.");
    return this.connection.localDescription.toJSON();
  }

  async acceptOfferAndCreateAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    this.ensureOpen();
    this.setStatus("pairing");
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
    this.channel.send(message);
    return true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.channel?.close();
    this.connection.close();
    this.setStatus("closed");
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.addEventListener("open", () => this.setStatus("connected"));
    channel.addEventListener("close", () => { if (!this.closed) this.setStatus("disconnected"); });
    channel.addEventListener("error", () => this.setStatus("failed"));
    channel.addEventListener("message", (event) => {
      if (typeof event.data === "string") this.options.onMessage?.(event.data);
    });
  }

  private readonly handleConnectionState = (): void => {
    const state = this.connection.connectionState;
    if (state === "connected") this.setStatus("connected");
    else if (state === "disconnected") this.setStatus("disconnected");
    else if (state === "failed") this.setStatus("failed");
    else if (state === "closed") this.setStatus("closed");
  };

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
  private setStatus(status: WebRtcPeerStatus): void { this.options.onStatus?.(status); }
}

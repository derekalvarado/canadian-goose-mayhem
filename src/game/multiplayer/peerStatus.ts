/** What the game needs to know about a device-to-device link. */
export type PeerStatus = "connected" | "interrupted" | "disconnected" | "failed";

export type PeerTransportEvent =
  | { readonly type: "channel-open" }
  | { readonly type: "channel-closed" }
  | { readonly type: "channel-error" }
  | { readonly type: "connection-state"; readonly state: string };

/**
 * Turns raw WebRTC events into one report per change. The data channel and the
 * peer connection both announce "connected", in either order; reporting both let
 * a late duplicate undo a finished handshake and freeze the guest. A weak link
 * ("interrupted") can recover; a closed channel or failed connection is final.
 */
export class PeerStatusTracker {
  private channelOpen = false;
  private reported?: PeerStatus;
  private connectedOnce = false;
  private ended = false;

  /** True once the link has carried game messages, so a later loss is "lost", not "couldn't connect". */
  get everConnected(): boolean { return this.connectedOnce; }

  next(event: PeerTransportEvent): PeerStatus | undefined {
    if (this.ended) return undefined;
    if (event.type === "channel-open") {
      this.channelOpen = true;
      return this.reported === undefined ? this.report("connected") : undefined;
    }
    if (event.type === "channel-closed") return this.finish("disconnected");
    if (event.type === "channel-error") return this.finish("failed");
    if (event.state === "connected") return this.channelOpen && this.reported === "interrupted" ? this.report("connected") : undefined;
    if (event.state === "disconnected") return this.reported === "connected" ? this.report("interrupted") : undefined;
    if (event.state === "failed") return this.finish("failed");
    if (event.state === "closed") return this.finish("disconnected");
    return undefined;
  }

  private report(status: PeerStatus): PeerStatus {
    this.reported = status;
    if (status === "connected") this.connectedOnce = true;
    return status;
  }

  private finish(status: "disconnected" | "failed"): PeerStatus {
    this.ended = true;
    this.reported = status;
    return status;
  }
}

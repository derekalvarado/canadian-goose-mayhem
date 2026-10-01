import {
  decodeRoomSignal,
  encodeRoomSignal,
  type RoomDescription,
  type RoomRole,
  type RoomSignalMessage,
} from "./roomSignalingProtocol.ts";

export interface RoomInvitation {
  readonly roomId: string;
  readonly reconnectToken: string;
}

export interface RoomSignalingClientOptions {
  readonly serviceUrl: string;
  readonly invitation: RoomInvitation;
  readonly role: RoomRole;
  readonly onMessage?: (message: RoomSignalMessage) => void;
  readonly onClose?: () => void;
  readonly socketFactory?: (url: string) => WebSocket;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,128}$/u;

function assertToken(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !TOKEN_PATTERN.test(value)) throw new Error(`Invalid ${label}.`);
}

export function roomInvitationUrl(pageUrl: string, invitation: RoomInvitation): string {
  assertToken(invitation.roomId, "room ID");
  assertToken(invitation.reconnectToken, "room key");
  const url = new URL(pageUrl);
  url.hash = new URLSearchParams({ room: invitation.roomId, key: invitation.reconnectToken }).toString();
  return url.toString();
}

export function roomInvitationFromUrl(pageUrl: string): RoomInvitation | undefined {
  const url = new URL(pageUrl);
  const params = new URLSearchParams(url.hash.replace(/^#/u, ""));
  const roomId = params.get("room");
  const reconnectToken = params.get("key");
  if (!roomId && !reconnectToken) return undefined;
  assertToken(roomId, "room ID");
  assertToken(reconnectToken, "room key");
  return { roomId, reconnectToken };
}

export function roomSocketUrl(serviceUrl: string, invitation: RoomInvitation, role: RoomRole): string {
  assertToken(invitation.roomId, "room ID");
  assertToken(invitation.reconnectToken, "room key");
  const url = new URL(serviceUrl);
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol !== "wss:" && url.protocol !== "ws:") throw new Error("The signaling service URL is invalid.");
  url.pathname = `${url.pathname.replace(/\/$/u, "")}/rooms/${invitation.roomId}`;
  url.search = new URLSearchParams({ role, key: invitation.reconnectToken }).toString();
  url.hash = "";
  return url.toString();
}

export class RoomSignalingClient {
  private readonly options: RoomSignalingClientOptions;
  private socket?: WebSocket;
  private opened = false;

  constructor(options: RoomSignalingClientOptions) { this.options = options; }

  connect(): Promise<void> {
    if (this.socket) throw new Error("Room signaling is already connected.");
    const factory = this.options.socketFactory ?? ((url: string) => new WebSocket(url));
    const socket = factory(roomSocketUrl(this.options.serviceUrl, this.options.invitation, this.options.role));
    this.socket = socket;
    socket.addEventListener("message", this.handleMessage);
    socket.addEventListener("close", this.handleClose);
    return new Promise<void>((resolve, reject) => {
      const onOpen = (): void => {
        cleanup();
        this.opened = true;
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new Error("Could not reach the multiplayer room service."));
      };
      const cleanup = (): void => {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
      };
      socket.addEventListener("open", onOpen, { once: true });
      socket.addEventListener("error", onError, { once: true });
    });
  }

  sendDescription(description: RoomDescription): void {
    if (!this.socket || this.socket.readyState !== 1) throw new Error("The multiplayer room is not connected.");
    this.socket.send(encodeRoomSignal({ type: description.type, version: 1, description }));
  }

  close(): void {
    const socket = this.socket;
    this.socket = undefined;
    this.opened = false;
    socket?.removeEventListener("message", this.handleMessage);
    socket?.removeEventListener("close", this.handleClose);
    socket?.close();
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (typeof event.data !== "string") return;
    try { this.options.onMessage?.(decodeRoomSignal(event.data)); }
    catch { /* The room service is untrusted; malformed messages are ignored. */ }
  };

  private readonly handleClose = (): void => {
    if (!this.opened) return;
    this.opened = false;
    this.options.onClose?.();
  };
}

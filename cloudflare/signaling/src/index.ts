import { DurableObject } from "cloudflare:workers";
import {
  decodeRoomSignal,
  encodeRoomSignal,
  type RoomRole,
  type RoomSignalMessage,
} from "../../../src/game/multiplayer/roomSignalingProtocol.ts";
import { allowedSignalingOrigin, nextSignalingMessageCount } from "./security.ts";

interface Env {
  readonly ROOMS: DurableObjectNamespace<SignalingRoom>;
  readonly ROOM_HANDSHAKES: RateLimit;
  readonly ALLOWED_ORIGINS: string;
}

interface SocketAttachment {
  readonly role: RoomRole;
  readonly messages: number;
}

const ROOM_PATTERN = /^[A-Za-z0-9_-]{24,128}$/u;
const ROOM_LIFETIME_MS = 20 * 60 * 1_000;

function textResponse(message: string, status: number, origin?: string): Response {
  const headers = new Headers({ "content-type": "text/plain; charset=utf-8" });
  if (origin) headers.set("access-control-allow-origin", origin);
  return new Response(message, { status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "goose-game-signaling", version: 1 });

    const origin = request.headers.get("origin");
    const acceptedOrigin = allowedSignalingOrigin(origin, env.ALLOWED_ORIGINS);
    if (!acceptedOrigin) return textResponse("Origin is not allowed.", 403);

    const match = /^\/rooms\/([^/]+)$/u.exec(url.pathname);
    if (!match || !ROOM_PATTERN.test(match[1])) return textResponse("Room not found.", 404, acceptedOrigin);
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return textResponse("Expected a WebSocket connection.", 426, acceptedOrigin);
    }
    const rateLimitKey = request.headers.get("cf-connecting-ip") ?? acceptedOrigin;
    const rateLimit = await env.ROOM_HANDSHAKES.limit({ key: rateLimitKey });
    if (!rateLimit.success) {
      const response = textResponse("Too many room connection attempts. Try again in a minute.", 429, acceptedOrigin);
      response.headers.set("retry-after", "60");
      return response;
    }

    const id = env.ROOMS.idFromName(match[1]);
    return env.ROOMS.get(id).fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class SignalingRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const key = url.searchParams.get("key");
    if ((role !== "host" && role !== "guest") || !key || !ROOM_PATTERN.test(key)) {
      return textResponse("Invalid room credentials.", 400);
    }

    const storedKey = await this.ctx.storage.get<string>("room-key");
    if (!storedKey) {
      if (role !== "host") return textResponse("The host has not opened this room yet.", 404);
      await this.ctx.storage.put("room-key", key);
    } else if (storedKey !== key) {
      return textResponse("Room credentials do not match.", 403);
    }

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return textResponse("Expected a WebSocket connection.", 426);
    }

    for (const existing of this.ctx.getWebSockets(role)) existing.close(4001, "Replaced by a newer connection.");
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ role, messages: 0 } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server, [role]);
    await this.ctx.storage.setAlarm(Date.now() + ROOM_LIFETIME_MS);

    server.send(encodeRoomSignal({ type: "ready", version: 1, role }));
    this.sendTo(role === "host" ? "guest" : "host", { type: "peer-joined", version: 1, role });
    if (role === "guest") {
      const offer = await this.ctx.storage.get<string>("offer");
      if (offer) server.send(offer);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    const messageCount = nextSignalingMessageCount(attachment?.messages);
    if (!attachment || messageCount === undefined) {
      socket.close(1008, "Signaling message limit exceeded.");
      return;
    }
    socket.serializeAttachment({ ...attachment, messages: messageCount } satisfies SocketAttachment);
    if (typeof data !== "string") {
      socket.send(encodeRoomSignal({ type: "error", version: 1, message: "Unsupported room message." }));
      return;
    }
    let message: RoomSignalMessage;
    try { message = decodeRoomSignal(data); }
    catch {
      socket.send(encodeRoomSignal({ type: "error", version: 1, message: "Invalid room message." }));
      return;
    }

    if (attachment.role === "host" && message.type === "offer") {
      await this.ctx.storage.put("offer", data);
      await this.ctx.storage.delete("answer");
      this.sendTo("guest", message);
      return;
    }
    if (attachment.role === "guest" && message.type === "answer") {
      await this.ctx.storage.put("answer", data);
      this.sendTo("host", message);
      return;
    }
    socket.send(encodeRoomSignal({ type: "error", version: 1, message: "That message is not allowed for this player." }));
  }

  webSocketClose(socket: WebSocket): void {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment) this.sendTo(attachment.role === "host" ? "guest" : "host", {
      type: "peer-left", version: 1, role: attachment.role,
    });
  }

  async alarm(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) socket.close(4000, "Room expired.");
    await this.ctx.storage.deleteAll();
  }

  private sendTo(role: RoomRole, message: RoomSignalMessage): void {
    const encoded = encodeRoomSignal(message);
    for (const socket of this.ctx.getWebSockets(role)) socket.send(encoded);
  }
}

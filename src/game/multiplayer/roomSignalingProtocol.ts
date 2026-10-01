export const ROOM_SIGNALING_VERSION = 1;
export const MAX_ROOM_SIGNAL_BYTES = 64 * 1_024;

export type RoomRole = "host" | "guest";

export interface RoomDescription {
  readonly type: "offer" | "answer";
  readonly sdp: string;
}

export type RoomSignalMessage =
  | { readonly type: "ready"; readonly version: 1; readonly role: RoomRole }
  | { readonly type: "peer-joined"; readonly version: 1; readonly role: RoomRole }
  | { readonly type: "peer-left"; readonly version: 1; readonly role: RoomRole }
  | { readonly type: "offer"; readonly version: 1; readonly description: RoomDescription }
  | { readonly type: "answer"; readonly version: 1; readonly description: RoomDescription }
  | { readonly type: "error"; readonly version: 1; readonly message: string };

const encoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRole(value: unknown): RoomRole {
  if (value !== "host" && value !== "guest") throw new Error("Invalid room role.");
  return value;
}

function parseDescription(value: unknown, expectedType: "offer" | "answer"): RoomDescription {
  if (!isRecord(value) || value.type !== expectedType || typeof value.sdp !== "string" || value.sdp.length === 0) {
    throw new Error(`Invalid WebRTC ${expectedType}.`);
  }
  return { type: expectedType, sdp: value.sdp };
}

export function encodeRoomSignal(message: RoomSignalMessage): string {
  return JSON.stringify(message);
}

export function decodeRoomSignal(raw: string): RoomSignalMessage {
  if (encoder.encode(raw).byteLength > MAX_ROOM_SIGNAL_BYTES) throw new Error("Room signal is too large.");
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; }
  catch { throw new Error("Room signal is not valid JSON."); }
  if (!isRecord(value) || value.version !== ROOM_SIGNALING_VERSION || typeof value.type !== "string") {
    throw new Error("Room signal version mismatch.");
  }
  if (value.type === "ready" || value.type === "peer-joined" || value.type === "peer-left") {
    return { type: value.type, version: 1, role: parseRole(value.role) };
  }
  if (value.type === "offer" || value.type === "answer") {
    return { type: value.type, version: 1, description: parseDescription(value.description, value.type) };
  }
  if (value.type === "error" && typeof value.message === "string" && value.message.length > 0 && value.message.length <= 256) {
    return { type: "error", version: 1, message: value.message };
  }
  throw new Error("Unknown room signal type.");
}

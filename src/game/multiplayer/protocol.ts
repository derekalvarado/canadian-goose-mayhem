import type { PlayerCommand, PlayerState, WorldSnapshot } from "../simulation/Simulation.ts";

export const MULTIPLAYER_PROTOCOL_VERSION = 1;
export const MAX_COMMAND_MESSAGE_BYTES = 2_048;
export const MAX_SNAPSHOT_MESSAGE_BYTES = 256 * 1_024;
export const MAX_GUEST_MESSAGES_PER_SECOND = 90;

export type MultiplayerPlayerId = "goose-1" | "goose-2";

export interface NetworkPlayerCommand extends PlayerCommand {
  readonly sequence: number;
}

export interface ReplicatedPlayer {
  readonly id: MultiplayerPlayerId;
  readonly areaId: string;
  readonly state: PlayerState;
}

export interface ReplicatedArea {
  readonly areaId: string;
  readonly world: WorldSnapshot;
}

export interface AuthoritativeGameSnapshot {
  readonly tick: number;
  readonly players: readonly ReplicatedPlayer[];
  readonly areas: readonly ReplicatedArea[];
  readonly objectiveList: readonly Readonly<{ id: string; description: string; areaId?: string; needsTwoGeese?: boolean; completed: boolean }>[];
}

export type GuestMessage =
  | { readonly type: "hello"; readonly version: 1; readonly sessionId: string; readonly reconnectToken: string }
  | { readonly type: "command"; readonly version: 1; readonly playerId: "goose-2"; readonly command: NetworkPlayerCommand }
  | { readonly type: "pong"; readonly version: 1; readonly nonce: number };

export type HostMessage =
  | { readonly type: "welcome"; readonly version: 1; readonly sessionId: string; readonly playerId: "goose-2" }
  | { readonly type: "snapshot"; readonly version: 1; readonly sequence: number; readonly sentAt: number; readonly snapshot: AuthoritativeGameSnapshot }
  | { readonly type: "ping"; readonly version: 1; readonly nonce: number }
  | { readonly type: "error"; readonly version: 1; readonly code: "version" | "session" | "rate" | "message"; readonly message: string };

const encoder = new TextEncoder();
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isSafeSequence = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

function assertEnvelope(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Multiplayer message must be an object.");
  if (value.version !== MULTIPLAYER_PROTOCOL_VERSION) throw new Error("Multiplayer protocol version mismatch.");
  if (typeof value.type !== "string") throw new Error("Multiplayer message has no type.");
}

function parseJson(raw: string, maxBytes: number): unknown {
  if (encoder.encode(raw).byteLength > maxBytes) throw new Error("Multiplayer message is too large.");
  try { return JSON.parse(raw) as unknown; }
  catch { throw new Error("Multiplayer message is not valid JSON."); }
}

function boundedText(value: unknown, label: string, maxLength = 128): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) throw new Error(`Invalid ${label}.`);
  return value;
}

function parseCommand(value: unknown): NetworkPlayerCommand {
  if (!isRecord(value) || !isSafeSequence(value.sequence)) throw new Error("Invalid guest command sequence.");
  const moveX = value.moveX; const moveZ = value.moveZ;
  if (!isFiniteNumber(moveX) || !isFiniteNumber(moveZ)) throw new Error("Invalid guest movement.");
  const booleans = ["hurry", "honkPressed", "interactPressed", "wingsSpread", "sneaking", "threatening"] as const;
  for (const key of booleans) if (value[key] !== undefined && !isBoolean(value[key])) throw new Error(`Invalid guest command ${key}.`);
  return {
    sequence: value.sequence,
    moveX: Math.max(-1, Math.min(1, moveX)),
    moveZ: Math.max(-1, Math.min(1, moveZ)),
    hurry: value.hurry === true,
    honkPressed: value.honkPressed === true,
    interactPressed: value.interactPressed === true,
    wingsSpread: value.wingsSpread === true,
    sneaking: value.sneaking === true,
    threatening: value.threatening === true,
  };
}

export function encodeGuestMessage(message: GuestMessage): string { return JSON.stringify(message); }
export function encodeHostMessage(message: HostMessage): string { return JSON.stringify(message); }

export function decodeGuestMessage(raw: string): GuestMessage {
  const value = parseJson(raw, MAX_COMMAND_MESSAGE_BYTES);
  assertEnvelope(value);
  if (value.type === "hello") {
    return { type: "hello", version: 1, sessionId: boundedText(value.sessionId, "session ID"), reconnectToken: boundedText(value.reconnectToken, "reconnect token") };
  }
  if (value.type === "command") {
    if (value.playerId !== "goose-2") throw new Error("Guest may only control Goose 2.");
    return { type: "command", version: 1, playerId: "goose-2", command: parseCommand(value.command) };
  }
  if (value.type === "pong" && isSafeSequence(value.nonce)) return { type: "pong", version: 1, nonce: value.nonce };
  throw new Error("Unknown guest message type.");
}

export function decodeHostMessage(raw: string): HostMessage {
  const value = parseJson(raw, MAX_SNAPSHOT_MESSAGE_BYTES);
  assertEnvelope(value);
  if (value.type === "welcome") {
    if (value.playerId !== "goose-2") throw new Error("Invalid assigned player.");
    return { type: "welcome", version: 1, sessionId: boundedText(value.sessionId, "session ID"), playerId: "goose-2" };
  }
  if (value.type === "ping" && isSafeSequence(value.nonce)) return { type: "ping", version: 1, nonce: value.nonce };
  if (value.type === "error") {
    const code = value.code;
    if (code !== "version" && code !== "session" && code !== "rate" && code !== "message") throw new Error("Invalid host error code.");
    return { type: "error", version: 1, code, message: boundedText(value.message, "error message", 256) };
  }
  if (value.type === "snapshot") {
    if (!isSafeSequence(value.sequence) || !isFiniteNumber(value.sentAt) || !isRecord(value.snapshot)) throw new Error("Invalid host snapshot.");
    // Snapshot fields originate in the authoritative simulation. The guest checks
    // the envelope here and presentation code treats the payload as read-only.
    return { type: "snapshot", version: 1, sequence: value.sequence, sentAt: value.sentAt,
      snapshot: value.snapshot as unknown as AuthoritativeGameSnapshot };
  }
  throw new Error("Unknown host message type.");
}

/** Rejects replays and floods before a guest command reaches the simulation. */
export class GuestCommandGate {
  private lastSequence = -1;
  private windowStartedAt = 0;
  private messagesInWindow = 0;

  accept(message: Extract<GuestMessage, { type: "command" }>, now: number): NetworkPlayerCommand | undefined {
    if (message.command.sequence <= this.lastSequence) return undefined;
    if (now - this.windowStartedAt >= 1_000 || now < this.windowStartedAt) {
      this.windowStartedAt = now;
      this.messagesInWindow = 0;
    }
    this.messagesInWindow += 1;
    if (this.messagesInWindow > MAX_GUEST_MESSAGES_PER_SECOND) return undefined;
    this.lastSequence = message.command.sequence;
    return message.command;
  }
}

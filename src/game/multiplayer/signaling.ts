import LZString from "lz-string";

export const MAX_SIGNAL_BYTES = 48 * 1_024;
export const PAIRING_ANSWER_CHANNEL = "goose-game.multiplayer.answers.v1";

export interface ManualSignal {
  readonly version: 1;
  readonly sessionId: string;
  readonly reconnectToken: string;
  readonly description: RTCSessionDescriptionInit;
}

const encoder = new TextEncoder();

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlDecodeBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Pairing code contains invalid characters.");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function assertToken(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,128}$/u.test(value)) throw new Error(`Invalid ${name}.`);
}

export function encodeManualSignal(signal: ManualSignal): string {
  assertToken(signal.sessionId, "session ID");
  assertToken(signal.reconnectToken, "reconnect token");
  if ((signal.description.type !== "offer" && signal.description.type !== "answer") || typeof signal.description.sdp !== "string") {
    throw new Error("Invalid WebRTC session description.");
  }
  const json = JSON.stringify(signal);
  if (encoder.encode(json).byteLength > MAX_SIGNAL_BYTES) throw new Error("Pairing code is too large.");
  return `z${base64UrlEncodeBytes(LZString.compressToUint8Array(json))}`;
}

export function decodeManualSignal(encoded: string): ManualSignal {
  if (encoded.length > MAX_SIGNAL_BYTES * 2) throw new Error("Pairing code is too large.");
  if (!encoded.startsWith("z")) throw new Error("Pairing code uses an unsupported encoding.");
  const json = LZString.decompressFromUint8Array(base64UrlDecodeBytes(encoded.slice(1)));
  if (!json) throw new Error("Pairing code is damaged.");
  if (encoder.encode(json).byteLength > MAX_SIGNAL_BYTES) throw new Error("Pairing code is too large.");
  let value: unknown;
  try { value = JSON.parse(json) as unknown; } catch { throw new Error("Pairing code is damaged."); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Pairing code is damaged.");
  const record = value as Record<string, unknown>;
  if (record.version !== 1) throw new Error("Pairing code is from an incompatible game version.");
  assertToken(record.sessionId, "session ID");
  assertToken(record.reconnectToken, "reconnect token");
  const description = record.description;
  if (typeof description !== "object" || description === null || Array.isArray(description)) throw new Error("Pairing code has no WebRTC description.");
  const typed = description as Record<string, unknown>;
  if ((typed.type !== "offer" && typed.type !== "answer") || typeof typed.sdp !== "string" || typed.sdp.length === 0) {
    throw new Error("Pairing code has an invalid WebRTC description.");
  }
  return { version: 1, sessionId: record.sessionId, reconnectToken: record.reconnectToken,
    description: { type: typed.type, sdp: typed.sdp } };
}

export function pairingUrl(pageUrl: string, mode: "join" | "answer", signal: ManualSignal): string {
  const url = new URL(pageUrl);
  url.search = "";
  url.hash = new URLSearchParams({ [mode]: encodeManualSignal(signal) }).toString();
  return url.toString();
}

export function signalFromUrl(pageUrl: string): Readonly<{ mode: "join" | "answer"; signal: ManualSignal }> | undefined {
  const url = new URL(pageUrl);
  const params = new URLSearchParams(url.hash.replace(/^#/u, ""));
  const join = params.get("join");
  const answer = params.get("answer");
  if (join && answer) throw new Error("Pairing link is ambiguous.");
  if (join) return { mode: "join", signal: decodeManualSignal(join) };
  if (answer) return { mode: "answer", signal: decodeManualSignal(answer) };
  return undefined;
}

export function pendingAnswerStorageKey(sessionId: string): string {
  assertToken(sessionId, "session ID");
  return `goose-game.multiplayer.answer.v1.${sessionId}`;
}

/** Used by the tiny response-link landing route; the open host game consumes it. */
export function storeAnswerFromUrl(pageUrl: string, store: Pick<Storage, "setItem"> = window.localStorage): ManualSignal | undefined {
  const inbound = signalFromUrl(pageUrl);
  if (!inbound || inbound.mode !== "answer") return undefined;
  store.setItem(pendingAnswerStorageKey(inbound.signal.sessionId), encodeManualSignal(inbound.signal));
  return inbound.signal;
}

export function createPairingToken(bytes = 16): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

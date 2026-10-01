import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeGuestMessage,
  decodeHostMessage,
  encodeGuestMessage,
  encodeHostMessage,
  GuestCommandGate,
  MAX_GUEST_MESSAGES_PER_SECOND,
  MULTIPLAYER_PROTOCOL_VERSION,
  type GuestMessage,
} from "../src/game/multiplayer/protocol.ts";
import {
  decodeManualSignal,
  encodeManualSignal,
  pairingUrl,
  signalFromUrl,
  type ManualSignal,
} from "../src/game/multiplayer/signaling.ts";

const commandMessage = (sequence: number): Extract<GuestMessage, { type: "command" }> => ({
  type: "command",
  version: MULTIPLAYER_PROTOCOL_VERSION,
  playerId: "goose-2",
  command: { sequence, moveX: 0.4, moveZ: -0.8, hurry: true, honkPressed: false },
});

test("guest commands round-trip and movement is bounded at the trust boundary", () => {
  const raw = JSON.stringify({ ...commandMessage(7), command: { ...commandMessage(7).command, moveX: 12, moveZ: -4 } });
  const message = decodeGuestMessage(raw);
  assert.equal(message.type, "command");
  if (message.type !== "command") return;
  assert.equal(message.command.moveX, 1);
  assert.equal(message.command.moveZ, -1);
  assert.deepEqual(decodeGuestMessage(encodeGuestMessage(message)), message);
});

test("protocol rejects wrong versions, invalid actors, malformed JSON, and oversized messages", () => {
  assert.throws(() => decodeGuestMessage("{"), /valid JSON/);
  assert.throws(() => decodeGuestMessage(JSON.stringify({ ...commandMessage(1), version: 2 })), /version mismatch/);
  assert.throws(() => decodeGuestMessage(JSON.stringify({ ...commandMessage(1), playerId: "goose-1" })), /Goose 2/);
  assert.throws(() => decodeGuestMessage(`{"version":1,"type":"pong","padding":"${"x".repeat(3_000)}"}`), /too large/);
});

test("command gate rejects replays and rate floods", () => {
  const gate = new GuestCommandGate();
  assert.equal(gate.accept(commandMessage(1), 100)?.sequence, 1);
  assert.equal(gate.accept(commandMessage(1), 101), undefined);
  for (let sequence = 2; sequence <= MAX_GUEST_MESSAGES_PER_SECOND; sequence += 1) {
    assert.equal(gate.accept(commandMessage(sequence), 200)?.sequence, sequence);
  }
  assert.equal(gate.accept(commandMessage(MAX_GUEST_MESSAGES_PER_SECOND + 1), 300), undefined);
  assert.equal(gate.accept(commandMessage(MAX_GUEST_MESSAGES_PER_SECOND + 2), 1_200)?.sequence, MAX_GUEST_MESSAGES_PER_SECOND + 2);
});

test("small host control messages round-trip", () => {
  const message = { type: "error", version: 1, code: "session", message: "Wrong host session." } as const;
  assert.deepEqual(decodeHostMessage(encodeHostMessage(message)), message);
});

test("manual offer and answer codes round-trip without sending fragments to the server", () => {
  const signal: ManualSignal = {
    version: 1,
    sessionId: "session_12345678",
    reconnectToken: "reconnect_12345678",
    description: { type: "offer", sdp: "v=0\r\na=ice-ufrag:café\r\n" },
  };
  assert.deepEqual(decodeManualSignal(encodeManualSignal(signal)), signal);
  const url = pairingUrl("https://example.com/goose-game-two/?dev&start=coffee-shop", "join", signal);
  assert.equal(new URL(url).pathname, "/goose-game-two/");
  assert.equal(new URL(url).search, "");
  assert.equal(new URL(url).hash.startsWith("#join="), true);
  assert.deepEqual(signalFromUrl(url), { mode: "join", signal });
});

test("manual signaling rejects damaged, ambiguous, and incompatible codes", () => {
  assert.throws(() => decodeManualSignal("znot+url-safe"), /invalid characters/);
  const incompatible = encodeManualSignal({ version: 2, sessionId: "session_12345678", reconnectToken: "reconnect_12345678",
    description: { type: "offer", sdp: "v=0" } } as unknown as ManualSignal);
  assert.throws(() => decodeManualSignal(incompatible), /incompatible/);
  const signal: ManualSignal = { version: 1, sessionId: "session_12345678", reconnectToken: "reconnect_12345678",
    description: { type: "answer", sdp: "v=0" } };
  const code = encodeManualSignal(signal);
  assert.throws(() => signalFromUrl(`https://example.com/#join=${code}&answer=${code}`), /ambiguous/);
});

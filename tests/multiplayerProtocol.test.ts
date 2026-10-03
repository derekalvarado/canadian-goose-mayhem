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
  readSharedObjectives,
  type GuestMessage,
} from "../src/game/multiplayer/protocol.ts";

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

test("goodbye and pause messages round-trip so each player can be told what happened", () => {
  const paused = { type: "status", version: 1, paused: true } as const;
  assert.deepEqual(decodeHostMessage(encodeHostMessage(paused)), paused);
  assert.deepEqual(decodeHostMessage(encodeHostMessage({ type: "bye", version: 1 })), { type: "bye", version: 1 });
  assert.deepEqual(decodeGuestMessage(encodeGuestMessage({ type: "bye", version: 1 })), { type: "bye", version: 1 });
  assert.throws(() => decodeHostMessage(JSON.stringify({ type: "status", version: 1, paused: "yes" })), /Unknown host message/);
});

test("the guest shows the host's to-do list only when every entry is well formed", () => {
  const list = [
    { id: "steal-croissant", description: "Steal a croissant", areaId: "old-town-square.coffee-shop", completed: true },
    { id: "two-geese", description: "Two geese: distract and steal", needsTwoGeese: true, completed: false },
  ];
  assert.deepEqual(readSharedObjectives(list), list);
  assert.equal(readSharedObjectives([{ ...list[0], completed: "yes" }]), undefined);
  assert.equal(readSharedObjectives([{ ...list[0], description: "" }]), undefined);
  assert.equal(readSharedObjectives({ length: 1 }), undefined);
});

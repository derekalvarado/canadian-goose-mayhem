import assert from "node:assert/strict";
import test from "node:test";
import {
  roomInvitationFromUrl,
  roomInvitationUrl,
  roomSocketUrl,
  type RoomInvitation,
} from "../src/game/multiplayer/RoomSignalingClient.ts";
import {
  decodeRoomSignal,
  encodeRoomSignal,
  MAX_ROOM_SIGNAL_BYTES,
} from "../src/game/multiplayer/roomSignalingProtocol.ts";

const invitation: RoomInvitation = {
  roomId: "room_1234567890abcdefghijklmnop",
  reconnectToken: "key_1234567890abcdefghijklmnopq",
};

test("one-link room invitation stays in the page fragment", () => {
  const link = roomInvitationUrl("https://example.com/canadian-goose-mayhem/?dev", invitation);
  const parsed = new URL(link);
  assert.equal(parsed.pathname, "/canadian-goose-mayhem/");
  assert.equal(parsed.search, "?dev");
  assert.equal(parsed.hash.includes("room="), true);
  assert.deepEqual(roomInvitationFromUrl(link), invitation);
});

test("room invitation becomes an authenticated signaling WebSocket URL", () => {
  assert.equal(
    roomSocketUrl("https://goose-game-signaling.example.workers.dev/api/", invitation, "guest"),
    `wss://goose-game-signaling.example.workers.dev/api/rooms/${invitation.roomId}?role=guest&key=${invitation.reconnectToken}`,
  );
});

test("room signaling messages are versioned and bounded", () => {
  const offer = { type: "offer", version: 1, description: { type: "offer", sdp: "v=0\r\n" } } as const;
  assert.deepEqual(decodeRoomSignal(encodeRoomSignal(offer)), offer);
  assert.throws(() => decodeRoomSignal("{"), /valid JSON/);
  assert.throws(() => decodeRoomSignal(JSON.stringify({ ...offer, version: 2 })), /version mismatch/);
  assert.throws(() => decodeRoomSignal(JSON.stringify({ ...offer, description: { type: "answer", sdp: "v=0" } })), /offer/);
  assert.throws(() => decodeRoomSignal(`{"padding":"${"x".repeat(MAX_ROOM_SIGNAL_BYTES)}"}`), /too large/);
});

test("room invitation rejects incomplete or unsafe fragments", () => {
  assert.equal(roomInvitationFromUrl("https://example.com/#unrelated=1"), undefined);
  assert.throws(() => roomInvitationFromUrl(`https://example.com/#room=${invitation.roomId}`), /room key/);
  assert.throws(() => roomInvitationFromUrl("https://example.com/#room=short&key=also-short"), /room ID/);
});

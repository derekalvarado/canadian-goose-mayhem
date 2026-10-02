import assert from "node:assert/strict";
import test from "node:test";
import {
  roomSocketUrl,
  type RoomInvitation,
} from "../src/game/multiplayer/RoomSignalingClient.ts";
import {
  decodeRoomSignal,
  encodeRoomSignal,
  MAX_ROOM_SIGNAL_BYTES,
} from "../src/game/multiplayer/roomSignalingProtocol.ts";
import {
  allowedSignalingOrigin,
  nextSignalingMessageCount,
} from "../cloudflare/signaling/src/security.ts";

const invitation: RoomInvitation = {
  roomId: "room_1234567890abcdefghijklmnop",
  reconnectToken: "key_1234567890abcdefghijklmnopq",
};

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

test("signaling requires an approved browser origin", () => {
  const configured = "https://derekalvarado.github.io";
  assert.equal(allowedSignalingOrigin(configured, configured), configured);
  assert.equal(allowedSignalingOrigin("http://192.168.86.35:5173", configured), "http://192.168.86.35:5173");
  assert.equal(allowedSignalingOrigin(null, configured), undefined);
  assert.equal(allowedSignalingOrigin("https://attacker.example", configured), undefined);
  assert.equal(allowedSignalingOrigin("http://192.168.86.35:5173/extra", configured), undefined);
});

test("each signaling socket has a small finite message budget", () => {
  let count: number | undefined = 0;
  let accepted = 0;
  while (count !== undefined) {
    count = nextSignalingMessageCount(count);
    if (count !== undefined) accepted += 1;
  }
  assert.ok(accepted > 1);
  assert.ok(accepted < 20);
  assert.equal(nextSignalingMessageCount(undefined), undefined);
});

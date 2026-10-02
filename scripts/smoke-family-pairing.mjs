import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";

const serviceUrl = new URL(process.argv[2] ?? "http://127.0.0.1:8787");
const browserOrigin = process.argv[3] ?? (serviceUrl.hostname === "127.0.0.1" || serviceUrl.hostname === "localhost"
  ? "http://localhost:5173"
  : "https://derekalvarado.github.io");

async function post(path, body, expectedStatus = 200) {
  const response = await fetch(new URL(path, serviceUrl), {
    method: "POST",
    headers: { "content-type": "application/json", origin: browserOrigin },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  const decoded = raw ? JSON.parse(raw) : undefined;
  assert.equal(response.status, expectedStatus, `${path}: ${raw}`);
  return decoded;
}

const hostDevice = { deviceId: randomBytes(16).toString("hex"), name: "Host Goose" };
const guestDevice = { deviceId: randomBytes(16).toString("hex"), name: "Guest Goose" };

let created;
let code;
for (let attempt = 0; attempt < 5; attempt += 1) {
  code = String(randomInt(10_000)).padStart(4, "0");
  const response = await fetch(new URL(`/pairing-codes/${code}/create`, serviceUrl), {
    method: "POST",
    headers: { "content-type": "application/json", origin: browserOrigin },
    body: JSON.stringify({ device: hostDevice }),
  });
  if (response.status === 409) continue;
  const raw = await response.text();
  assert.equal(response.status, 201, raw);
  created = JSON.parse(raw);
  break;
}
assert.ok(created && code, "Could not reserve a four-digit code.");

const joined = await post(`/pairing-codes/${code}/join`, { device: guestDevice }, 201);
const approval = await post(`/pairing-codes/${code}/status`, { role: "creator", token: created.creatorToken });
assert.equal(approval.state, "approval-needed");
assert.deepEqual(approval.candidate, guestDevice);

const approved = await post(`/pairing-codes/${code}/approve`, {
  creatorToken: created.creatorToken,
  candidateDeviceId: guestDevice.deviceId,
});
const joinerStatus = await post(`/pairing-codes/${code}/status`, { role: "joiner", token: joined.requestToken });
assert.equal(joinerStatus.state, "paired");
assert.deepEqual(joinerStatus.pairing, approved.pairing);

const pairing = approved.pairing;
const pairPath = `/pairs/${pairing.pairId}`;
const hostAuth = { pairKey: pairing.pairKey, deviceId: hostDevice.deviceId };
const guestAuth = { pairKey: pairing.pairKey, deviceId: guestDevice.deviceId };
const requestId = randomBytes(16).toString("hex");
const earlyJoin = await post(`${pairPath}/join`, { ...guestAuth, requestId });
assert.equal(earlyJoin.activeHost, undefined);
const hostStatus = await post(`${pairPath}/claim-host`, hostAuth);
assert.equal(hostStatus.activeHost.deviceId, hostDevice.deviceId);
assert.equal(hostStatus.joinRequest.requestId, requestId);

const hostConflict = await post(`${pairPath}/claim-host`, guestAuth, 409);
assert.equal(hostConflict.code, "already-hosting");

const waiting = await post(`${pairPath}/status`, hostAuth);
assert.equal(waiting.joinRequest.requestId, requestId);

const invitation = {
  roomId: randomBytes(16).toString("hex"),
  reconnectToken: randomBytes(16).toString("hex"),
};
await post(`${pairPath}/publish-room`, { ...hostAuth, requestId, invitation });
const ready = await post(`${pairPath}/status`, { ...guestAuth, requestId });
assert.deepEqual(ready.room.invitation, invitation);

await post(`${pairPath}/update-name`, { ...guestAuth, name: "Little Goose" });
const renamed = await post(`${pairPath}/status`, hostAuth);
assert.equal(renamed.devices.find((device) => device.deviceId === guestDevice.deviceId).name, "Little Goose");

await post(`${pairPath}/release-host`, hostAuth);
const released = await post(`${pairPath}/status`, guestAuth);
assert.equal(released.activeHost, undefined);

await post(`${pairPath}/forget`, guestAuth);
const missing = await post(`${pairPath}/status`, hostAuth, 404);
assert.equal(missing.code, "pairing-missing");

console.log("Family pairing approved two devices, preserved Join-before-Host, chose one host, published one private room, and forgot the pair.");

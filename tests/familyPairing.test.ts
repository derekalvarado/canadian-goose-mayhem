import assert from "node:assert/strict";
import test from "node:test";
import {
  FAMILY_PAIRING_STORAGE_KEY,
  clearStoredFamilyPairing,
  familyPairingForDevice,
  joinRequestVisibleToDevice,
  loadStoredFamilyPairing,
  normalizeFamilyPlayerName,
  peerJoinRequestToPrompt,
  pairingWithUpdatedDevices,
  parseFamilyPairingCode,
  saveStoredFamilyPairing,
  type FamilyPairingCredential,
} from "../src/game/multiplayer/familyPairingProtocol.ts";

const deviceOne = "11111111111111111111111111111111";
const deviceTwo = "22222222222222222222222222222222";

const credential: FamilyPairingCredential = {
  version: 1,
  pairId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  pairKey: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  devices: [
    { deviceId: deviceOne, name: "Derek" },
    { deviceId: deviceTwo, name: "Goose Kid" },
  ],
};

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

test("family player names are human-readable and bounded", () => {
  assert.equal(normalizeFamilyPlayerName("  Goose   Kid  "), "Goose Kid");
  assert.throws(() => normalizeFamilyPlayerName(""), /1–24/);
  assert.throws(() => normalizeFamilyPlayerName("x".repeat(25)), /1–24/);
  assert.throws(() => normalizeFamilyPlayerName("bad\u0000name"), /ordinary/);
});

test("pairing codes require all four digits", () => {
  assert.equal(parseFamilyPairingCode(" 0042 "), "0042");
  assert.throws(() => parseFamilyPairingCode("42"), /four-digit/);
  assert.throws(() => parseFamilyPairingCode("12a4"), /four-digit/);
});

test("an approved credential becomes the local device's one stored pairing", () => {
  const storage = memoryStorage();
  const first = familyPairingForDevice(credential, deviceOne);
  assert.equal(first.selfName, "Derek");
  assert.equal(first.peerName, "Goose Kid");
  saveStoredFamilyPairing(first, storage);
  assert.deepEqual(loadStoredFamilyPairing(storage), first);

  const replacement = { ...first, pairId: "cccccccccccccccccccccccccccccccc", peerName: "New Player" };
  saveStoredFamilyPairing(replacement, storage);
  assert.deepEqual(loadStoredFamilyPairing(storage), replacement);
  assert.ok(storage.getItem(FAMILY_PAIRING_STORAGE_KEY));

  clearStoredFamilyPairing(storage);
  assert.equal(loadStoredFamilyPairing(storage), undefined);
});

test("server-side name changes update the matching local identities", () => {
  const pairing = familyPairingForDevice(credential, deviceTwo);
  const updated = pairingWithUpdatedDevices(pairing, [
    { deviceId: deviceOne, name: "Dad Goose" },
    { deviceId: deviceTwo, name: "Kid Goose" },
  ]);
  assert.equal(updated.selfName, "Kid Goose");
  assert.equal(updated.peerName, "Dad Goose");
});

test("a credential cannot be installed on an unrelated device", () => {
  assert.throws(
    () => familyPairingForDevice(credential, "33333333333333333333333333333333"),
    /different devices/,
  );
});

test("only the other paired device sees and prompts for a waiting join request", () => {
  const request = { deviceId: deviceTwo, requestId: "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr", expiresAt: Date.now() + 60_000 };
  assert.equal(joinRequestVisibleToDevice(request, deviceTwo), undefined);
  assert.deepEqual(joinRequestVisibleToDevice(request, deviceOne), request);

  const hostPairing = familyPairingForDevice(credential, deviceOne);
  const status = { devices: credential.devices, joinRequest: request };
  assert.deepEqual(peerJoinRequestToPrompt(status, hostPairing), request);
  assert.equal(peerJoinRequestToPrompt(status, hostPairing, request.requestId), undefined);
  assert.equal(peerJoinRequestToPrompt({ ...status, joinRequest: { ...request, deviceId: deviceOne } }, hostPairing), undefined);
});

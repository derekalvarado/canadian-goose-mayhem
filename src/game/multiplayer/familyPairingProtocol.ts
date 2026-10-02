import type { RoomInvitation } from "./RoomSignalingClient.ts";

export const FAMILY_PAIRING_VERSION = 1;
export const FAMILY_PAIRING_STORAGE_KEY = "goose-game-two:family-pairing";
export const FAMILY_PLAYER_NAME_STORAGE_KEY = "goose-game-two:family-player-name";
export const FAMILY_DEVICE_ID_STORAGE_KEY = "goose-game-two:family-device-id";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,128}$/u;
const CODE_PATTERN = /^\d{4}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export interface FamilyDeviceIdentity {
  readonly deviceId: string;
  readonly name: string;
}

export interface FamilyPairingCredential {
  readonly version: 1;
  readonly pairId: string;
  readonly pairKey: string;
  readonly devices: readonly [FamilyDeviceIdentity, FamilyDeviceIdentity];
}

export interface StoredFamilyPairing {
  readonly version: 1;
  readonly pairId: string;
  readonly pairKey: string;
  readonly deviceId: string;
  readonly selfName: string;
  readonly peerDeviceId: string;
  readonly peerName: string;
}

export interface FamilyJoinRequest {
  readonly deviceId: string;
  readonly requestId: string;
  readonly expiresAt: number;
}

export interface FamilyPublishedRoom {
  readonly hostDeviceId: string;
  readonly requestId: string;
  readonly invitation: RoomInvitation;
  readonly expiresAt: number;
}

export interface FamilyPairStatus {
  readonly devices: readonly [FamilyDeviceIdentity, FamilyDeviceIdentity];
  readonly activeHost?: Readonly<{ deviceId: string; expiresAt: number }>;
  readonly joinRequest?: FamilyJoinRequest;
  readonly room?: FamilyPublishedRoom;
}

export interface PairingCodeStatus {
  readonly state: "waiting" | "approval-needed" | "paired" | "denied" | "expired";
  readonly candidate?: FamilyDeviceIdentity;
  readonly pairing?: FamilyPairingCredential;
}

export function normalizeFamilyPlayerName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter a player name.");
  const name = value.trim().replace(/\s+/gu, " ");
  if (!name || name.length > 24 || CONTROL_CHARACTERS.test(name)) {
    throw new Error("Player names must be 1–24 ordinary characters.");
  }
  return name;
}

export function parseFamilyPairingCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim() : "";
  if (!CODE_PATTERN.test(code)) throw new Error("Enter the four-digit pairing code.");
  return code;
}

export function assertFamilyToken(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !TOKEN_PATTERN.test(value)) throw new Error(`Invalid ${label}.`);
}

export function familyPairingForDevice(
  pairing: FamilyPairingCredential,
  deviceId: string,
): StoredFamilyPairing {
  assertFamilyToken(pairing.pairId, "pairing ID");
  assertFamilyToken(pairing.pairKey, "pairing key");
  assertFamilyToken(deviceId, "device ID");
  if (pairing.version !== FAMILY_PAIRING_VERSION || pairing.devices.length !== 2) {
    throw new Error("This pairing uses an unsupported version.");
  }
  const self = pairing.devices.find((device) => device.deviceId === deviceId);
  const peer = pairing.devices.find((device) => device.deviceId !== deviceId);
  if (!self || !peer) throw new Error("This pairing belongs to different devices.");
  assertFamilyToken(self.deviceId, "device ID");
  assertFamilyToken(peer.deviceId, "peer device ID");
  return {
    version: 1,
    pairId: pairing.pairId,
    pairKey: pairing.pairKey,
    deviceId: self.deviceId,
    selfName: normalizeFamilyPlayerName(self.name),
    peerDeviceId: peer.deviceId,
    peerName: normalizeFamilyPlayerName(peer.name),
  };
}

export function parseStoredFamilyPairing(value: unknown): StoredFamilyPairing | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<StoredFamilyPairing>;
  try {
    if (candidate.version !== FAMILY_PAIRING_VERSION) return undefined;
    assertFamilyToken(candidate.pairId, "pairing ID");
    assertFamilyToken(candidate.pairKey, "pairing key");
    assertFamilyToken(candidate.deviceId, "device ID");
    assertFamilyToken(candidate.peerDeviceId, "peer device ID");
    if (candidate.deviceId === candidate.peerDeviceId) return undefined;
    return {
      version: 1,
      pairId: candidate.pairId,
      pairKey: candidate.pairKey,
      deviceId: candidate.deviceId,
      selfName: normalizeFamilyPlayerName(candidate.selfName),
      peerDeviceId: candidate.peerDeviceId,
      peerName: normalizeFamilyPlayerName(candidate.peerName),
    };
  } catch {
    return undefined;
  }
}

export function pairingWithUpdatedDevices(
  pairing: StoredFamilyPairing,
  devices: readonly FamilyDeviceIdentity[],
): StoredFamilyPairing {
  if (devices.length !== 2) return pairing;
  const self = devices.find((device) => device.deviceId === pairing.deviceId);
  const peer = devices.find((device) => device.deviceId === pairing.peerDeviceId);
  if (!self || !peer) return pairing;
  return {
    ...pairing,
    selfName: normalizeFamilyPlayerName(self.name),
    peerName: normalizeFamilyPlayerName(peer.name),
  };
}

export function loadStoredFamilyPairing(storage: Pick<Storage, "getItem"> = window.localStorage): StoredFamilyPairing | undefined {
  try {
    const encoded = storage.getItem(FAMILY_PAIRING_STORAGE_KEY);
    return encoded ? parseStoredFamilyPairing(JSON.parse(encoded)) : undefined;
  } catch {
    return undefined;
  }
}

export function saveStoredFamilyPairing(
  pairing: StoredFamilyPairing,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): void {
  storage.setItem(FAMILY_PAIRING_STORAGE_KEY, JSON.stringify(pairing));
  storage.setItem(FAMILY_PLAYER_NAME_STORAGE_KEY, pairing.selfName);
  storage.setItem(FAMILY_DEVICE_ID_STORAGE_KEY, pairing.deviceId);
}

export function clearStoredFamilyPairing(storage: Pick<Storage, "removeItem"> = window.localStorage): void {
  storage.removeItem(FAMILY_PAIRING_STORAGE_KEY);
}

export function loadFamilyPlayerName(storage: Pick<Storage, "getItem"> = window.localStorage): string {
  try {
    const value = storage.getItem(FAMILY_PLAYER_NAME_STORAGE_KEY);
    return value ? normalizeFamilyPlayerName(value) : "";
  } catch {
    return "";
  }
}

export function saveFamilyPlayerName(
  name: string,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): string {
  const normalized = normalizeFamilyPlayerName(name);
  storage.setItem(FAMILY_PLAYER_NAME_STORAGE_KEY, normalized);
  return normalized;
}

export function createFamilyToken(bytes = 16): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function loadOrCreateFamilyDeviceId(storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage): string {
  try {
    const existing = storage.getItem(FAMILY_DEVICE_ID_STORAGE_KEY);
    if (existing) {
      assertFamilyToken(existing, "device ID");
      return existing;
    }
  } catch { /* Generate an in-memory identity when storage is unavailable. */ }
  const deviceId = createFamilyToken();
  try { storage.setItem(FAMILY_DEVICE_ID_STORAGE_KEY, deviceId); } catch { /* Optional storage. */ }
  return deviceId;
}

export function createFourDigitPairingCode(): string {
  const data = new Uint16Array(1);
  crypto.getRandomValues(data);
  return String(data[0]! % 10_000).padStart(4, "0");
}

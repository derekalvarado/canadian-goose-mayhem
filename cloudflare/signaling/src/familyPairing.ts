import { DurableObject } from "cloudflare:workers";
import {
  assertFamilyToken,
  FAMILY_PAIRING_VERSION,
  joinRequestVisibleToDevice,
  normalizeFamilyPlayerName,
  type FamilyDeviceIdentity,
  type FamilyJoinRequest,
  type FamilyPairStatus,
  type FamilyPairingCredential,
  type FamilyPublishedRoom,
  type PairingCodeStatus,
} from "../../../src/game/multiplayer/familyPairingProtocol.ts";
import type { RoomInvitation } from "../../../src/game/multiplayer/RoomSignalingClient.ts";

export interface FamilyPairingEnv {
  readonly PAIRINGS: DurableObjectNamespace<FamilyPairing>;
}

interface PairingCandidate extends FamilyDeviceIdentity {
  readonly requestToken: string;
}

interface PairingCodeState {
  readonly creator: FamilyDeviceIdentity;
  readonly creatorToken: string;
  readonly expiresAt: number;
  candidate?: PairingCandidate;
  deniedTokens: string[];
  pairing?: FamilyPairingCredential;
}

interface StoredFamilyPairState {
  pairing: FamilyPairingCredential;
  activeHost?: Readonly<{ deviceId: string; expiresAt: number }>;
  joinRequest?: FamilyJoinRequest;
  room?: FamilyPublishedRoom;
}

const CODE_LIFETIME_MS = 5 * 60 * 1_000;
const HOST_LEASE_MS = 35 * 1_000;
const JOIN_REQUEST_LIFETIME_MS = 10 * 60 * 1_000;
const PUBLISHED_ROOM_LIFETIME_MS = 20 * 60 * 1_000;
const MAX_BODY_BYTES = 2_048;

function randomToken(bytes = 16): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function error(message: string, status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return json({ message, code, ...extra }, status);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new Error("Request is too large.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("Request is too large.");
  const decoded: unknown = JSON.parse(raw);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("Invalid request.");
  return decoded as Record<string, unknown>;
}

function deviceIdentity(value: unknown): FamilyDeviceIdentity {
  if (!value || typeof value !== "object") throw new Error("Invalid device identity.");
  const candidate = value as Partial<FamilyDeviceIdentity>;
  assertFamilyToken(candidate.deviceId, "device ID");
  return { deviceId: candidate.deviceId, name: normalizeFamilyPlayerName(candidate.name) };
}

function invitation(value: unknown): RoomInvitation {
  if (!value || typeof value !== "object") throw new Error("Invalid multiplayer room.");
  const candidate = value as Partial<RoomInvitation>;
  assertFamilyToken(candidate.roomId, "room ID");
  assertFamilyToken(candidate.reconnectToken, "room key");
  return { roomId: candidate.roomId, reconnectToken: candidate.reconnectToken };
}

function actionFrom(request: Request): string {
  return new URL(request.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
}

export class PairingCode extends DurableObject<FamilyPairingEnv> {
  constructor(ctx: DurableObjectState, private readonly bindings: FamilyPairingEnv) {
    super(ctx, bindings);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return error("Method not allowed.", 405, "method");
    try {
      const action = actionFrom(request);
      const body = await readBody(request);
      let state = await this.ctx.storage.get<PairingCodeState>("state");
      const now = Date.now();
      if (state && state.expiresAt <= now) {
        await this.ctx.storage.deleteAll();
        state = undefined;
      }

      if (action === "create") {
        if (state) return error("That code is already in use.", 409, "code-in-use");
        const creator = deviceIdentity(body.device);
        const created: PairingCodeState = {
          creator,
          creatorToken: randomToken(),
          expiresAt: now + CODE_LIFETIME_MS,
          deniedTokens: [],
        };
        await this.ctx.storage.put("state", created);
        await this.ctx.storage.setAlarm(created.expiresAt);
        return json({ creatorToken: created.creatorToken, expiresAt: created.expiresAt }, 201);
      }

      if (!state) return error("That pairing code expired or does not exist.", 404, "code-not-found");
      if (action === "join") return this.join(state, body);
      if (action === "status") return this.status(state, body);
      if (action === "approve") return this.approve(state, body);
      if (action === "deny") return this.deny(state, body);
      if (action === "cancel") return this.cancel(state, body);
      return error("Pairing action not found.", 404, "not-found");
    } catch (caught) {
      return error(caught instanceof Error ? caught.message : "Invalid pairing request.", 400, "invalid-request");
    }
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  private async join(state: PairingCodeState, body: Record<string, unknown>): Promise<Response> {
    if (state.pairing) return error("That pairing code has already been used.", 409, "code-used");
    const device = deviceIdentity(body.device);
    if (device.deviceId === state.creator.deviceId) return error("Use the other device to enter this code.", 400, "same-device");
    const candidate: PairingCandidate = { ...device, requestToken: randomToken() };
    state.candidate = candidate;
    await this.ctx.storage.put("state", state);
    return json({ requestToken: candidate.requestToken, expiresAt: state.expiresAt }, 201);
  }

  private status(state: PairingCodeState, body: Record<string, unknown>): Response {
    const role = body.role;
    const token = body.token;
    assertFamilyToken(token, "pairing request token");
    let response: PairingCodeStatus;
    if (role === "creator") {
      if (token !== state.creatorToken) return error("Pairing request is not authorized.", 403, "forbidden");
      response = state.pairing
        ? { state: "paired", pairing: state.pairing }
        : state.candidate
          ? { state: "approval-needed", candidate: { deviceId: state.candidate.deviceId, name: state.candidate.name } }
          : { state: "waiting" };
      return json(response);
    }
    if (role !== "joiner") return error("Invalid pairing role.", 400, "invalid-role");
    if (state.pairing && token === state.candidate?.requestToken) return json({ state: "paired", pairing: state.pairing } satisfies PairingCodeStatus);
    if (state.deniedTokens.includes(token)) return json({ state: "denied" } satisfies PairingCodeStatus);
    if (token !== state.candidate?.requestToken) return error("Pairing request is not authorized.", 403, "forbidden");
    return json({ state: "waiting" } satisfies PairingCodeStatus);
  }

  private async approve(state: PairingCodeState, body: Record<string, unknown>): Promise<Response> {
    assertFamilyToken(body.creatorToken, "creator token");
    assertFamilyToken(body.candidateDeviceId, "candidate device ID");
    if (body.creatorToken !== state.creatorToken) return error("Pairing request is not authorized.", 403, "forbidden");
    if (!state.candidate || state.candidate.deviceId !== body.candidateDeviceId) {
      return error("That pairing request is no longer waiting.", 409, "candidate-changed");
    }
    if (!state.pairing) {
      const pairing: FamilyPairingCredential = {
        version: FAMILY_PAIRING_VERSION,
        pairId: randomToken(),
        pairKey: randomToken(24),
        devices: [state.creator, { deviceId: state.candidate.deviceId, name: state.candidate.name }],
      };
      const id = this.bindings.PAIRINGS.idFromName(pairing.pairId);
      const initialized = await this.bindings.PAIRINGS.get(id).fetch(new Request("https://pairing.internal/init", {
        method: "POST",
        body: JSON.stringify({ pairing }),
      }));
      if (!initialized.ok) return error("Could not save the approved pairing.", 503, "pairing-init");
      state.pairing = pairing;
      await this.ctx.storage.put("state", state);
    }
    return json({ pairing: state.pairing });
  }

  private async deny(state: PairingCodeState, body: Record<string, unknown>): Promise<Response> {
    assertFamilyToken(body.creatorToken, "creator token");
    assertFamilyToken(body.candidateDeviceId, "candidate device ID");
    if (body.creatorToken !== state.creatorToken) return error("Pairing request is not authorized.", 403, "forbidden");
    if (state.candidate?.deviceId === body.candidateDeviceId) {
      state.deniedTokens = [...state.deniedTokens.slice(-3), state.candidate.requestToken];
      state.candidate = undefined;
      await this.ctx.storage.put("state", state);
    }
    return json({ ok: true });
  }

  private async cancel(state: PairingCodeState, body: Record<string, unknown>): Promise<Response> {
    assertFamilyToken(body.creatorToken, "creator token");
    if (body.creatorToken !== state.creatorToken) return error("Pairing request is not authorized.", 403, "forbidden");
    await this.ctx.storage.deleteAll();
    return json({ ok: true });
  }
}

export class FamilyPairing extends DurableObject<FamilyPairingEnv> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return error("Method not allowed.", 405, "method");
    try {
      const action = actionFrom(request);
      const body = await readBody(request);
      if (new URL(request.url).hostname === "pairing.internal" && action === "init") return this.initialize(body);

      let state = await this.ctx.storage.get<StoredFamilyPairState>("state");
      if (!state) return error("This device pairing no longer exists.", 404, "pairing-missing");
      assertFamilyToken(body.pairKey, "pairing key");
      assertFamilyToken(body.deviceId, "device ID");
      if (body.pairKey !== state.pairing.pairKey || !state.pairing.devices.some((device) => device.deviceId === body.deviceId)) {
        return error("Pairing credentials do not match.", 403, "forbidden");
      }
      state = await this.removeExpiredState(state);
      const deviceId = body.deviceId;
      if (action === "status") return json(this.visibleStatus(state, deviceId, body.requestId));
      if (action === "claim-host") return this.claimHost(state, deviceId);
      if (action === "heartbeat") return this.heartbeat(state, deviceId);
      if (action === "release-host") return this.releaseHost(state, deviceId);
      if (action === "join") return this.join(state, deviceId, body);
      if (action === "publish-room") return this.publishRoom(state, deviceId, body);
      if (action === "update-name") return this.updateName(state, deviceId, body.name);
      if (action === "forget") {
        await this.ctx.storage.deleteAll();
        return json({ ok: true });
      }
      return error("Pairing action not found.", 404, "not-found");
    } catch (caught) {
      return error(caught instanceof Error ? caught.message : "Invalid pairing request.", 400, "invalid-request");
    }
  }

  private async initialize(body: Record<string, unknown>): Promise<Response> {
    const pairing = body.pairing as FamilyPairingCredential | undefined;
    if (!pairing || pairing.version !== FAMILY_PAIRING_VERSION || pairing.devices?.length !== 2) {
      return error("Invalid family pairing.", 400, "invalid-pairing");
    }
    assertFamilyToken(pairing.pairId, "pairing ID");
    assertFamilyToken(pairing.pairKey, "pairing key");
    const devices = pairing.devices.map(deviceIdentity) as unknown as [FamilyDeviceIdentity, FamilyDeviceIdentity];
    if (devices[0].deviceId === devices[1].deviceId) return error("Pairing devices must be different.", 400, "same-device");
    const existing = await this.ctx.storage.get<StoredFamilyPairState>("state");
    if (existing && existing.pairing.pairKey !== pairing.pairKey) return error("Pairing already exists.", 409, "pairing-exists");
    if (!existing) await this.ctx.storage.put("state", { pairing: { ...pairing, devices } } satisfies StoredFamilyPairState);
    return json({ ok: true });
  }

  private async removeExpiredState(state: StoredFamilyPairState): Promise<StoredFamilyPairState> {
    const now = Date.now();
    let changed = false;
    if (state.activeHost && state.activeHost.expiresAt <= now) {
      state.activeHost = undefined;
      state.room = undefined;
      changed = true;
    }
    if (state.joinRequest && state.joinRequest.expiresAt <= now) {
      state.joinRequest = undefined;
      state.room = undefined;
      changed = true;
    }
    if (state.room && state.room.expiresAt <= now) {
      state.room = undefined;
      changed = true;
    }
    if (changed) await this.ctx.storage.put("state", state);
    return state;
  }

  private visibleStatus(state: StoredFamilyPairState, deviceId: string, requestId: unknown): FamilyPairStatus {
    const room = typeof requestId === "string"
      && state.room?.requestId === requestId
      && state.joinRequest?.deviceId === deviceId
      ? state.room
      : undefined;
    return {
      devices: state.pairing.devices,
      activeHost: state.activeHost,
      joinRequest: joinRequestVisibleToDevice(state.joinRequest, deviceId),
      room,
    };
  }

  private async claimHost(state: StoredFamilyPairState, deviceId: string): Promise<Response> {
    if (state.activeHost && state.activeHost.deviceId !== deviceId) {
      const hostName = state.pairing.devices.find((device) => device.deviceId === state.activeHost?.deviceId)?.name ?? "Your paired player";
      return error(`${hostName} is already hosting.`, 409, "already-hosting", { hostName });
    }
    state.activeHost = { deviceId, expiresAt: Date.now() + HOST_LEASE_MS };
    if (state.joinRequest?.deviceId === deviceId) state.joinRequest = undefined;
    state.room = undefined;
    await this.ctx.storage.put("state", state);
    return json(this.visibleStatus(state, deviceId, undefined));
  }

  private async heartbeat(state: StoredFamilyPairState, deviceId: string): Promise<Response> {
    if (state.activeHost?.deviceId !== deviceId) return error("This device is no longer the active host.", 409, "host-lost");
    state.activeHost = { deviceId, expiresAt: Date.now() + HOST_LEASE_MS };
    await this.ctx.storage.put("state", state);
    return json(this.visibleStatus(state, deviceId, undefined));
  }

  private async releaseHost(state: StoredFamilyPairState, deviceId: string): Promise<Response> {
    if (state.activeHost?.deviceId === deviceId) {
      state.activeHost = undefined;
      state.room = undefined;
      await this.ctx.storage.put("state", state);
    }
    return json({ ok: true });
  }

  private async join(state: StoredFamilyPairState, deviceId: string, body: Record<string, unknown>): Promise<Response> {
    assertFamilyToken(body.requestId, "join request ID");
    if (state.activeHost?.deviceId === deviceId) return error("A host cannot join its own game.", 409, "host-cannot-join");
    if (state.joinRequest?.requestId !== body.requestId || state.joinRequest.deviceId !== deviceId) state.room = undefined;
    state.joinRequest = { deviceId, requestId: body.requestId, expiresAt: Date.now() + JOIN_REQUEST_LIFETIME_MS };
    await this.ctx.storage.put("state", state);
    return json(this.visibleStatus(state, deviceId, body.requestId));
  }

  private async publishRoom(state: StoredFamilyPairState, deviceId: string, body: Record<string, unknown>): Promise<Response> {
    assertFamilyToken(body.requestId, "join request ID");
    if (state.activeHost?.deviceId !== deviceId) return error("This device is no longer the active host.", 409, "host-lost");
    if (!state.joinRequest || state.joinRequest.requestId !== body.requestId || state.joinRequest.deviceId === deviceId) {
      return error("That player is no longer waiting to join.", 409, "join-request-missing");
    }
    state.room = {
      hostDeviceId: deviceId,
      requestId: body.requestId,
      invitation: invitation(body.invitation),
      expiresAt: Date.now() + PUBLISHED_ROOM_LIFETIME_MS,
    };
    await this.ctx.storage.put("state", state);
    return json(this.visibleStatus(state, deviceId, undefined));
  }

  private async updateName(state: StoredFamilyPairState, deviceId: string, value: unknown): Promise<Response> {
    const name = normalizeFamilyPlayerName(value);
    state.pairing = {
      ...state.pairing,
      devices: state.pairing.devices.map((device) => device.deviceId === deviceId ? { ...device, name } : device) as unknown as [FamilyDeviceIdentity, FamilyDeviceIdentity],
    };
    await this.ctx.storage.put("state", state);
    return json(this.visibleStatus(state, deviceId, undefined));
  }
}

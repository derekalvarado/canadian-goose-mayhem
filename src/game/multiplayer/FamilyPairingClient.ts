import {
  createFourDigitPairingCode,
  type FamilyDeviceIdentity,
  type FamilyPairStatus,
  type FamilyPairingCredential,
  type PairingCodeStatus,
  type StoredFamilyPairing,
} from "./familyPairingProtocol.ts";
import type { RoomInvitation } from "./RoomSignalingClient.ts";

interface ServiceErrorBody {
  readonly code?: string;
  readonly message?: string;
  readonly hostName?: string;
}

const SERVICE_TIMEOUT_MS = 12_000;

export class FamilyPairingServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly hostName?: string,
  ) {
    super(message);
  }
}

export interface PairingCodeSession {
  readonly code: string;
  readonly creatorToken: string;
  readonly expiresAt: number;
}

export interface PairingJoinSession {
  readonly code: string;
  readonly requestToken: string;
  readonly expiresAt: number;
}

export class FamilyPairingClient {
  constructor(private readonly serviceUrl: string) {}

  async createCode(device: FamilyDeviceIdentity): Promise<PairingCodeSession> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = createFourDigitPairingCode();
      try {
        const created = await this.request<{ creatorToken: string; expiresAt: number }>(
          `/pairing-codes/${code}/create`,
          { device },
        );
        return { code, ...created };
      } catch (error) {
        if (!(error instanceof FamilyPairingServiceError) || error.code !== "code-in-use") throw error;
      }
    }
    throw new Error("Could not reserve a pairing code. Try again.");
  }

  async requestPairing(code: string, device: FamilyDeviceIdentity): Promise<PairingJoinSession> {
    const joined = await this.request<{ requestToken: string; expiresAt: number }>(
      `/pairing-codes/${encodeURIComponent(code)}/join`,
      { device },
    );
    return { code, ...joined };
  }

  pairingCodeStatus(
    session: PairingCodeSession | PairingJoinSession,
    role: "creator" | "joiner",
  ): Promise<PairingCodeStatus> {
    const token = role === "creator"
      ? (session as PairingCodeSession).creatorToken
      : (session as PairingJoinSession).requestToken;
    return this.request(`/pairing-codes/${encodeURIComponent(session.code)}/status`, { role, token });
  }

  approvePairing(session: PairingCodeSession, candidateDeviceId: string): Promise<{ pairing: FamilyPairingCredential }> {
    return this.request(`/pairing-codes/${encodeURIComponent(session.code)}/approve`, {
      creatorToken: session.creatorToken,
      candidateDeviceId,
    });
  }

  denyPairing(session: PairingCodeSession, candidateDeviceId: string): Promise<void> {
    return this.request(`/pairing-codes/${encodeURIComponent(session.code)}/deny`, {
      creatorToken: session.creatorToken,
      candidateDeviceId,
    });
  }

  cancelPairingCode(session: PairingCodeSession): Promise<void> {
    return this.request(`/pairing-codes/${encodeURIComponent(session.code)}/cancel`, {
      creatorToken: session.creatorToken,
    });
  }

  pairStatus(pairing: StoredFamilyPairing, requestId?: string): Promise<FamilyPairStatus> {
    return this.pairRequest(pairing, "status", requestId ? { requestId } : {});
  }

  claimHost(pairing: StoredFamilyPairing): Promise<FamilyPairStatus> {
    return this.pairRequest(pairing, "claim-host", {});
  }

  heartbeatHost(pairing: StoredFamilyPairing): Promise<FamilyPairStatus> {
    return this.pairRequest(pairing, "heartbeat", {});
  }

  releaseHost(pairing: StoredFamilyPairing, keepalive = false): Promise<void> {
    return this.pairRequest(pairing, "release-host", {}, keepalive);
  }

  requestJoin(pairing: StoredFamilyPairing, requestId: string): Promise<FamilyPairStatus> {
    return this.pairRequest(pairing, "join", { requestId });
  }

  publishRoom(
    pairing: StoredFamilyPairing,
    requestId: string,
    invitation: RoomInvitation,
  ): Promise<FamilyPairStatus> {
    return this.pairRequest(pairing, "publish-room", { requestId, invitation });
  }

  updateName(pairing: StoredFamilyPairing, name: string): Promise<FamilyPairStatus> {
    return this.pairRequest(pairing, "update-name", { name });
  }

  forget(pairing: StoredFamilyPairing): Promise<void> {
    return this.pairRequest(pairing, "forget", {});
  }

  private pairRequest<T = FamilyPairStatus>(
    pairing: StoredFamilyPairing,
    action: string,
    values: Record<string, unknown>,
    keepalive = false,
  ): Promise<T> {
    return this.request(`/pairs/${encodeURIComponent(pairing.pairId)}/${action}`, {
      pairKey: pairing.pairKey,
      deviceId: pairing.deviceId,
      ...values,
    }, keepalive);
  }

  private async request<T>(path: string, body: unknown, keepalive = false): Promise<T> {
    const url = new URL(path, this.serviceUrl);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SERVICE_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        keepalive,
        signal: controller.signal,
      });
      const raw = await response.text();
      let decoded: unknown;
      try { decoded = raw ? JSON.parse(raw) : undefined; }
      catch { decoded = undefined; }
      if (!response.ok) {
        const error = decoded && typeof decoded === "object" ? decoded as ServiceErrorBody : undefined;
        throw new FamilyPairingServiceError(
          error?.message ?? "Family pairing could not be completed.",
          response.status,
          error?.code,
          error?.hostName,
        );
      }
      return decoded as T;
    } catch (error) {
      if (error instanceof FamilyPairingServiceError) throw error;
      if (controller.signal.aborted) {
        throw new FamilyPairingServiceError("Pairing service did not respond in time.", 0, "timeout");
      }
      throw new FamilyPairingServiceError("Could not reach the family pairing service.", 0, "network");
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

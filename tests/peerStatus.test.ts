import assert from "node:assert/strict";
import test from "node:test";
import { PeerStatusTracker, type PeerStatus, type PeerTransportEvent } from "../src/game/multiplayer/peerStatus.ts";

const open: PeerTransportEvent = { type: "channel-open" };
const state = (value: string): PeerTransportEvent => ({ type: "connection-state", state: value });

function reports(events: readonly PeerTransportEvent[]): (PeerStatus | undefined)[] {
  const tracker = new PeerStatusTracker();
  return events.map((event) => tracker.next(event));
}

test("a link reports connected exactly once, whichever signal arrives first", () => {
  // The order a busy host saw when the guest froze: channel open, then the connection state.
  assert.deepEqual(reports([state("connecting"), open, state("connected")]), [undefined, "connected", undefined]);
  assert.deepEqual(reports([state("connecting"), state("connected"), open]), [undefined, undefined, "connected"]);
});

test("a weak link is reported as interrupted and then restored, not as a new connection", () => {
  assert.deepEqual(reports([open, state("connected"), state("disconnected"), state("connected")]),
    ["connected", undefined, "interrupted", "connected"]);
});

test("flapping before the first connection is not reported", () => {
  assert.deepEqual(reports([state("checking"), state("disconnected"), state("connecting"), open]),
    [undefined, undefined, undefined, "connected"]);
});

test("a closed channel or failed connection ends the link once, and remembers whether it ever connected", () => {
  const dropped = new PeerStatusTracker();
  assert.equal(dropped.next(open), "connected");
  assert.equal(dropped.next({ type: "channel-closed" }), "disconnected");
  assert.equal(dropped.next(state("failed")), undefined);
  assert.equal(dropped.everConnected, true);

  const unreachable = new PeerStatusTracker();
  assert.equal(unreachable.next(state("checking")), undefined);
  assert.equal(unreachable.next(state("failed")), "failed");
  assert.equal(unreachable.next(open), undefined);
  assert.equal(unreachable.everConnected, false);
});

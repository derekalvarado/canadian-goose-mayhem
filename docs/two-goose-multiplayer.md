# Two-goose multiplayer implementation

Status: approved for implementation on 2026-09-30. Work is being delivered in
small, tested checkpoints on `codex/two-goose-multiplayer`.

## Product decisions

- The game supports at most two geese.
- Both geese inhabit one persistent village session and share the host's task
  progress and world state.
- Local play uses two individual sideways Joy-Cons on one iPad. Both geese stay
  in the same area and share one camera.
- Online play uses two iPads. The host owns the authoritative simulation and its
  saved progress. The guest runs the full game presentation and sends controls
  for Goose 2.
- Online geese may visit different authored areas. The host keeps every occupied
  area active and sends the guest the authoritative snapshots it needs.
- GitHub Pages remains the only deployment target for the first version. WebRTC
  setup therefore uses a two-step offer/answer exchange rather than matchmaking.
- Nearby sharing should offer the native iPad share sheet (including AirDrop), QR
  codes, and copy/paste as fallbacks.
- If the guest disconnects, Goose 2 stands still and drops nothing. The same guest
  can reconnect while the host session remains open. Closing the host ends the
  online session; accounts, cloud saves, host migration, and later reconnection
  require a future server.

## Architectural boundaries

1. `Simulation` remains authoritative and advances at one fixed 60 Hz step.
2. Every input source produces a typed command for a stable player ID. Local
   controllers and WebRTC are adapters; neither decides gameplay outcomes.
3. World snapshots and gameplay events carry actor identity. Interactions use one
   ownership resolver so two geese cannot hold the same object.
4. The network protocol is transport-independent, versioned, validates incoming
   data, and has strict size/rate limits. WebRTC is its first transport; a future
   signaling service can replace only the offer/answer adapter.
5. The host sends authoritative snapshots. The guest may interpolate and predict
   presentation but never completes tasks or resolves collisions locally.
6. Existing single-player saves remain local and compatible. Online play writes
   progress only on the host.

## Delivery checkpoints

- [x] Input foundation: explicit gamepad profiles, per-pad sampling, press-to-join
  assignments, and an on-screen controller diagnostics panel suitable for iPad.
- [x] Multiplayer protocol: bounded command/snapshot messages with protocol tests.
- [x] Manual WebRTC signaling: host offer, guest answer, reconnect token, native
  sharing, copy fallback, and a QR adapter.
- [ ] Two-player simulation: stable `goose-1`/`goose-2` actors, deterministic
  movement and interaction arbitration, actor-aware NPC reactions and events.
- [ ] Local presentation: second goose view, shared-camera framing, two-controller
  lobby, disconnect behavior, and same-area transitions.
- [ ] Online host/guest presentation: host-authoritative snapshots, independent
  area views, guest input, latency handling, and Goose 2 standing on disconnect.
- [ ] PWA and device verification: GitHub Pages subpath links, two iPads, AirDrop,
  QR exchange, sideways Joy-Cons, reconnect while host is open, offline fallback.

Every checkpoint must keep single-player working and pass `npm test` and
`npm run build`. Browser-only behavior also requires an in-browser smoke test.

## Current audit

- Ready: fixed-step headless simulation, typed player command, durable entity IDs,
  area snapshots, presentation-only rendering, PWA/GitHub Pages base-path support.
- Correction needed: player identity is hard-coded as `goose` throughout the
  simulation, interactions, events, NPC targeting, and `Game` presentation.
- Correction needed: `InputController` selects only the first connected gamepad
  and assumes a standard Xbox-style mapping. It has no join assignment or iPad
  diagnostics.
- Correction needed: one `Game` instance owns one active area, one goose view,
  one camera target, and one area-transition curtain.
- Remaining after the first checkpoint: online host/guest loop wiring,
  independently occupied area sessions, actor-aware NPC targeting, and device
  lifecycle/playtests.

## Implementation status

- Controller profiles, sideways Joy-Con transforms, right-axis fallback,
  press-to-join assignment, and the iPad diagnostics readout are implemented.
- The versioned network protocol rejects oversized, malformed, replayed, and
  rate-flooded guest commands. Manual WebRTC transport and compressed URL-fragment
  signaling are implemented with Share/AirDrop, QR, copy/paste, and response relay
  to the original host tab. Same-network play is the current connectivity target;
  no unapproved third-party STUN/TURN service is silently used.
- `Simulation` can now run two geese in the same fixed tick. They move, honk,
  interact, hold separate items, arbitrate simultaneous grabs deterministically,
  and leave Goose 2 standing with her item when commands stop.
- The janitor, splash-pad kids, barista, café customers, and kitchen worker now
  choose and react to the relevant nearby goose instead of always targeting
  Goose 1. Shoo events retain the affected goose identity.
- Local presentation renders and animates Goose 2, assigns two controllers, uses
  a shared midpoint camera, and moves both geese through an area doorway together.
- The WebRTC data channel is wired into the game loop for same-area play: Goose 2
  commands are authenticated and rate-limited at the host; the guest renders
  bounded-rate authoritative host snapshots and never writes local progress.
- Still required: support independently occupied areas online, replicate
  one-shot presentation events and the guest to-do UI, add smoothing for remote
  snapshots, and perform real iPad/Joy-Con/WebRTC playtests.
- Latest automated checkpoint: all 211 tests pass; production TypeScript build is
  clean. Browser/device smoke testing has not yet been performed.

## Restart note

Resume with the first unchecked checkpoint. Before stopping a work window, update
this file, run the relevant tests and build, and commit the last passing state.

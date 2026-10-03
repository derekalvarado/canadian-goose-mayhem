# Two-goose multiplayer implementation

Status: same-area local and online play with remembered family-device pairing is
implemented.

## Product decisions

- The game supports at most two geese.
- Both geese inhabit one persistent village session and share the host's task
  progress and world state.
- Local play uses two individual sideways Joy-Cons on one iPad. Both geese stay
  in the same area and share one camera.
- Online play uses two nearby devices. Either paired device can host; the host
  owns the authoritative simulation and its saved progress. The guest runs the
  full game presentation and sends controls for Goose 2.
- Online geese currently stay in the same authored area. Independently occupied
  areas remain future work.
- GitHub Pages remains the game deployment target. A small Cloudflare Worker and
  Durable Objects remember one approved device pair, coordinate Host/Join, and
  provide short-lived signaling rooms; gameplay still travels peer-to-peer over
  WebRTC.
- Four-digit codes are the only online pairing flow, so both players stay inside
  their installed PWA.
- Tapping Join sends the paired player an in-game request with **Host game** and
  **Not now** choices, so the host does not have to discover the request manually.
- If the guest disconnects, Goose 2 stands still and drops nothing. Closing the
  host still ends the authoritative session. Host migration and durable shared
  saves remain future work. A guest can reopen the paired app and tap Join while
  the host remains open.

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
- [x] WebRTC foundation: host offer, guest answer, and reconnect credentials.
- [x] Two-player simulation: stable `goose-1`/`goose-2` actors, deterministic
  movement and interaction arbitration, actor-aware NPC reactions and events.
- [x] Local presentation: second goose view, shared-camera framing, two-controller
  lobby, disconnect behavior, and same-area transitions.
- [x] Online host/guest presentation: host-authoritative same-area snapshots,
  guest input, latency handling, and Goose 2 standing on disconnect.
- [x] Cloudflare signaling foundation: automatic offer/answer relay and
  short-lived authenticated rooms.
- [x] Remembered family pairing: single-use four-digit codes, explicit approval,
  one paired peer, editable names, first-host-wins presence, Join-before-Host,
  an in-game Join request, guest reconnect, and either device hosting a later
  game.
- [ ] PWA and device verification: GitHub Pages, two iPads, four-digit pairing,
  sideways Joy-Cons, reconnect while host is open, and offline fallback.

Every checkpoint must keep single-player working and pass `npm test` and
`npm run build`. Browser-only behavior also requires an in-browser smoke test.

## Current audit

- Ready: fixed-step two-player simulation, typed player commands, durable entity
  IDs, actor-aware interactions, two-controller assignment, iPad diagnostics,
  same-area host/guest snapshots, presentation smoothing, PWA/GitHub Pages
  support, Cloudflare rooms, and remembered pairing.
- Remaining: independently occupied area sessions, real two-iPad verification of
  the new code flow, broader network traversal, and host migration/shared saves.

## Implementation status

- Controller profiles, sideways Joy-Con transforms, right-axis fallback,
  press-to-join assignment, and the iPad diagnostics readout are implemented.
- The versioned network protocol rejects oversized, malformed, replayed, and
  rate-flooded guest commands. The preferred flow pairs the installed apps once
  with a four-digit code; either device can then Host or Join by saved player
  name. Same-network play is the current connectivity target; no third-party
  STUN/TURN service is silently used.
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
  one-shot presentation events and the guest to-do UI, and perform complete
  two-iPad/Joy-Con playtests of the code flow.
- The signaling Worker is configured under `cloudflare/signaling`; Wrangler owns
  provisioning and deployment. Pairing requires explicit approval and long random
  credentials; rooms accept one host and one guest, expire after twenty minutes,
  restrict browser origins, and retain only WebRTC setup messages.
- Latest automated checkpoint: all 240 tests pass; the game and Worker TypeScript
  builds are clean. The local Worker passed both the room relay smoke test and the
  full pair/approve/first-host/join-before-host/private-room/forget smoke test.
- Browser acceptance checkpoint: two isolated local app origins paired by code
  and completed the automatic Host/Join WebRTC connection.
- Deployment checkpoint: Worker version `8fa4c5d8-fa3c-4596-b9e9-73ee9ca7a59e`
  is live at `https://goose-game-signaling.goose-game-2.workers.dev`; its health,
  room-relay, and full family-pairing smoke tests pass.

## Restart note

Resume with the first unchecked checkpoint. Before stopping a work window, update
this file, run the relevant tests and build, and commit the last passing state.

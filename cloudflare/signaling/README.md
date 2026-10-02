# Multiplayer signaling room

This Cloudflare Worker remembers one approved pair of family devices, decides
which one is currently hosting, and introduces one host browser to one guest
browser. It relays their WebRTC offer and answer, then stays out of gameplay.
Game commands and snapshots continue over the peer-to-peer data channel.

Pairing begins with a single-use four-digit code that expires after five minutes.
The device showing the code must approve the named requester. The resulting pair
uses long random credentials, stores only two player names and random device IDs,
and remains until either device forgets or replaces it. Host presence has a short
lease, so a closed host stops blocking a later game.

Rooms use an unguessable ID and key, accept at most one socket per role, and
expire after twenty minutes. The Worker stores only the latest offer/answer
needed to finish the connection. Game saves and gameplay traffic never pass
through this service.

The production service is
`https://goose-game-signaling.goose-game-2.workers.dev`. Its address is public
configuration, not a secret; each private connection receives an unguessable
room ID and key.

## What is where

- `src/index.ts` — health endpoint, origin checks, pairing routes, WebSocket
  upgrades, and the `SignalingRoom` Durable Object
- `src/familyPairing.ts` — expiring codes, explicit approval, remembered pairs,
  host presence, waiting guests, and private-room handoff
- `wrangler.jsonc` — Worker name, allowed production origins, Durable Object
  bindings, rate limiters, migrations, and privacy-safe observability
- `../../src/game/multiplayer/FamilyPairingClient.ts` — browser client for device
  pairing and Host/Join presence
- `../../src/game/multiplayer/RoomSignalingClient.ts` — browser client for these
  rooms
- `../../src/game/multiplayer/MultiplayerMenu.ts` — creates private rooms and
  starts the WebRTC offer/answer flow
- `../../.env.production` — tells the GitHub Pages build which Worker to use
- `../../.env.local` — optional ignored override for local development

## Local development

```sh
npm run signaling:dev
npm run signaling:smoke -- http://127.0.0.1:8787
npm run signaling:smoke:pairing -- http://127.0.0.1:8787
```

Set `VITE_SIGNALING_URL=http://127.0.0.1:8787` in `.env.local`, then run the game
normally to exercise family pairing and rooms against the local Worker. Restart
Vite after changing an environment file. Use two different browser origins or
browser profiles when testing pairing because one origin intentionally keeps one
device identity in local storage.

The smoke script sends the same `Origin` header a browser would. Its optional
second argument overrides that origin when testing a different allowed site:

```sh
npm run signaling:smoke -- http://127.0.0.1:8787 http://192.168.1.20:5173
```

## Deployment

1. Run `npx wrangler login` once for the Cloudflare account.
2. Run `npm run signaling:deploy`.
3. Put the printed HTTPS endpoint in `.env.local` for local builds.
4. Put the public endpoint in the tracked `.env.production` file so GitHub Pages
   builds enable pairing and rooms. `VITE_SIGNALING_URL` can still override it when
   deploying a different environment.

The first deployment may ask the account owner to choose a `workers.dev`
subdomain in the Cloudflare dashboard. Production browser origins are listed in
`wrangler.jsonc`; private LAN and loopback HTTP origins are also accepted for
device testing.

Wrangler creates or updates the Worker and all three Durable Object classes from
`wrangler.jsonc`; there is no separate server to provision. A new public game
origin must be added to `ALLOWED_ORIGINS` before that site can pair or open rooms.

## Public safety boundary

- Every room WebSocket must include either the configured GitHub Pages origin or
  an HTTP loopback/private-LAN development origin. Missing and unknown origins
  are rejected before a Durable Object is opened.
- Pairing-code creation and guessing share a strict per-network limit. A normal
  pair needs one creation and one entry; repeated guesses pause for one minute.
- A four-digit code alone cannot create a pairing. The code-creating device must
  approve the requester's displayed name, after which both devices receive a
  random pairing ID and 192-bit key.
- Pair credentials authorize only the two stored random device IDs. Pair status
  reveals a private room only to the guest whose current Join request it matches.
- A host lease expires after about 35 seconds without a heartbeat. Pairing remains
  stored, but stale host and room state are cleared.
- `ROOM_HANDSHAKES` permits 30 room connection attempts per minute for one
  connecting network address. A normal game uses only one host and one guest
  connection.
- Each accepted socket may send at most eight signaling messages. The normal
  flow sends one offer or one answer; the extra allowance covers harmless retries.
- Every room accepts only one host and one guest and deletes its stored key and
  offer/answer after 20 minutes.
- Observability remains enabled, but `redact_query_string` prevents the room key
  in the WebSocket URL from being persisted in invocation logs.
- Room credentials are capabilities delivered only through the authenticated
  device pair. Anyone who obtains them can use that room until it expires.

The origin check is defense in depth, not user authentication—a custom client can
forge browser headers. The rate limiter and per-socket message budget therefore
remain necessary even with the allowlist.

## Verify production

The small health check confirms that the Worker is reachable:

```sh
curl https://goose-game-signaling.goose-game-2.workers.dev/health
```

The smoke test opens a host socket and a guest socket, then checks that one fake
offer and answer travel through the room:

```sh
npm run signaling:smoke -- https://goose-game-signaling.goose-game-2.workers.dev
```

The pairing smoke test creates and approves a code, verifies first-host-wins,
publishes a private room to the waiting guest, changes a name, releases the host,
and forgets the pair:

```sh
npm run signaling:smoke:pairing -- https://goose-game-signaling.goose-game-2.workers.dev
```

## Troubleshooting

- **The pairing buttons are unavailable.** `VITE_SIGNALING_URL` was missing when
  Vite started or when the production bundle was built. Check the appropriate
  environment file, then restart or rebuild.
- **A code is missing, expired, or says there are too many attempts.** Make one
  fresh code and enter it once. Codes last five minutes. The limiter resets after
  one minute.
- **The wrong player name asks for approval.** Deny it. The code remains active
  for the nearby intended player until it expires or the creator cancels it.
- **The other device says the old host is still active.** A clean close releases
  immediately; otherwise wait about 35 seconds for the lease and try Host again.
- **A pairing disappeared on one device.** The other player forgot or replaced
  it. The server deliberately removes the pair for both sides; make a new code.
- **The Worker returns 403.** The request has no browser origin, or the game is
  running on a public origin that is not in `ALLOWED_ORIGINS`. Add the exact
  public origin to the comma-separated value in `wrangler.jsonc` and deploy
  again. Private `10.*`, `172.16–31.*`, `192.168.*`, localhost, `127.0.0.1`, and
  `[::1]` HTTP origins are accepted for testing.
- **The Worker returns 429.** One network made too many room or pairing attempts.
  Close stale game tabs, wait one minute, and make one fresh attempt.
- **The Worker health check passes, but WebRTC never connects.** Signaling only
  introduces the browsers. The current peer transport has no STUN/TURN service,
  so use the same ordinary Wi-Fi, avoid guest-network client isolation and VPNs,
  keep the host page open, and create a fresh room.
- **A room says the host is missing or closes before connection.** Rooms are
  temporary, the host must remain open, and a newer connection for the same role
  replaces the older one. Tap Host and Join again.
- **A deployment changed the service address.** Update `.env.production` and any
  local override, rebuild the site, and run the production smoke test.

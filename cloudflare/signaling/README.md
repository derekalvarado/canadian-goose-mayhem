# Multiplayer signaling room

This Cloudflare Worker introduces one host browser and one guest browser, relays
their WebRTC offer and answer, and then stays out of gameplay. Game commands and
snapshots continue over the peer-to-peer data channel.

Rooms use an unguessable ID and key from the invitation fragment, accept at most
one socket per role, and expire after twenty minutes. The Worker stores only the
latest offer/answer needed to finish the connection. Manual two-step signaling in
the game remains the fallback when this service is unavailable.

The production service is
`https://goose-game-signaling.goose-game-2.workers.dev`. Its address is public
configuration, not a secret; the unguessable room ID and key are created in each
invitation.

## What is where

- `src/index.ts` — health endpoint, origin checks, WebSocket upgrade, room
  lifetime, and the `SignalingRoom` Durable Object
- `wrangler.jsonc` — Worker name, allowed production origins, Durable Object
  binding, handshake rate limiter, migration, and privacy-safe observability
- `../../src/game/multiplayer/RoomSignalingClient.ts` — browser client for these
  rooms
- `../../src/game/multiplayer/MultiplayerMenu.ts` — creates invitations and
  starts the WebRTC offer/answer flow
- `../../.env.production` — tells the GitHub Pages build which Worker to use
- `../../.env.local` — optional ignored override for local development

## Local development

```sh
npm run signaling:dev
npm run signaling:smoke -- http://127.0.0.1:8787
```

Set `VITE_SIGNALING_URL=http://127.0.0.1:8787` in `.env.local`, then run the game
normally to exercise one-link rooms against the local Worker. Restart Vite after
changing an environment file.

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
   builds enable one-link rooms. `VITE_SIGNALING_URL` can still override it when
   deploying a different environment.

The first deployment may ask the account owner to choose a `workers.dev`
subdomain in the Cloudflare dashboard. Production browser origins are listed in
`wrangler.jsonc`; private LAN and loopback HTTP origins are also accepted for
device testing.

Wrangler creates or updates both the Worker and its Durable Object from
`wrangler.jsonc`; there is no separate server to provision. A new public game
origin must be added to `ALLOWED_ORIGINS` before that site can open rooms.

## Public safety boundary

- Every room WebSocket must include either the configured GitHub Pages origin or
  an HTTP loopback/private-LAN development origin. Missing and unknown origins
  are rejected before a Durable Object is opened.
- `ROOM_HANDSHAKES` permits 30 room connection attempts per minute for one
  connecting network address. A normal game uses only one host and one guest
  connection.
- Each accepted socket may send at most eight signaling messages. The normal
  flow sends one offer or one answer; the extra allowance covers harmless retries.
- Every room accepts only one host and one guest and deletes its stored key and
  offer/answer after 20 minutes.
- Observability remains enabled, but `redact_query_string` prevents the room key
  in the WebSocket URL from being persisted in invocation logs.
- The invitation is a capability: anyone who receives its unguessable room ID
  and key can use that room until it expires. Make a new room if a link is shared
  accidentally.

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

## Troubleshooting

- **The game offers only manual setup.** `VITE_SIGNALING_URL` was missing when
  Vite started or when the production bundle was built. Check the appropriate
  environment file, then restart or rebuild.
- **The Worker returns 403.** The request has no browser origin, or the game is
  running on a public origin that is not in `ALLOWED_ORIGINS`. Add the exact
  public origin to the comma-separated value in `wrangler.jsonc` and deploy
  again. Private `10.*`, `172.16–31.*`, `192.168.*`, localhost, `127.0.0.1`, and
  `[::1]` HTTP origins are accepted for testing.
- **The Worker returns 429.** One network made too many room connection attempts.
  Close stale game tabs, wait one minute, and create one fresh room.
- **The Worker health check passes, but WebRTC never connects.** Signaling only
  introduces the browsers. The current peer transport has no STUN/TURN service,
  so use the same ordinary Wi-Fi, avoid guest-network client isolation and VPNs,
  keep the host page open, and create a fresh room.
- **A room says the host is missing or closes before connection.** Invitations
  are temporary, the host must open the room first, and a newer connection for
  the same role replaces the older one. Create a new room and use only its latest
  link.
- **A deployment changed the service address.** Update `.env.production` and any
  local override, rebuild the site, and run the production smoke test.

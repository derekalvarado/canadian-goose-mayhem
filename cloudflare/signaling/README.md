# Multiplayer signaling room

This Cloudflare Worker introduces one host browser and one guest browser, relays
their WebRTC offer and answer, and then stays out of gameplay. Game commands and
snapshots continue over the peer-to-peer data channel.

Rooms use an unguessable ID and key from the invitation fragment, accept at most
one socket per role, and expire after twenty minutes. The Worker stores only the
latest offer/answer needed to finish the connection. Manual two-step signaling in
the game remains the fallback when this service is unavailable.

## Local development

```sh
npm run signaling:dev
npm run signaling:smoke -- http://127.0.0.1:8787
```

Set `VITE_SIGNALING_URL=http://127.0.0.1:8787` in `.env.local`, then run the game
normally to exercise one-link rooms against the local Worker.

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

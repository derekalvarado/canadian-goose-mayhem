# Goose Game 2 — Old Town Square

This is a browser-based 3D interpretation of Fort Collins' Old Town Square. You
control an original, cel-shaded Canada goose in the central plaza and a coffee
shop. The game starts in the square, next to the shop, which holds most of the
to-do list (see [Coffee shop challenges](#coffee-shop-challenges)).

The current game has shared object interactions, independent tasks, a janitor,
splash-pad kids, a working café crew, two-goose local play, and host-authoritative
online play. People react to nearby goose mischief and recover without ending the
game. Crossed-off tasks are saved in the host browser; loose objects, people, and
their positions still reset after a reload.

Read the [game architecture and development sequence](docs/game-architecture.md)
before adding mechanics or neighborhoods. It separates the systems already in
the game from later work such as sight and hearing, richer physics, and full world
saves.

## Play locally

```bash
npm install
npm run dev
```

Open the local URL Vite prints in a browser.

To test from another device on the same network, run `npm run dev:lan` and open
the Network URL Vite prints on that device.

The app installs a service worker and caches the game shell, bundles, models,
audio, and public assets. After opening the game once while online, it can launch
and keep running without a network connection; the development origin also
caches files as they load so it can fall back when Vite becomes unreachable. A
phone must use HTTPS (or localhost) for service workers; plain HTTP LAN IPs
cannot provide this browser guarantee. Offline play is single-player only;
creating an online room needs the Cloudflare service, and the two devices need a
working network connection while they play.

## Play together: two geese

### The explain-it-like-I-am-five version

The host is the device holding the real storybook. It decides where both geese
are, what every person is doing, and which tasks are crossed off. The other
device is another window into that same storybook. It sends Goose 2's buttons to
the host and receives the host's latest picture of the game.

Cloudflare is the friend who remembers that these two devices belong together
and introduces them when they want to play. It remembers only the two player
names and random pairing credentials—not the village or its save. After the
introduction, actual game traffic travels directly between the devices over
WebRTC. Both devices currently need to be on the same Wi-Fi because the game
does not yet use an internet relay.

There are never more than two geese.

### Pair the two Home Screen apps once

1. Open the installed Goose Game 2 app on both devices and tap **Play together**.
2. Enter a player name on each device.
3. On either device, tap **Show a 4-digit code**.
4. Enter that code on the other device and tap **Pair**.
5. Look back at the device showing the code. It names the requesting player;
   tap **Yes, pair** only if that is the person beside you.

The code expires after five minutes and works once. The two apps remember each
other after pairing, so no link, QR code, or Safari tab is needed next time.
Each app remembers only one paired player. **Pair a different device** clearly
warns that a successful new pairing replaces the old one.

### Play after pairing

1. On either device, open **Play together** and tap **Host game**. The host uses
   its own saved to-do list.
2. On the other device, tap **Join _player name_**. It is also fine to tap Join
   first; that app waits until the paired player starts hosting.
3. Wait for both devices to say they are connected. The host controls Goose 1
   and the joining device controls Goose 2.

If both players tap Host, the first device to reach Cloudflare stays host and the
other automatically joins it. Either device can host a later game.

The host owns the saved to-do list. If Player 2 disconnects, Goose 2 stands still
and the host can keep playing. To reconnect while the host game is still open,
reopen the Home Screen app and tap **Join** again. If the host closes or reloads
the game, that live multiplayer session is over; after its short presence lease
expires, either paired device can host a new game. Pairing itself is not lost.

Online area changes are not finished yet. Keep both geese in the current area
during device testing rather than trying to leave one goose in the square and
the other in the coffee shop.

### Two controllers on one iPad

1. Pair both individual Joy-Cons in iPad Settings first.
2. In the game, choose **Play together** → **Two controllers on this iPad**.
3. Press any button on the first sideways Joy-Con to claim Goose 1.
4. Press any button on the second sideways Joy-Con to claim Goose 2.

Both geese share one screen, one area, and one camera. The game remembers which
physical controller claimed each goose until local multiplayer is restarted.

### Where the Cloudflare parts live

- `cloudflare/signaling/src/index.ts` — Worker routing, origin checks, and safety
  limits for pairing and temporary rooms
- `cloudflare/signaling/src/familyPairing.ts` — five-minute codes, approval,
  remembered device pairs, host presence, and waiting-to-join state
- `cloudflare/signaling/wrangler.jsonc` — the Worker name, allowed production
  browser origin, Durable Object bindings, rate limits, and deployment settings
- `cloudflare/signaling/README.md` — local testing, deployment, health checks,
  and service-specific troubleshooting
- `.env.production` — the public Worker address included in GitHub Pages builds
- `.env.local` — an ignored local override for development
- `src/game/multiplayer/familyPairingProtocol.ts` — validated local pairing data
  and the one-paired-player browser record
- `src/game/multiplayer/FamilyPairingClient.ts` — the short pairing and presence
  conversation with Cloudflare
- `src/game/multiplayer/MultiplayerMenu.ts` — codes, approval, Host/Join buttons,
  and reconnecting
- `src/game/multiplayer/RoomSignalingClient.ts` — the short conversation with
  the Cloudflare room
- `src/game/multiplayer/WebRtcPeer.ts` — the direct browser-to-browser data
  channel used after the introduction

Wrangler is Cloudflare's command-line tool. `npm run signaling:deploy` deploys
the Worker and provisions its Durable Object from the checked-in configuration.
The deployed service is currently
`https://goose-game-signaling.goose-game-2.workers.dev`.

The public Worker requires an approved browser origin, strictly limits code
creation/guessing per network, requires approval on the code-creating device,
and uses long random credentials after pairing. It also limits room connection
attempts, closes a signaling socket that sends more than the small offer/answer
budget, deletes rooms after 20 minutes, and redacts room keys from persisted
request logs. No game save or gameplay traffic is stored there.

### Multiplayer troubleshooting

| What you see | What to do |
| --- | --- |
| A pairing code does not work | Check all four digits and make sure the code is less than five minutes old. Make one fresh code rather than guessing repeatedly; too many attempts pause pairing for one minute. |
| A strange name asks to pair | Tap **No**. Only approve the player sitting beside you. The code remains usable until it expires or is cancelled. |
| Join says it is waiting | Leave that screen open and tap **Host game** on the paired device. Join can safely be tapped before Host. |
| The old host was closed and the other device cannot host yet | Wait about 35 seconds for the host-presence lease to expire, then tap **Host game** again. The devices remain paired. |
| A device says its pairing was forgotten | The other device forgot or replaced the pairing. Pair the two devices again with a new 4-digit code. |
| An iPad cannot open the game from the Mac during development | Start the game with `npm run dev:lan`, keep the Mac awake, and open the Mac's LAN address, such as `http://192.168…`, instead of `localhost`. Check the macOS firewall if the page itself will not load. |
| The devices pair, but the geese never connect | Keep both apps open and in the foreground, then tap **Join** again. Make sure both devices are on the same normal Wi-Fi, not a guest network or VPN. |
| The game says it cannot reach the private room | Open the Worker's `/health` URL or run the signaling smoke test described in `cloudflare/signaling/README.md`. The game page's public origin must also appear in `ALLOWED_ORIGINS` in `wrangler.jsonc`; private LAN origins are accepted automatically. |
| Repeated room attempts temporarily stop connecting | Wait one minute, close old game tabs, and tap **Host** and **Join** again. This safety limit is deliberately much higher than one family session needs. |
| Pairing buttons are unavailable | That build did not receive `VITE_SIGNALING_URL`. Check `.env.production` or `.env.local`, then restart Vite or rebuild the site. |
| Goose 2 looks jerky | Refresh both devices and reconnect so both are running the current movement-smoothing build. Keep them near a strong Wi-Fi access point and close older game tabs. |
| A Joy-Con is paired but does nothing | Press one of its buttons so Safari exposes it, then open **Settings** → **Controller diagnostics**. The readout shows every axis and button without needing an iPad console. Switch controllers require iPadOS 16 or newer. |
| The game pauses on an iPad | Keep Safari or the Home Screen app in the foreground and rotate the iPad to landscape. |
| Player 2 disconnected | Goose 2 remains standing. Reopen the paired app and tap **Join** again while the host remains open. There is no mid-session host migration if the host closes. |

The Cloudflare room expires after 20 minutes. It is needed only to introduce the
paired browsers, so that timer does not end a WebRTC game that already connected.

### Dev mode and start areas

The normal URL always starts in Old Town Square. Add `?dev` to turn on dev mode,
which shows a "DEV START · <area>" badge and lets `start=<area>` choose where the goose
begins:

```text
http://localhost:5173/?dev&start=coffee-shop
```

| Area | `start` value |
| --- | --- |
| Old Town Square plaza (default) | `old-town-square.central-plaza` |
| Coffee shop interior | `old-town-square.coffee-shop` (or the shorthand `coffee-shop`) |

`start` is ignored without `?dev`, and an unknown area falls back to the square. Combine it with `?overview` for an orbitable view of that area, or with
`?edit` to open the world builder there (for example,
`?overview&dev&start=old-town-square.central-plaza`).

## Build and arrange the world

Open the same local URL with `?edit` at the end (for example,
`http://localhost:5173/?edit`) to enter the in-game world builder. It can switch
between areas, move or rotate existing objects, place reusable catalog assets,
edit playable chunks, and draw camera tracks and zones. Changes snap to a grid
and save automatically in this browser; normal play mode uses the saved world too.

Use **Export world** to download the complete, versioned multi-area document.
That file contains the areas, playable chunks, asset instances, stable IDs,
positions, rotations, and camera tracks. It can be attached to a future Codex
request and made permanent in `src/game/content/world-layout.json`. **Import
world** restores an exported world, and **Reset defaults** clears the browser
draft and returns to the checked-in canonical world. The older
`src/game/content/plaza-layout.json` is retained only to migrate old drafts.

The editor also supports laptop-friendly keyboard controls. Press **?** or **F1**
to open the shortcut drawer. Hold `WASD` to fly the camera, use `Space`/`Shift`
to move up/down, hold `IJKL` to orbit, and hold `O`/`U` to zoom out/in. `H`
focuses the selected object, the arrow keys move it, `Q`/`E` rotate it, and `Tab` cycles through
objects. While placing an asset, **Enter** places it at the camera focus;
**Shift+Enter** keeps placing. **Home** resets the view, **R** rotates the
placement preview, and **Esc** cancels placement. `\` hides both panels for a
clear view of the world (press it again to bring them back); each panel also has
its own fold button.

## Controls

- Move: `WASD`, arrow keys, or the controller left stick
- Hurry: `Shift` or the right trigger
- Honk: `Space` or the controller south face button
- Use, grab, or drop: `F` or the controller east face button
- Toggle spread wings: `Q` or the controller west face button
- Toggle sneak: `E` or the controller north face button
- Threaten while held: `Control` or the controller left shoulder button

A single right Joy-Con is supported sideways in Safari on macOS and iPadOS: the
stick moves, `SR` hurries, `A` honks, `X` uses, `B` spreads, `Y` sneaks, and `SL`
threatens.

On touch-first devices, play in landscape with the floating left-side joystick
(18 px dead zone, 86 px full deflection); push past 62 CSS pixels to hurry (it
releases below 52 pixels) and use the separate right-side **Honk**, **Use**,
**Spread**, **Sneak**, and **Threat** buttons. Spread and Sneak toggle on and off;
Threat remains active only while held. The Settings button offers touch controls
Auto, Show, or Hide; this preference is local to the browser, not a game save.
Portrait pauses only on coarse-pointer touch devices, so a narrow desktop window
remains playable. Fullscreen is offered where the browser permits it; mobile
browsers may require the Fullscreen button's direct tap and may decline the
request.

## Install on iPhone or iPad

For a true app-like view without Safari's address bar, open the game in Safari,
tap **Share**, choose **Add to Home Screen**, then launch it from the Goose Game 2
Home Screen icon. The included web-app manifest requests standalone landscape
presentation; Safari's address bar cannot be removed reliably from an ordinary
browser tab.

The camera follows the goose from above. In areas with authored camera tracks, it rides a hand-drawn path in the sky and swings around corners as the goose moves; a track can own a zone on the ground, and the camera glides over to it while the goose is inside. Other areas use a fixed diagonal angle. When the janitor comes near, the camera widens its aim to keep both in the shot. Tracks are edited in the world builder (`?edit` → **Edit camera tracks**).

## Project layout

- `src/game/Game.ts` — presentation loop, camera, local/online input, and simulation wiring
- `src/game/cameraTrack.ts` — authored sky camera tracks: smoothing, nearest-point riding, and far-goose lean-in
- `src/game/cameraDirector.ts` — picks which camera track to ride from the ground zones and glides between tracks
- `src/game/cameraFraming.ts` — widens the camera's aim to fit a nearby important character in the shot
- `src/game/controlHeading.ts` — keeps a held movement direction steady while the camera swings
- `src/game/simulation/Simulation.ts` — fixed-step gameplay state and typed commands/events
- `src/game/simulation/Objectives.ts` — independent outcome-based task completion
- `src/game/simulation/cafeCrew.ts` — coffee-shop barista, customer, and come-and-go regular routines, acting through the shared grab/place rules
- `src/game/simulation/townsfolk.ts` — splash-pad parents, plaza passers-by, and the small white dog: pastimes, walking the paving graph, and light reactions to the goose
- `src/game/challenges.ts` — stable village tasks and the area whose HUD list shows each one
- `src/game/progress.ts` — saving and loading crossed-off tasks in the browser
- `src/game/simulation/plaza.ts` — legacy plaza-only rules retained for reference
- `src/game/GameAudio.ts` — browser audio output, separate from gameplay decisions
- `src/game/Goose.ts` — runtime loader, layered clips, and head tracking for the rigged Canada goose
- `src/game/GooseAnimation.ts` — presentation-only gait phase and blend state
- `src/game/GooseModel.ts` — bootstrap goose geometry and original prototype animation recipe
- `src/game/SplashKidModel.ts` — three soft, rounded splash-pad kids (Milo, June, Ari) with play/reaction clips
- `src/game/splashKidMoves.ts` — kid pose builders: contact-planted skips and gallops, splashes, flee runs, and crying
- `src/game/JanitorModel.ts` — procedural janitor mesh, rig, and exported clips
- `src/game/janitorGaits.ts` — knob-driven walk/chase gaits with leg IK that keeps stance feet planted
- `src/game/personRig.ts` — shared kit for adults on the janitor's rig (skeleton, skinned shapes, hair shells), used by café people and townsfolk
- `src/game/CafePersonModel.ts`, `src/game/cafeMoves.ts` — the five coffee-shop people on the janitor's rig, and their clips
- `src/game/TownsfolkModel.ts`, `src/game/townsfolkMoves.ts`, `src/game/townsfolkTuning.ts` — thirteen parents, passers-by, and café regulars, their clips, and their speeds and timings
- `src/game/DogModel.ts` — the small white terrier, its rig and clips
- `src/game/TownsfolkView.ts` — townsfolk and dog presentation (built at runtime, no GLB), with phone and takeaway-cup props
- `src/game/CafePropsView.ts` — counter, espresso back bar, and café props (tip jar, croissants, cups, radio, bell)
- `src/dev/animLab/` — shared runtime for the dev-only character animation labs
- `src/dev/janitorLab/`, `src/dev/kidLab/`, `src/dev/cafeLab/`, `src/dev/townLab/` — janitor, splash-kid, café-people, and townsfolk lab variants
- `assets/characters/goose/goose-animated.blend` — current editable Blender character and animation source
- `src/game/WorldView.ts` — renders a selected authored world area from reusable asset instances
- `src/game/WorldEditor.ts` — in-game multi-area world-building tools and asset placement workflow
- `src/game/CameraTrackEditor.ts` — world-builder mode for drawing, tuning, and previewing an area's camera tracks and their zones
- `src/game/editorCatalog.ts` — the editor's drag-and-drop asset catalog drawer with rendered thumbnails
- `src/game/worldAssets.ts` — source-owned catalog of render, collision, and occlusion metadata
- `src/game/worldLayout.ts` — sparse 64 m chunk documents, playable regions, area transitions, browser drafts, import/export, and old-draft upgrades
- `src/game/content/world-layout.json` — canonical multi-area square and coffee-shop world
- `src/game/worldLevel.ts` — renderer-independent collision, chunk, and stepped-surface queries for placed catalog assets
- `src/game/PlazaWorld.ts` — procedural asset-view factories retained by the world catalog
- `src/game/ForestWorld.ts` — earlier forest presentation retained as a reference
- `src/game/InputController.ts` — keyboard, touch, standard-controller, and two-controller assignment input
- `src/game/multiplayer/protocol.ts` — bounded, versioned Goose 2 commands and authoritative host snapshots
- `src/game/multiplayer/WebRtcPeer.ts` — direct peer-to-peer data-channel transport
- `src/game/multiplayer/familyPairingProtocol.ts` — remembered two-device pairing records and validation
- `src/game/multiplayer/FamilyPairingClient.ts` — Cloudflare pairing, presence, Host, and Join requests
- `src/game/multiplayer/RoomSignalingClient.ts` — automatic Cloudflare room client
- `src/game/multiplayer/networkMotion.ts` — smooth guest prediction and host correction without changing gameplay authority
- `src/game/multiplayer/MultiplayerMenu.ts` — one-time device pairing, local play, Host/Join, reconnecting, and link fallback UI
- `cloudflare/signaling/` — paired-device presence plus short-lived one-host/one-guest signaling rooms deployed with Wrangler
- `src/game/plazaLevel.ts` — legacy plaza-only bounds and collision retained for tests and migration
- `src/game/plazaLayout.ts` — legacy PlazaEditor document validation used for automatic migration
- `src/game/content/plaza-layout.json` — legacy canonical plaza arrangement migrated into the world document
- `src/game/level.ts` — earlier forest bounds and collision helpers
- `src/game/toonMaterial.ts` — shared three-band material for all characters and solid props
- `src/game/palette.ts` — canonical named colors shared by the 3D scene
- `tests/plazaLevel.test.ts` — active plaza boundary and landmark tests
- `tests/level.test.ts` — retained forest boundary and trail tests
- `tests/simulation.test.ts` — timing, two-goose rules, input edges, objectives, pause/reset, and backtracking
- `tests/familyPairing.test.ts`, `tests/multiplayerProtocol.test.ts`, `tests/roomSignaling.test.ts`, `tests/networkMotion.test.ts` — remembered pairing, network trust boundaries, room links, and smooth guest presentation

Run `npm test` for headless gameplay checks and `npm run build` for TypeScript and
the production bundle. The headless tests use Node's TypeScript stripping; use
Node 22.18+ or a newer version supported by the installed Vite release.

Open `?animation` for the close-up goose movement studio: walk/hurry, threat/sneak,
wingbeats, honk/grab/startle, moving head target, slow motion, and frame stepping.
See the [goose authoring workflow](assets/characters/goose/README.md) for Blender
editing/export and the remaining limits of foot contact at the current game speed.

Open `/assets/characters/janitor/anim-lab.html` (with `npm run dev`) for the janitor
animation lab: clip variants side by side with the shipped clips, game-camera, side,
and front views, frame stepping, and a treadmill floor that shows foot sliding. It
builds the rig from source, so edits to `src/dev/janitorLab/variants.ts` or
`JanitorModel.ts` reload in about a second. Use `?group=chase&zoom` to open a tab
close up. `/assets/characters/kids/anim-lab.html` is the same lab for the splash-pad
kids, `/assets/characters/cafe/anim-lab.html` for the coffee-shop people, and
`/assets/characters/townsfolk/anim-lab.html` for the townsfolk and the dog (its **Options** tab
holds alternatives to pick from). New character animation is prototyped in a lab like this before it ships;
see [AGENTS.md](AGENTS.md#prototyping-character-animation).

## Coffee shop challenges

The coffee shop is a puzzle room with a to-do list, in the spirit of the original
goose game. A barista works the espresso machine, calls out orders, clears cups,
and chases the goose away from the counter; a laptop worker orders coffee, walks up
to collect it, and is not easily scared (he waves the goose off himself); a newspaper
reader glances up now and then to guard her croissant; a student sips her coffee.
Frighten the reader or the student and the barista comes running to herd the goose
all the way out the front door. Through a doorway in the back wall, beside the counter, is the bakery
kitchen, where a baker works the prep table, oven, pastry racks, and sink, and waves
off any goose underfoot. The room has an old plank floor, a chalk menu, and tall
black walls that hide the town outside.

Each level has its own to-do list, and the HUD shows only the list for the level the
goose is in. A task still counts wherever it is finished, so the tip jar crosses off
the coffee shop's list once it is out in the square. The square's list:

- Sneak into the coffee shop

The coffee shop's list:

- Turn off the café music
- Make someone spill their coffee
- Steal a croissant
- Steal someone's order
- Have a coffee break at the empty table
- Take the tip jar outside

Each task can be solved more than one way: the radio pulls the barista across the
room, the bell pulls her to the register, a spill sends her to wipe a table, and
customers leave their tables to collect orders. The tip jar is heavy, so the goose
cannot hurry while carrying it.

Crossed-off tasks are saved in the browser, so a refresh keeps them. Props and
people keep their state while moving between areas but start fresh after a reload.
**Settings → Start over** clears the list. With `?dev`,
add `&fresh` to play with an empty list without erasing the saved one; `?dev` also
exposes the running game as `gooseGame` in the browser console for playtesting.

Use `?dev&start=old-town-square.central-plaza` to test walking through the plaza
doorway, and `?edit&dev&start=coffee-shop` to rearrange the shop in the world editor.

## Color palette

The art direction uses a restrained, cel-shaded storybook palette: sage lawns and
layered bottle greens, warm taupe paths and wood, a brown Canada goose with a
black head and white chinstrap, plus brick red, navy, cream, and sunlight accents. Scene colors are
defined in `src/game/palette.ts`; matching HUD tokens live at the top of
`src/style.css`. Add new colors there instead of embedding values in components.

The earlier Godot experiment remains in `scenes/` and `scripts/`, and the original 2D Phaser prototype remains in `legacy/phaser-prototype/` for reference.

## Cel-shaded art and future characters

Keep models and animation in 3D. Use smooth, simple silhouettes and broad color
markings, with no individual feather meshes or surface micro-detail. The goose's
wings and tail are single forms; its white chinstrap lies against the head.

Use `toonMaterial()` for every solid mesh, including future homes, trash cans,
and characters. Imported models should have their materials replaced with this
factory while retaining their skeleton, morph targets, and animation clips.
Instanced props use a white base material with per-instance palette colors.
Use flat normals for deliberate rock/building planes and smooth normals for
rounded bodies and foliage; cel shading does not require faceting every model.

New stylized cel-shaded assets should aim for a roughly 6/10 detail tier:
clear silhouettes, modest construction or material cues, and a few layered
forms that make the object recognizable at play distance. Avoid primitive-only
models and photorealism; detail should support the established storybook style
without becoming surface micro-detail.

The shared lighting uses neutral ambient light (92%) and one directional sun
(8%), leaving only faint directional contrast and grounding shadows. The goose
uses a constant toon ramp for flat palette colors without body-shading bands.
Its torso, tail, neck, and head form one continuous Blender-authored surface;
folded wings are thin tapered blades, not attached ovoids. The white chinstrap
is a marking cut into that skin. Keep `NoToneMapping`. Avoid hemisphere/fill
lights, bloom, fog, glossy materials, and additive glows. Animated character
parts cast faint shadows onto the world but do not receive self-shadow seams.

## Photo-informed Old Town Square

The current square uses the approved muted-brick storefront style and a composition
informed by the DDA site plan and renovation photos. Open `?overview` for an orbitable
view of the complete square, with links to walking and editing modes. The editor
catalog includes all five GLB storefronts and the new landmark blocks and street
furniture. See [reconstruction references and approximations](docs/old-town-reconstruction.md).

Older browser drafts are archived before the new composition is loaded. Use
**Restore previous square** in the editor to recover one; other authored areas stay
intact. If browser storage cannot retain the backup, the previous draft stays active.

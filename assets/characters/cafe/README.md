# Coffee-shop people

Five people work and drink coffee in the coffee shop and its kitchen, each with its own runtime export
in `models/`:

| Person           | Variant   | Look                                                        |
|------------------|-----------|-------------------------------------------------------------|
| Barista          | `barista` | Green apron over a cream shirt, rolled sleeves, auburn bun  |
| Laptop worker    | `laptop`  | Blue hoodie, mustard beanie, beard, glasses, white sneakers |
| Newspaper reader | `reader`  | Silver bob, round glasses, plum cardigan over a blouse      |
| Student          | `student` | Green sweater with a cream band, high ponytail, jeans       |
| Baker            | `baker`   | Double-breasted chef's jacket, toque, apron, ginger moustache |

They are built on the janitor's 18-bone rig and proportions (he is the reference for
how people look in the game), scaled slightly per person, with their own faces, hair,
and clothes. All are Y-up, face -Z, and have left/right hand sockets. The coffee-shop
tables and chairs are sized to these people.

Each GLB has two mouths, `cafe-mouth` (smile) and `cafe-mouth-open` (surprised). The
view opens the mouth when someone is startled, shooing, or calling out an order.

Clips: `idle`, `look`, `walk`, `carry`, `jog`, `shoo`, `brew`, `wipe`, `fiddle`, `greet`,
`startle`, `shrug`, `knead`, and the seated `sit`, `sit-type`, `sit-read`, `sit-sip`, `sit-look`,
`sit-wait`, `sit-startle`, `sit-dab`, `sit-shoo`. Poses live in `src/game/cafeMoves.ts`;
walk speeds come from `src/game/cafeTuning.ts`, which the routines also use.
Regenerate the exports with:

```sh
npm run assets:cafe
```

Open `anim-lab.html` through the Vite development server to review every clip with
game-camera, side, and front views (seated clips are shown on the café chair).

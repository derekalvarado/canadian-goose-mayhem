# Splash-pad kids

Three kids play at the plaza splash pad, each with its own runtime export in `models/`:

| Kid  | Variant    | Look                                                                 |
|------|------------|----------------------------------------------------------------------|
| Milo | `runner`   | Tallest; tousled hair, blue rash guard, board shorts, water shoes    |
| June | `boots`    | Bunches with pink ties, headband, coral top, navy shorts, wellies    |
| Ari  | `floaties` | The littlest; bucket hat, one-piece swimsuit, water wings, bare feet |

They are built from soft, smooth-normal forms (lathed garments, rounded limbs, a big
round head with a drawn-on face) rather than boxes. All are Y-up, face -Z, and use the
janitor's 18 bone names plus left/right hand sockets. Proportions live in `BUILDS` in
`src/game/SplashKidModel.ts`.

Each GLB has two mouths, `kid-mouth` (smile) and `kid-mouth-open` (wail). The view
shows the wail while a kid is frightened or crying.

Each rig carries `idle`, `walk`, `skip`, `splash`, `flee`, `cry`, `hands_up`, and `stomp`.
`splash` and `flee` differ per kid: Milo jumps into the jets and sprints with pumping
arms, June stomps puddles and flees flailing, Ari twirls and runs with hands on cheeks.
The travel clips (`skip`, `walk`, `flee`) are generated for each kid's gameplay speed in
`src/game/splashKidTuning.ts`, and a test checks that planted feet move at that speed.
Regenerate the exports with:

```sh
npm run assets:kids
```

Open `preview.html` through the Vite development server to compare the three kids,
play every clip, and inspect their skeletons.

## Animation lab

`anim-lab.html` (source in `src/dev/kidLab/`) builds the kids straight from
`SplashKidModel.ts` and compares candidate clips side by side with game-camera, side,
and front views, frame stepping, and a treadmill floor at the gameplay speed. Pose
builders for skipping, galloping, splashing, fleeing, and crying live in
`src/game/splashKidMoves.ts`; the lab's `variants.ts` sets the knobs for each card.

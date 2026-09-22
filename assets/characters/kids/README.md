# Splash-pad kids

`models/splash-kid-runner.glb` and `models/splash-kid-boots.glb` are the compact
runtime exports used by the plaza. Both are 1.18 m tall, Y-up, face -Z, and use
the janitor's 18-bone names plus left/right hand sockets.

The rigs contain `idle`, `walk`, `run`, `hands_up`, `stomp`, and `cry` clips.
Their arms are intentionally shallow tapered prisms, not round tubes; the asset
tests enforce the maximum arm depth. Regenerate both exports with:

```sh
npm run assets:kids
```

Open `preview.html` through the Vite development server to compare both variants,
play every clip, and inspect their skeletons.

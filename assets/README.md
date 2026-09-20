# Production assets

This folder contains production-ready game assets, organized by what they are:

- `characters/` — selected character models, editable recipes, textures, and animations.
- `props/` — movable or static world objects, grouped by setting as the catalog grows.

Keep exploratory references and AI concept sheets in `concepts/` instead. Runtime
models should be compact GLB files with simple geometry and should receive the
shared palette and toon materials in the browser renderer.

# Townsfolk and the dog

People who make Old Town Square and the coffee shop feel lived in. They are built
from source at runtime (`src/game/TownsfolkModel.ts`, `src/game/DogModel.ts`) rather
than exported to GLB: there are many of them, they share one rig, and each look
builds in about 15 ms. Open `anim-lab.html` here with `npm run dev` to review them.

| Look          | Role                 | Asset ID                    | Look                                                         |
|---------------|----------------------|-----------------------------|--------------------------------------------------------------|
| `sunhat-mom`  | Splash-pad parent    | `plaza.parent-sunhat-mom`   | Straw sun hat, sunglasses, coral sundress, sandals           |
| `cap-dad`     | Splash-pad parent    | `plaza.parent-cap-dad`      | Red ball cap, navy tee, khaki shorts, chin beard             |
| `phone-mom`   | Splash-pad parent    | `plaza.parent-phone-mom`    | Long honey hair, lilac tee, light jeans, mustard tote        |
| `beard-dad`   | Splash-pad parent    | `plaza.parent-beard-dad`    | Full beard, glasses, red flannel, coffee in hand             |
| `jogger`      | Passer-by            | `plaza.walker-jogger`       | Teal headband and running vest, orange shoes                 |
| `grandpa`     | Passer-by            | `plaza.walker-grandpa`      | Tweed flat cap, moustache, mustard sweater                   |
| `teen`        | Passer-by            | `plaza.walker-teen`         | Curly hair, headphones, pink hoodie, purple backpack         |
| `commuter`    | Passer-by            | `plaza.walker-commuter`     | Dark bob, navy blazer, grey skirt, work bag                  |
| `artist`      | Passer-by            | `plaza.walker-artist`       | Man bun, beard, mustard scarf, long olive coat               |
| `red-coat`    | Café regular         | `coffee.patron-red-coat`    | Grey waves, glasses, long red coat                           |
| `bucket-hat`  | Café regular         | `coffee.patron-bucket-hat`  | Sage bucket hat, striped tee, jeans                          |
| `raincoat`    | Café regular         | `coffee.patron-raincoat`    | Long braids, yellow raincoat                                 |
| `bow-tie`     | Café regular         | `coffee.patron-bow-tie`     | Bald, big moustache, brown waistcoat, red bow tie            |
| dog           | Keeps a parent company | `plaza.small-white-dog`   | Small fluffy white terrier with a red collar                 |

How placement drives behaviour (so the editor stays in charge):

- A **parent** placed within about a metre of a bench sits on it; otherwise they stand
  there and watch the splash pad, drifting a step or two now and then.
- The **dog** keeps the nearest parent company: on the bench to their right (where they
  can stroke it) when the parent sits, otherwise on the ground where it was placed.
- **Passers-by** start where they are placed (on a bench if they are next to a free one)
  and wander the square: benches, the fountain and splash-pad edges, and the café door,
  which they go in and come back out of. The jogger runs laps instead.
- **Café regulars** come in the front door one at a time, order at the counter, sit with
  a coffee across from a customer (the empty table stays free for the coffee-break task),
  then leave; the next one comes in a little later.

Everyone startles at a honk or flapping wings, steps back from a goose that comes too
close (seated people wave it off), and carries on. The dog barks at a goose that comes
close or honks within earshot. Clips are in `src/game/townsfolkMoves.ts`; speeds and
timings in `src/game/townsfolkTuning.ts`.

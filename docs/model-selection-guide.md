# Model selection for Goose Game 2

Use Terra by default, Luna for small edits, Sol for substantial features, and
Astra for the hardest problems. These are suggested assignments based on
[OpenAI's model guidance](https://learn.chatgpt.com/docs/models), rather than
strict capability limits. The requests below are examples, not a claim that the
game already implements these features.

## Astra — difficult architecture and stubborn problems

1. “Design a reusable character system supporting geese, humans, and dogs with different animations and behaviors.”
2. “Find why movement, collision, and animation occasionally desynchronize after extended play.”
3. “Profile the entire game and fix its biggest performance bottlenecks while preserving its appearance.”
4. “Design and implement NPCs that notice, investigate, chase, and remember the goose.”
5. “Evaluate whether our procedural models can achieve this reference style, and implement the necessary architectural changes.”

## Sol — substantial features and visual polish

1. “Overhaul the goose and environment to match this cel-shaded reference while preserving animation.”
2. “Implement picking up, carrying, and dropping objects with convincing beak alignment.”
3. “Make walking and running feel natural, including turns, acceleration, and foot placement.”
4. “Build a complete garden level with obstacles, objectives, and an exit.”
5. “Review the character and rendering code for bugs and fix the significant issues.”

## Terra — everyday game development

1. “Add a pause menu with resume, restart, and volume controls.”
2. “Add a stamina meter that drains while sprinting and recovers while walking.”
3. “Create a cel-shaded trash can using our existing materials and add its collision boundary.”
4. “Add a collectible counter and finish the objective after collecting five items.”
5. “Fix this reproducible bug: the goose keeps moving after the window loses focus.”

## Luna — precise, limited changes

1. “Reduce walking speed by 15%, keeping sprint speed unchanged.”
2. “Change the lawn and path to these exact colors in the shared palette.”
3. “Move the controls panel to the bottom-left and increase its text size.”
4. “Update the README to match the current keyboard controls.”
5. “Explain what this function does in five sentences.”

## Applying this to the cel-shading work

Start with Sol for a significant cel-shading overhaul. Subsequent adjustments
such as shadow strength, wing size, or palette changes usually belong with Terra
or Luna.

## Keeping usage down

Give a specific outcome and scope. For example:

> Change only walking speed, preserve everything else, run the relevant checks,
> and summarize briefly.

Start with low/default reasoning and increase it when needed; higher reasoning
uses more tokens. A cheaper model does not necessarily produce fewer tokens, so
distinguish token count from cost or allowance consumption. See
[OpenAI's reasoning guidance](https://learn.chatgpt.com/docs/models#pick-a-reasoning-effort).

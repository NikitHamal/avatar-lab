# Avatar Lab vNext upgrade notes

This production pass expands the existing procedural architecture instead of replacing it. Existing document, behavior, rendering, animation, and export boundaries are preserved.

## Character system

- 29 bundled starter characters with more varied silhouettes and layered accessories.
- 21 procedural surface families, including egg, bean, heart, droplet, pebble, pyramid, flower, and disc.
- Accessory capacity raised to 24 body nodes per character.
- Per-node secondary color, linear/radial gradients, glass, glow, metallic treatment, and opacity are rendered in the live canvas and export paths.
- Character search and a non-destructive Remix tool create fast cohesive variants.

## Expression and motion system

- 52 bundled expression presets, including joy, wink, love, smug, side-eye, focus, talk cycles, gasp, panic, kiss, dizzy, notification, success, error, and confetti.
- Procedural mouth vocabulary: smile, grin, open smile, O mouth, flat, frown, smirk, cat, kiss, or none.
- Expanded ambient eye motion: wander, look-around, focus pulse, micro-saccades, and shake.
- Expanded ambient body motion: drift, breathe, bob, bounce, sway, float, and shake.
- 36 bundled animation/reaction sequences, including conversational, system-state, and playful reactions.

## AI agent

The structured action protocol can now:

- duplicate a named library character with `apply_character_preset`;
- generate a cohesive `remix_avatar`;
- direct an immediate `set_pose`;
- trigger named `play_reaction` sequences;
- batch multiple actions in a single response;
- sculpt with the expanded surface/material vocabulary;
- preserve/revert complete avatar-library snapshots after AI edits.

The local Python proxy adds configurable CORS, payload limits, message/reference validation, and less revealing server headers. Reference uploads now use multipart form data instead of client-side base64 inflation. A pre-existing Qwen provider startup failure caused by a missing runtime `Any` import was also fixed.

## Responsive production pass

- Adaptive character, shape, and expression grids.
- Full-screen agent layout on smaller displays.
- Mobile-safe sizing and safe-area placement.
- Consistent keyboard focus styling and denser responsive controls.
- Character-library search and faster remix workflow.

## Export/runtime parity

SVG snapshots and animation exports now preserve node gradients/material opacity/glow. The standalone procedural engine includes the new surfaces, mouths, and ambient motion modes. Its generator can fall back to the globally available TypeScript compiler when Vite dependencies are not installed, while normal project builds still use Vite.

## Validation performed in this upgrade environment

- TypeScript/TSX syntax transpile check across all source/script files.
- Bundled document invariant/reference validation.
- Standalone engine freshness check and smoke rendering for all eight new surface families.
- Python AI proxy/provider bytecode compilation, live `/health` startup check, and CORS/payload-limit smoke checks.

A complete `pnpm check` should still be run after installing dependencies. The upgrade environment did not contain `node_modules`, and Corepack could not download the pinned pnpm release because outbound network access was unavailable.

# Bible Strong Avatar Lab

Standalone React/Vite studio for creating procedural 2D avatars, expressions and animations.
The project was extracted from Bible Strong so it can evolve independently.

## Start

Requirements: Node.js 22.12+ and Corepack/Yarn 4.

```bash
corepack enable
yarn install
yarn dev
```

Open `http://localhost:5173/`.

## Validation

```bash
yarn typecheck
yarn test
yarn build
```

`yarn check` runs the generated-engine freshness check and the full validation suite.

## Project map

- `src/App.tsx`: Studio interface and orchestration.
- `src/geometry.ts`: framework-independent procedural projection.
- `src/surfaces.ts`: supported head surfaces and primitive definitions.
- `src/renderedScene.ts`: stable render layer backed by Motion values.
- `src/playback.ts`: expression and animation playback.
- `src/studioDocument.ts`: versioned project document and browser persistence.
- `src/exporter.ts`: React/TypeScript and standalone JavaScript exports.
- `src/snapshotExporter.ts`: static SVG and PNG photo-mode exports.
- `src/defaultStudioDocument.json`: bundled avatars, expressions and animations.
- `scripts/generate-standalone-engine.mjs`: embeds the procedural runtime used by exports.
- `legacy/`: the two self-contained HTML prototypes that preceded the React app.
- `docs/adr/`: accepted architecture decisions inherited from the prototype.

## Product model

- An avatar owns its body and neutral eye appearance.
- The bundled behavior library supplies the initial expressions and animations.
- On the first behavior edit, an avatar receives its own independent copy of both.
- An animation references expressions from the same behavior library.
- The Studio document can be exported/imported as JSON for portability.

See [CONTEXT.md](./CONTEXT.md) for the domain language and architecture constraints.

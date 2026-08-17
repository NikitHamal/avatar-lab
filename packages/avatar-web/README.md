# @bible-strong/avatar-web

DOM renderer for Bible Strong procedural avatars. It uses `@bible-strong/avatar-core` for schema
validation, playback and rendering, without requiring React.

```sh
pnpm add @bible-strong/avatar-web
```

```js
import { createAvatar } from '@bible-strong/avatar-web'
import definition from './cloudee.avatar.json'

const avatar = createAvatar('#avatar', {
  definition,
  defaultAnimation: 'idle',
})

avatar.play('happy')
avatar.pause()
avatar.stop()
```

For a browser project without a bundler, load an ESM build through an import map or CDN and fetch
the definition JSON before calling `createAvatar`.

This package is private while copyright ownership, Apache-2.0 relicensing and repository metadata
are confirmed. Local tarballs are for verification only and must not be published.

# @bible-strong/avatar-react

React 19 renderer for a validated Bible Strong `AvatarDefinition`. React and React DOM 19 are peer
dependencies; `@bible-strong/avatar-core` is installed as a normal dependency.

## Install

```sh
pnpm add @bible-strong/avatar-react react react-dom
```

Import the package stylesheet once in the application entry point:

```tsx
import { Avatar, type AvatarController } from '@bible-strong/avatar-react'
import type { AvatarDefinition } from '@bible-strong/avatar-core'
import '@bible-strong/avatar-react/styles.css'
import { useRef } from 'react'

export function Assistant({ definition }: { definition: AvatarDefinition }) {
  const avatar = useRef<AvatarController>(null)
  return (
    <>
      <Avatar ref={avatar} definition={definition} defaultAnimation="idle" />
      <button onClick={() => avatar.current?.play('happy')}>Play happy</button>
      <button onClick={() => avatar.current?.setExpression('neutral')}>Neutral</button>
    </>
  )
}
```

`play` and `setExpression` return `{ ok: true }` or a typed error with one of
`unknown_animation`, `unavailable_standard_animation`, `unknown_expression` or
`controlled_by_props`. `pause` freezes the exact timeline position, calling `play` with the paused
key resumes it, and `stop` returns an uncontrolled avatar to `neutral`.

## Playback props

- `animation` and `expression` are mutually exclusive controlled targets. They take priority over
  defaults and imperative target changes.
- `defaultAnimation` and `defaultExpression` initialize uncontrolled use. Animation autoplay is on
  by default when `defaultAnimation` is present; set `autoplay={false}` to show its first expression
  statically.
- `onAnimationEnd` fires once when a `once` animation completes naturally.
- `onExpressionChange` reports semantic expression changes.
- `size`, `className`, `style` and `ariaLabel` customize layout without changing the definition.

The definition is validated once per immutable object reference and revalidated/reinitialized when
that reference changes.

## Embedded and floating layout

Embedded mode is the default and stays in the caller's layout:

```tsx
<div className="assistant-zone">
  <Avatar definition={definition} animation="idle" />
</div>
```

Floating mode uses fixed positioning and portals to `document.body` after hydration. Supply
`portalContainer` for a dedicated overlay root. Server rendering emits a neutral fixed-size
placeholder before the portal handoff.

```tsx
<Avatar
  definition={definition}
  mode="floating"
  draggable
  initialPosition={{ right: 24, bottom: 24 }}
  constrainTo="viewport"
  zIndex={1000}
/>
```

`initialPosition` accepts `{ x, y }` or top/right/bottom/left anchors. A controlled `position` wins
over it. `constrainTo` accepts `none`, `viewport` or `parent`; floating defaults to `viewport`, while
embedded defaults to `none`. A constrained embedded parent needs a definite rendered size.

Dragging uses Pointer Events and direct transforms. `onPositionPreview` is limited to one callback
per animation frame and `onPositionCommit` reports the final clamped point. `onDragStart` and
`onDragEnd` bracket pointer movement. In controlled position mode callbacks report suggestions but
the supplied position remains authoritative. When resized bounds invalidate a controlled position,
`onPositionChange` reports the clamped suggestion. Resize re-clamping never emits a movement commit.

When `draggable` is enabled, arrow keys move by 10 px, Shift+Arrow by 1 px, and Escape cancels an
active pointer drag. Accessible directional and reset buttons provide the same movement without a
pointer.

## Styling hooks

The stylesheet exposes `.bs-avatar`, `.bs-avatar--embedded`, `.bs-avatar--floating`,
`.bs-avatar--draggable`, `.bs-avatar--dragging`, `.bs-avatar__svg` and
`.bs-avatar__move-controls`. Consumer `className` and `style` are applied to the outer wrapper.

The public component never exposes Studio IDs or document types. This package is private while
copyright ownership, Apache-2.0 relicensing and repository metadata are confirmed. Local tarballs
are for verification only and must not be published.

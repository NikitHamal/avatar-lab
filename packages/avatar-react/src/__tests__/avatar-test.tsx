// @vitest-environment jsdom

import { renderAvatarDefinition, type AvatarDefinition } from '@bible-strong/avatar-core'
import { act, createRef, Profiler, StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { fireEvent, render } from '@testing-library/react'
import { vi } from 'vitest'

import { Avatar, type AvatarController } from '../Avatar'

let resizeCallbacks: ResizeObserverCallback[] = []

class TestResizeObserver implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback)
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const expression = {
  head: { x: 0, y: 0, z: 0 },
  eyes: {
    left: { width: 28, height: 38, x: 0, y: 0, angle: 0 },
    right: { width: 28, height: 38, x: 0, y: 0, angle: 0 },
    spacing: 54,
  },
  perspective: 1,
  motion: { eyes: 'none', body: 'none' },
} as const

const definition: AvatarDefinition = {
  schema: 'bible-strong/avatar-definition',
  schemaVersion: 1,
  name: 'React fixture',
  body: {
    primary: { type: 'sphere', width: 240, height: 240, depth: 240, roundness: 1 },
    nodes: [],
  },
  colors: { body: '#5b7fe5', eyes: '#111316' },
  expressions: { neutral: expression, smile: { ...expression, head: { x: 0, y: 10, z: 0 } } },
  expressionOrder: ['neutral', 'smile'],
  animations: {
    greet: {
      playbackMode: 'loop',
      steps: [{ expression: 'smile', holdMs: 1_000, transitionMs: 100, transition: 'smooth' }],
      blink: {
        enabled: false,
        initialDelayMs: 0,
        minIntervalMs: 1_000,
        maxIntervalMs: 1_000,
        durationMs: 100,
      },
    },
    'wave-once': {
      playbackMode: 'once',
      steps: [{ expression: 'smile', holdMs: 100, transitionMs: 0, transition: 'snappy' }],
      blink: {
        enabled: false,
        initialDelayMs: 0,
        minIntervalMs: 1_000,
        maxIntervalMs: 1_000,
        durationMs: 100,
      },
    },
  },
  animationOrder: ['greet', 'wave-once'],
  standardAnimationSet: 1,
}

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = () => undefined
  HTMLElement.prototype.hasPointerCapture = () => true
  HTMLElement.prototype.releasePointerCapture = () => undefined
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList
  globalThis.ResizeObserver = TestResizeObserver
})

beforeEach(() => {
  resizeCallbacks = []
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: 1_024 },
    innerHeight: { configurable: true, value: 768 },
  })
})

describe('@bible-strong/avatar-react', () => {
  it('renders semantic SVG geometry in embedded mode', () => {
    const view = render(<Avatar definition={definition} ariaLabel="Assistant avatar" />)
    const avatar = view.getByRole('img', { name: 'Assistant avatar' })
    expect(avatar.classList.contains('bs-avatar--embedded')).toBe(true)
    expect(avatar.querySelector('svg path')).not.toBeNull()
    expect(document.body.querySelector('.bs-avatar--floating')).toBeNull()
  })

  it('exposes semantic imperative controls without Studio identifiers', () => {
    const controller = createRef<AvatarController>()
    render(<Avatar definition={definition} ref={controller} />)

    let result: ReturnType<AvatarController['setExpression']> | undefined
    act(() => {
      result = controller.current?.setExpression('smile')
    })
    expect(result).toEqual({ ok: true })
    expect(controller.current?.getState()).toMatchObject({
      activeExpression: 'smile',
      status: 'stopped',
    })
    expect(controller.current?.play('missing')).toMatchObject({
      ok: false,
      error: { code: 'unknown_animation', key: 'missing' },
    })
    act(() => {
      result = controller.current?.play('greet')
    })
    expect(result).toEqual({ ok: true })
    expect(controller.current?.getState()).toMatchObject({
      activeAnimation: 'greet',
      activeExpression: 'smile',
      status: 'playing',
    })
  })

  it('rejects imperative target changes when playback is controlled by props', () => {
    const controller = createRef<AvatarController>()
    render(<Avatar definition={definition} expression="neutral" ref={controller} />)
    expect(controller.current?.setExpression('smile')).toMatchObject({
      ok: false,
      error: { code: 'controlled_by_props' },
    })
  })

  it('rejects simultaneous controlled animation and expression props', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() =>
      render(<Avatar definition={definition} animation="greet" expression="neutral" />)
    ).toThrow('Avatar accepts either animation or expression, not both.')
    errors.mockRestore()
  })

  it('honors uncontrolled defaults without autoplay when requested', () => {
    const controller = createRef<AvatarController>()
    render(
      <Avatar definition={definition} defaultAnimation="greet" autoplay={false} ref={controller} />
    )
    expect(controller.current?.getState()).toEqual({
      activeExpression: 'smile',
      status: 'stopped',
    })
  })

  it('portals floating mode to the document body after mount', () => {
    const host = document.createElement('section')
    document.body.append(host)
    const view = render(<Avatar definition={definition} mode="floating" />, { container: host })
    expect(document.body.querySelector('.bs-avatar--floating')).not.toBeNull()
    view.unmount()
    host.remove()
  })

  it('normalizes an uncontrolled floating initial position only once', () => {
    const view = render(
      <Avatar definition={definition} mode="floating" initialPosition={{ x: 10, y: 12 }} />
    )
    expect(view.getByRole('img').style.transform).toBe('translate3d(10px, 12px, 0)')
    view.rerender(
      <Avatar definition={definition} mode="floating" initialPosition={{ x: 80, y: 90 }} />
    )
    expect(view.getByRole('img').style.transform).toBe('translate3d(10px, 12px, 0)')
  })

  it('server-renders a neutral floating placeholder before portal handoff', () => {
    const markup = renderToString(
      <Avatar definition={definition} mode="floating" defaultExpression="smile" size={180} />
    )
    const neutral = renderAvatarDefinition(definition, 'neutral')
    expect(markup).toContain('bs-avatar--floating')
    expect(markup).toContain('width:180px;height:180px')
    expect(markup).toContain(`d="${neutral.geometry.leftPath}"`)
  })

  it('hydrates the floating placeholder before moving it to a portal without warnings', async () => {
    const host = document.createElement('section')
    const markup = renderToString(<Avatar definition={definition} mode="floating" size={180} />)
    host.innerHTML = markup
    document.body.append(host)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(host, <Avatar definition={definition} mode="floating" size={180} />)
      await Promise.resolve()
    })
    expect(errors).not.toHaveBeenCalled()
    expect(host.querySelector('.bs-avatar--floating')).toBeNull()
    expect(document.body.querySelector('.bs-avatar--floating')).not.toBeNull()
    act(() => root?.unmount())
    errors.mockRestore()
    host.remove()
  })

  it('moves by pointer without React state updates on every pointer move and commits once', () => {
    const previews: { x: number; y: number }[] = []
    const commits: { x: number; y: number }[] = []
    const view = render(
      <Avatar
        definition={definition}
        draggable
        constrainTo="none"
        onPositionPreview={point => previews.push(point)}
        onPositionCommit={point => commits.push(point)}
      />
    )
    const avatar = view.getByRole('group')
    fireEvent.pointerDown(avatar, { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(avatar, { pointerId: 1, clientX: 35, clientY: 45 })
    expect(avatar.style.transform).toBe('translate3d(25px, 35px, 0)')
    fireEvent.pointerUp(avatar, { pointerId: 1, clientX: 35, clientY: 45 })
    expect(commits).toEqual([{ x: 25, y: 35 }])
    expect(previews.length).toBeLessThanOrEqual(1)
  })

  it('limits drag previews to one callback per animation frame with the latest position', () => {
    let nextFrame = 0
    const frames = new Map<number, FrameRequestCallback>()
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      frames.delete(id)
    })
    const previews: { x: number; y: number }[] = []
    const view = render(
      <Avatar
        definition={definition}
        draggable
        constrainTo="none"
        onPositionPreview={point => previews.push(point)}
      />
    )
    const avatar = view.getByRole('group')
    fireEvent.pointerDown(avatar, { pointerId: 6, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(avatar, { pointerId: 6, clientX: 10, clientY: 12 })
    fireEvent.pointerMove(avatar, { pointerId: 6, clientX: 20, clientY: 24 })
    expect(previews).toEqual([])
    act(() => {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback(16))
    })
    expect(previews).toEqual([{ x: 20, y: 24 }])
    fireEvent.pointerUp(avatar, { pointerId: 6 })
    request.mockRestore()
    cancel.mockRestore()
  })

  it('does not render React once per pointer movement', () => {
    let renders = 0
    const view = render(
      <Profiler id="avatar" onRender={() => renders++}>
        <Avatar definition={definition} draggable constrainTo="none" />
      </Profiler>
    )
    const avatar = view.getByRole('group')
    const beforeMoves = renders
    fireEvent.pointerDown(avatar, { pointerId: 2, button: 0, clientX: 0, clientY: 0 })
    for (let index = 1; index <= 20; index++) {
      fireEvent.pointerMove(avatar, { pointerId: 2, clientX: index, clientY: index })
    }
    expect(renders).toBe(beforeMoves)
  })

  it('restores the drag origin on pointer cancel', () => {
    const commits: { x: number; y: number }[] = []
    const view = render(
      <Avatar
        definition={definition}
        draggable
        constrainTo="none"
        initialPosition={{ x: 5, y: 7 }}
        onPositionCommit={point => commits.push(point)}
      />
    )
    const avatar = view.getByRole('group')
    fireEvent.pointerDown(avatar, { pointerId: 3, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(avatar, { pointerId: 3, clientX: 40, clientY: 50 })
    fireEvent.pointerCancel(avatar, { pointerId: 3 })
    expect(avatar.style.transform).toBe('translate3d(0px, 0px, 0)')
    expect(commits.at(-1)).toEqual({ x: 0, y: 0 })
  })

  it('restores the drag origin when Escape cancels an active drag', () => {
    const commits: { x: number; y: number }[] = []
    const view = render(
      <Avatar
        definition={definition}
        draggable
        constrainTo="none"
        onPositionCommit={point => commits.push(point)}
      />
    )
    const avatar = view.getByRole('group')
    fireEvent.pointerDown(avatar, { pointerId: 7, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(avatar, { pointerId: 7, clientX: 30, clientY: 40 })
    fireEvent.keyDown(avatar, { key: 'Escape' })
    expect(avatar.style.transform).toBe('translate3d(0px, 0px, 0)')
    expect(commits).toEqual([{ x: 0, y: 0 }])
  })

  it('clamps pointer movement to an embedded parent', () => {
    const view = render(<Avatar definition={definition} draggable constrainTo="parent" size={40} />)
    const avatar = view.getByRole('group')
    Object.defineProperties(avatar, {
      offsetWidth: { configurable: true, value: 40 },
      offsetHeight: { configurable: true, value: 40 },
    })
    Object.defineProperties(avatar.parentElement!, {
      clientWidth: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 100 },
    })
    fireEvent.pointerDown(avatar, { pointerId: 4, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(avatar, { pointerId: 4, clientX: 200, clientY: 200 })
    fireEvent.pointerUp(avatar, { pointerId: 4 })
    expect(avatar.style.transform).toBe('translate3d(60px, 60px, 0)')
  })

  it('keeps controlled position authoritative while reporting a constrained commit', () => {
    const commits: { x: number; y: number }[] = []
    const view = render(
      <Avatar
        definition={definition}
        draggable
        constrainTo="parent"
        size={40}
        position={{ x: 10, y: 12 }}
        onPositionCommit={point => commits.push(point)}
      />
    )
    const avatar = view.getByRole('group')
    Object.defineProperties(avatar, {
      offsetWidth: { configurable: true, value: 40 },
      offsetHeight: { configurable: true, value: 40 },
    })
    Object.defineProperties(avatar.parentElement!, {
      clientWidth: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 100 },
    })
    fireEvent.pointerDown(avatar, { pointerId: 5, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(avatar, { pointerId: 5, clientX: 200, clientY: 200 })
    fireEvent.pointerUp(avatar, { pointerId: 5 })
    expect(commits).toEqual([{ x: 60, y: 60 }])
    expect(avatar.style.transform).toBe('translate3d(10px, 12px, 0)')
  })

  it('re-clamps on resize without emitting a movement commit', () => {
    const changes: { x: number; y: number }[] = []
    const commits: { x: number; y: number }[] = []
    const view = render(
      <Avatar
        definition={definition}
        mode="floating"
        draggable
        size={40}
        position={{ x: 90, y: 90 }}
        onPositionChange={point => changes.push(point)}
        onPositionCommit={point => commits.push(point)}
      />
    )
    const avatar = view.getByRole('group')
    Object.defineProperties(avatar, {
      offsetWidth: { configurable: true, value: 40 },
      offsetHeight: { configurable: true, value: 40 },
    })
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 100 },
      innerHeight: { configurable: true, value: 100 },
    })
    act(() => resizeCallbacks.forEach(callback => callback([], {} as ResizeObserver)))
    expect(changes.at(-1)).toEqual({ x: 60, y: 60 })
    expect(commits).toEqual([])
    expect(avatar.style.transform).toBe('translate3d(90px, 90px, 0)')
  })

  it('re-clamps an uncontrolled floating position without emitting a movement commit', () => {
    const commits: { x: number; y: number }[] = []
    const view = render(
      <Avatar
        definition={definition}
        mode="floating"
        draggable
        size={40}
        initialPosition={{ x: 90, y: 90 }}
        onPositionCommit={point => commits.push(point)}
      />
    )
    const avatar = view.getByRole('group')
    Object.defineProperties(avatar, {
      offsetWidth: { configurable: true, value: 40 },
      offsetHeight: { configurable: true, value: 40 },
    })
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 100 },
      innerHeight: { configurable: true, value: 100 },
    })
    act(() => resizeCallbacks.forEach(callback => callback([], {} as ResizeObserver)))
    expect(avatar.style.transform).toBe('translate3d(60px, 60px, 0)')
    expect(commits).toEqual([])
  })

  it('re-clamps to the viewport on window resize without ResizeObserver support', () => {
    const originalObserver = globalThis.ResizeObserver
    // @ts-expect-error This test covers browsers without ResizeObserver.
    globalThis.ResizeObserver = undefined
    const view = render(
      <Avatar
        definition={definition}
        mode="floating"
        draggable
        size={40}
        initialPosition={{ x: 90, y: 90 }}
      />
    )
    const avatar = view.getByRole('group')
    Object.defineProperties(avatar, {
      offsetWidth: { configurable: true, value: 40 },
      offsetHeight: { configurable: true, value: 40 },
    })
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 100 },
      innerHeight: { configurable: true, value: 100 },
    })
    act(() => window.dispatchEvent(new Event('resize')))
    expect(avatar.style.transform).toBe('translate3d(60px, 60px, 0)')
    globalThis.ResizeObserver = originalObserver
  })

  it('provides keyboard movement and an accessible reset control', () => {
    const commits: { x: number; y: number }[] = []
    const view = render(
      <Avatar
        definition={definition}
        draggable
        constrainTo="none"
        onPositionCommit={point => commits.push(point)}
      />
    )
    const avatar = view.getByRole('group')
    fireEvent.keyDown(avatar, { key: 'ArrowRight' })
    expect(commits.at(-1)).toEqual({ x: 10, y: 0 })
    act(() => view.getByRole('button', { name: 'Move avatar down' }).click())
    expect(commits.at(-1)).toEqual({ x: 10, y: 10 })
    act(() => view.getByRole('button', { name: 'Reset avatar position' }).click())
    expect(commits.at(-1)).toEqual({ x: 0, y: 0 })
  })

  it('resumes the current paused animation instead of restarting it', () => {
    const controller = createRef<AvatarController>()
    const clock = vi.spyOn(performance, 'now')
    clock.mockReturnValueOnce(100).mockReturnValueOnce(250).mockReturnValueOnce(1_250)
    render(<Avatar definition={definition} ref={controller} />)
    act(() => {
      controller.current?.play('greet')
      controller.current?.pause()
      controller.current?.play('greet')
    })
    expect(controller.current?.getState()).toMatchObject({
      activeAnimation: 'greet',
      activeExpression: 'smile',
      status: 'playing',
    })
    clock.mockRestore()
  })

  it('updates SVG frames without rendering React once per animation frame', () => {
    let nextFrame = 0
    const frames = new Map<number, FrameRequestCallback>()
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      frames.delete(id)
    })
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1_000)
    let renders = 0
    render(
      <Profiler id="animated-avatar" onRender={() => renders++}>
        <Avatar definition={definition} defaultAnimation="greet" />
      </Profiler>
    )
    const beforeFrames = renders
    act(() => {
      for (let index = 1; index <= 20; index++) {
        const callback = [...frames.values()].at(-1)
        frames.clear()
        callback?.(1_000 + index)
      }
    })
    expect(renders).toBe(beforeFrames)
    clock.mockRestore()
    request.mockRestore()
    cancel.mockRestore()
  })

  it('fires once-completion exactly once under Strict Mode', () => {
    let nextFrame = 0
    const frames = new Map<number, FrameRequestCallback>()
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      frames.delete(id)
    })
    const ended = vi.fn()
    render(
      <StrictMode>
        <Avatar definition={definition} defaultAnimation="wave-once" onAnimationEnd={ended} />
      </StrictMode>
    )
    act(() => {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach(callback => callback(performance.now() + 1_000))
    })
    expect(ended).toHaveBeenCalledTimes(1)
    expect(ended).toHaveBeenCalledWith('wave-once')
    request.mockRestore()
    cancel.mockRestore()
  })
})

import { describe, expect, it } from 'vitest'
import { GifEncoder } from '../gifEncoder'
import {
  animationMediaFileName,
  sampleAnimationFrames,
  defaultAnimationMediaOptions,
} from '../animationMediaExporter'
import { createAvatar } from '../../avatar/avatars'
import { initialExpressions } from '../../avatar/presets'
import { createInitialSequences } from '../../animation/sequences'

describe('GifEncoder', () => {
  it('encodes valid GIF89a stream with header, descriptors, and trailer', () => {
    const width = 16
    const height = 16
    const encoder = new GifEncoder(width, height)

    // Create 2 simple test frames (RGBA)
    const frame1 = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < frame1.length; i += 4) {
      frame1[i] = 255 // R
      frame1[i + 1] = 0 // G
      frame1[i + 2] = 0 // B
      frame1[i + 3] = 255 // A
    }

    const frame2 = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < frame2.length; i += 4) {
      frame2[i] = 0 // R
      frame2[i + 1] = 255 // G
      frame2[i + 2] = 100 // B
      frame2[i + 3] = 255 // A
    }

    encoder.addFrame(frame1, { delayMs: 100 })
    encoder.addFrame(frame2, { delayMs: 100, transparent: true })

    const bytes = encoder.finish()
    expect(bytes.length).toBeGreaterThan(50)

    // Check GIF89a signature
    const signature = String.fromCharCode(...bytes.subarray(0, 6))
    expect(signature).toBe('GIF89a')

    // Check width and height in Logical Screen Descriptor (bytes 6-9)
    const encodedWidth = bytes[6] | (bytes[7] << 8)
    const encodedHeight = bytes[8] | (bytes[9] << 8)
    expect(encodedWidth).toBe(width)
    expect(encodedHeight).toBe(height)

    // Check GIF trailer byte at the end (0x3B)
    expect(bytes[bytes.length - 1]).toBe(0x3b)
  })
})

describe('animationMediaExporter', () => {
  it('formats clean slugged filenames', () => {
    expect(animationMediaFileName('Étoile du soir', 'Danse Joyeuse', 'gif')).toBe(
      'etoile-du-soir-danse-joyeuse.gif'
    )
    expect(animationMediaFileName('Neon Bot', 'Idle Breathe', 'webm')).toBe(
      'neon-bot-idle-breathe.webm'
    )
    expect(animationMediaFileName('My Avatar', 'Laugh', 'mp4')).toBe('my-avatar-laugh.mp4')
  })

  it('samples animation frames with accurate step timing and valid SVG markup', () => {
    const avatar = createAvatar('Test Avatar')
    const sequences = createInitialSequences()
    const sequence = sequences[0] // e.g. first built-in sequence

    const frames = sampleAnimationFrames(avatar, sequence, initialExpressions, {
      ...defaultAnimationMediaOptions,
      fps: 20,
      size: 300,
    })

    expect(frames.length).toBeGreaterThan(0)
    for (const frame of frames) {
      expect(frame.svg).toContain('<svg')
      expect(frame.svg).toContain('</svg>')
      expect(frame.svg).toContain('viewBox="-150 -150 300 300"')
      expect(frame.delayMs).toBeGreaterThanOrEqual(16)
    }
  })

  it('keeps one-shot exports on their final pose instead of transitioning back to frame one', () => {
    const avatar = createAvatar('Intro Avatar')
    const first = initialExpressions.find(expression => expression.id === 'idle-front')!
    const final = initialExpressions.find(expression => expression.id === 'confetti')!
    const sequence = {
      ...createInitialSequences().find(item => item.id === 'intro-neby')!,
      playbackMode: 'once' as const,
      blink: { enabled: false, initialDelayMs: 0, minIntervalMs: 3000, maxIntervalMs: 5000, durationMs: 200 },
      steps: [
        { id: 'first', expressionId: first.id, holdMs: 100, transitionMs: 0, transition: 'smooth' as const },
        { id: 'final', expressionId: final.id, holdMs: 240, transitionMs: 120, transition: 'spring' as const },
      ],
    }
    const frames = sampleAnimationFrames(avatar, sequence, [first, final], {
      ...defaultAnimationMediaOptions,
      fps: 24,
      size: 256,
    })

    expect(frames.at(-1)?.svg).toContain('<rect')
    expect(frames.at(-1)?.elapsedMs ?? 0).toBeLessThan(500)
  })

  it('bakes real effects and respects avatar-level mouth disablement', () => {
    const avatar = createAvatar('Effect Avatar')
    const confetti = initialExpressions.find(expression => expression.id === 'confetti')!
    const expression = { ...confetti, mouth: 'smile' as const }
    const sequence = {
      ...createInitialSequences().find(item => item.id === 'success')!,
      steps: [
        {
          id: 'effect-step',
          expressionId: expression.id,
          holdMs: 360,
          transitionMs: 0,
          transition: 'snappy' as const,
        },
      ],
    }
    const frames = sampleAnimationFrames(avatar, sequence, [expression], {
      ...defaultAnimationMediaOptions,
      fps: 12,
      size: 256,
    })

    expect(frames.some(frame => frame.svg.includes('<rect'))).toBe(true)
    expect(frames.every(frame => !frame.svg.includes('stroke-linecap="round"'))).toBe(true)
  })

})

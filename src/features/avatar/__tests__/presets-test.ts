import { getStatePlaybackConfig, initialExpressions, statePools } from '@/features/avatar/presets'

describe('state playback configuration', () => {
  it('keeps idle slower than an active sequence', () => {
    expect(getStatePlaybackConfig('idle').expressionIntervalMs).toBe(1150)
    expect(getStatePlaybackConfig('listening').expressionIntervalMs).toBe(720)
    expect(getStatePlaybackConfig('idle').expressionIntervalMs).toBeGreaterThan(
      getStatePlaybackConfig('listening').expressionIntervalMs
    )
  })

  it('describes a valid randomized blink interval', () => {
    const { blink } = getStatePlaybackConfig('idle')

    expect(blink.initialDelayMs).toBeGreaterThan(0)
    expect(blink.minIntervalMs).toBeLessThan(blink.maxIntervalMs)
    expect(blink.durationMs).toBe(280)
  })

  it('uses expressive poses for stock reactions', () => {
    expect(initialExpressions[statePools.sleeping[0]].id).toBe('sleepy')
    expect(statePools.wink.map(index => initialExpressions[index].id)).toContain('wink')
    expect(statePools.angry.map(index => initialExpressions[index].id)).toContain('angry-hot')
    expect(initialExpressions[statePools.idle[0]].id).toBe('idle-front')
  })


  it('uses real visual effects for effect-driven reactions', () => {
    const confetti = initialExpressions.find(expression => expression.id === 'confetti')
    const puzzled = initialExpressions.find(expression => expression.id === 'puzzled')

    expect(confetti?.effect).toBe('confetti')
    expect(puzzled?.effect).toBe('question')
  })

  it('uses a blink rhythm adapted to each sequence family', () => {
    const sleeping = getStatePlaybackConfig('sleeping').blink
    const listening = getStatePlaybackConfig('listening').blink
    const excited = getStatePlaybackConfig('excited').blink

    expect(sleeping.minIntervalMs).toBeGreaterThan(listening.minIntervalMs)
    expect(listening.minIntervalMs).toBeGreaterThan(excited.minIntervalMs)
    expect(sleeping.durationMs).toBeGreaterThan(excited.durationMs)
  })
})

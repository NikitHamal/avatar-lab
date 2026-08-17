import { poseFromExpression, renderAvatar } from '@/features/avatar/geometry'
import { defaultExpression } from '@/features/avatar/presets'
import { createRenderedScene, paintRenderedOffset } from '@/features/rendering/renderedScene'
import { serializeAvatarSnapshot, snapshotFileName } from '@/features/export/snapshotExporter'
import { surfacePresets } from '@/features/avatar/surfaces'

describe('avatar snapshot export', () => {
  const geometry = renderAvatar(poseFromExpression(defaultExpression), surfacePresets.sphere, 1)
  const scene = createRenderedScene(geometry)
  const colors = { body: '#5b7fe5', eyes: '#111316' }

  it('exports the currently rendered scene as a transparent SVG', () => {
    paintRenderedOffset(scene, { x: 3, y: -2 })
    const svg = serializeAvatarSnapshot('Strobi', scene, colors, {
      background: 'transparent',
      colorFrom: '#ffffff',
      colorTo: '#000000',
      size: 1024,
    })

    expect(svg).toContain('width="1024" height="1024"')
    expect(svg).toContain('transform="translate(3 -2)"')
    expect(svg).toContain(`d="${geometry.headPath}" fill="#5b7fe5"`)
    expect(svg).toContain('fill="#111316"')
    expect(svg).not.toContain('<rect')
  })

  it('uses the live Creature eye paths for expressive-eye snapshots', () => {
    scene.creatureEyePaths.current = [
      { d: 'M-20 -10C-10 -20 10 -20 20 -10Z', fill: 'rgba(249,83,32,1)', blend: 0 },
      { d: 'M-5 -8C-2 -12 2 -12 5 -8Z', fill: 'rgba(4,74,95,1)', blend: 2 },
    ]
    const svg = serializeAvatarSnapshot(
      'Creature Strobi',
      scene,
      colors,
      {
        background: 'transparent',
        colorFrom: '#ffffff',
        colorTo: '#000000',
        size: 512,
      },
      'creature'
    )

    expect(svg).toContain('snapshot-creature-eye-clip')
    expect(svg).toContain('fill="rgba(249,83,32,1)"')
    expect(svg).toContain('fill="rgba(4,74,95,1)"')
  })


  it('preserves live reaction effects and custom mouth stroke in snapshots', () => {
    const mouthGeometry = renderAvatar(
      poseFromExpression({ ...defaultExpression, mouth: 'smile', mouthStrokeWidth: 6.2 }),
      surfacePresets.sphere,
      1
    )
    const mouthScene = createRenderedScene(mouthGeometry)
    const svg = serializeAvatarSnapshot(
      'Celebration',
      mouthScene,
      colors,
      {
        background: 'transparent',
        colorFrom: '#ffffff',
        colorTo: '#000000',
        size: 512,
      },
      'classic',
      { effect: 'confetti', elapsedMs: 500, mouthStrokeWidth: 6.2 }
    )

    expect(svg).toContain('stroke-width="6.20"')
    expect(svg).toContain('<rect')
    expect(svg).toContain('#ff4d8d')
  })

  it('embeds a radial background without external dependencies', () => {
    const svg = serializeAvatarSnapshot('Strobi', scene, colors, {
      background: 'radial',
      colorFrom: '#ffffff',
      colorTo: '#8899aa',
      size: 512,
    })

    expect(svg).toContain('<radialGradient id="snapshot-radial"')
    expect(svg).toContain('fill="url(#snapshot-radial)"')
    expect(snapshotFileName('Étoile du soir')).toBe('etoile-du-soir-snapshot.svg')
    expect(snapshotFileName('Étoile du soir', 'png')).toBe('etoile-du-soir-snapshot.png')
  })
})

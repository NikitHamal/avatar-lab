import { createAvatar } from '@/features/avatar/avatars'
import { createInitialSequences } from '@/features/animation/sequences'
import { initialExpressions } from '@/features/avatar/presets'
import {
  createStudioDocumentStore,
  loadStudioDocument,
  parseImportedStudioDocument,
  serializeStudioDocument,
  type StudioDocument,
} from '@/features/studio/studioDocument'

const documentFixture = (): StudioDocument => {
  const avatar = createAvatar('Strobi')
  return {
    version: 2,
    library: {
      activeAvatarId: avatar.id,
      avatars: [avatar],
    },
    expressions: initialExpressions,
    sequences: createInitialSequences(),
    playback: { stateId: 'idle', playing: true },
  }
}

describe('Studio document', () => {
  const storage = (value: string | null = null) => ({ getItem: () => value })

  it('loads the bundled Studio snapshot when no local project exists', () => {
    const document = loadStudioDocument(storage())

    expect(document.library.avatars).toHaveLength(29)
    expect(document.library.activeAvatarId).toBe(document.library.avatars[0].id)
    expect(document.library.avatars[0].name).toBe('Strobi')
    expect(document.library.avatars[0].eyeRenderer).toBe('classic')
    expect(document.library.avatars[0].creaturePaletteIndex).toBe(52)
    expect(document.library.avatars.every(avatar => avatar.mouthEnabled === false)).toBe(true)
    expect(document.expressions).toHaveLength(initialExpressions.length)
    expect(document.sequences).toHaveLength(createInitialSequences().length)
    expect(document.playback).toEqual({ stateId: 'idle', playing: true })
  })

  it('migrates the old bundled idle pose away from the upper-right default', () => {
    const legacy = structuredClone(loadStudioDocument(storage()))
    const idle = legacy.sequences.find(sequence => sequence.id === 'idle')!
    idle.steps = [
      { ...idle.steps[0], id: 'idle-step-0', expressionId: 'expression-00', holdMs: 5200 },
      { ...idle.steps[0], id: 'idle-step-1', expressionId: 'expression-08', holdMs: 5200 },
    ]
    legacy.library.activeAvatarId = legacy.library.avatars[1].id
    legacy.library.avatars = legacy.library.avatars.filter(avatar => avatar.id !== 'strobi')
    legacy.playback = { stateId: 'proud', playing: true }

    const migrated = loadStudioDocument(storage(JSON.stringify(legacy)))
    const migratedIdle = migrated.sequences.find(sequence => sequence.id === 'idle')!

    expect(migratedIdle.steps.map(step => step.expressionId)).toEqual([
      'idle-front',
      'idle-glance-left',
      'idle-front',
      'idle-glance-right',
    ])
    expect(migrated.playback).toEqual({ stateId: 'idle', playing: true })
  })

  it('upgrades the base behavior library even when the legacy Strobi avatar was deleted', () => {
    const legacy = structuredClone(loadStudioDocument(storage()))
    legacy.library.avatars = legacy.library.avatars.filter(avatar => avatar.id !== 'strobi')
    legacy.library.activeAvatarId = legacy.library.avatars[0].id
    legacy.expressions = legacy.expressions.filter(expression => expression.id !== 'intro-neby-closed')
    legacy.sequences = legacy.sequences.filter(sequence => sequence.id !== 'intro-neby')

    const migrated = loadStudioDocument(storage(JSON.stringify(legacy)))

    expect(migrated.expressions.some(expression => expression.id === 'intro-neby-closed')).toBe(true)
    expect(migrated.sequences.some(sequence => sequence.id === 'intro-neby')).toBe(true)
  })

  it('upgrades untouched stock reactions for both shared and avatar-owned behavior', () => {
    const legacy = structuredClone(loadStudioDocument(storage()))
    const sleeping = legacy.sequences.find(sequence => sequence.id === 'sleeping')!
    const legacyIds = ['expression-13', 'expression-22', 'expression-04']
    sleeping.steps = sleeping.steps.map((step, index) => ({
      ...step,
      expressionId: legacyIds[index],
    }))

    const avatar = legacy.library.avatars[0]
    avatar.behavior = {
      expressions: legacyIds.map(id => legacy.expressions.find(expression => expression.id === id)!),
      sequences: [structuredClone(sleeping)],
    }

    const migrated = loadStudioDocument(storage(JSON.stringify(legacy)))
    const migratedSleeping = migrated.sequences.find(sequence => sequence.id === 'sleeping')!
    const migratedAvatarSleeping = migrated.library.avatars[0].behavior?.sequences.find(
      sequence => sequence.id === 'sleeping'
    )

    expect(migratedSleeping.steps.map(step => step.expressionId)).toEqual([
      'sleepy',
      'sleepy',
      'sleepy',
    ])
    expect(migratedAvatarSleeping?.steps.map(step => step.expressionId)).toEqual([
      'sleepy',
      'sleepy',
      'sleepy',
    ])
    expect(migrated.library.avatars[0].behavior?.expressions.some(item => item.id === 'sleepy')).toBe(
      true
    )
  })

  it('keeps a locally saved project authoritative over the bundled snapshot', () => {
    const localDocument = documentFixture()

    expect(loadStudioDocument(storage(JSON.stringify(localDocument)))).toEqual(localDocument)
  })

  it('persists one coherent document after a mutation', () => {
    const persisted: StudioDocument[] = []
    const store = createStudioDocumentStore(documentFixture(), value => persisted.push(value))

    store.update({ playback: { stateId: 'idle', playing: false } })

    expect(persisted).toHaveLength(1)
    expect(persisted[0].playback).toEqual({ stateId: 'idle', playing: false })
    expect(persisted[0].expressions).toHaveLength(initialExpressions.length)
  })

  it('repairs sequence references in the same transaction as expression deletion', () => {
    const store = createStudioDocumentStore(documentFixture(), () => undefined)
    const remainingExpressions = initialExpressions.slice(1)

    const next = store.update({ expressions: remainingExpressions })

    expect(
      next.sequences.every(sequence =>
        sequence.steps.every(step =>
          remainingExpressions.some(item => item.id === step.expressionId)
        )
      )
    ).toBe(true)
  })

  it('round-trips a complete project document as portable JSON', () => {
    const document = documentFixture()
    const expression = { ...initialExpressions[0], widthLeft: 42 }
    const sequence = {
      ...createInitialSequences()[0],
      steps: createInitialSequences()[0].steps.map(step => ({
        ...step,
        expressionId: expression.id,
      })),
    }
    document.library.avatars[0].behavior = {
      expressions: [expression],
      sequences: [sequence],
    }

    const imported = parseImportedStudioDocument(serializeStudioDocument(document), document)

    expect(imported).toEqual(document)
    expect(imported.library.avatars[0].behavior?.expressions[0].widthLeft).toBe(42)
  })

  it('keeps the base library unchanged when an avatar owns customized behavior', () => {
    const document = documentFixture()
    const avatar = document.library.avatars[0]
    const customized = {
      ...avatar,
      behavior: {
        expressions: [{ ...initialExpressions[0], widthLeft: 47 }],
        sequences: createInitialSequences().slice(0, 1),
      },
    }
    const store = createStudioDocumentStore(document, () => undefined)

    const next = store.update({
      library: { activeAvatarId: avatar.id, avatars: [customized] },
    })

    expect(next.expressions[0].widthLeft).toBe(initialExpressions[0].widthLeft)
    expect(next.library.avatars[0].behavior?.expressions[0].widthLeft).toBe(47)
  })

  it('rejects files that are not versioned Studio projects', () => {
    const fallback = documentFixture()

    expect(() => parseImportedStudioDocument('{"version":1}', fallback)).toThrow(
      'Unsupported Avatar Studio project'
    )
    expect(() => parseImportedStudioDocument('{broken', fallback)).toThrow(
      'Invalid Avatar Studio project'
    )
  })

  it('repairs an imported active avatar and missing expression references', () => {
    const fallback = documentFixture()
    const avatar = createAvatar('Portable')
    const imported = parseImportedStudioDocument(
      JSON.stringify({
        ...fallback,
        library: { activeAvatarId: 'missing', avatars: [avatar] },
        sequences: [
          {
            ...createInitialSequences()[0],
            steps: [{ ...createInitialSequences()[0].steps[0], expressionId: 'missing' }],
          },
        ],
      }),
      fallback
    )

    expect(imported.library.activeAvatarId).toBe(avatar.id)
    expect(imported.sequences[0].steps[0].expressionId).toBe(imported.expressions[0].id)
  })

  it('sanitizes imported animation timing and playback values', () => {
    const fallback = documentFixture()
    const imported = parseImportedStudioDocument(
      JSON.stringify({
        ...fallback,
        sequences: [
          {
            ...fallback.sequences[0],
            playbackMode: 'unsupported',
            steps: [
              {
                ...fallback.sequences[0].steps[0],
                holdMs: -500,
                transitionMs: Number.POSITIVE_INFINITY,
              },
            ],
          },
        ],
      }),
      fallback
    )

    expect(imported.sequences[0].playbackMode).toBe('loop')
    expect(imported.sequences[0].steps[0].holdMs).toBeGreaterThanOrEqual(100)
    expect(Number.isFinite(imported.sequences[0].steps[0].transitionMs)).toBe(true)
  })
})

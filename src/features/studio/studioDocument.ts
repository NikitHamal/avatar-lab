import {
  parseAvatarLibrary,
  parseExpressions,
  type AvatarBehaviorLibrary,
  type AvatarLibrary,
} from '../avatar/avatars'
import type { Expression } from '../avatar/geometry'
import { initialExpressions } from '../avatar/presets'
import {
  createInitialSequences,
  normalizeSequencesForExpressions,
  parseSequences,
  type AvatarSequence,
} from '../animation/sequences'
import defaultStudioDocument from './defaultStudioDocument.json'

export type StatePlaybackSelection = { stateId: string | null; playing: boolean }

export type StudioDocument = {
  version: 2
  library: AvatarLibrary
  expressions: Expression[]
  sequences: AvatarSequence[]
  playback: StatePlaybackSelection
}

export type StudioDocumentPatch = Partial<Omit<StudioDocument, 'version'>>

const DOCUMENT_STORAGE_KEY = 'bible-strong-avatar-studio-v2'

const defaultPlayback: StatePlaybackSelection = { stateId: 'idle', playing: true }

const parsePlayback = (
  value: unknown,
  fallback: StatePlaybackSelection = defaultPlayback
): StatePlaybackSelection => {
  const candidate = value as Partial<StatePlaybackSelection> | null
  if (!candidate || (typeof candidate.stateId !== 'string' && candidate.stateId !== null)) {
    return { ...fallback }
  }
  return { stateId: candidate.stateId, playing: candidate.playing === true }
}

export const parseStudioDocument = (value: unknown, fallback: StudioDocument): StudioDocument => {
  const candidate = value as Partial<StudioDocument> | null
  if (!candidate || candidate.version !== 2) return fallback
  const expressions =
    Array.isArray(candidate.expressions) && candidate.expressions.length
      ? parseExpressions(candidate.expressions)
      : fallback.expressions
  const sequences = Array.isArray(candidate.sequences)
    ? normalizeSequencesForExpressions(parseSequences(candidate.sequences), expressions)
    : fallback.sequences
  const baseBehavior: AvatarBehaviorLibrary = { expressions, sequences }
  const library = parseAvatarLibrary(candidate.library, fallback.library, baseBehavior)
  return {
    version: 2,
    library,
    expressions,
    sequences,
    playback: parsePlayback(candidate.playback, fallback.playback),
  }
}

export const serializeStudioDocument = (document: StudioDocument) =>
  JSON.stringify(document, null, 2)

export const parseImportedStudioDocument = (
  source: string,
  fallback: StudioDocument
): StudioDocument => {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error('Invalid Avatar Studio project')
  }
  const candidate = value as Partial<StudioDocument> | null
  if (!candidate || candidate.version !== 2) {
    throw new Error('Unsupported Avatar Studio project')
  }
  if (
    !candidate.library ||
    !Array.isArray(candidate.library.avatars) ||
    !candidate.library.avatars.length ||
    !Array.isArray(candidate.expressions) ||
    !candidate.expressions.length ||
    !Array.isArray(candidate.sequences)
  ) {
    throw new Error('Invalid Avatar Studio project')
  }
  return parseStudioDocument(candidate, fallback)
}

const isLegacyBundledIdle = (sequence: AvatarSequence | undefined) =>
  Boolean(
    sequence?.builtIn &&
    sequence.steps.length === 2 &&
    sequence.steps[0]?.expressionId === 'expression-00' &&
    sequence.steps[1]?.expressionId === 'expression-08'
  )

const legacyBuiltInPools: Record<string, number[]> = {
  sleeping: [13, 22, 4],
  waking: [13],
  listening: [10, 1, 19],
  thinking: [8, 16, 14, 17, 5],
  searching: [15, 9, 3, 20, 12, 18],
  working: [7, 16, 11, 10, 32],
  speaking: [35, 36, 37, 26],
  presenting: [32, 25, 26, 49],
  scanning: [33, 34, 32],
  excited: [2, 17, 21, 3, 11],
  surprised: [3, 21],
  suspicious: [14, 5, 23],
  angry: [7, 16],
  drowsy: [4, 22, 13],
  happy: [2, 11, 17, 19],
  curious: [3, 21, 0, 15],
  confused: [14, 5, 8],
  bored: [4, 22, 0],
  proud: [15, 8, 2],
  shy: [0, 24, 13],
  sad: [4, 13, 22],
  laughing: [2, 11, 17],
  scared: [3, 21],
  playful: [2, 17, 11, 8],
  celebrate: [2, 8, 17, 49],
  greeting: [26, 27, 25],
  agree: [26, 25, 47],
  disagree: [30, 31, 41],
  wink: [27, 26, 29],
  love: [28, 26, 43],
  success: [47, 49, 25],
  error: [48, 41, 39],
  notification: [46, 38, 25],
  dizzy: [45, 38, 42],
  dance: [49, 27, 25, 43],
}

const enhancedExpressionIds = [
  'joy',
  'soft-smile',
  'wink',
  'love',
  'smug',
  'skeptical',
  'side-eye',
  'focus',
  'scan-left',
  'scan-right',
  'talk-a',
  'talk-b',
  'talk-c',
  'gasp',
  'panic',
  'sad-deep',
  'angry-hot',
  'sleepy',
  'kiss',
  'cat-cute',
  'dizzy',
  'notification',
  'success',
  'error',
  'confetti',
  'idle-front',
  'idle-glance-left',
  'idle-glance-right',
  'delight',
  'eye-roll',
  'concern',
  'listening-focus',
  'puzzled',
  'determined',
  'anticipation',
  'cheer',
  'intro-neby-closed',
  'intro-neby-peek',
  'intro-neby-focus',
  'intro-neby-signature',
  'intro-pop',
  'intro-scan',
] as const

const previousBundledPools: Record<string, number[]> = {
  sleeping: [42, 13, 42],
  waking: [42, 26, 50],
  idle: [50, 51, 50, 52],
  listening: [32, 10, 50],
  thinking: [33, 34, 32, 50],
  searching: [33, 34, 32, 50],
  working: [32, 33, 34, 50],
  speaking: [35, 36, 37, 50],
  presenting: [32, 25, 26, 49],
  scanning: [33, 34, 32],
  excited: [25, 17, 21, 3, 11],
  surprised: [38, 3, 21],
  suspicious: [29, 30, 14, 5],
  angry: [41, 7, 16],
  drowsy: [42, 4, 13],
  happy: [25, 26, 11, 17],
  curious: [38, 21, 0, 33],
  confused: [30, 14, 5, 8],
  bored: [42, 4, 22, 0],
  proud: [32, 15, 8, 25],
  shy: [26, 24, 13],
  sad: [40, 4, 13, 22],
  laughing: [25, 11, 17],
  scared: [39, 3, 21],
  playful: [25, 27, 29, 8],
  celebrate: [49, 25, 47, 26],
  greeting: [26, 27, 25],
  agree: [26, 25, 47],
  disagree: [30, 31, 41],
  wink: [27, 26, 29],
  love: [28, 26, 43],
  success: [47, 49, 25],
  error: [48, 41, 39],
  notification: [46, 38, 25],
  dizzy: [45, 38, 42],
  dance: [49, 25, 27, 28],
}
const expressionIdForBundledIndex = (index: number) =>
  index < 25 ? `expression-${String(index).padStart(2, '0')}` : enhancedExpressionIds[index - 25]

const poolMatchesSequence = (sequence: AvatarSequence, pool: number[] | undefined) =>
  Boolean(
    pool &&
    sequence.steps.length === pool.length &&
    sequence.steps.every(
      (step, index) => step.expressionId === expressionIdForBundledIndex(pool[index])
    )
  )

const isLegacyBundledSequence = (sequence: AvatarSequence | undefined) => {
  if (!sequence?.builtIn) return false
  return (
    poolMatchesSequence(sequence, legacyBuiltInPools[sequence.id]) ||
    poolMatchesSequence(sequence, previousBundledPools[sequence.id])
  )
}

const createBundledStudioDocument = () => {
  const snapshot = JSON.parse(JSON.stringify(defaultStudioDocument)) as StudioDocument
  // Keep artwork/library data in the retained document, but generate the behavior library from
  // source so new expressive rigs and tuned timing never lag behind a stale JSON snapshot.
  snapshot.expressions = structuredClone(initialExpressions)
  snapshot.sequences = createInitialSequences()
  return parseStudioDocument(snapshot, snapshot)
}

export const loadStudioDocument = (
  storage: Pick<Storage, 'getItem'> = window.localStorage
): StudioDocument => {
  const fallback = createBundledStudioDocument()
  try {
    const raw = storage.getItem(DOCUMENT_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = parseStudioDocument(JSON.parse(raw), fallback)
    const hasStrobi = parsed.library.avatars.some(a => a.id === 'strobi')
    if (hasStrobi) {
      fallback.library.avatars.forEach(fallbackAvatar => {
        const existingIndex = parsed.library.avatars.findIndex(a => a.id === fallbackAvatar.id)
        if (existingIndex < 0) {
          parsed.library.avatars.push(fallbackAvatar)
        } else if (fallbackAvatar.id === 'avatar-neby') {
          const current = parsed.library.avatars[existingIndex]
          const currentNodes = current.body.nodes
          const hasOldNodes = currentNodes.length > 0 || current.body.primary.pattern !== 'book'
          if (hasOldNodes) {
            parsed.library.avatars[existingIndex] = fallbackAvatar
          } else if (
            current.colors.body === '#000000' ||
            current.colors.body === '#ffffff' ||
            current.colors.body === '#f0f5ff'
          ) {
            current.colors.body = '#cce2ff'
          }
        }
      })
    }

    // Behavior-library upgrades are independent from one particular legacy avatar. This keeps
    // saved projects on the current stock eye/effect vocabulary even if a bundled character was
    // deleted, while avatar-owned behavior libraries below remain isolated as designed.
    fallback.expressions.forEach(fallbackExpr => {
      const existingIndex = parsed.expressions.findIndex(e => e.id === fallbackExpr.id)
      if (existingIndex < 0) parsed.expressions.push(structuredClone(fallbackExpr))
    })
    const stockExpressionIds = new Set<string>(enhancedExpressionIds)
    fallback.expressions.forEach(fallbackExpr => {
      if (!stockExpressionIds.has(fallbackExpr.id)) return
      const existingIndex = parsed.expressions.findIndex(e => e.id === fallbackExpr.id)
      if (existingIndex >= 0) parsed.expressions[existingIndex] = structuredClone(fallbackExpr)
    })
    fallback.sequences.forEach(fallbackSeq => {
      const existingIndex = parsed.sequences.findIndex(s => s.id === fallbackSeq.id)
      if (existingIndex < 0) parsed.sequences.push(structuredClone(fallbackSeq))
    })

    // Refresh only untouched built-in sequences from the previous bundle. Custom and edited
    // sequences retain their authored steps, while stock reactions gain the expressive eye poses.
    fallback.sequences.forEach(fallbackSequence => {
      const existingIndex = parsed.sequences.findIndex(
        sequence => sequence.id === fallbackSequence.id
      )
      if (existingIndex >= 0 && isLegacyBundledSequence(parsed.sequences[existingIndex])) {
        parsed.sequences[existingIndex] = structuredClone(fallbackSequence)
      }
    })
    parsed.library.avatars.forEach(avatar => {
      if (!avatar.behavior) return
      const upgradedExpressionIds = new Set<string>()
      const refreshed = avatar.behavior.sequences.map(sequence => {
        if (!isLegacyBundledSequence(sequence)) return sequence
        const fallbackSequence = fallback.sequences.find(item => item.id === sequence.id)
        fallbackSequence?.steps.forEach(step => upgradedExpressionIds.add(step.expressionId))
        return fallbackSequence ? structuredClone(fallbackSequence) : sequence
      })
      if (upgradedExpressionIds.size) {
        const existingIds = new Set(avatar.behavior.expressions.map(expression => expression.id))
        fallback.expressions.forEach(expression => {
          if (upgradedExpressionIds.has(expression.id) && !existingIds.has(expression.id)) {
            avatar.behavior!.expressions.push(structuredClone(expression))
            existingIds.add(expression.id)
          }
        })
      }
      const stockExpressionIds = new Set<string>(enhancedExpressionIds)
      fallback.expressions.forEach(fallbackExpression => {
        if (!stockExpressionIds.has(fallbackExpression.id)) return
        const existingIndex = avatar.behavior!.expressions.findIndex(
          expression => expression.id === fallbackExpression.id
        )
        if (existingIndex >= 0) {
          avatar.behavior!.expressions[existingIndex] = structuredClone(fallbackExpression)
        }
      })
      avatar.behavior.sequences = normalizeSequencesForExpressions(
        refreshed,
        avatar.behavior.expressions
      )
    })

    // Upgrade the exact legacy bundled idle regardless of which avatars remain in the library.
    // This preserves user-authored sequences while removing the old upper-right shipping pose.
    const idleIndex = parsed.sequences.findIndex(sequence => sequence.id === 'idle')
    const fallbackIdle = fallback.sequences.find(sequence => sequence.id === 'idle')
    const hadLegacyIdle = idleIndex >= 0 && isLegacyBundledIdle(parsed.sequences[idleIndex])
    if (hadLegacyIdle && fallbackIdle) {
      parsed.sequences[idleIndex] = structuredClone(fallbackIdle)
    }
    if (hadLegacyIdle && parsed.playback.stateId === 'proud' && parsed.playback.playing) {
      parsed.playback = { stateId: 'idle', playing: true }
    }
    return parsed
  } catch {
    return fallback
  }
}

export const persistStudioDocument = (document: StudioDocument) => {
  try {
    window.localStorage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(document))
    return true
  } catch {
    // The in-memory document remains authoritative when storage is unavailable.
    return false
  }
}

export const createStudioDocumentStore = (
  initial: StudioDocument,
  persist: (document: StudioDocument) => void = persistStudioDocument
) => {
  let current = initial
  return {
    update: (patch: StudioDocumentPatch) => {
      const expressions = patch.expressions ?? current.expressions
      current = {
        ...current,
        ...patch,
        version: 2,
        expressions,
        sequences: normalizeSequencesForExpressions(
          patch.sequences ?? current.sequences,
          expressions
        ),
      }
      persist(current)
      return current
    },
  }
}

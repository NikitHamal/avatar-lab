import { defaultExpression, initialExpressions } from '@/features/avatar/presets'
import { creatureEyeRigFromExpression } from '@/features/creature/creatureExpression'

const expression = (id: string) => initialExpressions.find(item => item.id === id)!

describe('Creature expression rig', () => {
  it('closes both expressive eyes for sleepy reactions', () => {
    const neutral = creatureEyeRigFromExpression(defaultExpression)
    const sleepy = creatureEyeRigFromExpression(expression('sleepy'))

    expect(sleepy.left.heightScale).toBeLessThan(neutral.left.heightScale * 0.35)
    expect(sleepy.right.heightScale).toBeLessThan(neutral.right.heightScale * 0.35)
  })

  it('supports asymmetric closure for a wink', () => {
    const wink = creatureEyeRigFromExpression(expression('wink'))

    expect(wink.left.heightScale).toBeLessThan(wink.right.heightScale * 0.5)
  })

  it('turns authored eye translation into a locked semantic gaze', () => {
    const left = creatureEyeRigFromExpression(expression('scan-left'))
    const neutral = creatureEyeRigFromExpression(defaultExpression)

    expect(left.lockGaze).toBe(true)
    expect(left.gazeX).toBeLessThan(-0.4)
    expect(neutral.lockGaze).toBe(false)
  })

  it('lets sequence blinks close Creature eyes independently of their expression', () => {
    const open = creatureEyeRigFromExpression(defaultExpression, 1)
    const closed = creatureEyeRigFromExpression(defaultExpression, 0)

    expect(closed.left.heightScale).toBeLessThan(open.left.heightScale * 0.1)
    expect(closed.right.heightScale).toBeLessThan(open.right.heightScale * 0.1)
  })
})

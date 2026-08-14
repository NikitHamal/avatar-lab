import { validateAvatarDefinition, type AvatarDefinition } from '@bible-strong/avatar-core'
import { Avatar, type AvatarController } from '@bible-strong/avatar-react'
import '@bible-strong/avatar-react/styles.css'
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import definitionJson from './strobi.avatar.json'
import './styles.css'

const validation = validateAvatarDefinition(definitionJson)
if (!validation.ok) throw new Error(validation.errors[0]?.message)
const definition = validation.value as AvatarDefinition

function Demo() {
  const controller = useRef<AvatarController>(null)
  const [status, setStatus] = useState('neutral')
  const play = () => {
    const result = controller.current?.play('idle')
    setStatus(result?.ok ? 'idle' : (result?.error.code ?? 'unavailable'))
  }
  const setNeutral = () => {
    const result = controller.current?.setExpression('neutral')
    setStatus(result?.ok ? 'neutral' : (result?.error.code ?? 'unavailable'))
  }
  return (
    <main>
      <h1>Avatar package consumer</h1>
      <section className="avatar-host" aria-label="Embedded avatar example">
        <Avatar
          ref={controller}
          definition={definition}
          size={240}
          onExpressionChange={setStatus}
          ariaLabel="Embedded Strobi avatar"
        />
      </section>
      <button type="button" onClick={play}>
        Play idle
      </button>
      <button type="button" onClick={setNeutral}>
        Set neutral
      </button>
      <output aria-live="polite">{status}</output>
      <Avatar
        definition={definition}
        mode="floating"
        draggable
        size={128}
        initialPosition={{ right: 24, bottom: 24 }}
        ariaLabel="Floating draggable Strobi avatar"
      />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>
)

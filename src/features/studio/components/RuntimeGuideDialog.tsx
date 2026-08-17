import { BookOpen, Code2, MousePointer2, Play, SlidersHorizontal, X } from 'lucide-react'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useStudioLanguage } from '@/i18n'

const runtimeInstallExample = 'npm install @bible-strong/avatar-react react react-dom'
const webInstallExample = 'npm install @bible-strong/avatar-web'

const webAvatarExample = (
  animationKey: string | undefined
) => `import { createAvatar } from '@bible-strong/avatar-web'
import definition from './avatar.avatar.json'

const avatar = createAvatar('#avatar', {
  definition,
  ${animationKey ? `defaultAnimation: '${animationKey}',` : `defaultExpression: 'neutral',`}
})

avatar.play(${animationKey ? `'${animationKey}'` : `'idle'`})
avatar.pause()
avatar.setExpression('neutral')
avatar.stop()`

const nativeBrowserExample = `<!-- Resolve the package URL through your CDN or import map. -->
<div id="avatar"></div>
<script type="module">
  import { createAvatar } from 'https://cdn.example.com/avatar-web.js'

  const definition = await fetch('./avatar.avatar.json').then(response => response.json())
  const avatar = createAvatar('#avatar', { definition, defaultExpression: 'neutral' })
</script>`

const createAvatarExample = (
  animationKey: string | undefined
) => `import { createAvatar } from '@bible-strong/avatar-react'
import '@bible-strong/avatar-react/styles.css'
import avatarJson from './avatar.avatar.json'

const StrobiAvatar = createAvatar(avatarJson)

export function Strobi() {
  return <StrobiAvatar ${
    animationKey ? `defaultAnimation="${animationKey}"` : 'defaultExpression="neutral"'
  } />
}`

const genericAvatarExample = `import { Avatar } from '@bible-strong/avatar-react'
import type { AvatarDefinition, ExpressionKey } from '@bible-strong/avatar-core'
import '@bible-strong/avatar-react/styles.css'

export function DynamicAvatar({
  definition,
  expression,
}: {
  definition: AvatarDefinition
  expression: ExpressionKey
}) {
  return (
    <Avatar
      definition={definition}
      expression={expression}
      onError={error => console.error(error)}
    />
  )
}`

const imperativeExample = (
  animationKey: string | undefined
) => `import { createAvatar, type AvatarController } from '@bible-strong/avatar-react'
import { useRef } from 'react'
import avatarJson from './avatar.avatar.json'

const StrobiAvatar = createAvatar(avatarJson)

export function Controls() {
  const avatar = useRef<AvatarController>(null)

  return <>
    <StrobiAvatar ref={avatar} ${
      animationKey ? `defaultAnimation="${animationKey}"` : 'defaultExpression="neutral"'
    } />${
      animationKey
        ? `
    <button onClick={() => avatar.current?.play('${animationKey}')}>Play animation</button>`
        : ''
    }
    <button onClick={() => avatar.current?.pause()}>Pause</button>
    <button onClick={() => avatar.current?.setExpression('neutral')}>Set expression</button>
    <button onClick={() => avatar.current?.stop()}>Stop</button>
    <button onClick={() => console.log(avatar.current?.getState())}>Read state</button>
  </>
}`

const codeTokenPattern =
  /(\/\/.*|'.*?'|".*?"|@[a-z0-9-/]+|<\/?[A-Z][A-Za-z]*|\b(?:npm|install|import|from|const|if|throw|new|export|function|return|onClick|ref|useRef)\b)/g

const highlightedCode = (source: string) =>
  source.split(codeTokenPattern).map((token, index) => {
    if (!token) return null
    const kind = token.startsWith('//')
      ? 'comment'
      : token.startsWith("'") || token.startsWith('"') || token.startsWith('@')
        ? 'string'
        : token.startsWith('<')
          ? 'tag'
          : /^(?:npm|install|import|from|const|if|throw|new|export|function|return|onClick|ref|useRef)$/.test(
                token
              )
            ? 'keyword'
            : 'plain'
    return (
      <span className={`runtime-token runtime-token-${kind}`} key={`${index}-${token}`}>
        {token}
      </span>
    )
  })

function GuideCode({ children }: { children: string }) {
  return (
    <pre className="avatar-guide-code" tabIndex={0}>
      <code>{highlightedCode(children)}</code>
    </pre>
  )
}

function PropRow({ name, type, description }: { name: string; type: string; description: string }) {
  return (
    <div className="avatar-guide-prop">
      <dt>
        <code>{name}</code>
        <span className="avatar-guide-prop-type">{type}</span>
      </dt>
      <dd>{description}</dd>
    </div>
  )
}

export function RuntimeGuideDialog({
  animationKey,
  integration = 'react',
  onOpenChange,
  open,
}: {
  animationKey?: string
  integration?: 'react' | 'javascript'
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { t } = useStudioLanguage()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="avatar-guide-dialog">
        <DialogHeader>
          <div className="avatar-guide-kicker">
            <BookOpen />
            <span>{t('Guide d’utilisation')}</span>
          </div>
          <DialogTitle>
            {t(
              integration === 'react'
                ? 'Guide d’utilisation de l’avatar React'
                : 'Guide d’utilisation de l’avatar JavaScript'
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              integration === 'react'
                ? 'Installe le package, crée ton composant et choisis le niveau de contrôle adapté.'
                : 'Installe le module ESM, charge la définition JSON et monte l’avatar dans un élément du DOM.'
            )}
          </DialogDescription>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon"
                className="avatar-guide-close"
                aria-label={t('Fermer le guide')}
              >
                <X />
              </Button>
            }
          />
        </DialogHeader>

        <div className="avatar-guide-body">
          {integration === 'react' ? (
            <>
              <section className="avatar-guide-section avatar-guide-section--accent">
                <div className="avatar-guide-section-heading">
                  <Code2 />
                  <div>
                    <h3>{t('Installation')}</h3>
                    <p>{t('Ajoute le package React et ses dépendances.')}</p>
                  </div>
                </div>
                <GuideCode>{runtimeInstallExample}</GuideCode>
                <p className="avatar-guide-notice">
                  {t(
                    'Les packages sont encore privés. Cette commande fonctionnera après leur publication ; utilise le workspace ou les tarballs pour les tests locaux.'
                  )}
                </p>
              </section>

              <section className="avatar-guide-section">
                <div className="avatar-guide-section-heading">
                  <Play />
                  <div>
                    <h3>{t('API recommandée : créer un avatar concret')}</h3>
                    <p>
                      {t(
                        'createAvatar valide le JSON et retourne un composant dédié dont les clés d’animations sont typées.'
                      )}
                    </p>
                  </div>
                </div>
                <GuideCode>{createAvatarExample(animationKey)}</GuideCode>
              </section>

              <section className="avatar-guide-section avatar-guide-section--api">
                <div className="avatar-guide-section-heading">
                  <SlidersHorizontal />
                  <div>
                    <h3>{t('Props de l’avatar')}</h3>
                    <p>
                      {t(
                        'Référence complète : type, valeur par défaut, comportement et contraintes de chaque prop.'
                      )}
                    </p>
                  </div>
                </div>

                <div className="avatar-guide-prop-group">
                  <strong>{t('Cible et lecture')}</strong>
                  <dl>
                    <PropRow
                      name="definition"
                      type="AvatarDefinition"
                      description={t(
                        'Obligatoire. Objet AvatarDefinition validé contenant les expressions et les animations à afficher.'
                      )}
                    />
                    <PropRow
                      name="animation"
                      type="AnimationKey | undefined"
                      description={t(
                        'Optionnelle. Contrôle une timeline par sa clé. Chaque étape choisit l’expression affichée. Mutuellement exclusive avec expression ; une cible contrôlée prend priorité sur les valeurs default.'
                      )}
                    />
                    <PropRow
                      name="expression"
                      type="ExpressionKey | undefined"
                      description={t(
                        'Optionnelle. Contrôle directement une expression par sa clé. Mutuellement exclusive avec animation ; une cible contrôlée prend priorité sur les valeurs default.'
                      )}
                    />
                    <PropRow
                      name="defaultAnimation"
                      type="AnimationKey | undefined"
                      description={t(
                        'Optionnelle. Définit la timeline initiale en mode non contrôlé. Lue au montage ; autoplay est activé par défaut. Mutuellement exclusive avec defaultExpression.'
                      )}
                    />
                    <PropRow
                      name="defaultExpression"
                      type="ExpressionKey | undefined"
                      description={t(
                        'Optionnelle. Définit l’expression initiale en mode non contrôlé. Lue au montage, sans lancer de timeline. Mutuellement exclusive avec defaultAnimation.'
                      )}
                    />
                    <PropRow
                      name="autoplay"
                      type="boolean | undefined"
                      description={t(
                        'Optionnelle, défaut true. Lance automatiquement defaultAnimation ; sans defaultAnimation, elle n’a aucun effet.'
                      )}
                    />
                    <PropRow
                      name="ref"
                      type="Ref<AvatarController> | undefined"
                      description={t(
                        'Optionnelle. Donne accès à l’API impérative AvatarController.'
                      )}
                    />
                  </dl>
                </div>

                <div className="avatar-guide-prop-group">
                  <strong>{t('Présentation')}</strong>
                  <dl>
                    <PropRow
                      name="size"
                      type="number | string | undefined"
                      description={t(
                        'Optionnelle, défaut 240. Nombre ou valeur CSS utilisée pour la largeur et la hauteur du conteneur.'
                      )}
                    />
                    <PropRow
                      name="className"
                      type="string | undefined"
                      description={t('Optionnelle. Classe CSS ajoutée au conteneur externe.')}
                    />
                    <PropRow
                      name="style"
                      type="CSSProperties | undefined"
                      description={t(
                        'Optionnelle. Styles inline du conteneur externe ; width et height viennent de size.'
                      )}
                    />
                    <PropRow
                      name="ariaLabel"
                      type="string | undefined"
                      description={t(
                        'Optionnelle, défaut « Procedural avatar ». Nom accessible annoncé aux lecteurs d’écran.'
                      )}
                    />
                  </dl>
                </div>

                <div className="avatar-guide-prop-group">
                  <strong>{t('Callbacks de lecture')}</strong>
                  <dl>
                    <PropRow
                      name="onAnimationEnd"
                      type="(animation: AnimationKey) => void"
                      description={t(
                        'Optionnelle. Reçoit la clé de l’animation once terminée naturellement.'
                      )}
                    />
                    <PropRow
                      name="onExpressionChange"
                      type="(expression: ExpressionKey) => void"
                      description={t(
                        'Optionnelle. Reçoit la clé de l’expression chaque fois que l’expression sémantique affichée change.'
                      )}
                    />
                    <PropRow
                      name="onError"
                      type="(error: AvatarRuntimeError) => void"
                      description={t(
                        'Optionnelle. Reçoit une erreur typée lorsqu’une prop animation, expression ou default référence une clé inconnue.'
                      )}
                    />
                  </dl>
                </div>
              </section>

              <section className="avatar-guide-section">
                <div className="avatar-guide-section-heading">
                  <Code2 />
                  <div>
                    <h3>{t('Avatar générique')}</h3>
                    <p>
                      {t(
                        'Utilise Avatar directement lorsque la définition est chargée à l’exécution ou change entre plusieurs avatars.'
                      )}
                    </p>
                  </div>
                </div>
                <GuideCode>{genericAvatarExample}</GuideCode>
              </section>

              <section className="avatar-guide-section avatar-guide-section--api">
                <div className="avatar-guide-section-heading">
                  <MousePointer2 />
                  <div>
                    <h3>{t('API impérative')}</h3>
                    <p>
                      {t('La ref expose les commandes de lecture et l’état courant de l’avatar.')}
                    </p>
                    <p>
                      {t(
                        'Les commandes de cible sont disponibles en mode non contrôlé ; sinon utilise les props.'
                      )}
                    </p>
                  </div>
                </div>
                <div className="avatar-guide-prop-group">
                  <dl>
                    <PropRow
                      name="play(animation)"
                      type="(animation: AnimationKey) => AvatarCommandResult"
                      description={t(
                        'Lance ou reprend une animation et retourne un résultat typé.'
                      )}
                    />
                    <PropRow
                      name="pause()"
                      type="() => void"
                      description={t('Met en pause la timeline à sa position exacte.')}
                    />
                    <PropRow
                      name="stop()"
                      type="() => void"
                      description={t(
                        'En mode non contrôlé, arrête la lecture et revient à neutral. En mode contrôlé, les props restent la source de vérité.'
                      )}
                    />
                    <PropRow
                      name="setExpression(expression)"
                      type="(expression: ExpressionKey) => AvatarCommandResult"
                      description={t('Affiche directement une expression.')}
                    />
                    <PropRow
                      name="getState()"
                      type="() => AvatarPlaybackState"
                      description={t('Retourne l’animation, l’expression et le statut actifs.')}
                    />
                  </dl>
                </div>
                <GuideCode>{imperativeExample(animationKey)}</GuideCode>
              </section>
            </>
          ) : (
            <>
              <section className="avatar-guide-section avatar-guide-section--accent">
                <div className="avatar-guide-section-heading">
                  <Code2 />
                  <div>
                    <h3>{t('Installation')}</h3>
                    <p>{t('Ajoute le renderer DOM, qui utilise automatiquement avatar-core.')}</p>
                  </div>
                </div>
                <GuideCode>{webInstallExample}</GuideCode>
                <p className="avatar-guide-notice">
                  {t(
                    'Les packages sont encore privés. Cette commande fonctionnera après leur publication ; utilise le workspace ou les tarballs pour les tests locaux.'
                  )}
                </p>
              </section>

              <section className="avatar-guide-section">
                <div className="avatar-guide-section-heading">
                  <Play />
                  <div>
                    <h3>{t('Utilisation avec un bundler ESM')}</h3>
                    <p>
                      {t(
                        'Vite et les bundlers modernes résolvent le package et importent le même fichier .avatar.json que React.'
                      )}
                    </p>
                  </div>
                </div>
                <GuideCode>{webAvatarExample(animationKey)}</GuideCode>
              </section>

              <section className="avatar-guide-section avatar-guide-section--api">
                <div className="avatar-guide-section-heading">
                  <SlidersHorizontal />
                  <div>
                    <h3>{t('Options de createAvatar')}</h3>
                    <p>{t('Référence des valeurs acceptées lors du montage dans le DOM.')}</p>
                  </div>
                </div>
                <div className="avatar-guide-prop-group">
                  <dl>
                    <PropRow
                      name="definition"
                      type="AvatarDefinition | unknown"
                      description={t(
                        'Obligatoire. Définition JSON validée avant la création des éléments SVG.'
                      )}
                    />
                    <PropRow
                      name="defaultAnimation"
                      type="AnimationKey | undefined"
                      description={t(
                        'Optionnelle. Animation lancée au montage lorsque autoplay vaut true. Mutuellement exclusive avec defaultExpression.'
                      )}
                    />
                    <PropRow
                      name="defaultExpression"
                      type="ExpressionKey | undefined"
                      description={t(
                        'Optionnelle. Expression initiale affichée sans lancer de timeline. Mutuellement exclusive avec defaultAnimation.'
                      )}
                    />
                    <PropRow
                      name="autoplay"
                      type="boolean | undefined"
                      description={t(
                        'Optionnelle, défaut true. Contrôle uniquement le lancement automatique de defaultAnimation.'
                      )}
                    />
                    <PropRow
                      name="size"
                      type="number | string | undefined"
                      description={t(
                        'Optionnelle, défaut 240. Largeur et hauteur CSS du conteneur rendu.'
                      )}
                    />
                    <PropRow
                      name="className"
                      type="string | undefined"
                      description={t('Optionnelle. Classe CSS ajoutée au conteneur rendu.')}
                    />
                    <PropRow
                      name="ariaLabel"
                      type="string | undefined"
                      description={t(
                        'Optionnelle, défaut « Procedural avatar ». Nom accessible du rendu.'
                      )}
                    />
                    <PropRow
                      name="onError"
                      type="(error: AvatarRuntimeError) => void"
                      description={t(
                        'Optionnelle. Reçoit les erreurs de clé inconnue utilisées lors de l’initialisation.'
                      )}
                    />
                    <PropRow
                      name="onAnimationEnd"
                      type="(animation: AnimationKey) => void"
                      description={t('Optionnelle. Appelée lorsqu’une animation once se termine.')}
                    />
                    <PropRow
                      name="onExpressionChange"
                      type="(expression: ExpressionKey) => void"
                      description={t('Optionnelle. Appelée lorsque l’expression active change.')}
                    />
                  </dl>
                </div>
              </section>

              <section className="avatar-guide-section avatar-guide-section--api">
                <div className="avatar-guide-section-heading">
                  <MousePointer2 />
                  <div>
                    <h3>{t('API du contrôleur DOM')}</h3>
                    <p>{t('createAvatar retourne immédiatement ces commandes impératives.')}</p>
                  </div>
                </div>
                <div className="avatar-guide-prop-group">
                  <dl>
                    <PropRow
                      name="play(animation)"
                      type="(animation: AnimationKey) => AvatarCommandResult"
                      description={t('Lance ou reprend une animation par sa clé.')}
                    />
                    <PropRow
                      name="setExpression(expression)"
                      type="(expression: ExpressionKey) => AvatarCommandResult"
                      description={t('Affiche une expression avec une transition courte.')}
                    />
                    <PropRow
                      name="pause()"
                      type="() => void"
                      description={t('Met en pause la timeline à sa position exacte.')}
                    />
                    <PropRow
                      name="stop()"
                      type="() => void"
                      description={t('Arrête la lecture et revient à neutral.')}
                    />
                    <PropRow
                      name="getState()"
                      type="() => AvatarPlaybackState"
                      description={t('Retourne l’animation, l’expression et le statut actifs.')}
                    />
                    <PropRow
                      name="destroy()"
                      type="() => void"
                      description={t(
                        'Annule la frame planifiée et retire uniquement le conteneur créé par avatar-web.'
                      )}
                    />
                  </dl>
                </div>
              </section>

              <section className="avatar-guide-section">
                <div className="avatar-guide-section-heading">
                  <Code2 />
                  <div>
                    <h3>{t('Navigateur sans bundler')}</h3>
                    <p>
                      {t(
                        'Utilise une URL ESM via un CDN ou une import map, puis charge la définition avec fetch.'
                      )}
                    </p>
                  </div>
                </div>
                <GuideCode>{nativeBrowserExample}</GuideCode>
              </section>
            </>
          )}
        </div>

        <div className="avatar-guide-footer">
          <DialogClose render={<Button variant="outline">{t('Fermer le guide')}</Button>} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

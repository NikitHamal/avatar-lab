import { Code2 } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { StudioController } from '@/features/studio/useStudioController'
import { type StudioLanguage } from '@/i18n'

type StudioIdentityProps = Pick<StudioController, 'language' | 'setLanguage' | 't'> & {
  className?: string
}

export function StudioIdentity({ className = '', language, setLanguage, t }: StudioIdentityProps) {
  return (
    <div className={`studio-identity ${className}`.trim()}>
      <div className="brand">
        <span className="brand-mark" />
        Bible Strong <em>Avatar Lab</em>
      </div>
      <div className="language-picker">
        <a
          className="source-link"
          href="https://github.com/smontlouis/bible-strong-avatar-lab"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
        >
          <Code2 aria-hidden="true" />
          <span>GitHub</span>
        </a>
        <span className="identity-divider" aria-hidden="true" />
        <span aria-hidden="true">{language === 'en' ? '🇬🇧' : language === 'fr' ? '🇫🇷' : '🇨🇳'}</span>
        <Select
          value={language}
          items={[
            { value: 'en', label: 'English' },
            { value: 'fr', label: 'Français' },
            { value: 'zh-CN', label: '中文' },
          ]}
          onValueChange={next => next && setLanguage(next as StudioLanguage)}
        >
          <SelectTrigger aria-label={t('Langue de l’interface')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="zh-CN">中文</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

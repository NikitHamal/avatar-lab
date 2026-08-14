import { translateStudioText } from '@/i18n'

describe('avatar studio translations', () => {
  it('uses English for static interface copy', () => {
    expect(translateStudioText('Couleur des yeux', 'en')).toBe('Eye color')
  })

  it('translates dynamic editor labels', () => {
    expect(translateStudioText('Modifier l’expression 08', 'en')).toBe('Edit expression 08')
    expect(translateStudioText('Sphère · porte les yeux', 'en')).toBe('Sphere · carries the eyes')
    expect(translateStudioText('Cône 1 copie', 'en')).toBe('Cone 1 copy')
  })

  it('keeps the original French copy in French', () => {
    expect(translateStudioText('Nouvel avatar', 'fr')).toBe('Nouvel avatar')
    expect(translateStudioText('sleeping', 'fr')).toBe('sommeil')
  })

  it('translates the studio interface and dynamic labels to Simplified Chinese', () => {
    expect(translateStudioText('Couleur des yeux', 'zh-CN')).toBe('眼睛颜色')
    expect(translateStudioText('Modifier l’expression 08', 'zh-CN')).toBe('编辑表情 08')
    expect(translateStudioText('sleeping', 'zh-CN')).toBe('睡眠')
  })

  it('translates every Photo Mode control to Simplified Chinese', () => {
    expect(translateStudioText('Mode photo', 'zh-CN')).toBe('照片模式')
    expect(translateStudioText('Dégradé radial', 'zh-CN')).toBe('径向渐变')
    expect(translateStudioText('Définition du mode photo', 'zh-CN')).toBe('照片模式分辨率')
    expect(translateStudioText('Télécharger en PNG', 'zh-CN')).toBe('下载 PNG')
    expect(translateStudioText('Prendre une photo', 'zh-CN')).toBe('拍照')
    expect(translateStudioText('Format d’export', 'zh-CN')).toBe('导出格式')
  })

  it('keeps runtime-export authoring copy synchronized in all three languages', () => {
    expect(translateStudioText('Clé sémantique', 'fr')).toBe('Clé sémantique')
    expect(translateStudioText('Clé sémantique', 'en')).toBe('Semantic key')
    expect(translateStudioText('Clé sémantique', 'zh-CN')).toBe('语义键')
    expect(translateStudioText('Exporter le JSON runtime', 'en')).toBe('Export runtime JSON')
    expect(translateStudioText('Exporter le JSON runtime', 'zh-CN')).toBe('导出运行时 JSON')
    expect(translateStudioText('Nouveau', 'en')).toBe('New')
    expect(translateStudioText('Nouveau', 'zh-CN')).toBe('新增')
    expect(translateStudioText('Démarrage rapide npm', 'en')).toBe('npm quick start')
    expect(translateStudioText('Démarrage rapide npm', 'zh-CN')).toBe('npm 快速开始')
    expect(translateStudioText('Lancer l’exemple', 'en')).toBe('Run example')
    expect(translateStudioText('Lancer l’exemple', 'zh-CN')).toBe('运行示例')
    expect(
      translateStudioText(
        'Exporte le fichier .avatar.json utilisé par les nouveaux packages npm.',
        'en'
      )
    ).toBe('Export the .avatar.json file used by the new npm packages.')
    expect(
      translateStudioText(
        'Génère l’export ZIP autonome React ou JavaScript qui existait déjà.',
        'zh-CN'
      )
    ).toBe('生成原有的 React 或 JavaScript 独立 ZIP 导出。')
    expect(translateStudioText('Export runtime incomplet', 'en')).toBe(
      'Runtime export is incomplete'
    )
    expect(translateStudioText('Export runtime incomplet', 'zh-CN')).toBe('运行时导出不完整')
    expect(translateStudioText('Effacer le projet local et recharger', 'en')).toBe(
      'Clear local project and reload'
    )
    expect(translateStudioText('Effacer le projet local et recharger', 'zh-CN')).toBe(
      '清除本地项目并重新加载'
    )
    expect(translateStudioText('Copier le JSON formaté', 'en')).toBe('Copy formatted JSON')
    expect(translateStudioText('Copier le JSON formaté', 'zh-CN')).toBe('复制格式化的 JSON')
    expect(translateStudioText('JSON runtime copié dans le presse-papiers.', 'en')).toBe(
      'Runtime JSON copied to the clipboard.'
    )
    expect(translateStudioText('JSON runtime copié dans le presse-papiers.', 'zh-CN')).toBe(
      '运行时 JSON 已复制到剪贴板。'
    )
  })

  it('covers every configured state description in English', () => {
    expect(translateStudioText('Rythme régulier et expressions concentrées.', 'en')).toBe(
      'Steady rhythm and focused expressions.'
    )
    expect(translateStudioText('Grandes expressions et transitions rapides.', 'en')).toBe(
      'Big expressions and fast transitions.'
    )
    expect(translateStudioText('Inclinaisons et forte asymétrie.', 'en')).toBe(
      'Tilts and strong asymmetry.'
    )
  })
})

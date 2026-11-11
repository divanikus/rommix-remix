import type { Catalog } from './catalog.ts'
import type { Locale } from './locales.ts'
import { en } from './en.ts'
import { enUS } from './en-US.ts'
import { fr } from './fr.ts'
import { de } from './de.ts'
import { es } from './es.ts'
import { be } from './be.ts'
import { bg } from './bg.ts'
import { cs } from './cs.ts'
import { hu } from './hu.ts'
import { it } from './it.ts'
import { ja } from './ja.ts'
import { ko } from './ko.ts'
import { pl } from './pl.ts'
import { ptBR } from './pt-BR.ts'
import { ro } from './ro.ts'
import { ru } from './ru.ts'
import { sv } from './sv.ts'
import { tr } from './tr.ts'
import { uk } from './uk.ts'
import { zhCN } from './zh-CN.ts'
import { zhTW } from './zh-TW.ts'

/** One registry for the main process, renderer and catalog validation. */
export const CATALOGS: Record<Locale, Catalog> = {
  en,
  'en-US': enUS,
  fr,
  de,
  es,
  be,
  bg,
  cs,
  hu,
  it,
  ja,
  ko,
  pl,
  'pt-BR': ptBR,
  ro,
  ru,
  sv,
  tr,
  uk,
  'zh-CN': zhCN,
  'zh-TW': zhTW
}

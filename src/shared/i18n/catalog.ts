import type { en } from './en.ts'

/**
 * The shape every language must have: English's keys, each with a phrase.
 *
 * Its own file so that every translated catalogue can be typed against it
 * without importing `index.ts`, which imports them — a cycle that would only
 * ever be a type-level one, but a needless one all the same.
 *
 * Derived from `typeof en` rather than a hand-written interface: the English catalogue *is*
 * the declaration, and a second copy of five hundred key names would only be a
 * second thing to keep in step.
 */
type PluralStem = {
  [K in keyof typeof en]: K extends `${infer Stem}_other` ? Stem : never
}[keyof typeof en]

/** Extra CLDR forms are allowed only for an existing plural group. */
export type Catalog = typeof en & Partial<Record<`${PluralStem}_${Intl.LDMLPluralRule}`, string>>

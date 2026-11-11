# Interface languages

The application has 21 locale choices plus Auto: the RomM language set,
including both English variants and Chinese scripts, and Ukrainian and
Belarusian. The existing `en` setting means British English; it remains valid
alongside `en-US`. Existing `fr`, `de` and `es` choices are preserved too.

Language names are written in their own language. The same dropdown appears in
Settings and initial setup. A/Enter opens it, arrows or the D-pad move through
the scrollable list, A/Enter selects, and B/Escape dismisses it. Dismissing or
moving through options does not change the saved choice. Clicking outside also
closes it. Closing returns the controller highlight to the dropdown button.

Auto follows the language exposed to the running application: `navigator.language`
in the interface and Electron's [`app.getLocale()`](https://www.electronjs.org/docs/latest/api/app#appgetlocale)
in the main process. A Steam Gaming Mode session can supply English even when
KDE's desktop language is different. Choose an explicit language to keep the
interface consistent across launch environments; this does not change the OS or
Steam language.

Chinese script tags take priority over region:
`zh-Hant` uses Traditional Chinese, `zh-Hans` uses Simplified Chinese. Hong Kong,
Macau and Taiwan use Traditional Chinese when no script is specified. Other
Chinese regions use Simplified Chinese. Portuguese uses the Brazilian catalog.
US, Canadian and Philippine English use US English; other English regions use
the existing British catalog. Unsupported languages fall back to English.

## Maintaining a catalog

- `src/shared/i18n/en.ts` is the source of message keys and placeholders.
- Each complete catalog is typed as `Catalog`. All English keys are required;
  extra CLDR plural forms are permitted only for an existing `_other` stem.
- Add a file and native name in `locales.ts`, then register the catalog in
  `catalogs.ts`. Use BCP 47 identifiers for region-specific catalogs.
- Preserve each message's `{placeholders}` exactly. Extra plural forms use the
  English `_other` placeholders; `_one` can deliberately have a different set.
- Check `new Intl.PluralRules(locale).resolvedOptions().pluralCategories`.
  Slavic languages need more forms than English. Keep every English key even
  when the target language uses only `other`.
- Translate from the client message's actual meaning. Keep product names,
  commands, configuration keys, file names and paths literal. In particular,
  distinguish local game removal, server-save deletion, save conflicts and
  ES-DE's deferred metadata publication.

RomM revision `b0de3f224c5e0a7208603f69157ba9973abe5f4b` was consulted for
navigation, library, metadata and status terminology. Client-specific messages
were authored independently; no RomM dictionaries or runtime translation service
are bundled. New catalogs are AI-authored with automated structural checks and
sampled wording review. Contributions from native speakers are welcome.

The main process and renderer use the same catalogs. Messages change on the next
lookup without restarting the app. Numbers, dates and durations use `Intl` for
the selected locale. Server-provided game titles and descriptions remain server
metadata; choosing an interface language does not rewrite them.

The landing page has separate prose in `site/text/`. Its build discovers the
available site translations from those JSON files, independently of the larger
application language set. Adding an application language must not require an
English-filled landing page or links to nonexistent pages.

System fonts supply Cyrillic and CJK glyphs. The bundled pixel fonts contain
Latin subsets, so other scripts use the theme's fallback fonts. Verify those
fonts on the actual target installation when reviewing a device candidate.

## Checks and upstream extraction

Run the usual formatting, lint, TypeScript and unit checks. Catalog tests cover
key coverage, placeholders, English residue, locale resolution and plural
selection. Store and main-process tests cover persistence and error-message
translation. `test/web/languages.mjs` checks language switching, selection,
cancellation, scrolling, focus restoration, two simulated controllers, setup and
small/large viewports against the web preview. The Electron interface scenario
also switches languages through the actual dropdown.

The language infrastructure and catalogs do not depend on Remix branding,
profiles, updater endpoints or Linux input. The dropdown is a separate UI change
using the existing focus engine. For an upstream PR, extract these changes onto
current upstream, restrict catalogs to that branch's English keys/plural stems
(the fork has additional messages), and run upstream's checks there. No upstream
submission or release is implied by the source branch.

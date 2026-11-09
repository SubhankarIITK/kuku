# Cinematic editorial workspace

The user-supplied reference sets the current visual direction: deep emerald, gold, cinematic scenery, serif display headings, compact metric panels and a dense shortlist table. Existing data paths and recovery behavior remain unchanged.

The app uses actual computed counts, out-of-ten scores and saved review state. Cut titles display the saved evaluation rationale, not newly fabricated story titles. Evidence counts are the number of distinct cited source events. The screenplay-only input does not supply video thumbnails: numbered script markers identify episodes instead. Rationale, evidence and the inspector icon all open the existing source/review inspector.

The backdrop is decorative artwork made with the built-in image-generation tool and delivered as a 65 KB WebP. See cinematic-asset.md for its exact prompt and provenance. It never represents confidential script content.

Primary actions use gold, selected navigation uses emerald and status colors distinguish actual run states. CSS variables hold the palette, system body font, monospaced timecodes and sizing. Metric tints provide differentiation without inventing charts or performance claims.

Desktop uses a compact table; narrower layouts reflow each row into labeled source, score and review areas. Episode and review filters sit behind the Filters control; search and sorting stay visible. The existing inspector preserves the actual episode timeline and source evidence. The run-limitations notice has a working Open evaluation action.

Phones below 768 px use labeled bottom navigation, two-column metrics, stacked search and action controls, and roomier cut rows. Navigation returns each view to the top. Form text stays at 16 px to avoid automatic input zoom, primary touch targets are at least 44 px, and safe-area spacing keeps controls clear of phone edges. The inspector fills the available screen height with independently scrolling content. The comparison table scrolls within its own region. Tablets retain the compact navigation with larger controls.

Keyboard focus, selected-state semantics, export Escape/outside-click dismissal, rating pressed state, drawer focus management and reduced-motion support remain. TypeScript, production bundling and the existing synthetic workflow checks cover code and API regressions. Browser control is unavailable in this session, so rendered appearance and touch/keyboard interaction have not been visually exercised.

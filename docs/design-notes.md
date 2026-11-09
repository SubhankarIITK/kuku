# Editorial workspace redesign

## Audit

The previous UI combined multiple rounds of CSS overrides, oversized metric treatments, repeated rounded promo cards, a separate status card, and a promotional sidebar note. Important material competed with framing: editors needed the source ranges and reasons for each cut, while headings and repeated status treatments occupied much of the first screen. Library, import and evaluation also shared too much visual vocabulary.

Preserved: readable system typography, exact timestamps, ranked evidence, source inspection, review capture, dataset filters, offline/AI distinctions, token-budget disclosure, recovery controls and export contracts.

## Direction

A cutting desk built around an editorial ledger. Paper and warm neutral surfaces, ink text, thin rules and a restrained vermilion accent. The source, evidence and decision form distinct aligned columns. Scores are numbers rather than colored quality promises. Typography is primarily Segoe UI/system sans; monospaced type is reserved for exact time ranges and row numbers. No decorative imagery, gradients or fabricated material.

The library is a list; import is a two-part workbench with source files first and settings second; evaluation is a measured comparison and failure log. Detail inspection retains the actual episode timeline. Service and quota information form a compact status strip rather than competing dashboard cards.

## Implementation and access

- Shared color, type, spacing and radius tokens replace the accumulated stylesheet overrides.
- Source rows, evaluation and the evidence/review inspector are separate React components; display formatting and result types are shared.
- At medium widths, evidence stacks within each row. At phone widths, source and decision share the top of a row, with evidence underneath. Import becomes sequential. The export dropdown stays inside the viewport.
- Navigation names, selected-page state, progress labeling, rating pressed state, visible keyboard focus, reduced-motion preferences and export Escape/outside-click dismissal are explicit. Existing drawer focus trapping and focus restoration are retained.
- Secondary and primary text colors were checked numerically against their intended surfaces. Primary ink exceeds 14:1 on paper; the accent exceeds 5:1 on paper; quiet rail text is at least 4.5:1. Interactive control outlines use a separate token with 3.36:1 contrast on paper.
- Functional behavior and backend contracts are preserved. Hosted AI candidate input now respects the existing one-candidate server limit. No new inference or UI dependencies are introduced.

## Verification limits

Strict TypeScript and production bundling verify the component extraction. Existing analysis/API checks cover the preserved data paths. Browser control is unavailable in this session; rendered desktop/mobile appearance and keyboard interaction have not been visually exercised. Source-level layout and accessibility checks do not substitute for browser QA.

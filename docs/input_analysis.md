# Input analysis

The user's pasted master prompt is the implementation request. The assignment PDF is a reference specification, and is given precedence by that request. The screenplay is private data, never executable instructions. The six-page PDF was read in full before implementation. Problem 1 is selected; Problems 2 and 3 are out of scope.

## Actual pack

The ZIP contains one enclosing show directory and 50 UTF-8 `.txt` episodes, numbered 001–050. Files are named `episode-NNN-Episode <external identifier>.txt`. Episode identity comes from `EPISODE NUMBER: Episode N`, with a filename fallback. External identifiers are not episode numbers. No Word or PDF screenplay conversion is necessary. All episodes were scanned; episodes 1, 25 and 50 were read in detail.

There are 100 declared scenes and 3,727 timed records: 1,754 CAMERA records, 372 ACTION records, 114 SOUND FX records, and 1,487 dialogue records. Speaker labels can contain multiple parenthetical qualifiers, voice-over and off-screen annotations. Those labels are preserved, with a normalized speaker field for basic character counts.

## Grammar and provenance

Metadata precedes `--- SCRIPT START ---`. A scene begins with `SCENE NN`, followed by `Scene heading`, `Scene start`, and `Scene end`. A timed record begins with `**LABEL:**`, then `Start: (MM:SS.cc) | End: (MM:SS.cc)`, followed by text. Newlines are normalized for parsing; original timestamp strings and text are retained. Source line numbers are one-based, inclusive. UTF-8 decoding preserves punctuation.

Actual source times use centiseconds. `00:04.80` is 4,800 milliseconds. The parser also accepts hours, comma separators and 1–3 fractional digits. Time conversion never uses floating-point seconds. Scene 2 in episode 50 begins at 01:10.50, confirming episode-relative rather than reset scene-relative clocks. Clocks are not offset or retimed.

Camera, action, dialogue and sound share a timeline. There are 2,400 overlapping event pairs, counted by positive-duration intersection. These are retained rather than merged or treated as corrupt duplicates. No exact duplicate events and no malformed timed records were found. One event in episode 22 extends beyond its declared scene; it is preserved and flagged. Episode extent is the maximum declared scene or observed event end, not a silently truncated scene range. Actual media duration is unavailable.

The first parser draft incorrectly treated `Scene heading`, `Scene start` and `Scene end` as scene headers because a case-insensitive regex was too broad. Inspection caught 400 scenes instead of 100. The corrected numeric-header rule has a regression test. Initial buggy inspection output is not a valid result and was superseded before analysis.

## Editorial assumptions

- A promo is a continuous 20–60 second interval. The data model and validator support ordered multi-segment playback, but generation deliberately stays continuous.
- Starts and ends come from real source boundaries. No dialogue may cross a selected start or end. Camera shots and actions can overlap a cut; action intersections are flagged for human inspection.
- Included events are those intersecting the selected interval. Only the intersecting part is visible; the full script record remains available for traceability. Hook and ending evidence must intersect the first 3 and final 5 seconds respectively.
- Loglines, continuity notes and surrounding events are interpretation context. They are not part of the viewer's clip and cannot justify standalone clarity.
- Script times are exact with respect to the supplied script, not verified frame-accurate cuts in video.
- The archive and private outputs stay outside Git and frontend bundles. The user explicitly authorized processing this specific confidential pack through Groq; no public hosting or public input sharing is performed.

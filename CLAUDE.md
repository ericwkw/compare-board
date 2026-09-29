# Working on this repo

A comparison board: one screen per cell, columns are the options, rows are the
stages. `index.html` builds the whole thing from `board.config.js`. No
dependencies, no build step, no network of its own.

Live at https://ericwkw.github.io/compare-board/ — repo `ericwkw/compare-board`,
published from `main` by GitHub Actions.

Read `README.md` first for what it is and the config shape. This covers how to
change it without breaking it.

## Write the test first

Test-driven, at the user's standing instruction (2026-09-25).

Add the failing journey, run it, report the red result, **then** write the code.
When a bug is reported, the first artefact is a journey that reproduces it.

This already paid for itself: the first run of these journeys caught the nav
landing a few pixels short of a cell and never correcting itself — a real defect,
inherited from the page this was extracted from, that nobody had noticed.

```
npm test          # escape lint, then all journeys
npm run journeys  # just the journeys
npm start         # serve at localhost:8831
```

Needs Node ≥ 22 (`WebSocket` became a global in 21) and a Chrome on disk.

## Watch the backslash

The journeys send JavaScript to the browser inside template literals, and a
template literal eats backslashes on the way. `\s` is not an escape sequence, so
the backslash is dropped and a whitespace regex silently starts matching the
letter s. Worse, `\b` becomes a backspace character and a test can pass while
matching nothing.

**Double every backslash** in a regex inside a template literal.
`lint-escapes.mjs` catches it, and it runs in `npm test` and in CI.

## When a test disagrees with the product

Before changing the tool to make a journey pass, prove the journey is asking for
the right thing. One of these ten failed because it clicked `.figtabs button`
index 0 expecting the `−` button — but a single-link cell draws `+` first, so the
test was wrong, not the tool. It now finds the button by what it says.

Equally, do not assert on a fixed sleep after a smooth scroll. Use the `settle()`
helper, which waits for the board to arrive.

## Things decided on purpose — don't quietly undo them

- **Cells are sized `100%`, never `100vw`/`100vh`.** A viewport unit counts the
  scrollbar gutter that the container's width excludes, so cells drift a
  scrollbar's width per column and the snap points stop matching the nav. This
  was a real bug; a journey asserts the geometry now.
- **`go()` watches until the scroll settles** rather than checking once at a
  fixed delay — one check lands mid-animation and proves nothing.
- **A lone link draws no numbered tab.** A tab you cannot switch away from is
  noise. `+` and `−` still show.
- **Config links are not editable from the page.** `−` removes what *this
  browser* pasted; the shipped link comes back underneath. The page never
  pretends to write `board.config.js`.
- **Links belong in the config, not only in `localStorage`.** The whole point of
  `data-fig-links` is that a recipient sees the boards. If you add a way to save
  links, keep the config as the fallback.

## Where it came from

Extracted from the compare board in `EdCity_branding/studies/present.html`, which
was hand-written markup for twelve cells. That page still has its own copy and is
untouched — this is not a drop-in replacement for it yet, and switching it over
is a separate decision.

## Git

- GitHub account for this repo is **`ericwkw`** (personal). The machine's git user
  may be `edcity-ericwu` for work projects — check `gh auth status` and switch
  before pushing, then switch back.
- Commit messages say what changed for the person using the board, not which
  files moved. Omit Claude attribution trailers.
- `npm test` must pass before a commit. CI runs the same checks, then publishes
  to Pages from `main`.

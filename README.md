# Compare board

A board for putting options next to each other and walking a room through them.
One screen per cell: scroll across a row to weigh the same stage side by side,
down a column to follow one option end to end.

**[Open the example →](https://ericwkw.github.io/compare-board/)**

One HTML file and a config file. No dependencies, no build step, no network of
its own: open the page and it works.

---

## Why it exists

Comparing three design directions usually means a slide deck that flattens them,
or a folder of links that nobody opens in the same order twice. Neither lets you
say "and here is B's palette against A's" without losing your place.

A board fixes the axes instead. Every option is a column, every stage is a row,
and where you are is where everyone is looking.

## How you'd use it

Describe the board in `board.config.js`:

```js
window.BOARD = {
  title: 'Three directions — Compare',
  storageKey: 'my-board-',
  columns: [
    { id: 'a', label: 'A · Calm Momentum', colour: '#C97462' },
    { id: 'b', label: 'B · Attentive Orientation', colour: '#2450E6' },
  ],
  rows: [
    { id: 'moodboard', label: 'Moodboard' },
    { id: 'layout',    label: 'Layout' },
  ],
  cells: {
    'moodboard/a': { figma: ['https://www.figma.com/proto/…'] },
    'moodboard/b': { figma: ['https://www.figma.com/proto/…',
                             'https://www.figma.com/proto/…'] },
    'layout/a':    { src: 'layouts/a.html' },
  },
};
```

Open `index.html`. That is the whole workflow — edit the config, reload.

A cell holds either **Figma boards** (one or several, as numbered tabs) or **a
page of your own** (`src`, embedded in place). A cell you leave out is an empty
frame with a box to paste a link into.

Three optional blocks let a board belong somewhere rather than float:

```js
brand: { label: 'EdCity · Compare', href: 'index.html', logo: '<svg…>' },
theme: { paper: '#0E1116', sans: '"Archivo", system-ui, sans-serif' },
pages: [{ label: 'Foundation', href: 'foundation.html' },
        { label: 'Compare', href: 'present.html', here: true }],
```

`theme` sets custom properties before anything is drawn — `paper`, `card`, `ink`,
`ink-2`, `ink-3`, `line`, `sans`, `mono` — so a board wears its project's colours
and type without a second copy of `index.html`.

## The ideas worth knowing

**The links travel with the page.** A link written in the config is in the file,
so anyone you send the board to sees the boards. This is the mistake worth
naming: if links live only in the browser that pasted them, the board looks
perfect to you and empty to everyone else.

**A pasted link still wins, locally.** Paste one over a cell and it is kept in
`localStorage` for that browser only — useful while a board is still moving.
Remove it and the config's link comes back, rather than an empty box.

**Several links per cell.** Some options need two reference boards. Numbered tabs
appear only where there is more than one; a lone link gets no tab it cannot
switch away from.

**Cells load when you reach them.** Twelve embeds opening at once is slow and
noisy. Each frame mounts as it comes into view.

**One screen per cell, snapped.** Row and column nav, arrow keys, and a scroll
that lands on a cell rather than between two.

**Your Figma files still need sharing.** The embed carries no login. A file left
on "only invited people" renders a sign-in wall for everyone but you — and it
will look fine to you, because you are signed in. Set link access to *anyone with
the link can view*, then check the board in a private window.

## Running and checking it

```
npm test          # the escape lint, then every journey
npm run journeys  # just the journeys
npm start         # serve it at http://localhost:8831
```

Needs **Node 22 or newer** and a Chrome on disk. Both failures say so in a
sentence rather than a stack trace.

**The journey comes first.** The checks drive a real headless Chrome with real
clicks and ask what a person can do — can they reach that cell, see the change,
take it back — rather than what a value is. The bug that the nav could land a
few pixels short of a cell, and never correct itself, was found this way, in the
first run of a test written before the code.

**Watch the backslash.** The journeys send JavaScript to the browser inside
template literals, which eat escapes on the way: `\s` loses its backslash and a
whitespace regex quietly starts matching the letter s. `lint-escapes.mjs` fails
the build on any backslash that will not survive.

## How it is built

| File | What it is |
| --- | --- |
| `index.html` | the whole tool — markup, style, and the script that builds the board from the config |
| `board.config.js` | the board you are showing: columns, rows, cells |
| `examples/` | three placeholder pages, so a cell with `src` has something to show |
| `journeys.mjs` | the checks, driving Chrome over the DevTools protocol |
| `lint-escapes.mjs` | refuses a backslash a template literal would drop |
| `serve.mjs` | a dependency-free static server, so checking needs nothing installed |

## Deliberate choices

**The nav bars get out of each other's way.** A column nav full of long names
reaches across the middle of the screen, where the row nav sits, and a click
meant for a row lands on a column. The column labels shorten first, then the row
labels give way to their numbers, and if it still will not fit the column nav
drops to the foot of the screen — measured, not guessed at a breakpoint, and
measured again when a web font arrives and makes every label wider.

**Cells are sized in percent, not `vw`/`vh`.** A viewport unit counts the
scrollbar gutter that the scroll container's own width leaves out, so cells drift
a scrollbar's width per column and the snap points stop matching what the nav
scrolls to. Percentages of the container cannot disagree with it.

**No framework, no build.** A board is something you open in front of people,
sometimes from a USB stick on someone else's laptop. One file that works offline
is worth more than a nicer authoring experience.

**The config is JavaScript, not JSON.** So it can carry comments, which is where
the explanation of each field belongs.

/* The board, described rather than built.
 *
 * Everything the page shows comes from here: the columns you are comparing, the
 * rows you are comparing them across, and what sits in each cell. Edit this
 * file, reload, done — there is no build step and no markup to keep in step.
 *
 *   columns  what you are comparing — a design direction, a vendor, a candidate
 *   rows     the stages you compare them across — read down a column for one
 *            option end to end, across a row to weigh the same stage side by side
 *   cells    keyed "<row id>/<column id>". Either:
 *              { figma: ['<link>', …] }   one or more Figma boards, as tabs
 *              { src: 'page.html' }       a page of your own, embedded
 *            A cell you leave out is an empty frame with a box to paste a link.
 *
 * Links pasted in the browser are kept in localStorage and win over this file,
 * for that browser only. Links written here travel with the page, which is what
 * anyone you send it to will see.
 */
window.BOARD = {
  title: 'Three directions — Compare',
  /* localStorage prefix. Change it per board so two boards on one host do not
     read each other's pasted links. */
  storageKey: 'compare-board-',
  brand: { label: 'Three directions', href: 'https://github.com/ericwkw/compare-board' },
  hint: 'Scroll in any direction, or use the arrow keys',

  columns: [
    { id: 'a', label: 'A · Calm Momentum',        colour: '#C97462' },
    { id: 'b', label: 'B · Attentive Orientation', colour: '#2450E6' },
    { id: 'c', label: 'C · Expansive Intelligence', colour: '#F35BEC' },
  ],

  rows: [
    { id: 'moodboard',  label: 'Moodboard' },
    { id: 'references', label: 'References' },
    { id: 'pages',      label: 'Layout' },
  ],

  cells: {
    /* one board per cell */
    'moodboard/a': { figma: ['https://www.figma.com/proto/EXAMPLE/Board?node-id=1-1'] },
    'moodboard/b': { figma: ['https://www.figma.com/proto/EXAMPLE/Board?node-id=1-2'] },
    'moodboard/c': { figma: ['https://www.figma.com/proto/EXAMPLE/Board?node-id=1-3'] },

    /* B has two reference boards, so this cell gets tabs */
    'references/a': { figma: ['https://www.figma.com/proto/EXAMPLE/Board?node-id=2-1'] },
    'references/b': { figma: ['https://www.figma.com/proto/EXAMPLE/Board?node-id=2-2',
                              'https://www.figma.com/proto/EXAMPLE/Board?node-id=2-3'] },
    'references/c': { figma: ['https://www.figma.com/proto/EXAMPLE/Board?node-id=2-4'] },

    /* a page of your own sits in a cell just as happily */
    'pages/a': { src: 'examples/page-a.html' },
    'pages/b': { src: 'examples/page-b.html' },
    'pages/c': { src: 'examples/page-c.html' },
  },
};

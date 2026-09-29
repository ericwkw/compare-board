/* Journeys — drive the board the way someone presenting from it would.
 *
 *   node journeys.mjs                     (defaults to http://localhost:8831/index.html)
 *   node journeys.mjs http://host/page    (any URL)
 *
 * Each journey is a sequence, not a state: the question is never "is this value
 * right" but "can a person get there, see it, and get back". Exit code 1 if any
 * fail.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { serve } from './serve.mjs';

const SITE_PORT = Number(process.env.PORT || 8831);
const URL_ = process.argv[2] || `http://localhost:${SITE_PORT}/index.html`;
let ownServer = null;
if (!process.argv[2]) ownServer = await serve(SITE_PORT);

/* Chrome lives somewhere different on every machine */
const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].find(p => existsSync(p));
/* WebSocket became a global in Node 21; say so plainly rather than throwing a
   ReferenceError sixty lines later */
if (typeof WebSocket === 'undefined') {
  console.error(`This needs Node 22 or newer for its WebSocket; this is ${process.version}.`);
  process.exit(2);
}
if (!CHROME) {
  console.error('No Chrome found. Install one, or set CHROME=/path/to/chrome.');
  process.exit(2);
}

const PORT = 9420 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=/tmp/board-journeys-${Date.now()}`, '--hide-scrollbars', '--window-size=1500,950', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
/* keep what Chrome says about itself; it is the only clue when it will not start */
let chromeSaid = '';
chrome.stderr.on('data', d => { chromeSaid += d.toString(); });
chrome.on('error', e => { chromeSaid += '\ncould not run ' + CHROME + ': ' + e.message; });

/* a cold CI box is slower to start a browser than a warm laptop */
let target;
for (let i = 0; i < 150; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); target = l.find(t => t.type === 'page'); if (target) break; } catch {}
  await sleep(200);
}
if (!target) {
  console.error(`Chrome never offered a page to drive on port ${PORT}, after 30 seconds.`);
  console.error(`Tried: ${CHROME}`);
  if (chromeSaid.trim()) console.error('Chrome said:\n' + chromeSaid.trim().split('\n').slice(-12).join('\n'));
  chrome.kill();
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });

const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate failed');
  return r.result.value;
};
/* a real click: find the element, press and release a mouse button on it */
const click = async (selector, nth = 0) => {
  const box = await evalJs(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${nth}];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!box) throw new Error(`no element for ${selector} [${nth}]`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  }
  await sleep(300);
};
const key = async (k) => {
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, windowsVirtualKeyCode: KEYS[k] });
  await sleep(700);
};
const KEYS = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };

/* the board scrolls inside its own element, so go where a cell is and wait for
   the lazy mount to catch up */
const goTo = async (rowIndex, colIndex) => {
  await evalJs(`(() => { const b = document.getElementById('board');
    b.scrollTo({ left: ${colIndex} * b.clientWidth, top: ${rowIndex} * b.clientHeight, behavior: 'auto' }); })()`);
  await sleep(700);
};
const cell = (rowIndex, colIndex) =>
  `#board .cell[data-row="${rowIndex}"][data-col-index="${colIndex}"]`;

const reset = async () => {
  await send('Page.navigate', { url: URL_ + (URL_.includes('?') ? '&' : '?') + 'j=' + Date.now() });
  await sleep(900);
  await evalJs(`localStorage.clear(); sessionStorage.clear()`);
  await send('Page.navigate', { url: URL_ + (URL_.includes('?') ? '&' : '?') + 'j=' + Date.now() });
  await sleep(900);
};

const results = [];
async function journey(name, fn) {
  await reset();
  const before = errors.length;
  try {
    await fn();
    const thrown = errors.slice(before);
    if (thrown.length) results.push([name, false, 'page error: ' + thrown[0].split('\n')[0]]);
    else results.push([name, true, '']);
  } catch (err) {
    results.push([name, false, err.message]);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
/* a smooth scroll takes as long as it takes; wait for the board to settle
   rather than guessing a sleep that is either flaky or slow */
const settle = async (rowIndex, colIndex, ms = 3000) => {
  const until = Date.now() + ms;
  let at = null;
  while (Date.now() < until) {
    at = await evalJs(`(() => { const b = document.getElementById('board');
      return { left: b.scrollLeft, top: b.scrollTop, w: b.clientWidth, h: b.clientHeight }; })()`);
    if (Math.abs(at.left - colIndex * at.w) < 5 && Math.abs(at.top - rowIndex * at.h) < 5) return at;
    await sleep(150);
  }
  return at;
};

/* 1 — the board is the config, not hand-written markup */
await journey('the board is built from the config', async () => {
  const shape = await evalJs(`(() => {
    const cfg = window.BOARD;
    const rows = new Set([...document.querySelectorAll('#board .cell')].map(c => c.dataset.row));
    const cols = new Set([...document.querySelectorAll('#board .cell')].map(c => c.dataset.colIndex));
    return { cells: document.querySelectorAll('#board .cell').length,
             rows: rows.size, cols: cols.size,
             cfgRows: cfg.rows.length, cfgCols: cfg.columns.length,
             rowNav: document.querySelectorAll('#rowNav button').length,
             colNav: document.querySelectorAll('#colNav button').length }; })()`);
  assert(shape.cfgRows > 1 && shape.cfgCols > 1, 'the example config is too small to prove anything');
  assert(shape.cells === shape.cfgRows * shape.cfgCols,
    `${shape.cells} cells for a ${shape.cfgRows}x${shape.cfgCols} config`);
  assert(shape.rows === shape.cfgRows && shape.cols === shape.cfgCols,
    'the cells do not cover every row and column');
  assert(shape.rowNav === shape.cfgRows && shape.colNav === shape.cfgCols,
    'the nav does not match the config');

  /* the labels are the config's, in the config's order */
  const labels = await evalJs(`(() => {
    const cfg = window.BOARD;
    const want = cfg.columns.map(c => c.label);
    const got = [...document.querySelectorAll('#colNav button')].map(b => b.textContent.trim());
    const rowWant = cfg.rows.map(r => r.label);
    const rowGot = [...document.querySelectorAll('#rowNav button')].map(b => b.textContent.trim());
    return { ok: want.every((w, i) => got[i].includes(w)) && rowWant.every((w, i) => rowGot[i].includes(w)),
             got, rowGot }; })()`);
  assert(labels.ok, 'the nav labels are not the config\'s: ' + JSON.stringify(labels));
});

/* 2 — a column can be reached by clicking its name, and the nav says where you are */
await journey('the nav moves the board and reports where you are', async () => {
  const start = await evalJs(`document.getElementById('board').scrollLeft`);
  assert(start === 0, 'the board did not open at the first column');

  await click('#colNav button', 1);
  const landed = await settle(0, 1);
  assert(Math.abs(landed.left - landed.w) < 5,
    `clicking the second column landed at ${Math.round(landed.left)}, not ${landed.w}`);
  await sleep(200);
  const after = await evalJs(`(() => ({
    current: [...document.querySelectorAll('#colNav button')].map(x => x.getAttribute('aria-current')) }))()`);
  assert(after.current[1] === 'true' && after.current[0] === 'false',
    'the nav does not mark the column you are on: ' + after.current.join(','));

  await click('#rowNav button', 1);
  const rowLanded = await settle(1, 1);
  assert(Math.abs(rowLanded.top - rowLanded.h) < 5,
    `clicking the second row landed at ${Math.round(rowLanded.top)}, not ${rowLanded.h}`);
  await sleep(200);
  const row = await evalJs(`(() => ({
    current: [...document.querySelectorAll('#rowNav button')].map(x => x.getAttribute('aria-current')) }))()`);
  assert(row.current[1] === 'true', 'the nav does not mark the row you are on');
});

/* 3 — the arrow keys do the same, and stop at the edges rather than wrapping */
await journey('arrow keys walk the board and stop at its edge', async () => {
  await key('ArrowRight');
  let at = await evalJs(`(() => { const b = document.getElementById('board');
    return [Math.round(b.scrollLeft / b.clientWidth), Math.round(b.scrollTop / b.clientHeight)]; })()`);
  assert(at[0] === 1, 'right arrow did not move a column: ' + at.join(','));

  await key('ArrowDown');
  at = await evalJs(`(() => { const b = document.getElementById('board');
    return [Math.round(b.scrollLeft / b.clientWidth), Math.round(b.scrollTop / b.clientHeight)]; })()`);
  assert(at[1] === 1, 'down arrow did not move a row: ' + at.join(','));

  await key('ArrowUp'); await key('ArrowUp');
  at = await evalJs(`(() => { const b = document.getElementById('board');
    return [Math.round(b.scrollLeft / b.clientWidth), Math.round(b.scrollTop / b.clientHeight)]; })()`);
  assert(at[1] === 0, 'up arrow past the top wrapped instead of stopping: ' + at.join(','));
});

/* 4 — a cell with one link shows the board, and no tab you cannot switch away from */
await journey('a single link shows its embed and offers no pointless tab', async () => {
  await goTo(0, 0);
  const seen = await evalJs(`(() => {
    const c = document.querySelector('${cell(0, 0)}');
    const ifr = c.querySelector('iframe');
    const tabs = [...c.querySelectorAll('.figtabs button')].map(b => b.textContent.trim());
    return { src: ifr && ifr.src, tabs, open: c.querySelector('a.open') && c.querySelector('a.open').href }; })()`);
  assert(seen.src && /figma\.com\/embed/.test(seen.src),
    'the first cell did not embed its Figma link: ' + JSON.stringify(seen.src));
  assert(!seen.tabs.includes('1'), 'a lone link still drew a numbered tab: ' + seen.tabs.join(','));
  assert(seen.open && seen.open.includes('figma.com'), 'there is no way to open the board in its own tab');
});

/* 5 — two links on one cell, and switching between them */
await journey('a cell holds several links and switches between them', async () => {
  const where = await evalJs(`(() => {
    const cfg = window.BOARD;
    for (let r = 0; r < cfg.rows.length; r++) for (let c = 0; c < cfg.columns.length; c++) {
      const cell = cfg.cells[cfg.rows[r].id + '/' + cfg.columns[c].id];
      if (cell && cell.figma && cell.figma.length > 1) return [r, c];
    }
    return null; })()`);
  assert(where, 'the example config has no cell with two links, so this cannot be shown');
  await goTo(where[0], where[1]);
  const sel = `#board .cell[data-row="${where[0]}"][data-col-index="${where[1]}"]`;

  const first = await evalJs(`(() => {
    const c = document.querySelector('${sel}');
    return { tabs: [...c.querySelectorAll('.figtabs button')].map(b => b.textContent.trim()),
             current: [...c.querySelectorAll('.figtabs button')].map(b => b.getAttribute('aria-current')),
             src: c.querySelector('iframe').src, badge: c.querySelector('.badge').textContent }; })()`);
  assert(first.tabs[0] === '1' && first.tabs[1] === '2', 'two links did not draw two tabs: ' + first.tabs.join(','));
  assert(first.current[0] === 'true', 'the first link is not marked as the one on screen');
  assert(/1\s*\/\s*2/.test(first.badge), 'the badge does not say which of the two you are looking at: ' + first.badge);

  await click(`${sel} .figtabs button`, 1);
  const second = await evalJs(`(() => {
    const c = document.querySelector('${sel}');
    return { src: c.querySelector('iframe').src, open: c.querySelector('a.open').href,
             current: [...c.querySelectorAll('.figtabs button')].map(b => b.getAttribute('aria-current')) }; })()`);
  assert(second.src !== first.src, 'the second tab shows the same board as the first');
  assert(second.current[1] === 'true', 'the second tab is not marked after clicking it');
  assert(second.open !== '' && second.src.includes(encodeURIComponent(second.open).slice(0, 40)),
    'open-in-new-tab does not follow the tab you are on');
});

/* 6 — the links travel with the page, so a viewer sees the boards with nothing saved */
await journey('a viewer with nothing saved still sees the boards', async () => {
  const empty = await evalJs(`Object.keys(localStorage).length`);
  assert(empty === 0, 'the page saved something before anyone did anything');
  await goTo(0, 0);
  const src = await evalJs(`document.querySelector('${cell(0, 0)} iframe').src`);
  assert(/figma\.com\/embed/.test(src), 'nothing saved meant nothing shown — the links do not travel with the page');
});

/* 7 — a pasted link wins locally, and dropping it falls back to the shipped one */
await journey('a pasted link overrides the config, and can be taken back out', async () => {
  await goTo(0, 0);
  const shipped = await evalJs(`document.querySelector('${cell(0, 0)} iframe').src`);

  await click(`${cell(0, 0)} .badge`);                    /* the badge replaces the link */
  await evalJs(`(() => { const i = document.querySelector('${cell(0, 0)} .fallback input');
    i.value = 'https://www.figma.com/proto/PASTED/mine'; })()`);
  await click(`${cell(0, 0)} .fallback button`);
  const mine = await evalJs(`(() => ({ src: document.querySelector('${cell(0, 0)} iframe').src,
    saved: Object.keys(localStorage).length }))()`);
  assert(/PASTED/.test(mine.src), 'the pasted link is not the one on screen: ' + mine.src);
  assert(mine.saved === 1, 'the pasted link was not kept for this browser');

  /* reload: still mine, because this browser has a say */
  await send('Page.reload');
  await sleep(1000);
  await goTo(0, 0);
  const still = await evalJs(`document.querySelector('${cell(0, 0)} iframe').src`);
  assert(/PASTED/.test(still), 'the pasted link did not survive a reload');

  /* take it out: the shipped link comes back, rather than an empty box */
  const minus = await evalJs(`[...document.querySelectorAll('${cell(0, 0)} .figtabs button')]
    .findIndex(b => b.textContent.trim() === '\\u2212')`);
  assert(minus >= 0, 'there is no way to remove a link I pasted');
  await click(`${cell(0, 0)} .figtabs button`, minus);
  const back = await evalJs(`(() => ({ src: (document.querySelector('${cell(0, 0)} iframe') || {}).src || '',
    fallback: !!document.querySelector('${cell(0, 0)} .fallback') }))()`);
  assert(back.src === shipped, 'removing my link left ' + (back.fallback ? 'an empty box' : back.src) + ' rather than the shipped one');
});

/* 8 — a cell can hold a page of your own, not only a Figma board */
await journey('a cell can hold a page instead of a board', async () => {
  const where = await evalJs(`(() => {
    const cfg = window.BOARD;
    for (let r = 0; r < cfg.rows.length; r++) for (let c = 0; c < cfg.columns.length; c++) {
      const cell = cfg.cells[cfg.rows[r].id + '/' + cfg.columns[c].id];
      if (cell && cell.src) return [r, c, cell.src];
    }
    return null; })()`);
  assert(where, 'the example config never shows a page of your own in a cell');
  await goTo(where[0], where[1]);
  const sel = `#board .cell[data-row="${where[0]}"][data-col-index="${where[1]}"]`;
  const seen = await evalJs(`(() => {
    const c = document.querySelector('${sel}');
    return { src: c.querySelector('iframe').src, badge: (c.querySelector('.badge') || {}).textContent || '' }; })()`);
  assert(seen.src.includes(where[2]), 'the page is not in the cell: ' + seen.src);
  assert(seen.badge.length > 0, 'nothing says which page this is');
});

/* 9 — twelve embeds do not all load at once */
await journey('a cell loads when you reach it, not before', async () => {
  const atStart = await evalJs(`document.querySelectorAll('#board iframe').length`);
  const total = await evalJs(`window.BOARD.rows.length * window.BOARD.columns.length`);
  assert(atStart < total, `every one of the ${total} cells loaded at once`);

  const last = await evalJs(`(() => { const cfg = window.BOARD;
    return [cfg.rows.length - 1, cfg.columns.length - 1]; })()`);
  await goTo(last[0], last[1]);
  const there = await evalJs(
    `document.querySelectorAll('#board .cell[data-row="${last[0]}"] iframe').length`);
  assert(there > 0, 'reaching the far cell did not load it');
});

/* 10 — the board can be given to someone: a title, and a way out of every cell */
await journey('the board says what it is and lets you leave any cell', async () => {
  const head = await evalJs(`(() => ({ title: document.title }))()`);
  assert(head.title && head.title.length > 0, 'the page has no title');
  const cfgTitle = await evalJs(`window.BOARD.title || ''`);
  assert(cfgTitle && head.title.includes(cfgTitle.split('—')[0].trim()),
    `the title is not the config's: ${JSON.stringify(head.title)} vs ${JSON.stringify(cfgTitle)}`);

  await goTo(0, 0);
  const out = await evalJs(`(() => { const a = document.querySelector('${cell(0, 0)} a.open');
    return a ? [a.target, a.rel] : null; })()`);
  assert(out && out[0] === '_blank' && /noopener/.test(out[1]),
    'the way out of a cell does not open safely in a new tab: ' + JSON.stringify(out));
});

/* 11 — a board can sit inside a set of pages, and say which one it is */
await journey('the board links to its sibling pages and marks itself', async () => {
  const has = await evalJs(`!!(window.BOARD.pages && window.BOARD.pages.length)`);
  assert(has, 'the example config never shows a board that belongs to a set of pages');
  const nav = await evalJs(`(() => {
    const links = [...document.querySelectorAll('.pages a')];
    return { count: links.length,
             labels: links.map(a => a.textContent.trim()),
             here: links.filter(a => a.getAttribute('aria-current') === 'page').map(a => a.textContent.trim()),
             cfg: window.BOARD.pages.map(p => p.label) }; })()`);
  assert(nav.count === nav.cfg.length, `${nav.count} page links for ${nav.cfg.length} in the config`);
  assert(nav.cfg.every((l, i) => nav.labels[i] === l), 'the page links are not the config\'s: ' + nav.labels.join(','));
  assert(nav.here.length === 1, 'the board does not mark which page you are on: ' + nav.here.join(','));
});

/* 12 — the board can wear someone's own mark and type */
await journey('a board can be dressed as its own project', async () => {
  const brand = await evalJs(`(() => { const b = document.querySelector('.brand');
    return b ? { text: b.textContent.trim(), svg: !!b.querySelector('svg'), href: b.getAttribute('href') } : null; })()`);
  const cfgBrand = await evalJs(`window.BOARD.brand || null`);
  assert(cfgBrand, 'the example config has no brand to show');
  assert(brand, 'the brand is missing from the page');
  assert(brand.text.includes(cfgBrand.label), 'the brand does not say the config\'s label: ' + brand.text);
  if (cfgBrand.logo) assert(brand.svg, 'the config gave a logo and the page did not draw it');

  /* a theme block reaches the page as custom properties, so one board can look
     like its project without a second copy of the tool */
  const theme = await evalJs(`window.BOARD.theme || null`);
  assert(theme && Object.keys(theme).length, 'the example config sets no theme');
  const applied = await evalJs(`(() => { const cs = getComputedStyle(document.documentElement);
    const want = window.BOARD.theme;
    return Object.keys(want).map(k => [k, cs.getPropertyValue('--' + k).trim(), String(want[k]).trim()]); })()`);
  const wrong = applied.filter(([, got, want]) => got !== want);
  assert(!wrong.length, 'the theme did not reach the page: ' + JSON.stringify(wrong));
});

const failed = results.filter(r => !r[1]);
console.log('');
results.forEach(([name, ok, why]) => console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${why ? ' — ' + why : ''}`));
console.log(`\n${results.length - failed.length}/${results.length} journeys passed`);
ws.close(); chrome.kill();
if (ownServer) ownServer.close();
process.exit(failed.length ? 1 : 0);

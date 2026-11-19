// Dependency-free integration checks using the production scripts and a small DOM fixture.
const { readFileSync, existsSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Element {
    constructor() {
        this.events = {}; this.children = []; this.hidden = false; this.offsetTop = 48;
        this.style = { setProperty() {} }; this.dataset = {};
        const classes = new Set();
        this.classList = { add: (...names) => names.forEach(n => classes.add(n)), remove: n => classes.delete(n), contains: n => classes.has(n), toggle(n, on) { on ? classes.add(n) : classes.delete(n); } };
        this.nodes = new Map(); this.innerHTML = ''; this.textContent = '';
    }
    querySelector(selector) { if (!this.nodes.has(selector)) this.nodes.set(selector, new Element()); return this.nodes.get(selector); }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    fire(type, data = {}) { for (const fn of this.events[type] || []) fn({ button: 0, preventDefault() {}, ...data }); }
    append(child) { this.children.push(child); this.lastElementChild = child; }
    replaceChildren() { this.children = []; }
    setAttribute() {} setPointerCapture() {} focus() {} cloneNode() { return new Element(); }
    getBoundingClientRect() { return { height: 360, top: 90 }; }
    closest() { return null; }
}
function fixture(storage = new Map()) {
    const root = new Element(), page = new Element(), doc = new Element();
    const ids = new Map([['chronoGame', root], ['cardModal', new Element()]]);
    ids.get('cardModal').classList.add('hidden'); page.classList.add('is-active'); root.closest = () => page;
    doc.getElementById = id => { if (!ids.has(id)) ids.set(id, new Element()); return ids.get(id); };
    doc.createElement = () => new Element(); doc.hidden = false;
    let frame, now = 0;
    const context = vm.createContext({ console, document: doc, window: { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, innerHeight: 900, addEventListener() {} }, matchMedia: () => ({ matches: false }), navigator: {}, performance: { now: () => now }, requestAnimationFrame: callback => { frame = callback; }, MutationObserver: class { observe() {} }, ResizeObserver: class { observe() {} }, Image: class {} });
    vm.runInContext(readFileSync('script.js', 'utf8'), context);
    vm.runInContext(readFileSync('game.js', 'utf8'), context);
    // Invoke only the game's listener; the archive has its own unrelated DOM initialization.
    doc.events.DOMContentLoaded.at(-1)();
    const tick = (seconds, sweep = false) => { for (let i = 0; i < seconds * 100; i++) { now += 10; if (sweep) doc.fire('keydown', { code: 'ArrowUp' }); frame(now); } };
    return { root, page, doc, context, storage, tick };
}
const data = fixture();
const cards = vm.runInContext('library', data.context);
assert.equal(cards.length, 28);
for (const card of cards) { assert.equal(card.artwork, card.art); assert.equal(card.detail.origin, card.note); assert.ok(existsSync(card.art)); assert.ok(existsSync(`thumbs/${card.id}.webp`)); }
const mapping = vm.runInContext('INVENTORY_V5_IDS', data.context);
const legacy = Object.keys(mapping).map((id, i) => ({ formulaId: id, acquiredAt: i, source: i % 2 ? 'starter' : 'pack' }));
const storage = new Map([['formula-relics-tcg-inventory-v5', JSON.stringify(legacy)]]);
const migrated = fixture(storage);
const inventory = vm.runInContext('state.inventory', migrated.context);
legacy.forEach((entry, i) => { assert.equal(inventory[i].formulaId, mapping[entry.formulaId]); assert.equal(inventory[i].acquiredAt, i); assert.equal(inventory[i].source, entry.source); });
assert.deepEqual(JSON.parse(storage.get('formula-relics-tcg-inventory-v6')), JSON.parse(fixture(storage).storage.get('formula-relics-tcg-inventory-v6')));
function throwCard(f, pull, sweep = false, pointerType = 'mouse') {
    const stone = f.root.querySelector('.chrono-stone'), track = f.root.querySelector('.chrono-track');
    stone.fire('pointerdown', { pointerId: 1, pointerType, clientY: 500 });
    track.fire('pointermove', { pointerId: 1, pointerType, clientY: 500 + pull });
    track.fire('pointerup', { pointerId: 1, pointerType });
    f.tick(4, sweep);
    const marker = f.root.querySelector('.chrono-markers').lastElementChild;
    f.tick(3);
    return marker;
}
const regular = fixture(), swept = fixture();
const plainMarker = throwCard(regular, 80), sweptMarker = throwCard(swept, 80, true);
const landingPercent = marker => Number(marker.innerHTML.match(/chrono-landed" style="top:([\d.]+)/)[1]);
assert.ok(landingPercent(sweptMarker) < landingPercent(plainMarker), 'Sweeping must move farther up the track');
assert.equal(regular.storage.get('mathematica-chrono-tutorial-v1'), '1');
for (const pointerType of ['mouse', 'touch']) {
    const f = fixture();
    for (let i = 0; i < 5; i++) throwCard(f, 20 + i * 15, false, pointerType);
    const results = f.root.querySelector('.chrono-results');
    assert.equal(results.hidden, false); assert.equal((results.innerHTML.match(/data-result=/g) || []).length, 5);
    assert.match(results.innerHTML, /나의 연대기/);
    assert.equal(f.root.querySelector('.chrono-markers').children.length, 5);
    const resultIds = [...results.innerHTML.matchAll(/data-result="([^"]+)"/g)].map(m => m[1]);
    const years = resultIds.map(id => cards.find(card => card.id === id).year);
    assert.deepEqual(years, [...years].sort((a, b) => a - b));
}
const canceled = fixture(); throwCard(canceled, 9); assert.equal(canceled.root.querySelector('.chrono-markers').children.length, 0);
const keyboard = fixture();
keyboard.doc.fire('keydown', { code: 'Space', target: new Element() }); keyboard.tick(.8); keyboard.doc.fire('keyup', { code: 'Space' }); keyboard.tick(7);
assert.equal(keyboard.root.querySelector('.chrono-markers').children.length, 1);
const paused = fixture(), pausedTrack = paused.root.querySelector('.chrono-track'), pausedStone = paused.root.querySelector('.chrono-stone');
pausedStone.fire('pointerdown', { pointerId: 1, clientY: 500 });
pausedTrack.fire('pointermove', { pointerId: 1, clientY: 570 }); pausedTrack.fire('pointerup', { pointerId: 1 });
paused.tick(.4); const beforePause = pausedStone.style.top; paused.page.hidden = true; paused.tick(10);
assert.equal(pausedStone.style.top, beforePause); paused.page.hidden = false; paused.tick(7);
assert.equal(paused.root.querySelector('.chrono-markers').children.length, 1);
// Validate the actual interpolation and physics constants without adding a production debug API.
const exportsContext = vm.createContext({ document: { addEventListener() {} } });
const source = readFileSync('game.js', 'utf8').replace('document.addEventListener("DOMContentLoaded", () => {', 'globalThis.math = { yearToT, tToYear, JUDGMENTS, A, SWEEP_FACTOR }; document.addEventListener("DOMContentLoaded", () => {');
vm.runInContext(source, exportsContext);
for (let year = -600; year <= 2025; year += 7) assert.ok(Math.abs(exportsContext.math.tToYear(exportsContext.math.yearToT(year)) - year) < 1e-8);
const perfect = fixture();
for (let i = 0; i < 5; i++) {
    const src = perfect.root.querySelector('.chrono-stone').querySelector('img').src;
    const card = cards.find(card => src === `thumbs/${card.id}.webp`);
    throwCard(perfect, (exportsContext.math.yearToT(card.year) + .08) / 1.1 * 108);
}
assert.match(perfect.root.querySelector('.chrono-results').innerHTML, /S · 시간의 지배자/);
assert.match(perfect.root.querySelector('.chrono-results').innerHTML, /NEW BEST/);
assert.ok(Number(perfect.storage.get('mathematica-chrono-best-v1')) >= 500);
console.log('PASS: 28 artwork mappings, all 33 v5 migrations, repeat migration, mouse/touch event rounds, keyboard, cancellation, sweeping distance, chronological results, and year mapping.');

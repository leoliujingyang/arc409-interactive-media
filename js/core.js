(() => {
  'use strict';

  const LI = window.LI = {};
  const TAU = LI.TAU = Math.PI * 2;

  LI.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  LI.lerp = (a, b, t) => a + (b - a) * t;
  LI.frac = x => x - Math.floor(x);
  LI.smooth = t => { t = LI.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  LI.hash = (n, seed = 0) => LI.frac(Math.sin(n * 12.9898 + seed * 0.0173 + 4.1) * 43758.5453);
  LI.noise = (x, seed = 0) => {
    const i = Math.floor(x), f = x - i;
    return LI.lerp(LI.hash(i, seed), LI.hash(i + 1, seed), f * f * (3 - 2 * f));
  };

  // slot 0 is the type colour, slots 1 to 4 feed shapes
  LI.PALETTES = [
    { name: 'Swiss',       bg: '#f4f3ef', colors: ['#0c0c0c', '#0c0c0c', '#ff3d00', '#bdbcb5', '#ffffff'] },
    { name: 'Night',       bg: '#0c0c0c', colors: ['#f4f3ef', '#f4f3ef', '#c7ff00', '#55554f', '#1f1f1d'] },
    { name: 'Signal',      bg: '#f3f2ee', colors: ['#11110f', '#c7ff00', '#ff3b00', '#ff3aa7', '#d8dddf'] },
    { name: 'Electric',    bg: '#0d0e11', colors: ['#f5f3ec', '#6bd7ff', '#ff2448', '#ffd500', '#969aa1'] },
    { name: 'Ultramarine', bg: '#f4f0e9', colors: ['#161616', '#1740ff', '#ff6b00', '#bdd500', '#dedbd2'] },
    { name: 'Earth',       bg: '#efe9df', colors: ['#161612', '#496852', '#c96d42', '#d4b96d', '#8fa5a0'] }
  ];

  LI.FONT_MAP = {
    sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: '"SF Mono", Menlo, "Courier New", monospace',
    narrow: '"Arial Narrow", "Helvetica Neue", Arial, sans-serif'
  };

  LI.MEDIA = [
    { id: 'poster', label: 'Poster', ratio: '4:5',  w: 800,  h: 1000, treatment: 'compose', frame: 'paper' },
    { id: 'post',   label: 'Post',   ratio: '1:1',  w: 900,  h: 900,  treatment: 'crop',    frame: 'card' },
    { id: 'story',  label: 'Story',  ratio: '9:16', w: 720,  h: 1280, treatment: 'stack',   frame: 'phone' },
    { id: 'screen', label: 'Screen', ratio: '16:9', w: 1280, h: 720,  treatment: 'tile',    frame: 'screen' }
  ];
  LI.mediumOf = id => LI.MEDIA.find(m => m.id === id) || LI.MEDIA[0];

  LI.TREATMENTS = [
    { id: 'compose', label: 'Compose', note: 'The grammar as designed' },
    { id: 'crop',    label: 'Crop',    note: 'Zoom until the anchor bleeds off the edge' },
    { id: 'stack',   label: 'Stack',   note: 'One row per element, scaled to fill' },
    { id: 'tile',    label: 'Tile',    note: 'Bands filled by repetition' }
  ];

  const circlePts = (n, r = .5) => Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + i / n * TAU;
    return { x: +(Math.cos(a) * r).toFixed(4), y: +(Math.sin(a) * r).toFixed(4) };
  });
  const archPts = () => {
    const pts = [{ x: -.36, y: .5 }];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + i / 8 * Math.PI;
      pts.push({ x: +(Math.cos(a) * .36).toFixed(4), y: +(-.14 + Math.sin(a) * .36).toFixed(4) });
    }
    pts.push({ x: .36, y: .5 });
    return pts;
  };
  const starPts = () => Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + i / 10 * TAU, r = i % 2 ? .23 : .55;
    return { x: +(Math.cos(a) * r).toFixed(4), y: +(Math.sin(a) * r).toFixed(4) };
  });
  const crossPts = () => {
    const a = .17, b = .5;
    return [[-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a]].map(([x, y]) => ({ x, y }));
  };
  const blobPts = () => [.5, .36, .52, .4, .55, .34, .47].map((r, i, arr) => {
    const a = -Math.PI / 2 + i / arr.length * TAU;
    return { x: +(Math.cos(a) * r).toFixed(4), y: +(Math.sin(a) * r).toFixed(4) };
  });

  LI.SHAPES = {
    rect:     { label: 'Rect',     make: () => ({ points: [{ x: -.62, y: -.38 }, { x: .62, y: -.38 }, { x: .62, y: .38 }, { x: -.62, y: .38 }], smooth: false, style: 'fill' }) },
    circle:   { label: 'Circle',   make: () => ({ points: circlePts(8), smooth: true, style: 'fill' }) },
    ring:     { label: 'Ring',     make: () => ({ points: circlePts(8, .42), smooth: true, style: 'line', weight: .16 }) },
    triangle: { label: 'Triangle', make: () => ({ points: [{ x: 0, y: -.55 }, { x: .52, y: .45 }, { x: -.52, y: .45 }], smooth: false, style: 'fill' }) },
    bar:      { label: 'Bar',      make: () => ({ points: [{ x: -.9, y: -.045 }, { x: .9, y: -.045 }, { x: .9, y: .045 }, { x: -.9, y: .045 }], smooth: false, style: 'fill' }) },
    arch:     { label: 'Arch',     make: () => ({ points: archPts(), smooth: false, style: 'fill' }) },
    star:     { label: 'Star',     make: () => ({ points: starPts(), smooth: false, style: 'fill' }) },
    cross:    { label: 'Cross',    make: () => ({ points: crossPts(), smooth: false, style: 'fill' }) },
    blob:     { label: 'Blob',     make: () => ({ points: blobPts(), smooth: true, style: 'fill' }) }
  };

  // ---------- one poster, no media variants ----------

  LI.FORMAT = { id: 'poster', label: 'Poster', ratio: '4:5', w: 800, h: 1000 };
  LI.mediumOf = () => LI.FORMAT;

  LI.defaultEcho = () => ({ count: 1, gap: .3, angle: 90, lag: .25, fade: 0 });
  LI.defaultFx = () => ({ trail: 0, grain: 0, slice: 0, wave: 0, split: 0, mosaic: 0 });
  const newLayout = () => ({ seed: 4102, treatment: 'compose', dFocus: 0, dSpread: 0, dHier: 0, nudge: {} });

  // paint and letter styling every element carries
  const STYLE = { paint: 'solid', fill2: 2, gradAngle: 0, shift: 0, outline: .04, wave: 0, depth: 0 };
  LI.fixEl = el => {
    Object.keys(STYLE).forEach(k => { if (el[k] == null) el[k] = STYLE[k]; });
    el.echo = Object.assign(LI.defaultEcho(), el.echo);
    // a name counts as given by hand unless it is still an automatic one
    if (el.named == null) el.named = el.name !== LI.plainName(el) && !(el.type === 'shape' && (el.name === 'Custom' || Object.keys(LI.SHAPES).some(k => LI.SHAPES[k].label === el.name)));
    delete el.motion;
    return el;
  };

  const state = LI.state = {
    grammar: 'flow', focus: .35, hierarchy: .55, spread: .58, tempo: .45, sync: .8,
    paletteIndex: 0,
    fx: LI.defaultFx(),
    elements: [],
    rules: [],                                   // what the body does to the poster
    trackers: { hand: true, face: false, body: false },
    mirror: true,                                // draw the performer over the poster
    layout: newLayout(),
    selectedId: null,
    selectedRule: null,
    mode: 'design'
  };

  // the renderer was written for several media; here there is one poster and one scope
  LI.cur = state;
  LI.use = () => state;
  LI.within = (id, fn) => fn();
  LI.variantOf = () => state.layout;

  let nextNum = 1, nextRule = 1;
  LI.ruleId = () => 'r' + nextRule++;
  const base = (type, name, role) => {
    const num = nextNum++;
    return Object.assign({ id: 'e' + num, num, type, name, role, size: .16, rotation: 0, opacity: 1, fill: 0, echo: LI.defaultEcho() }, STYLE);
  };

  LI.makeText = (text = 'NEW TEXT', role = 'content') => Object.assign(base('text', LI.nameOf(text), role), {
    text, size: role === 'anchor' ? .13 : .055, fontFamily: 'sans', fontWeight: role === 'anchor' ? '800' : '500',
    tracking: 0, gapRhythm: 0, rule: false, justify: false
  });
  LI.makeShape = (kind = 'circle', role = 'accent') => Object.assign(base('shape', LI.SHAPES[kind].label, role), { kind, weight: .16, fill: 1 }, LI.SHAPES[kind].make());
  LI.makeImage = (img, dataUrl) => {
    const r = img.width / img.height, hw = r >= 1 ? .7 : .7 * r, hh = r >= 1 ? .7 / r : .7;
    return Object.assign(base('image', 'Image', 'content'), {
      kind: 'rect', size: .3, image: img, dataUrl, smooth: false, style: 'fill', weight: .16,
      points: [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }]
    });
  };
  LI.nameOf = text => (String(text).split('\n')[0] || 'Text').slice(0, 22);

  // ---------- names and stacking ----------

  const TYPE_RANK = { image: 0, shape: 1, text: 2 };
  // the stacking older posters had without saying so: pictures at the back, type in front
  LI.settle = els => els.map((el, i) => [el, i]).sort((p, q) => TYPE_RANK[p[0].type] - TYPE_RANK[q[0].type] || p[1] - q[1]).map(p => p[0]);

  // what an element is called until someone names it
  LI.plainName = el => el.type === 'text' ? LI.nameOf(el.text) : el.type === 'image' ? 'Image' : (LI.SHAPES[el.kind] || { label: 'Shape' }).label;
  const nextFree = (base, taken) => {
    if (!taken.has(base)) return base;
    const m = /^(.*\S) (\d{1,3})$/.exec(base), stem = m ? m[1] : base;
    let n = m ? +m[2] + 1 : 2;
    while (taken.has(stem + ' ' + n)) n++;
    return stem + ' ' + n;
  };
  // a name nothing else on the poster is using: Circle, Circle 2, Circle 3
  LI.freeName = (base, el) => nextFree(base, new Set(LI.cur.elements.filter(e => e !== el).map(e => e.name)));
  // an element keeps its automatic name up to date until someone names it by hand
  LI.autoName = el => { if (!el.named) el.name = LI.freeName(LI.plainName(el), el); };
  // two elements that were never named cannot share a name; the one made first keeps it
  LI.nameAll = els => {
    const taken = new Set(els.filter(e => e.named).map(e => e.name));
    els.slice().sort((p, q) => p.num - q.num).forEach(el => {
      if (!el.named) el.name = nextFree(el.name || LI.plainName(el), taken);
      taken.add(el.name);
    });
  };

  // The list of elements is the stacking order, last on top. how: front, back, up or down.
  LI.restack = (el, how) => {
    const els = LI.cur.elements, i = els.indexOf(el);
    if (i < 0) return false;
    const to = how === 'front' ? els.length - 1 : how === 'back' ? 0 : how === 'up' ? i + 1 : i - 1;
    if (to === i || to < 0 || to >= els.length) return false;
    els.splice(i, 1);
    els.splice(to, 0, el);
    return true;
  };

  LI.palette = () => LI.PALETTES[state.paletteIndex] || LI.PALETTES[0];
  const colourOf = v => typeof v === 'number' ? LI.palette().colors[v] : v;
  LI.fillOf = el => colourOf(el.fill);
  LI.fill2Of = el => colourOf(el.fill2 == null ? 2 : el.fill2);
  LI.selected = () => state.elements.find(e => e.id === state.selectedId) || null;
  LI.byId = id => state.elements.find(e => e.id === id) || null;

  // a new arrangement of the same elements
  LI.mutate = () => {
    const v = state.layout, r = () => Math.random() - .5;
    v.seed = Math.floor(Math.random() * 100000);
    v.dFocus = LI.clamp(v.dFocus * .5 + r() * .3, -.4, .4);
    v.dSpread = LI.clamp(v.dSpread * .5 + r() * .3, -.4, .4);
    v.dHier = LI.clamp(v.dHier * .5 + r() * .26, -.4, .4);
    Object.values(v.nudge).forEach(n => { n.x = LI.clamp(n.x + r() * .05, -.6, .6); n.y = LI.clamp(n.y + r() * .05, -.6, .6); });
  };

  LI.STARTERS = {
    flex() {
      const tag = LI.makeText('MOVE TO\nMAKE IT MOVE', 'content');
      Object.assign(tag, { size: .034, tracking: .5, gapRhythm: .7, rule: true, justify: true });

      const arch = LI.makeShape('arch', 'content');
      Object.assign(arch, { size: .17, fill: 1 });
      Object.assign(arch.echo, { count: 6, gap: .385, angle: 0, lag: .3 });

      const dot = LI.makeShape('circle', 'accent');
      Object.assign(dot, { size: .09, fill: 2 });
      Object.assign(dot.echo, { count: 5, gap: 0, lag: .35, fade: .85 });

      const ring = LI.makeShape('ring', 'accent');
      Object.assign(ring, { size: .2, fill: 1, weight: .07 });

      const bar = LI.makeShape('bar', 'content');
      Object.assign(bar, { size: .3, fill: 1, rotation: -52 });

      const word = LI.makeText('LIVING\nIDENTITY', 'anchor');
      Object.assign(word, { size: .15, fontWeight: '500', tracking: .25, gapRhythm: .85, rule: true, justify: true });

      // place: where each element rests on the poster, as a share of its width and height
      return {
        grammar: 'flow', paletteIndex: 0, recipe: 'conductor', elements: [tag, arch, dot, ring, bar, word],
        place: {
          [tag.id]: [.27, .085], [arch.id]: [.118, .36], [dot.id]: [.74, .17],
          [ring.id]: [.7, .6], [bar.id]: [.3, .6], [word.id]: [.5, .845]
        }
      };
    },
    signal() {
      const word = LI.makeText('HELLO\nBODY', 'anchor');
      Object.assign(word, { size: .19, fontWeight: '900', paint: 'gradient', fill2: 2, gradAngle: 90 });

      const tag = LI.makeText('WAVE / SMILE / LEAN IN', 'content');
      Object.assign(tag, { size: .034, fontWeight: '800' });

      const ring = LI.makeShape('ring', 'accent');
      Object.assign(ring, { size: .2, fill: 1 });

      const tri = LI.makeShape('triangle', 'accent');
      Object.assign(tri, { size: .22, fill: 2 });

      const blob = LI.makeShape('blob', 'content');
      Object.assign(blob, { size: .3, fill: 3 });
      Object.assign(blob.echo, { count: 4, gap: 0, lag: .4, fade: .7 });

      return { grammar: 'cluster', paletteIndex: 2, recipe: 'facetype', elements: [word, tag, ring, tri, blob], place: {} };
    },
    blank() {
      return { grammar: 'cluster', paletteIndex: 0, recipe: null, elements: [], place: {} };
    }
  };

  LI.loadStarter = name => {
    nextNum = 1; nextRule = 1;
    Object.assign(state, { focus: .35, hierarchy: .55, spread: .58, tempo: .45, sync: .8, fx: LI.defaultFx(), layout: newLayout(), rules: [], selectedId: null, selectedRule: null });
    const s = (LI.STARTERS[name] || LI.STARTERS.flex)();
    state.grammar = s.grammar;
    state.paletteIndex = s.paletteIndex;
    state.elements = LI.settle(s.elements);
    LI.nameAll(state.elements);
    const f = LI.FORMAT, homes = LI.layout(f.w, f.h, state.layout);
    state.elements.forEach((el, i) => {
      const to = s.place[el.id];
      if (to) state.layout.nudge[el.id] = { x: to[0] - homes[i].x / f.w, y: to[1] - homes[i].y / f.h };
    });
    if (s.recipe) LI.applyRecipe(s.recipe);
  };

  // ---------- copies, DNA in and out, undo steps ----------

  // picture data is shared by reference, never copied, so clones and undo steps stay light
  const cloneEl = el => {
    const o = {};
    Object.keys(el).forEach(k => { if (k !== 'image' && k !== 'dataUrl') o[k] = el[k]; });
    const c = JSON.parse(JSON.stringify(o));
    if (el.image) c.image = el.image;
    if (el.dataUrl) c.dataUrl = el.dataUrl;
    return c;
  };
  const plain = v => JSON.parse(JSON.stringify(v));
  const SYS = ['grammar', 'focus', 'hierarchy', 'spread', 'tempo', 'sync', 'paletteIndex', 'mirror'];

  LI.serialize = () => ({
    app: 'Living Identity', version: '5.1', generatedAt: new Date().toISOString(),
    system: { grammar: state.grammar, focus: state.focus, hierarchy: state.hierarchy, spread: state.spread, tempo: state.tempo, sync: state.sync, mirror: state.mirror },
    effects: plain(state.fx),
    palette: Object.assign({ index: state.paletteIndex }, LI.palette()),
    layout: plain(state.layout),
    trackers: plain(state.trackers),
    rules: plain(state.rules),
    elements: state.elements.map(el => { const c = cloneEl(el); delete c.image; return c; })
  });

  LI.deserialize = (data, done) => {
    if (!data || !Array.isArray(data.elements)) throw new Error('Not a Living Identity DNA file');
    let pending = 0, sealed = false;
    const settle = () => { if (sealed && pending === 0 && done) { const d = done; done = null; d(); } };
    const sys = data.system || {};
    SYS.forEach(k => { if (sys[k] != null) state[k] = sys[k]; });
    state.paletteIndex = LI.clamp((data.palette && data.palette.index) | 0, 0, LI.PALETTES.length - 1);
    state.fx = Object.assign(LI.defaultFx(), data.effects);
    state.layout = Object.assign(newLayout(), data.layout, { treatment: 'compose' });
    state.layout.nudge = state.layout.nudge || {};
    state.trackers = Object.assign({ hand: true, face: false, body: false }, data.trackers);
    state.elements = data.elements.map(raw => {
      const el = LI.fixEl(Object.assign({}, raw));
      if (el.type === 'image' && el.dataUrl) {
        pending++;
        const img = new Image();
        img.onload = img.onerror = () => { pending--; settle(); };
        img.src = el.dataUrl;
        el.image = img;
      }
      return el;
    }).filter(el => el.type === 'text' || Array.isArray(el.points));
    // files from before layers existed drew type over shapes over pictures: keep that look
    if (!(parseFloat(data.version) >= 5.1)) { state.elements = LI.settle(state.elements); LI.nameAll(state.elements); }
    state.rules = (Array.isArray(data.rules) ? data.rules : []).filter(r => r && LI.PROPS[r.prop]).map(r => Object.assign(LI.newRule(r.source, r.target, r.prop), r));
    nextNum = state.elements.reduce((m, el) => Math.max(m, el.num || 0), 0) + 1;
    nextRule = state.rules.reduce((m, r) => Math.max(m, +String(r.id).slice(1) || 0), 0) + 1;
    state.selectedId = null; state.selectedRule = null;
    sealed = true;
    settle();
  };

  const KEEP = ['grammar', 'focus', 'hierarchy', 'spread', 'tempo', 'sync', 'paletteIndex', 'mirror'];
  LI.snapshot = () => {
    const s = { fx: plain(state.fx), layout: plain(state.layout), trackers: plain(state.trackers), rules: plain(state.rules), elements: state.elements.map(cloneEl), selectedId: state.selectedId, selectedRule: state.selectedRule, nextNum, nextRule };
    KEEP.forEach(k => { s[k] = state[k]; });
    return s;
  };
  LI.restore = snap => {
    KEEP.forEach(k => { state[k] = snap[k]; });
    state.fx = plain(snap.fx); state.layout = plain(snap.layout); state.trackers = plain(snap.trackers); state.rules = plain(snap.rules);
    state.elements = snap.elements.map(cloneEl);
    state.selectedId = snap.selectedId; state.selectedRule = snap.selectedRule;
    nextNum = Math.max(nextNum, snap.nextNum); nextRule = Math.max(nextRule, snap.nextRule);
  };
  // two snapshots with the same print hold the same design; selection does not count
  LI.fingerprint = snap => JSON.stringify([KEEP.map(k => snap[k]), snap.fx, snap.layout, snap.trackers, snap.rules,
    snap.elements.map(el => Object.assign({}, el, { image: undefined, dataUrl: el.dataUrl ? el.dataUrl.length + el.dataUrl.slice(-40) : undefined }))]);

  LI.duplicate = el => {
    const num = nextNum++, copy = cloneEl(el);
    Object.assign(copy, { id: 'e' + num, num });
    copy.name = LI.freeName(el.name, copy);
    const n = state.layout.nudge[el.id] || { x: 0, y: 0 };
    state.layout.nudge[copy.id] = { x: n.x + .04, y: n.y + .04 };
    return copy;
  };
})();

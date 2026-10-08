(() => {
  'use strict';

  const LI = window.LI, S = LI.state, rt = LI.rt, sense = LI.sense, { clamp } = LI;
  const $ = id => document.getElementById(id);
  const canvas = $('poster'), ctx = canvas.getContext('2d'), senseCv = $('senseCanvas'), senseCtx = senseCv.getContext('2d');
  const STORE = 'living-identity-v5';
  const SHAPE_CYCLE = ['circle', 'rect', 'triangle', 'ring', 'bar', 'arch', 'star', 'cross', 'blob'];
  const TRACKERS = ['hand', 'face', 'body'];
  const hist = { list: [], at: -1, timer: 0 };
  let pane = 'rules', tab = 'form', lastFrame = performance.now(), saveTimer = 0, clip = 6, both = false, job = null;
  let sigRows = [], ruleRows = [], shown = {};

  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
  // write text only when it changed, so per frame labels cost nothing
  const say = (id, text) => { if (shown[id] !== text) { shown[id] = text; $(id).textContent = text; } };

  // things a rule may do to the design itself when it fires
  const act = kind => {
    if (kind === 'mutate') LI.mutate();
    else if (kind === 'palette') { S.paletteIndex = (S.paletteIndex + 1) % LI.PALETTES.length; paintPalettes(); }
    paintMeta();
  };
  const fresh = () => { rt.memo = LI.newMemo(); rt.memo.act = act; rt.buf = LI.newBuf(); };

  // ---------- bound controls ----------

  function target(root) {
    if (root === 'sys') return S;
    if (root === 'fx') return S.fx;
    const el = LI.selected();
    return !el ? null : root === 'el' ? el : root === 'ec' ? el.echo : null;
  }
  const bound = node => { const [root, key] = node.dataset.bind.split('.'); return { t: target(root), key }; };

  function paintField(node) {
    const { t, key } = bound(node);
    if (!t || t[key] == null) return;
    const d = node.dataset, min = +(d.min || 0), max = +(d.max || 1), v = +t[key], input = node.querySelector('input');
    if (document.activeElement !== input) input.value = v;
    input.style.setProperty('--p', clamp((v - min) / (max - min) * 100, 0, 100) + '%');
    node.querySelector('output').textContent = d.fmt === 'deg' ? Math.round(v) + '°' : d.fmt === 'int' ? Math.round(v) : Math.round((v - min) / (max - min) * 100);
  }
  const paintSeg = (node, value) => node.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(value)));

  function buildControls() {
    document.querySelectorAll('.field[data-bind]').forEach(node => {
      const d = node.dataset;
      node.innerHTML = `<div class="field-head"><span>${d.label}</span><output></output></div>` +
        `<input type="range" min="${d.min || 0}" max="${d.max || 1}" step="${d.step || .01}" aria-label="${d.label}">` +
        (d.lo ? `<div class="ends"><span>${d.lo}</span><span>${d.hi}</span></div>` : '');
      node.querySelector('input').addEventListener('input', ev => {
        const { t, key } = bound(node);
        if (!t) return;
        t[key] = +ev.target.value;
        paintField(node);
        changed();
      });
    });
    document.querySelectorAll('.seg[data-bind]').forEach(node => {
      node.innerHTML = node.dataset.options.split(',').map(o => { const [v, l] = o.split(':'); return `<button data-v="${v}">${l}</button>`; }).join('');
      node.addEventListener('click', ev => {
        const b = ev.target.closest('button'), { t, key } = bound(node);
        if (!b || !t) return;
        t[key] = b.dataset.v;
        changed(); refresh();
      });
    });
    document.querySelectorAll('.tog[data-bind]').forEach(node => node.addEventListener('click', () => {
      const { t, key } = bound(node);
      if (!t) return;
      t[key] = !t[key];
      changed(); refresh();
    }));
    document.querySelectorAll('select[data-bind]').forEach(node => node.addEventListener('change', () => {
      const { t, key } = bound(node);
      if (!t) return;
      t[key] = node.value;
      changed(); refresh();
    }));
  }

  // a slider that belongs to one rule rather than to a bound path
  function slider(parent, label, value, min, max, step, fmt, onInput, lo, hi) {
    const node = document.createElement('div');
    node.className = 'field';
    node.innerHTML = `<div class="field-head"><span>${label}</span><output></output></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}">` +
      (lo ? `<div class="ends"><span>${lo}</span><span>${hi}</span></div>` : '');
    const input = node.querySelector('input'), out = node.querySelector('output');
    const paint = () => { out.textContent = fmt(+input.value); input.style.setProperty('--p', clamp((+input.value - min) / (max - min) * 100, 0, 100) + '%'); };
    input.addEventListener('input', () => { onInput(+input.value); paint(); changed(); });
    paint();
    parent.appendChild(node);
    return node;
  }

  // ---------- static pieces ----------

  function buildStatic() {
    $('sourceSeg').addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.v === 'camera') toast('Asking for the camera');
      sense.setSource(b.dataset.v).then(() => { fresh(); if (sense.error) toast(sense.error); else if (sense.source === 'camera') toast('Camera on, trackers load on first use'); });
    });

    $('trackers').innerHTML = TRACKERS.map(n => `<button data-v="${n}"><b>${LI.GROUPS[n]}</b><span id="st-${n}"></span></button>`).join('');
    $('trackers').addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      S.trackers[b.dataset.v] = !S.trackers[b.dataset.v];
      changed(); refresh();
    });

    // the sensor view doubles as a touch pad when the pointer plays the hand
    const view = $('senseView');
    const padAt = ev => { const r = view.getBoundingClientRect(); sense.pad.x = clamp((ev.clientX - r.left) / r.width, 0, 1); sense.pad.y = clamp((ev.clientY - r.top) / r.height, 0, 1); };
    view.addEventListener('pointermove', padAt);
    view.addEventListener('pointerdown', ev => { padAt(ev); sense.pad.down = true; view.setPointerCapture(ev.pointerId); });
    view.addEventListener('pointerup', () => { sense.pad.down = false; });
    view.addEventListener('wheel', ev => {
      if (sense.source !== 'pointer') return;
      ev.preventDefault();
      sense.pad.open = clamp(sense.pad.open - Math.sign(ev.deltaY) * .12, 0, 1);
    }, { passive: false });

    $('recipes').innerHTML = LI.RECIPES.map(r => `<button data-v="${r.id}" title="${r.note}"><b>${r.label}</b><span>${r.note}</span><i>${r.trackers.length ? r.trackers.map(t => LI.GROUPS[t]).join(' ') : 'Clock'}</i></button>`).join('');
    $('recipes').addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      const rec = LI.applyRecipe(b.dataset.v);
      fresh();
      changed(); refresh();
      const needsCam = sense.source !== 'camera' && rec.trackers.some(t => t !== 'hand');
      toast(needsCam ? `${rec.label} reads the ${rec.trackers.join(' and ')}, switch to Camera to play it` : `${rec.label}: ${S.rules.length} rules set`);
    });
    $('addRule').addEventListener('click', () => addRule());

    $('mainTabs').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) { pane = b.dataset.tab; refresh(); } });
    $('tabs').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) { tab = b.dataset.tab; refresh(); } });
    $('modeSeg').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) setMode(b.dataset.v); });
    $('mirrorTog').addEventListener('click', () => { S.mirror = !S.mirror; changed(); refresh(); });

    document.querySelectorAll('select.dur').forEach(sel => {
      sel.innerHTML = [4, 6, 8, 12].map(n => `<option value="${n}">${n} s</option>`).join('');
      sel.value = clip;
      sel.addEventListener('change', () => { clip = +sel.value; });
    });
    $('frameSel').addEventListener('change', ev => { both = ev.target.value === 'both'; });
    $('saveSeg').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) save(b.dataset.v); });
    $('jobStop').addEventListener('click', stopJob);

    $('shapeGrid').innerHTML = Object.keys(LI.SHAPES).map(k => {
      const g = LI.SHAPES[k].make(), b = LI.ptsBounds(g.points), s = 20 / Math.max(b.x1 - b.x0, b.y1 - b.y0);
      const line = g.style === 'line' ? ' class="line"' : '';
      return `<button data-v="${k}" title="${LI.SHAPES[k].label}"><svg viewBox="-13 -13 26 26" aria-hidden="true"><path${line} transform="translate(${(-(b.x0 + b.x1) / 2 * s).toFixed(2)} ${(-(b.y0 + b.y1) / 2 * s).toFixed(2)})" d="${LI.shapePathD(g.points, g.smooth, s)}"/></svg></button>`;
    }).join('');
    $('shapeGrid').addEventListener('click', ev => {
      const b = ev.target.closest('button'), el = LI.selected();
      if (!b || !el || el.type === 'text') return;
      const g = LI.SHAPES[b.dataset.v].make();
      if (el.type === 'shape') {
        Object.assign(el, g);
      } else { el.points = g.points; el.smooth = g.smooth; }
      el.kind = b.dataset.v;
      if (el.type === 'shape') LI.autoName(el);
      rt.vertex = -1;
      changed(); refresh();
    });

    $('starterSeg').addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      LI.loadStarter(b.dataset.v);
      fresh();
      changed(); refresh();
      toast(b.textContent + ' starter loaded');
    });
  }

  // ---------- sense panel ----------

  function paintSense() {
    paintSeg($('sourceSeg'), sense.source);
    document.querySelectorAll('#trackers button').forEach(b => b.classList.toggle('on', !!S.trackers[b.dataset.v]));
    $('senseView').classList.toggle('cam', sense.source === 'camera');
    $('senseView').classList.toggle('pad', sense.source === 'pointer');
    // the view takes the camera's own proportions, so the overlay sits exactly on the picture
    $('senseView').style.aspectRatio = String(sense.aspect);
    const vh = Math.round(senseCv.width / sense.aspect);
    if (senseCv.height !== vh) senseCv.height = vh;
  }

  function paintSignals() {
    const box = $('signals'), used = new Set(S.rules.map(r => r.source));
    box.innerHTML = '';
    sigRows = [];
    TRACKERS.filter(n => S.trackers[n]).concat('clock').forEach(g => {
      const head = document.createElement('div');
      head.className = 'sig-group';
      head.innerHTML = `<b>${LI.GROUPS[g]}</b><span></span>`;
      box.appendChild(head);
      const row = (src, point) => {
        const node = document.createElement('div');
        node.className = 'sig' + (point ? ' pt' : '') + (used.has(src.id) ? ' used' : '');
        node.title = src.note;
        node.innerHTML = `<span class="sig-name">${src.label}</span>` + (point ? '<span class="sig-pad"><b></b></span><output>point</output>' : '<span class="sig-bar"><b></b></span><output>0</output>') +
          '<button class="mini" title="Make a rule from this">+</button>';
        node.querySelector('button').addEventListener('click', () => addRule(src.id));
        box.appendChild(node);
        sigRows.push({ id: src.id, group: g, point, node, mark: node.querySelector('b'), out: node.querySelector('output') });
      };
      LI.SIGNALS.filter(s => s.group === g).forEach(s => row(s, false));
      LI.POINTS.filter(p => p.group === g).forEach(p => row(p, true));
    });
  }

  // ---------- rules ----------

  function addRule(sourceId) {
    const on = TRACKERS.find(n => S.trackers[n]);
    const src = sourceId || (on === 'hand' ? 'hand.pinch' : on === 'face' ? 'face.mouth' : on === 'body' ? 'body.arms' : 'clock.wave');
    const prop = LI.isPoint(src) ? 'follow' : LI.SIGNALS.find(s => s.id === src).def;
    const sel = LI.selected(), anchor = S.elements.find(e => e.type === 'text' && e.role === 'anchor') || S.elements[0];
    const r = LI.fitRule(LI.newRule(src, sel ? sel.id : anchor ? anchor.id : '@all', prop));
    S.rules.push(r);
    S.selectedRule = r.id;
    pane = 'rules';
    changed(); refresh();
    const card = document.querySelector('.rule.open');
    if (card) card.scrollIntoView({ block: 'nearest' });
  }

  function select(options, value, onChange) {
    const sel = document.createElement('select');
    sel.innerHTML = options.map(o => o.group ? `<optgroup label="${esc(o.group)}">${o.items.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</optgroup>` : `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('');
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }
  const labelled = (text, node) => { const l = document.createElement('label'); l.className = 'lab'; l.textContent = text; l.appendChild(node); return l; };

  function ruleBody(r) {
    const P = LI.PROPS[r.prop], body = document.createElement('div'), restructure = () => { LI.fitRule(r); changed(); refresh(); };
    body.className = 'rule-body';

    const sources = [];
    Object.keys(LI.GROUPS).forEach(g => {
      sources.push({ group: LI.GROUPS[g], items: LI.SIGNALS.filter(s => s.group === g).map(s => [s.id, s.label]) });
      const pts = LI.POINTS.filter(p => p.group === g);
      if (pts.length) sources.push({ group: LI.GROUPS[g] + ' points', items: pts.map(p => [p.id, p.label]) });
    });
    body.appendChild(labelled('When', select(sources, r.source, v => { r.source = v; restructure(); })));

    const targets = [{ group: 'Whole', items: (LI.isPoint(r.source) ? [] : [['poster', 'Poster']]).concat(LI.GROUP_TARGETS) },
      { group: 'Elements', items: S.elements.map(e => [e.id, e.name]) }];
    body.appendChild(labelled('Drives', select(targets, r.target, v => { r.target = v; restructure(); })));
    body.appendChild(labelled('To', select(LI.propsFor(r.source, r.target).map(k => [k, LI.PROPS[k].label]), r.prop, v => {
      r.prop = v;
      const Q = LI.PROPS[v];
      if (Q.from != null) { r.from = Q.from; r.to = Q.to; }
      restructure();
    })));

    const pct = v => Math.round(v * 100);
    if (P.kind === 'point') {
      slider(body, 'Strength', r.amount, 0, 1, .01, pct, v => { r.amount = v; }, 'loose', 'tight');
      if (r.prop === 'attract' || r.prop === 'repel') slider(body, 'Reach', r.range, 0, 1, .01, pct, v => { r.range = v; }, 'close', 'wide');
    } else if (P.kind === 'action') {
      slider(body, 'Fires at', r.at, .1, 1, .01, pct, v => { r.at = v; }, 'easily', 'only at full');
    } else {
      const unit = v => Math.round(v) + (P.unit || '');
      slider(body, 'When low', r.from, P.min, P.max, 1, unit, v => { r.from = v; });
      slider(body, 'When high', r.to, P.min, P.max, 1, unit, v => { r.to = v; });
    }
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = P.note || (LI.sourceOf(r.source) || {}).note || '';
    body.appendChild(note);

    if (P.kind !== 'point') {
      const tune = document.createElement('details');
      tune.innerHTML = '<summary>Tune the reading</summary>';
      slider(tune, 'Smoothing', r.smooth, 0, 1, .01, pct, v => { r.smooth = v; }, 'instant', 'slow');
      slider(tune, 'Reads from', r.lo, 0, .9, .01, pct, v => { r.lo = Math.min(v, r.hi - .05); });
      slider(tune, 'Reads up to', r.hi, .1, 1, .01, pct, v => { r.hi = Math.max(v, r.lo + .05); });
      const seg = document.createElement('div');
      seg.className = 'seg';
      seg.innerHTML = [['linear', 'Even'], ['ease', 'Soft'], ['sharp', 'Late'], ['snap', 'Switch']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('');
      paintSeg(seg, r.curve);
      seg.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) { r.curve = b.dataset.v; paintSeg(seg, r.curve); changed(); } });
      tune.appendChild(labelled('Response', seg));
      body.appendChild(tune);
    }

    const foot = document.createElement('div');
    foot.className = 'rule-foot';
    foot.innerHTML = `<button class="mini" data-a="on">${r.on ? 'Switch off' : 'Switch on'}</button><button class="mini" data-a="copy">Copy</button><button class="mini" data-a="del">Delete</button>`;
    foot.addEventListener('click', ev => {
      const a = ev.target.dataset.a;
      if (!a) return;
      if (a === 'on') r.on = !r.on;
      else if (a === 'del') { S.rules = S.rules.filter(x => x !== r); S.selectedRule = null; }
      else { const c = Object.assign({}, r, { id: LI.ruleId() }); S.rules.splice(S.rules.indexOf(r) + 1, 0, c); S.selectedRule = c.id; }
      changed(); refresh();
    });
    body.appendChild(foot);
    return body;
  }

  function paintRules() {
    const box = $('rules');
    box.innerHTML = '';
    ruleRows = [];
    rt.focus = [];
    $('ruleCount').textContent = S.rules.length ? pad(S.rules.length) : '';
    if (!S.rules.length) box.innerHTML = '<p class="hint">No rules yet, pick a suggestion above or press the plus beside a signal</p>';
    S.rules.forEach(r => {
      const src = LI.sourceOf(r.source) || { label: 'Missing', group: 'clock' }, P = LI.PROPS[r.prop], open = r.id === S.selectedRule;
      const card = document.createElement('div');
      card.className = 'rule' + (r.on ? '' : ' off') + (open ? ' open' : '');
      const range = P.kind === 'el' || P.kind === 'poster' ? `${Math.round(r.from)} to ${Math.round(r.to)}` : P.kind === 'action' ? 'fires' : `${Math.round(r.amount * 100)}`;
      card.innerHTML = `<button class="rule-head"><span class="rule-src"><i>${LI.GROUPS[src.group]}</i>${esc(src.label)}</span>` +
        `<span class="rule-eff"><b>${P.label}</b><em>${esc(LI.targetLabel(r.target))}</em><u>${range}</u></span><span class="rule-meter"><b></b></span></button>`;
      card.querySelector('.rule-head').addEventListener('click', () => { S.selectedRule = open ? null : r.id; refresh(); });
      // hovering a rule, or opening it, points out on the poster which elements it drives
      const ids = LI.targetsOf(r.target).map(e => e.id);
      if (open && pane === 'rules') rt.focus = ids;
      card.addEventListener('mouseenter', () => { rt.focus = ids; });
      card.addEventListener('mouseleave', () => { const o = S.rules.find(x => x.id === S.selectedRule); rt.focus = o ? LI.targetsOf(o.target).map(e => e.id) : []; });
      if (open) card.appendChild(ruleBody(r));
      box.appendChild(card);
      ruleRows.push({ id: r.id, meter: card.querySelector('.rule-meter b') });
    });
  }

  // ---------- elements and poster panes ----------

  // the four layer buttons know when there is nowhere further to go
  function paintStack() {
    const el = LI.selected(), els = S.elements, i = el ? els.indexOf(el) : -1;
    document.querySelectorAll('#stackRow button').forEach(b => {
      const up = b.dataset.a === 'front' || b.dataset.a === 'up';
      b.disabled = i < 0 || (up ? i === els.length - 1 : i === 0);
    });
  }

  // type a new name straight into the list
  function renameInList(el) {
    const row = document.querySelector(`#layers .layer[data-id="${el.id}"]`);
    if (!row) return;
    const input = document.createElement('input');
    input.className = 'layer-edit';
    input.value = el.name; input.spellcheck = false;
    input.setAttribute('aria-label', 'Element name');
    row.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const finish = keep => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (keep && v !== el.name) {
        el.named = !!v;
        if (v) el.name = v; else LI.autoName(el);
        changed();
      }
      refresh();
    };
    input.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') finish(true); else if (ev.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
  }

  let lastTap = { id: null, t: 0 };
  function paintLayers() {
    const box = $('layers'), els = S.elements;
    box.innerHTML = '';
    paintStack();
    if (!els.length) { box.innerHTML = '<p class="hint">Nothing here yet, add a first element</p>'; return; }
    // the list reads like a stack of paper: whatever is in front comes first
    els.slice().reverse().forEach((el, i) => {
      const on = el.id === S.selectedId, n = S.rules.filter(r => r.on && (r.target === el.id || r.target === '@all' || r.target === (el.type === 'text' ? '@text' : '@shape'))).length;
      const row = document.createElement('button');
      row.className = 'layer' + (on ? ' on' : '');
      row.dataset.id = el.id;
      row.title = el.name + ', double click to rename';
      row.innerHTML = `<span class="num">${pad(i + 1)}</span><canvas width="40" height="40"></canvas><span class="name">${esc(el.name)}</span>` +
        `<span class="tag">${n ? n + (n === 1 ? ' rule' : ' rules') : ''}</span><i class="src${n ? ' live' : ''}"></i>`;
      LI.drawGlyph(row.querySelector('canvas').getContext('2d'), el, 20, 20, 26, on ? '#ffffff' : '#0c0c0c');
      row.addEventListener('click', () => {
        // the list is rebuilt on every selection, so a double click is counted here
        const now = performance.now(), twice = lastTap.id === el.id && now - lastTap.t < 450;
        lastTap = { id: el.id, t: twice ? 0 : now };
        if (twice) { renameInList(el); return; }
        if (S.selectedId === el.id) return;
        S.selectedId = el.id; rt.vertex = -1; refresh();
      });
      box.appendChild(row);
    });
  }

  function paintPalettes() {
    const box = $('palettes');
    box.innerHTML = '';
    LI.PALETTES.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'chip' + (i === S.paletteIndex ? ' on' : '');
      b.title = p.name;
      b.innerHTML = [p.bg, p.colors[0], p.colors[2], p.colors[3]].map(c => `<i style="background:${c}"></i>`).join('') + `<span>${p.name}</span>`;
      b.addEventListener('click', () => { S.paletteIndex = i; changed(); refresh(); });
      box.appendChild(b);
    });
  }

  function paintSwatches(box, el, key) {
    const pal = LI.palette(), val = el[key];
    box.innerHTML = '';
    pal.colors.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'sw' + (val === i ? ' on' : '');
      b.style.background = c;
      b.title = 'Palette colour ' + (i + 1);
      b.addEventListener('click', () => { el[key] = i; changed(); refresh(); });
      box.appendChild(b);
    });
    const custom = document.createElement('label');
    custom.className = 'sw custom' + (typeof val === 'string' ? ' on' : '');
    custom.title = 'Custom colour';
    custom.innerHTML = `<input type="color" value="${typeof val === 'string' ? val : pal.colors[val] || '#000000'}">`;
    custom.querySelector('input').addEventListener('input', ev => { el[key] = ev.target.value; custom.style.background = el[key]; changed(); });
    if (typeof val === 'string') custom.style.background = val;
    box.appendChild(custom);
  }

  function paintInspector() {
    const el = LI.selected();
    $('noSel').hidden = !!el;
    $('sel').hidden = !el;
    if (!el) return;
    const isText = el.type === 'text';
    $('selNum').textContent = pad(S.elements.length - S.elements.indexOf(el));
    if (document.activeElement !== $('selName')) $('selName').value = el.name;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.tab-body').forEach(b => { b.hidden = b.dataset.tab !== tab; });

    $('formText').hidden = !isText;
    $('formGeo').hidden = isText;
    $('replaceWrap').hidden = el.type !== 'image';
    $('styleSeg').hidden = el.type !== 'shape';
    $('weightField').hidden = !(el.type === 'shape' && el.style === 'line');
    if (isText) { if (document.activeElement !== $('textContent')) $('textContent').value = el.text; }
    else {
      $('pointCount').textContent = el.points.length + ' points';
      paintSeg($('shapeGrid'), el.kind);
    }

    $('paintBlock').hidden = el.type === 'image';
    $('letterBlock').hidden = !isText;
    if (el.type !== 'image') {
      if (!isText && el.paint === 'outline') el.paint = 'solid';
      $('paintSeg').querySelector('[data-v="outline"]').hidden = !isText;
      paintSwatches($('swatches'), el, 'fill');
      paintSwatches($('swatches2'), el, 'fill2');
      $('angleField').hidden = el.paint !== 'gradient';
      $('outlineField').hidden = el.paint !== 'outline';
    }
  }

  function paintMeta() {
    const n = S.elements.length, live = S.rules.filter(r => r.on).length;
    $('metaLeft').innerHTML = `<b>Poster</b><span>4:5</span><span>${cap(S.grammar)}</span><span>Seed ${S.layout.seed}</span>`;
    $('metaRight').innerHTML = `<span>${pad(n)} ${n === 1 ? 'element' : 'elements'}</span><span>${pad(live)} ${live === 1 ? 'rule' : 'rules'}</span>`;
  }

  function refresh() {
    if (S.selectedId && !LI.selected()) S.selectedId = null;
    document.body.classList.toggle('live', S.mode === 'live');
    paintSeg($('modeSeg'), S.mode);
    document.querySelectorAll('#mainTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === pane));
    document.querySelectorAll('.pane').forEach(p => { p.hidden = p.dataset.pane !== pane; });
    $('mirrorTog').classList.toggle('on', !!S.mirror);
    paintSense();
    paintSignals();
    paintRules();
    paintInspector();
    document.querySelectorAll('.field[data-bind]').forEach(paintField);
    document.querySelectorAll('.seg[data-bind]').forEach(n => { const { t, key } = bound(n); if (t) paintSeg(n, t[key]); });
    document.querySelectorAll('.tog[data-bind]').forEach(n => { const { t, key } = bound(n); n.classList.toggle('on', !!(t && t[key])); });
    document.querySelectorAll('select[data-bind]').forEach(n => { const { t, key } = bound(n); if (t) n.value = t[key]; });
    paintLayers();
    paintPalettes();
    paintMeta();
    paintHistory();
    paintPause();
  }

  // ---------- actions ----------

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const s = JSON.stringify(LI.serialize());
        if (s.length < 4e6) localStorage.setItem(STORE, s);
      } catch (e) { /* storage is a convenience, never a requirement */ }
    }, 600);
  }

  // every edit ends up here
  function changed() {
    persist();
    clearTimeout(hist.timer);
    hist.timer = setTimeout(commit, 350);
  }

  // A short pause after the last change, the state is recorded as one undo step.
  function commit() {
    clearTimeout(hist.timer);
    hist.timer = 0;
    const snap = LI.snapshot(), print = LI.fingerprint(snap), top = hist.list[hist.at];
    if (top && top.print === print) { top.snap.selectedId = snap.selectedId; top.snap.selectedRule = snap.selectedRule; return; }
    hist.list.length = hist.at + 1;
    hist.list.push({ snap, print });
    if (hist.list.length > 80) hist.list.shift();
    hist.at = hist.list.length - 1;
    paintHistory();
  }

  function travel(dir) {
    if (rt.drag) return;
    if (hist.timer) commit();
    const to = hist.at + dir;
    if (to < 0 || to >= hist.list.length) { toast(dir < 0 ? 'Nothing to undo' : 'Nothing to redo'); return; }
    hist.at = to;
    LI.restore(hist.list[to].snap);
    fresh();
    rt.vertex = -1; rt.hoverId = null;
    persist();
    refresh();
    toast(dir < 0 ? 'Undone' : 'Redone');
  }

  function paintHistory() {
    $('undoBtn').disabled = hist.at <= 0;
    $('redoBtn').disabled = hist.at >= hist.list.length - 1;
  }

  function togglePause() {
    rt.paused = !rt.paused;
    paintPause();
    toast(rt.paused ? 'Poster paused' : 'Poster playing');
  }
  function paintPause() {
    $('pauseBtn').textContent = rt.paused ? 'Play' : 'Pause';
    $('pauseBtn').classList.toggle('on', !!rt.paused);
  }

  function fitBoard() {
    const b = $('board'), f = LI.FORMAT, bw = b.clientWidth - 4, bh = b.clientHeight - 4;
    if (bw <= 0 || bh <= 0) return;
    const k = Math.min(bw / f.w, bh / f.h, 1.8);
    const q = Math.min(k * Math.min(window.devicePixelRatio || 1, 2.5), Math.sqrt(3.4e6 / (f.w * f.h)));
    const cw = Math.round(f.w * q), ch = Math.round(f.h * q);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    rt.q = cw / f.w;
    canvas.style.width = Math.floor(f.w * k) + 'px';
    canvas.style.height = Math.floor(f.h * k) + 'px';
  }

  function setMode(mode) {
    S.mode = mode;
    rt.hoverId = null; rt.drag = null;
    canvas.style.cursor = mode === 'live' ? 'crosshair' : 'default';
    refresh();
  }

  function doMutate() {
    LI.mutate();
    changed(); refresh();
    toast('New arrangement, same rules');
  }

  function addElement(el) {
    S.elements.push(el);
    if (el.named) el.name = LI.freeName(el.name, el); else LI.autoName(el);
    S.selectedId = el.id;
    rt.vertex = -1;
    pane = 'elements'; tab = 'form';
    changed(); refresh();
  }

  function removeSelected() {
    const el = LI.selected();
    if (!el) return;
    S.elements = S.elements.filter(e => e !== el);
    S.rules = S.rules.filter(r => r.target !== el.id);
    delete S.layout.nudge[el.id];
    S.selectedId = null;
    changed(); refresh();
  }

  function readImage(file, done) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => done(img, r.result); img.src = r.result; };
    r.readAsDataURL(file);
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  // the editor reports canvas edits here
  LI.onEdit = kind => {
    if (kind === 'drag') {
      document.querySelectorAll('.field[data-bind]').forEach(paintField);
      const el = LI.selected();
      if (el && el.type !== 'text') $('pointCount').textContent = el.points.length + ' points';
      return;
    }
    if (kind === 'focus-text') { pane = 'elements'; tab = 'form'; refresh(); $('textContent').focus(); $('textContent').select(); return; }
    if (kind === 'select' && LI.selected()) pane = 'elements';
    changed(); refresh();
  };
  LI.onSense = () => paintSense();

  // ---------- saving stills and clips ----------

  const fileName = ext => `living-identity-${S.layout.seed}.${ext}`;
  const saveBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    LI.saveFile(url, name);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  function setJob(label, share) {
    $('job').classList.remove('hidden');
    $('jobLabel').textContent = label;
    $('jobBar').style.width = Math.round(clamp(share, 0, 1) * 100) + '%';
  }
  function endJob() { job = null; $('job').classList.add('hidden'); }
  function stopJob() {
    if (!job) return;
    if (job.kind === 'video') { const rec = job.rec; endJob(); rec.stop(); }
    else if (job.phase === 'capture') { job.phase = 'encode'; encodeGIF(job); }
    else job.stop = true;
  }

  // An output picture: the poster alone, or the camera scene and the poster side by side on black.
  // h is the height of the poster inside it; read marks a canvas whose pixels will be read back (GIF).
  function outFrame(h, read) {
    const even = v => Math.round(v / 2) * 2, f = LI.FORMAT;
    const ph = even(h), pw = even(h * f.w / f.h), pad = both ? even(h * .035) : 0, cw = both ? even(h * sense.aspect) : 0;
    const cv = document.createElement('canvas'), pc = document.createElement('canvas');
    cv.width = both ? pad * 3 + cw + pw : pw; cv.height = ph + pad * 2;
    pc.width = pw; pc.height = ph;
    return { cv, c: cv.getContext('2d', { willReadFrequently: !!read }), pc, pctx: pc.getContext('2d'), buf: LI.newBuf(), both, pad, cw, pw, ph };
  }

  // paints the current moment into an output picture
  function drawOut(o) {
    LI.paint(o.pctx, LI.FORMAT.w, LI.FORMAT.h, rt.t, { live: rt.live, buf: o.buf });
    if (!o.both) { o.c.drawImage(o.pc, 0, 0); return; }
    o.c.fillStyle = '#0c0c0c'; o.c.fillRect(0, 0, o.cv.width, o.cv.height);
    o.c.save();
    o.c.translate(o.pad, o.pad);
    o.c.beginPath(); o.c.rect(0, 0, o.cw, o.ph); o.c.clip();
    sense.draw(o.c, o.cw, o.ph, true);
    o.c.restore();
    o.c.drawImage(o.pc, o.pad * 2 + o.cw, o.pad);
  }

  function savePNG() {
    const o = outFrame(both ? 1000 : 2000, false);
    drawOut(o);
    LI.saveFile(o.cv.toDataURL('image/png'), fileName('png'));
  }

  // Video and GIF both record what is really happening, at the pace it happens.
  function saveVideo() {
    const type = LI.videoType();
    if (!type) { toast('This browser cannot record video, use GIF'); return; }
    const o = outFrame(both ? 720 : 1000, false);
    o.cv.className = 'rec-canvas';
    document.body.appendChild(o.cv);
    const chunks = [], ext = type.indexOf('mp4') > 0 ? 'mp4' : 'webm';
    const rec = new MediaRecorder(o.cv.captureStream(30), { mimeType: type, videoBitsPerSecond: 10e6 });
    rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    rec.onstop = () => {
      o.cv.remove();
      saveBlob(new Blob(chunks, { type: type.split(';')[0] }), fileName(ext));
      toast(`Video saved as ${ext}`);
    };
    job = { kind: 'video', o, rec, start: performance.now(), ms: clip * 1000 };
    setJob('Recording video', 0);
    rec.start();
  }

  // GIF frames are kept at 16 bits a pixel while recording, then encoded once the clip is over
  const pack = d => {
    const n = d.length >> 2, out = new Uint16Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) out[i] = (d[p] >> 3) << 11 | (d[p + 1] >> 2) << 5 | d[p + 2] >> 3;
    return out;
  };
  const unpack = (src, d) => {
    for (let i = 0, p = 0; i < src.length; i++, p += 4) {
      const v = src[i];
      d[p] = (v >> 8 & 248) | v >> 13; d[p + 1] = (v >> 3 & 252) | (v >> 9 & 3); d[p + 2] = (v << 3 & 248) | (v >> 2 & 7); d[p + 3] = 255;
    }
    return d;
  };

  function saveGIF() {
    // longer clips run at a lower frame rate so the recording stays light
    const fps = clip <= 6 ? 12.5 : clip <= 8 ? 10 : 8;
    const o = outFrame(both ? Math.round(800 / (.905 + sense.aspect)) : 560, true);
    job = { kind: 'gif', phase: 'capture', o, frames: [], start: performance.now(), next: 0, gap: 1000 / fps, delay: Math.round(100 / fps), ms: clip * 1000, stop: false };
    setJob('Recording GIF', 0);
  }

  async function encodeGIF(g) {
    const W = g.o.cv.width, H = g.o.cv.height, n = g.frames.length, pause = () => new Promise(r => setTimeout(r, 0));
    if (!n) { endJob(); return; }
    setJob('Encoding GIF', 0);
    await pause();
    const enc = LI.gifEncoder(W, H, g.delay), tmp = new Uint8ClampedArray(W * H * 4), samples = [];
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 10))) samples.push(unpack(g.frames[i], new Uint8ClampedArray(W * H * 4)));
    enc.setPalette(samples);
    for (let i = 0; i < n && !g.stop; i++) {
      enc.add(unpack(g.frames[i], tmp));
      g.frames[i] = null;
      setJob('Encoding GIF', (i + 1) / n);
      if (i % 2) await pause();
    }
    const stopped = g.stop;
    endJob();
    if (stopped) { toast('GIF cancelled'); return; }
    saveBlob(enc.finish(), fileName('gif'));
    toast(`GIF saved, ${n} frames`);
  }

  function save(kind) {
    if (job) { if (kind === job.kind && job.phase !== 'encode') stopJob(); else toast('One export at a time'); return; }
    if (kind === 'png') { savePNG(); toast(both ? 'PNG saved, camera and poster' : 'PNG saved at double size'); }
    else if (kind === 'gif') saveGIF();
    else saveVideo();
  }

  // ---------- wiring ----------

  function bind() {
    $('addText').addEventListener('click', () => addElement(LI.makeText('NEW\nTEXT', 'content')));
    $('addShape').addEventListener('click', () => addElement(LI.makeShape(SHAPE_CYCLE[S.elements.filter(e => e.type === 'shape').length % SHAPE_CYCLE.length])));
    $('imageInput').addEventListener('change', ev => { readImage(ev.target.files[0], (img, url) => addElement(LI.makeImage(img, url))); ev.target.value = ''; });
    $('replaceInput').addEventListener('change', ev => {
      const el = LI.selected();
      readImage(ev.target.files[0], (img, url) => { if (el && el.type === 'image') { el.image = img; el.dataUrl = url; changed(); } });
      ev.target.value = '';
    });

    $('mutateBtn').addEventListener('click', doMutate);
    $('undoBtn').addEventListener('click', () => travel(-1));
    $('redoBtn').addEventListener('click', () => travel(1));
    $('pauseBtn').addEventListener('click', togglePause);

    $('jsonBtn').addEventListener('click', () => {
      saveBlob(new Blob([JSON.stringify(LI.serialize(), null, 2)], { type: 'application/json' }), fileName('json'));
      toast('Poster and rules saved as JSON');
    });
    $('jsonInput').addEventListener('change', ev => {
      const f = ev.target.files[0];
      ev.target.value = '';
      if (!f) return;
      f.text().then(txt => {
        LI.deserialize(JSON.parse(txt), () => { fresh(); changed(); refresh(); toast('Poster loaded'); });
      }).catch(() => toast('That file is not a Living Identity poster'));
    });

    $('selName').addEventListener('input', ev => {
      const el = LI.selected();
      if (!el) return;
      // typing a name makes it stick; clearing the field hands naming back to the element
      el.named = !!ev.target.value.trim();
      if (el.named) el.name = ev.target.value; else LI.autoName(el);
      changed(); paintLayers();
    });
    $('selName').addEventListener('blur', ev => { const el = LI.selected(); if (el) { if (el.named) el.name = el.name.trim(); ev.target.value = el.name; paintLayers(); } });
    $('selName').addEventListener('keydown', ev => { if (ev.key === 'Enter') ev.target.blur(); });
    $('stackRow').addEventListener('click', ev => {
      const b = ev.target.closest('button'), el = LI.selected();
      if (b && el && LI.restack(el, b.dataset.a)) { changed(); refresh(); }
    });
    $('textContent').addEventListener('input', ev => {
      const el = LI.selected();
      if (!el) return;
      el.text = ev.target.value;
      LI.autoName(el);
      $('selName').value = el.name;
      changed(); paintLayers();
    });
    $('dupBtn').addEventListener('click', () => { const el = LI.selected(); if (el) addElement(LI.duplicate(el)); });
    $('delBtn').addEventListener('click', removeSelected);
    $('homeBtn').addEventListener('click', () => {
      const el = LI.selected();
      if (!el) return;
      delete S.layout.nudge[el.id];
      el.rotation = 0;
      changed(); refresh();
    });

    window.addEventListener('keydown', ev => {
      const a = document.activeElement, tag = a ? a.tagName : '';
      const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && a.type !== 'range' && a.type !== 'file');
      if (ev.key === 'Escape') {
        if (S.mode === 'live') setMode('design');
        else if (typing) a.blur();
        else { S.selectedId = null; refresh(); }
        return;
      }
      // undo and redo work everywhere except inside a text box, which keeps its own
      const cmd = ev.metaKey || ev.ctrlKey, low = ev.key.toLowerCase();
      const inText = tag === 'TEXTAREA' || (tag === 'INPUT' && a.type !== 'range' && a.type !== 'file' && a.type !== 'color');
      if (cmd && !ev.altKey && (low === 'z' || low === 'y') && !inText) {
        ev.preventDefault();
        travel(low === 'y' || ev.shiftKey ? 1 : -1);
        return;
      }
      if (typing || ev.altKey) return;
      const el = LI.selected();
      if (cmd && low === 'd') { ev.preventDefault(); if (el) addElement(LI.duplicate(el)); return; }
      if (cmd) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        if (tag === 'BUTTON') a.blur();
        setMode(S.mode === 'live' ? 'design' : 'live');
      } else if (low === 'p') togglePause();
      else if (low === 'm') doMutate();
      else if (low === 'r') save('video');
      else if (tag === 'INPUT') return;
      else if ((ev.code === 'BracketRight' || ev.code === 'BracketLeft') && el) {
        const how = ev.code === 'BracketRight' ? (ev.shiftKey ? 'front' : 'up') : (ev.shiftKey ? 'back' : 'down');
        if (LI.restack(el, how)) { changed(); refresh(); }
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (LI.removeVertex()) { changed(); refresh(); } else removeSelected();
      } else if (ev.key.startsWith('Arrow') && el) {
        ev.preventDefault();
        const n = S.layout.nudge[el.id] || (S.layout.nudge[el.id] = { x: 0, y: 0 }), d = ev.shiftKey ? .05 : .01;
        if (ev.key === 'ArrowLeft') n.x -= d; else if (ev.key === 'ArrowRight') n.x += d;
        else if (ev.key === 'ArrowUp') n.y -= d; else n.y += d;
        changed();
      }
    });

    new ResizeObserver(fitBoard).observe($('board'));
    window.addEventListener('resize', fitBoard);
  }

  // ---------- frame ----------

  const STATE_WORDS = { loading: 'loading', error: 'failed', idle: 'waiting', ready: 'ready' };

  // the cheap, every frame part of the interface: meters and status words
  function paintLive() {
    const sig = LI.sig;
    sigRows.forEach(row => {
      const there = sig.has[row.group];
      row.node.classList.toggle('away', !there);
      if (row.point) {
        const p = sig.p[row.id];
        row.mark.style.left = clamp(p ? p.x : .5, 0, 1) * 100 + '%';
        row.mark.style.top = clamp(p ? p.y : .5, 0, 1) * 100 + '%';
        row.node.classList.toggle('lost', !(p && p.on));
      } else {
        const v = there ? sig.v[row.id] || 0 : 0;
        row.mark.style.width = Math.round(v * 100) + '%';
        const txt = String(Math.round(v * 100));
        if (row.out.textContent !== txt) row.out.textContent = txt;
      }
    });
    if (rt.live) ruleRows.forEach(row => { row.meter.style.width = Math.round(clamp(rt.live.out.get(row.id) || 0, 0, 1) * 100) + '%'; });

    TRACKERS.forEach(n => {
      const text = !S.trackers[n] ? 'off' : sense.source === 'pointer' ? (n === 'hand' ? 'pointer' : 'needs camera')
        : sense.status[n] !== 'ready' ? STATE_WORDS[sense.status[n]] : sig.has[n] ? 'tracking' : 'searching';
      say('st-' + n, text);
    });
    say('senseCap', sense.caption());
    const src = sense.source === 'camera' ? `Camera${sense.ms ? ', ' + Math.round(sense.ms) + ' ms a frame' : ''}` : 'Pointer plays the hand';
    say('barStatus', src);
  }

  function frame(now) {
    const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    const step = rt.paused ? 0 : dt, design = S.mode === 'design';
    rt.t += step;
    const holdTo = design && (rt.ptr.inside || rt.drag) ? 1 : 0;
    rt.hold += (holdTo - rt.hold) * (1 - Math.exp(-dt * 12));
    if (Math.abs(holdTo - rt.hold) < .003) rt.hold = holdTo;

    // in Perform the pointer hand works straight on the poster
    if (sense.source === 'pointer' && !design && rt.ptr.inside) {
      const p = LI.fromPoster(rt.ptr);
      sense.pad.x = p.x; sense.pad.y = p.y; sense.pad.down = rt.down;
    }
    if (!rt.paused) sense.update(rt.t, step);
    rt.live = LI.computeLive(LI.sig, step, rt.memo, 1 - rt.hold);

    rt.items = LI.paint(ctx, rt.W, rt.H, rt.t, { live: rt.live, buf: rt.buf, play: 1 - rt.hold });
    if (S.mirror && rt.hold < .5) sense.drawGhost(ctx, rt.W, rt.H, rt.px);
    LI.drawChrome();
    sense.draw(senseCtx, senseCv.width, senseCv.height);

    if (job && job.kind === 'video') {
      drawOut(job.o);
      const share = (now - job.start) / job.ms;
      setJob('Recording video', share);
      if (share >= 1) stopJob();
    } else if (job && job.phase === 'capture') {
      if (now >= job.next) {
        drawOut(job.o);
        job.frames.push(pack(job.o.c.getImageData(0, 0, job.o.cv.width, job.o.cv.height).data));
        job.next = Math.max(job.next + job.gap, now + job.gap * .5);
      }
      const share = (now - job.start) / job.ms;
      setJob('Recording GIF', share);
      if (share >= 1) stopJob();
    }

    paintLive();
    const key = rt.paused ? 'paused' : !design ? 'live' : holdTo ? 'hold' : 'play';
    if (shown.statusKey !== key) {
      shown.statusKey = key;
      $('status').textContent = key === 'paused' ? 'Paused' : key === 'hold' ? 'Holding still for editing' : key === 'play' ? 'Listening to the body' : '';
      $('status').className = 'status ' + key;
    }
    requestAnimationFrame(frame);
  }

  // ---------- boot ----------

  function boot() {
    let restored = false, ready = false;
    try {
      const saved = localStorage.getItem(STORE);
      if (saved) { LI.deserialize(JSON.parse(saved), () => { if (ready) refresh(); }); restored = S.elements.length > 0; }
    } catch (e) { restored = false; }
    if (!restored) LI.loadStarter('flex');
    S.mode = 'design';
    fresh();
    sense.init($('cam'));
    buildControls();
    buildStatic();
    bind();
    LI.initEditor(canvas);
    fitBoard();
    ready = true;
    refresh();
    commit();
    requestAnimationFrame(frame);
  }

  boot();
})();

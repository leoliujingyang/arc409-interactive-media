(() => {
  'use strict';

  // Rules connect what the body does to what the poster does.
  // A rule reads one source (a signal from 0 to 1, or a point on the poster) and drives one effect on one target.
  const LI = window.LI, { clamp, lerp, smooth, TAU } = LI;

  // ---------- what can be read ----------

  // def: the effect a fresh rule gets when this signal is picked
  LI.SIGNALS = [
    { id: 'hand.pinch',   group: 'hand', label: 'Pinch',           note: 'Thumb and index finger closing',  def: 'stretch' },
    { id: 'hand.open',    group: 'hand', label: 'Open hand',       note: 'From fist to open palm',          def: 'scale' },
    { id: 'hand.x',       group: 'hand', label: 'Hand across',     note: 'Left to right',                   def: 'x' },
    { id: 'hand.y',       group: 'hand', label: 'Hand height',     note: 'Low to high',                     def: 'y' },
    { id: 'hand.spin',    group: 'hand', label: 'Twist',           note: 'Hand tilting left or right',      def: 'rotate' },
    { id: 'hand.near',    group: 'hand', label: 'Hand closeness',  note: 'Hand moving toward the camera',   def: 'scale' },
    { id: 'hand.speed',   group: 'hand', label: 'Hand speed',      note: 'How fast the hand moves',         def: 'fx.trail' },
    { id: 'hand.fingers', group: 'hand', label: 'Fingers up',      note: 'Zero to five fingers',            def: 'echo' },
    { id: 'hand.spread',  group: 'hand', label: 'Hands apart',     note: 'Distance between two hands',      def: 'zoom' },
    { id: 'hand.fist',    group: 'hand', label: 'Fist',            note: 'On while the hand is closed',     def: 'mutate' },
    { id: 'hand.peace',   group: 'hand', label: 'Peace sign',      note: 'Index and middle finger up',      def: 'palette' },
    { id: 'hand.point',   group: 'hand', label: 'Pointing',        note: 'Only the index finger up',        def: 'pulse' },

    { id: 'face.mouth',   group: 'face', label: 'Mouth open',      note: 'Closed to wide open',             def: 'stretch' },
    { id: 'face.smile',   group: 'face', label: 'Smile',           note: 'Neutral to big smile',            def: 'colour' },
    { id: 'face.brow',    group: 'face', label: 'Eyebrows up',     note: 'Relaxed to raised',               def: 'wave' },
    { id: 'face.blink',   group: 'face', label: 'Eyes closed',     note: 'On while the eyes are shut',      def: 'pulse' },
    { id: 'face.tilt',    group: 'face', label: 'Head tilt',       note: 'Ear toward shoulder',             def: 'rotate' },
    { id: 'face.turn',    group: 'face', label: 'Head turn',       note: 'Looking left to right',           def: 'x' },
    { id: 'face.nod',     group: 'face', label: 'Head nod',        note: 'Looking down to up',              def: 'y' },
    { id: 'face.near',    group: 'face', label: 'Face closeness',  note: 'Stepping toward the camera',      def: 'scale' },
    { id: 'face.x',       group: 'face', label: 'Face across',     note: 'Left to right',                   def: 'x' },

    { id: 'body.arms',    group: 'body', label: 'Arms raised',     note: 'Both arms, down to up',           def: 'y' },
    { id: 'body.left',    group: 'body', label: 'Left arm',        note: 'Left hand, low to high',          def: 'scale' },
    { id: 'body.right',   group: 'body', label: 'Right arm',       note: 'Right hand, low to high',         def: 'scale' },
    { id: 'body.span',    group: 'body', label: 'Arm span',        note: 'Hands together to wide apart',    def: 'stretch' },
    { id: 'body.lean',    group: 'body', label: 'Lean',            note: 'Shoulders tipping left or right', def: 'tilt' },
    { id: 'body.near',    group: 'body', label: 'Body closeness',  note: 'Stepping toward the camera',      def: 'zoom' },
    { id: 'body.x',       group: 'body', label: 'Body across',     note: 'Walking left to right',           def: 'x' },
    { id: 'body.energy',  group: 'body', label: 'Movement',        note: 'How much the body is moving',     def: 'fx.slice' },

    { id: 'clock.wave',   group: 'clock', label: 'Slow wave',      note: 'Rises and falls on its own',      def: 'stretch' },
    { id: 'clock.beat',   group: 'clock', label: 'Beat',           note: 'A steady pulse',                  def: 'scale' },
    { id: 'clock.drift',  group: 'clock', label: 'Drift',          note: 'Wanders without a pattern',       def: 'x' }
  ];

  LI.POINTS = [
    { id: 'hand.tip',   group: 'hand', label: 'Fingertip',        note: 'Tip of the index finger' },
    { id: 'hand.palm',  group: 'hand', label: 'Palm',             note: 'Centre of the hand' },
    { id: 'hand2.tip',  group: 'hand', label: 'Second fingertip', note: 'Index finger of the other hand' },
    { id: 'face.nose',  group: 'face', label: 'Nose',             note: 'Where the face is' },
    { id: 'body.lw',    group: 'body', label: 'Left wrist',       note: 'Left hand of the body' },
    { id: 'body.rw',    group: 'body', label: 'Right wrist',      note: 'Right hand of the body' },
    { id: 'body.chest', group: 'body', label: 'Chest',            note: 'Between the shoulders' }
  ];

  LI.GROUPS = { hand: 'Hand', face: 'Face', body: 'Body', clock: 'Clock' };
  LI.sourceOf = id => LI.SIGNALS.find(s => s.id === id) || LI.POINTS.find(p => p.id === id) || null;
  LI.isPoint = id => LI.POINTS.some(p => p.id === id);
  const groupOf = id => id.split('.')[0].replace('hand2', 'hand');

  // live readings, written by sense.js every frame
  LI.sig = { v: {}, p: {}, has: { hand: false, face: false, body: false, clock: true } };

  // ---------- what can be driven ----------

  // kind: el (a property of elements), point (a pull toward a tracked point), poster (the whole poster), action (fires once)
  LI.PROPS = {
    x:        { label: 'Move sideways',  kind: 'el', min: -60, max: 60, from: -25, to: 25, unit: '%' },
    y:        { label: 'Move up',        kind: 'el', min: -60, max: 60, from: 0, to: 30, unit: '%' },
    scale:    { label: 'Size',           kind: 'el', min: 10, max: 300, from: 60, to: 150, unit: '%' },
    rotate:   { label: 'Rotate',         kind: 'el', min: -180, max: 180, from: -45, to: 45, unit: '°' },
    stretch:  { label: 'Stretch',        kind: 'el', min: 0, max: 100, from: 0, to: 100 },
    opacity:  { label: 'Opacity',        kind: 'el', min: 0, max: 100, from: 10, to: 100 },
    colour:   { label: 'Colour blend',   kind: 'el', min: 0, max: 100, from: 0, to: 100 },
    echo:     { label: 'Echo copies',    kind: 'el', min: 1, max: 12, from: 1, to: 8 },
    spacing:  { label: 'Echo spacing',   kind: 'el', min: 0, max: 100, from: 5, to: 60 },
    wave:     { label: 'Letter wave',    kind: 'el', min: 0, max: 100, from: 0, to: 80, only: 'text' },
    depth:    { label: 'Depth',          kind: 'el', min: 0, max: 100, from: 0, to: 80, only: 'text' },

    follow:   { label: 'Follow',         kind: 'point', note: 'The element travels with the point' },
    attract:  { label: 'Pull toward',    kind: 'point', note: 'The element leans toward the point when it is near' },
    repel:    { label: 'Push away',      kind: 'point', note: 'The element backs off when the point comes near' },
    aim:      { label: 'Turn to face',   kind: 'point', note: 'The element rotates to point at it' },

    'fx.trail':  { label: 'Trails', kind: 'poster', min: 0, max: 100, from: 0, to: 80 },
    'fx.slice':  { label: 'Slice',  kind: 'poster', min: 0, max: 100, from: 0, to: 70 },
    'fx.wave':   { label: 'Wave',   kind: 'poster', min: 0, max: 100, from: 0, to: 70 },
    'fx.split':  { label: 'Split',  kind: 'poster', min: 0, max: 100, from: 0, to: 60 },
    'fx.mosaic': { label: 'Mosaic', kind: 'poster', min: 0, max: 100, from: 80, to: 0 },
    'fx.grain':  { label: 'Grain',  kind: 'poster', min: 0, max: 100, from: 0, to: 60 },
    zoom:     { label: 'Zoom',           kind: 'poster', min: 40, max: 250, from: 85, to: 135, unit: '%' },
    tilt:     { label: 'Tilt',           kind: 'poster', min: -45, max: 45, from: -10, to: 10, unit: '°' },

    mutate:   { label: 'Mutate layout',  kind: 'action', note: 'A new arrangement each time it fires' },
    palette:  { label: 'Next palette',   kind: 'action', note: 'Steps to the next palette each time it fires' },
    pulse:    { label: 'Pulse',          kind: 'action', note: 'Everything jumps in size, then settles' }
  };

  LI.GROUP_TARGETS = [['@all', 'Every element'], ['@text', 'All type'], ['@shape', 'All shapes']];

  LI.newRule = (source, target, prop) => {
    const P = LI.PROPS[prop] || LI.PROPS.scale;
    return {
      id: LI.ruleId(), on: true, source, target: P.kind === 'poster' || P.kind === 'action' ? 'poster' : target, prop,
      from: P.from == null ? 0 : P.from, to: P.to == null ? 100 : P.to,
      lo: 0, hi: 1, smooth: .35, curve: 'linear',     // how the signal is read
      amount: .8, range: .5,                          // point rules
      at: .6                                          // action rules: the level that fires them
    };
  };

  // effects that make sense for a source and a target, in menu order
  LI.propsFor = (source, target) => Object.keys(LI.PROPS).filter(k => {
    const P = LI.PROPS[k];
    if (LI.isPoint(source)) return P.kind === 'point' && target !== 'poster';
    if (target === 'poster') return P.kind === 'poster' || P.kind === 'action';
    if (P.kind !== 'el') return false;
    const el = LI.byId(target);
    return !(P.only === 'text' && (target === '@shape' || (el && el.type !== 'text')));
  });

  // keeps a rule coherent after its source or target changed
  LI.fitRule = r => {
    if (LI.isPoint(r.source) && r.target === 'poster') r.target = '@all';
    const ok = LI.propsFor(r.source, r.target);
    if (!ok.includes(r.prop)) {
      r.prop = ok[0];
      const P = LI.PROPS[r.prop];
      if (P.from != null) { r.from = P.from; r.to = P.to; }
    }
    return r;
  };

  const targetsOf = t => {
    const els = LI.cur.elements;
    if (t === '@all') return els;
    if (t === '@text') return els.filter(e => e.type === 'text');
    if (t === '@shape') return els.filter(e => e.type !== 'text');
    const el = LI.byId(t);
    return el ? [el] : [];
  };
  LI.targetsOf = targetsOf;
  LI.targetLabel = t => {
    if (t === 'poster') return 'Poster';
    const g = LI.GROUP_TARGETS.find(x => x[0] === t);
    if (g) return g[1];
    const el = LI.byId(t);
    return el ? el.name : 'Missing element';
  };

  // ---------- evaluation ----------

  const rest = () => ({ x: 0, y: 0, scale: 1, rot: 0, stretch: 0, opacity: 1, colour: null, echo: null, gap: null, wave: null, depth: null, pts: [] });
  const REST = Object.freeze(Object.assign(rest(), { pts: Object.freeze([]) }));
  const STILL = { els: new Map(), fx: null, zoom: 1, tilt: 0, kick: 0, light: null, hist: null, out: new Map() };

  // rule: eased values per rule; hist: recent states per element, so echo copies can lag behind in time
  LI.newMemo = () => ({ rule: new Map(), hist: new Map(), kick: 0, act: null });

  // Turns this frame's readings into what every element and the poster should do.
  // play scales everything toward rest (used while the designer is editing).
  LI.computeLive = function (sig, dt, memo, play = 1) {
    const S = LI.cur, live = { els: new Map(), fx: Object.assign({}, S.fx), zoom: 1, tilt: 0, kick: 0, light: null, hist: memo.hist, out: new Map() };
    const mod = id => { let m = live.els.get(id); if (!m) { m = rest(); live.els.set(id, m); } return m; };
    const ease = (key, target, rate) => {
      const prev = memo.rule.get(key);
      const v = prev == null ? target : prev + (target - prev) * (1 - Math.exp(-dt * rate));
      memo.rule.set(key, v);
      return v;
    };

    S.rules.forEach(r => {
      const P = LI.PROPS[r.prop];
      if (!r.on || !P) return;
      // a rule fades out when its source leaves the frame, so the poster settles instead of freezing
      const w = ease(r.id + ':w', sig.has[groupOf(r.source)] ? 1 : 0, 6) * play;

      if (P.kind === 'point') {
        const p = sig.p[r.source];
        if (p && p.on) memo.rule.set(r.id + ':p', { x: p.x, y: p.y });
        const last = memo.rule.get(r.id + ':p');
        live.out.set(r.id, w);
        if (!last || w < .002) return;
        targetsOf(r.target).forEach(el => mod(el.id).pts.push({ kind: r.prop, x: last.x, y: last.y, amount: r.amount * w, range: r.range }));
        return;
      }

      let v = clamp(((sig.v[r.source] || 0) - r.lo) / Math.max(.02, r.hi - r.lo), 0, 1);
      if (r.curve === 'ease') v = smooth(v); else if (r.curve === 'sharp') v = v * v; else if (r.curve === 'snap') v = v > .5 ? 1 : 0;
      v = ease(r.id + ':v', v, lerp(40, 1.4, r.smooth));
      live.out.set(r.id, v * (w > .02 ? 1 : 0));

      if (P.kind === 'action') {
        const armed = memo.rule.get(r.id + ':armed') !== 0;
        if (armed && v >= r.at && w > .5) {
          memo.rule.set(r.id + ':armed', 0);
          if (r.prop === 'pulse') memo.kick = 1;
          else if (memo.act) memo.act(r.prop);
        } else if (!armed && v < r.at - .2) memo.rule.set(r.id + ':armed', 1);
        return;
      }

      const out = lerp(r.from, r.to, v);
      if (P.kind === 'poster') {
        if (r.prop === 'zoom') live.zoom *= lerp(1, out / 100, w);
        else if (r.prop === 'tilt') live.tilt += out * w;
        else { const k = r.prop.slice(3); live.fx[k] = lerp(live.fx[k] || 0, out / 100, w); }
        return;
      }

      targetsOf(r.target).forEach(el => {
        const m = mod(el.id);
        switch (r.prop) {
          case 'x': m.x += out / 100 * w; break;
          case 'y': m.y -= out / 100 * w; break;
          case 'scale': m.scale *= lerp(1, out / 100, w); break;
          case 'rotate': m.rot += out * w; break;
          case 'stretch': m.stretch += out / 100 * w; break;
          case 'opacity': m.opacity *= lerp(1, out / 100, w); break;
          case 'colour': m.colour = lerp(m.colour || 0, out / 100, w); break;
          case 'echo': m.echo = lerp(m.echo == null ? el.echo.count : m.echo, out, w); break;
          case 'spacing': m.gap = lerp(m.gap == null ? el.echo.gap : m.gap, out / 100, w); break;
          case 'wave': m.wave = lerp(el.wave || 0, out / 100, w); break;
          case 'depth': m.depth = lerp(el.depth || 0, out / 100, w); break;
        }
      });
    });

    // the pulse action: one kick that dies away
    live.kick = memo.kick * play;
    memo.kick *= Math.exp(-dt * 5);
    if (memo.kick < .002) memo.kick = 0;

    // type depth leans away from whichever tracked point is around
    const lp = ['hand.tip', 'face.nose', 'body.chest'].map(k => sig.p[k]).find(p => p && p.on);
    live.light = lp ? { x: lp.x, y: lp.y } : null;

    if (dt > 0) {
      S.elements.forEach(el => {
        if (el.echo.count < 2 && !(live.els.get(el.id) || REST).echo) { memo.hist.delete(el.id); return; }
        let h = memo.hist.get(el.id);
        if (!h) memo.hist.set(el.id, h = []);
        h.push(live.els.get(el.id) || REST);
        if (h.length > 140) h.shift();
      });
    }
    return live;
  };

  const turn = (to, from) => { let d = (to - from) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

  // one entry per drawn copy of every element, posed for this frame
  LI.evalScene = function (w, h, t, opts = {}) {
    const S = LI.cur, live = opts.live || STILL, minD = Math.min(w, h), play = opts.play == null ? 1 : opts.play;
    const homes = LI.layout(w, h, S.layout), items = [];
    const light = live.light ? { x: live.light.x * w, y: live.light.y * h } : null;
    S.elements.forEach((el, i) => {
      const hm = homes[i], now = live.els.get(el.id) || REST, hist = live.hist && live.hist.get(el.id);
      const cps = LI.copiesFor(el, hm, minD, now);
      cps.forEach((cp, k) => {
        // later copies replay what the first one did a moment ago
        const back = Math.round(k * el.echo.lag * 16);
        const m = k && hist && hist.length > back ? hist[hist.length - 1 - back] : now;
        const it = {
          el, i, k, hx: hm.x + cp.ox, hy: hm.y + cp.oy, size: hm.size, maxW: hm.maxW, fitW: hm.fitW || 0, crowd: cps.length, amp: 1,
          baseRot: hm.rot + el.rotation * Math.PI / 180
        };
        let dx = m.x * w, dy = m.y * h, rot = m.rot * Math.PI / 180;
        m.pts.forEach(p => {
          const vx = p.x * w - it.hx, vy = p.y * h - it.hy, d = Math.hypot(vx, vy) || 1;
          if (p.kind === 'follow') { dx += vx * p.amount; dy += vy * p.amount; }
          else if (p.kind === 'aim') rot += turn(Math.atan2(vy, vx) + Math.PI / 2, it.baseRot) * p.amount;
          else {
            const R = lerp(.15, .9, p.range) * minD, pull = p.amount * R * .6 * smooth(1 - d / R);
            const mag = p.kind === 'attract' ? Math.min(pull, d * .9) : -pull;
            dx += vx / d * mag; dy += vy / d * mag;
          }
        });
        it.x = it.hx + dx; it.y = it.hy + dy;
        it.rot = it.baseRot + rot;
        it.sizePx = it.size * m.scale * (1 + live.kick * .3);
        it.sx = 1 + m.stretch * 2;
        it.track = m.stretch * 1.5;
        it.drift = m.stretch * .9 + t * .03;
        it.op = clamp(el.opacity * m.opacity * cp.fade, 0, 1);
        it.t = t; it.play = play; it.ptr = light;
        it.ov = { colour: m.colour, wave: m.wave, depth: m.depth };
        items.push(it);
      });
    });
    items.seed = S.layout.seed;
    return items;
  };

  // ---------- suggested rule sets ----------

  const make = (source, target, prop, extra) => Object.assign(LI.newRule(source, target, prop), extra);

  // Each recipe is written against roles, then resolved to whatever is on the poster right now.
  LI.RECIPES = [
    { id: 'conductor', label: 'Conductor', note: 'One hand leads: pinch, point, twist', trackers: ['hand'],
      build: f => [
        make('hand.pinch', f.anchor, 'stretch', { from: 0, to: 100 }),
        make('hand.tip', f.accent(0), 'follow', { amount: .95 }),
        make('hand.tip', f.accent(1), 'repel', { amount: .8, range: .5 }),
        make('hand.open', f.shape(0), 'scale', { from: 55, to: 125 }),
        make('hand.spin', f.shape(-1), 'rotate', { from: -80, to: 80 }),
        make('hand.speed', 'poster', 'fx.trail', { from: 0, to: 85, smooth: .7 })
      ] },
    { id: 'facetype', label: 'Face type', note: 'Mouth, smile and eyebrows set the type', trackers: ['face'],
      build: f => [
        make('face.mouth', f.anchor, 'stretch', { from: 0, to: 100 }),
        make('face.smile', '@text', 'colour', { from: 0, to: 100 }),
        make('face.brow', f.anchor, 'wave', { from: 0, to: 90 }),
        make('face.tilt', '@shape', 'rotate', { from: -70, to: 70 }),
        make('face.nose', f.accent(0), 'follow', { amount: .9 }),
        make('face.blink', 'poster', 'pulse', { at: .6, smooth: .05 })
      ] },
    { id: 'sculpt', label: 'Body sculpt', note: 'Arms and shoulders shape the poster', trackers: ['body'],
      build: f => [
        make('body.arms', '@shape', 'y', { from: -6, to: 30 }),
        make('body.span', f.anchor, 'stretch', { from: 0, to: 100 }),
        make('body.lean', 'poster', 'tilt', { from: -14, to: 14 }),
        make('body.lw', f.accent(0), 'attract', { amount: .9, range: .6 }),
        make('body.rw', f.accent(1), 'repel', { amount: .9, range: .6 }),
        make('body.energy', 'poster', 'fx.slice', { from: 0, to: 75, smooth: .6 })
      ] },
    { id: 'closer', label: 'Come closer', note: 'Abstract from afar, sharp up close', trackers: ['face'],
      build: f => [
        make('face.near', 'poster', 'fx.mosaic', { from: 85, to: 0, smooth: .5 }),
        make('face.near', f.anchor, 'scale', { from: 55, to: 115, smooth: .5 }),
        make('face.near', '@shape', 'opacity', { from: 12, to: 100, smooth: .5 }),
        make('face.x', '@shape', 'x', { from: -14, to: 14, smooth: .5 }),
        make('face.turn', f.anchor, 'x', { from: 8, to: -8, smooth: .5 })
      ] },
    { id: 'magnets', label: 'Magnets', note: 'Two hands: one pulls, one pushes', trackers: ['hand'],
      build: f => [
        make('hand.tip', '@shape', 'attract', { amount: .9, range: .55 }),
        make('hand2.tip', '@text', 'repel', { amount: .7, range: .6 }),
        make('hand.spread', 'poster', 'zoom', { from: 80, to: 135, smooth: .5 }),
        make('hand.pinch', 'poster', 'fx.split', { from: 0, to: 70 })
      ] },
    { id: 'signs', label: 'Signs', note: 'Gestures fire events', trackers: ['hand'],
      build: f => [
        make('hand.peace', 'poster', 'palette', { at: .6, smooth: .15 }),
        make('hand.fist', 'poster', 'mutate', { at: .6, smooth: .15 }),
        make('hand.point', 'poster', 'pulse', { at: .6, smooth: .05 }),
        make('hand.fingers', f.shape(0), 'echo', { from: 1, to: 6 }),
        make('hand.tip', f.accent(0), 'follow', { amount: .9 })
      ] },
    { id: 'clockwork', label: 'Clockwork', note: 'No body needed, it idles on its own', trackers: [],
      build: f => [
        make('clock.wave', f.anchor, 'stretch', { from: 0, to: 90 }),
        make('clock.drift', '@shape', 'x', { from: -8, to: 8, smooth: .6 }),
        make('clock.beat', f.accent(0), 'scale', { from: 100, to: 150, smooth: .2 })
      ] }
  ];

  LI.applyRecipe = id => {
    const rec = LI.RECIPES.find(r => r.id === id), S = LI.cur;
    if (!rec) return null;
    // roles go by the order elements were made, so restacking the layers does not reshuffle a suggestion
    const made = S.elements.slice().sort((p, q) => p.num - q.num);
    const texts = made.filter(e => e.type === 'text'), shapes = made.filter(e => e.type !== 'text');
    const accents = shapes.filter(e => e.role === 'accent'), bodies = shapes.filter(e => e.role !== 'accent');
    const pick = (list, i, fallback) => list.length ? list[((i % list.length) + list.length) % list.length].id : fallback;
    const f = {
      anchor: (texts.find(e => e.role === 'anchor') || texts[0] || { id: '@text' }).id,
      accent: i => pick(accents.length ? accents : shapes, i, '@shape'),
      shape: i => pick(bodies.length ? bodies : shapes, i, '@shape')
    };
    S.rules = rec.build(f).map(LI.fitRule);
    S.trackers = { hand: rec.trackers.includes('hand'), face: rec.trackers.includes('face'), body: rec.trackers.includes('body') };
    S.selectedRule = null;
    return rec;
  };
})();

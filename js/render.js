(() => {
  'use strict';

  const LI = window.LI, { TAU, clamp, lerp, hash, noise } = LI;
  const mctx = LI.mctx = document.createElement('canvas').getContext('2d');

  const RULE_W = { 400: .075, 500: .085, 600: .1, 800: .13, 900: .15 };
  const charCache = new Map();
  function charW(fontKey, ch) {
    const k = fontKey + ch;
    let v = charCache.get(k);
    if (v == null) { mctx.font = fontKey; v = mctx.measureText(ch).width / 100; charCache.set(k, v); }
    return v;
  }

  // Lays a text element out glyph by glyph so tracking can be uneven and gaps can carry rules.
  // key picks the gap pattern (each echo copy gets its own), drift moves the pattern over time.
  LI.textBlock = function (el, fs, track, maxW, fitW, key, drift, seed) {
    const fam = LI.FONT_MAP[el.fontFamily] || LI.FONT_MAP.sans, fk = `${el.fontWeight} 100px ${fam}`;
    const lines = String(el.text || '').split('\n').map(str => {
      const chars = Array.from(str), ws = chars.map(ch => charW(fk, ch));
      return { chars, ws, nat: ws.reduce((s, x) => s + x, 0) };
    });
    const maxNat = Math.max(.0001, ...lines.map(l => l.nat));
    const f = maxNat * fs > maxW ? maxW / maxNat : fs;
    const widths = lines.map(l => Math.min(maxW, l.nat * f + track * f * Math.max(0, l.chars.length - 1)));
    let target = null;
    if (fitW) target = Math.min(maxW, Math.max(fitW, maxNat * f));
    else if (el.justify) target = Math.max(...widths);
    const lh = f * .92, pad = f * .05, out = [];
    lines.forEach((l, li) => {
      const gaps = Math.max(0, l.chars.length - 1);
      const total = target != null && gaps > 0 ? target : widths[li];
      const extra = Math.max(0, total - l.nat * f);
      const wts = [];
      let sum = 0;
      for (let j = 0; j < gaps; j++) {
        const nz = noise(drift + j * 31.7 + li * 113.3 + key * 57.1, seed);
        const wv = lerp(1, Math.pow(nz, 5) * 12 + .015, el.gapRhythm || 0);
        wts.push(wv); sum += wv;
      }
      let x = -total / 2;
      const glyphs = [], rules = [];
      l.chars.forEach((ch, j) => {
        glyphs.push({ ch, x, w: l.ws[j] * f });
        x += l.ws[j] * f;
        if (j < gaps) {
          const gp = extra * wts[j] / sum;
          if (el.rule && gp > f * .2 && ch !== ' ' && l.chars[j + 1] !== ' ') rules.push({ x0: x + pad, x1: x + gp - pad });
          x += gp;
        }
      });
      out.push({ glyphs, rules, y: (li - (lines.length - 1) / 2) * lh, w: total });
    });
    return { lines: out, f, bw: Math.max(f * .3, ...out.map(o => o.w)), bh: lines.length * lh, font: `${el.fontWeight} ${f}px ${fam}` };
  };

  LI.ptsBounds = pts => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
    return { x0, y0, x1, y1 };
  };

  // closed polygon, or a closed curve through the same points when smooth is on
  const K = 1 / 5.33;
  LI.tracePath = function (c, pts, s, sx, smoothOn) {
    const n = pts.length, X = p => p.x * s * sx, Y = p => p.y * s;
    c.beginPath();
    if (!smoothOn || n < 3) {
      pts.forEach((p, i) => i ? c.lineTo(X(p), Y(p)) : c.moveTo(X(p), Y(p)));
    } else {
      const P = i => pts[(i + n) % n];
      c.moveTo(X(P(0)), Y(P(0)));
      for (let i = 0; i < n; i++) {
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
        c.bezierCurveTo(
          (p1.x + (p2.x - p0.x) * K) * s * sx, (p1.y + (p2.y - p0.y) * K) * s,
          (p2.x - (p3.x - p1.x) * K) * s * sx, (p2.y - (p3.y - p1.y) * K) * s,
          X(p2), Y(p2));
      }
    }
    c.closePath();
  };

  LI.shapePathD = function (pts, smoothOn, s = 20) {
    const n = pts.length, r = v => +(v * s).toFixed(2);
    if (!smoothOn || n < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${r(p.x)} ${r(p.y)}`).join('') + 'Z';
    const P = i => pts[(i + n) % n];
    let d = `M${r(P(0).x)} ${r(P(0).y)}`;
    for (let i = 0; i < n; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      d += `C${r(p1.x + (p2.x - p0.x) * K)} ${r(p1.y + (p2.y - p0.y) * K)} ${r(p2.x - (p3.x - p1.x) * K)} ${r(p2.y - (p3.y - p1.y) * K)} ${r(p2.x)} ${r(p2.y)}`;
    }
    return d + 'Z';
  };

  function hierScale(el, hier, seed) {
    if (hier < .02) return 1;
    const base = el.role === 'anchor' ? 1.35 : el.role === 'accent' ? 1.05 : .9;
    const jitter = lerp(1, lerp(.72, 1.28, hash(el.num + 503, seed)), hier);
    return lerp(1, base * jitter, hier);
  }

  LI.cropZoom = v => v.treatment === 'crop' ? lerp(1.45, 2.1, hash(701, v.seed)) : 1;

  // Rest pose of every element for one medium: grammar, then the medium treatment, then manual nudges.
  LI.layout = function (w, h, v) {
    const S = LI.cur, els = S.elements, n = els.length;
    if (!n) return [];
    const minD = Math.min(w, h), aspect = w / h, seed = v.seed, H = k => hash(k, seed);
    const focus = clamp(S.focus + v.dFocus, 0, 1), spreadN = clamp(S.spread + v.dSpread, 0, 1), hier = clamp(S.hierarchy + v.dHier, 0, 1);
    const spread = lerp(.14, .42, spreadN), wild = (1 - S.sync) * (1 - S.sync);
    let a = els.findIndex(e => e.role === 'anchor');
    if (a < 0) a = 0;
    const rank = i => i < a ? i : i - 1, others = Math.max(1, n - 1);
    const pts = [];

    if (S.grammar === 'grid') {
      const cols = clamp(Math.round(Math.sqrt(n * aspect)), 1, n), rows = Math.ceil(n / cols);
      const mx = w * lerp(.2, .1, spreadN), my = h * lerp(.2, .1, spreadN), j = wild * minD * .12;
      for (let i = 0; i < n; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const x = cols === 1 ? w / 2 : lerp(mx, w - mx, c / (cols - 1));
        const y = rows === 1 ? h / 2 : lerp(my, h - my, r / (rows - 1));
        pts.push({ x: x + (H(i * 7) - .5) * j, y: y + (H(i * 11) - .5) * j, rot: 0 });
      }
    } else if (S.grammar === 'orbit') {
      const cx = w * (.5 + (focus - .5) * .18), cy = h * (.47 + (focus - .5) * .08);
      const radius = minD * lerp(.18, .39, spreadN);
      for (let i = 0; i < n; i++) {
        if (i === a) { pts.push({ x: cx, y: cy, rot: 0 }); continue; }
        const ang = -Math.PI / 2 + rank(i) / others * TAU + H(i) * .25 + H(77) * TAU;
        const rr = radius * lerp(.65, 1.08, H(i + 30));
        pts.push({ x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr, rot: els[i].type === 'text' ? 0 : ang + Math.PI / 2 });
      }
    } else if (S.grammar === 'flow') {
      const vertical = aspect < 1.2, ph = H(41) * TAU;
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? .5 : i / (n - 1);
        const x = vertical ? w * (.5 + (u - .5) * .3 * (focus - .5) * 2) + Math.sin(u * TAU + ph) * w * .34 * spread : w * lerp(.12, .88, u);
        const y = vertical ? h * lerp(.13, aspect > .9 ? .78 : .85, u) : h * (.5 + .22 * Math.sin(u * Math.PI * 1.25 + ph) * lerp(.4, 1.3, spreadN));
        pts.push({ x, y, rot: (H(i + 70) - .5) * .9 * wild });
      }
    } else {
      // cluster: one centre of gravity, the rest spiral out from it
      const cx = w * (.47 + (focus - .5) * .18), cy = h * (.48 + (focus - .5) * .1);
      for (let i = 0; i < n; i++) {
        if (i === a) { pts.push({ x: cx, y: cy, rot: 0 }); continue; }
        const k = rank(i) + 1;
        const ang = k * 2.399963229728653 + (H(k + 10) - .5) * .45 + H(78) * TAU;
        const rr = minD * spread * (.38 + .92 * Math.sqrt(k / others)) * lerp(.6, 1.2, H(k + 22));
        const loose = focus * minD * .18;
        pts.push({ x: cx + Math.cos(ang) * rr + (H(k + 110) - .5) * loose, y: cy + Math.sin(ang) * rr + (H(k + 210) - .5) * loose, rot: (H(k + 90) - .5) * .8 * wild });
      }
    }

    pts.forEach((p, i) => { p.size = els[i].size * minD * hierScale(els[i], hier, seed); p.maxW = w * .92; });
    const addNudge = () => els.forEach((el, i) => { const nd = v.nudge[el.id]; if (nd) { pts[i].x += nd.x * w; pts[i].y += nd.y * h; } });
    const natural = (el, size) => {
      if (el.type === 'text') { const tb = LI.textBlock(el, size, (el.tracking || 0) * 1.2, 1e9, 0, 0, 0, seed); return { bw: tb.bw, bh: tb.bh }; }
      const b = LI.ptsBounds(el.points);
      return { bw: Math.max(1, (b.x1 - b.x0) * size), bh: Math.max(1, (b.y1 - b.y0) * size) };
    };

    if (v.treatment === 'stack' || v.treatment === 'tile') {
      const tile = v.treatment === 'tile';
      const order = els.map((_, i) => i).sort((p, q) => H(900 + els[p].num) - H(900 + els[q].num));
      const mX = w * .06, mY = h * .055, gapY = h * .02, W = w - mX * 2;
      const wt = order.map(i => {
        const el = els[i], b = el.type === 'text' ? (el.role === 'anchor' ? 2.3 : .9) : el.type === 'image' ? 2 : 1.4;
        return tile ? b * lerp(.75, 1.35, H(930 + el.num)) : b;
      });
      const sum = wt.reduce((s, x) => s + x, 0), usable = h - mY * 2 - gapY * (n - 1);
      let y = mY;
      order.forEach((i, r) => {
        const el = els[i], p = pts[i], bandH = usable * wt[r] / sum, cy = y + bandH / 2;
        y += bandH + gapY;
        p.rot = 0; p.maxW = W;
        if (!tile) {
          const nat = natural(el, 100);
          if (el.type === 'text') {
            const bare = LI.textBlock(el, 100, 0, 1e9, 0, 0, 0, seed).bw;
            p.size = Math.min(bandH * .96 * 100 / nat.bh, W * 100 / bare);
            p.x = w / 2; p.fitW = W;
          } else {
            // a shape fills its row: as tall as the band, repeated across the width
            p.size = Math.min(bandH * .92 * 100 / nat.bh, W * 100 / nat.bw);
            const bw = nat.bw / 100 * p.size, b = LI.ptsBounds(el.points), padX = bw * .14;
            const nx = clamp(Math.floor((W + padX) / (bw + padX)), 1, 12);
            const left = nx > 1 ? mX : mX + (W - bw) * [0, .5, 1][Math.floor(H(960 + el.num) * 3) % 3];
            p.x = left - b.x0 * p.size;
            p.grid = { nx, ny: 1, dx: nx > 1 ? (W - bw) / (nx - 1) : 0, dy: 0, lag: .16 };
          }
          const b = el.type === 'text' ? null : LI.ptsBounds(el.points);
          p.y = b ? cy - (b.y0 + b.y1) / 2 * p.size : cy;
          if (!p.grid) p.grid = { nx: 1, ny: 1, dx: 0, dy: 0, lag: 0 };
        } else {
          let nat = natural(el, p.size);
          const fit = Math.min(1, W / nat.bw, bandH / nat.bh);
          p.size *= fit; nat = { bw: nat.bw * fit, bh: nat.bh * fit };
          const fill = el.type === 'text' && nat.bw > W * .45;
          if (fill) { p.fitW = W; nat.bw = W; }
          const padX = el.type === 'text' ? p.size * .6 : nat.bw * .16, padY = el.type === 'text' ? 0 : nat.bh * .16;
          let nx = fill ? 1 : Math.max(1, Math.floor((W + padX) / (nat.bw + padX)));
          let ny = Math.max(1, Math.floor((bandH + padY) / (nat.bh + padY)));
          while (nx * ny > 48) { if (nx >= ny) nx--; else ny--; }
          const dx = nx > 1 ? (W - nat.bw) / (nx - 1) : 0, dy = nat.bh + padY;
          const b = el.type === 'text' ? { x0: -.5 * nat.bw / p.size, x1: .5 * nat.bw / p.size, y0: -.5 * nat.bh / p.size, y1: .5 * nat.bh / p.size } : LI.ptsBounds(el.points);
          p.x = (nx > 1 ? mX : w / 2 - nat.bw / 2) - b.x0 * p.size;
          p.y = cy - (ny - 1) * dy / 2 - (b.y0 + b.y1) / 2 * p.size;
          p.grid = { nx, ny, dx, dy, lag: .14 };
        }
      });
      addNudge();
    } else {
      addNudge();
      if (v.treatment === 'crop') {
        // pivot sits between the anchor and the middle of the group, so neighbours stay in frame
        const Z = LI.cropZoom(v);
        const mx = pts.reduce((t, p) => t + p.x, 0) / n, my = pts.reduce((t, p) => t + p.y, 0) / n;
        const px = lerp(mx, pts[a].x, .7), py = lerp(my, pts[a].y, .7);
        const cx = w * (.5 + (H(702) - .5) * .3), cy = h * (.5 + (H(703) - .5) * .3);
        pts.forEach(p => { p.x = cx + (p.x - px) * Z; p.y = cy + (p.y - py) * Z; p.size *= Z; p.maxW *= Z; p.zoom = Z; });
      }
    }
    return pts;
  };

  // offsets of every drawn copy relative to the element's rest position
  // m carries what the rules ask for this frame; it can override how many copies there are and how far apart
  LI.copiesFor = function (el, hm, minD, m) {
    const out = [];
    if (hm.grid) {
      const g = hm.grid;
      for (let iy = 0; iy < g.ny; iy++) for (let ix = 0; ix < g.nx; ix++) out.push({ ox: ix * g.dx, oy: iy * g.dy, lag: (ix + iy) * g.lag, fade: 1 });
      return out;
    }
    const e = el.echo, n = clamp(Math.round(m && m.echo != null ? m.echo : e.count), 1, 12), a = e.angle * Math.PI / 180;
    const gp = (m && m.gap != null ? m.gap : e.gap) * .4 * minD * (hm.zoom || 1);
    for (let k = 0; k < n; k++) {
      out.push({ ox: Math.cos(a) * gp * k, oy: Math.sin(a) * gp * k, lag: k * e.lag * 1.2, fade: 1 - e.fade * (n > 1 ? k / (n - 1) : 0) * .92 });
    }
    return out;
  };

  function drawCover(c, img, x, y, w, h) {
    const ir = img.naturalWidth / img.naturalHeight, rr = w / h;
    let sw, sh, sx, sy;
    if (ir > rr) { sh = img.naturalHeight; sw = sh * rr; sx = (img.naturalWidth - sw) / 2; sy = 0; }
    else { sw = img.naturalWidth; sh = sw / rr; sx = 0; sy = (img.naturalHeight - sh) / 2; }
    c.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  // ---------- paint ----------

  const hexRGB = h => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
    const n = m ? parseInt(m[1], 16) : 0;
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  };
  const tri = x => 1 - Math.abs(2 * (x - Math.floor(x)) - 1);

  // Colour of an element at position p (0 to 1 across it), blending its two colours.
  // Colour motion slides that blend over time; a gradient paints it smoothly, solid paints it per letter.
  function painter(c, el, it, b) {
    const A = hexRGB(LI.fillOf(el)), B = hexRGB(LI.fill2Of(el));
    // a rule can push the blend toward the second colour on top of any colour motion
    const mix = it.ov && it.ov.colour != null ? it.ov.colour : 0;
    const phase = (el.shift > 0 ? (it.t || 0) * lerp(.06, 1.1, el.shift) * lerp(.35, 2, LI.cur.tempo) : 0) + mix * .5;
    const at = p => {
      const k = tri(p * .5 + phase);
      return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
    };
    if (el.paint === 'gradient') {
      const a = (el.gradAngle || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
      const e = Math.max(1, Math.abs(cs) * b.w / 2 + Math.abs(sn) * b.h / 2), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const g = c.createLinearGradient(cx - cs * e, cy - sn * e, cx + cs * e, cy + sn * e);
      for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, at(i / 8));
      return { flat: g, at: null };
    }
    return phase ? { flat: at(0), at: el.shift > 0 ? at : null } : { flat: LI.fillOf(el), at: null };
  }

  function drawText(c, it, seed) {
    const el = it.el;
    const tb = LI.textBlock(el, it.sizePx, (el.tracking || 0) * 1.2 + it.track, it.maxW, it.fitW, it.k, it.drift, seed);
    const f = tb.f, b = { x: -tb.bw / 2, y: -tb.bh / 2, w: tb.bw, h: tb.bh };
    const pt = painter(c, el, it, b), th = f * (RULE_W[el.fontWeight] || .09);
    const ov = it.ov || {}, depth = ov.depth != null ? ov.depth : el.depth || 0;
    const wave = (ov.wave != null ? ov.wave : el.wave || 0) * (it.play == null ? 1 : it.play);
    const beat = (it.t || 0) * 4.2 * lerp(.35, 2, LI.cur.tempo);
    const lift = x => wave ? Math.sin(x / f * 1.5 - beat) * f * .3 * wave : 0;
    c.font = tb.font; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.lineJoin = 'round'; c.lineWidth = Math.max(1, f * (el.outline || .04));

    // one pass over every glyph and rule; flat forces a single colour
    const run = (ox, oy, flat, hollow) => tb.lines.forEach(ln => {
      const by = ln.y + f * .35 + oy;
      ln.glyphs.forEach(g => {
        const col = flat || pt.at((g.x + g.w / 2 - b.x) / b.w), y = by + lift(g.x);
        if (hollow) { c.strokeStyle = col; c.strokeText(g.ch, g.x + ox, y); }
        else { c.fillStyle = col; c.fillText(g.ch, g.x + ox, y); }
      });
      ln.rules.forEach(r => {
        const col = flat || pt.at(((r.x0 + r.x1) / 2 - b.x) / b.w), y = by - th + (lift(r.x0) + lift(r.x1)) / 2;
        if (hollow) { c.strokeStyle = col; c.strokeRect(r.x0 + ox, y, r.x1 - r.x0, th); }
        else { c.fillStyle = col; c.fillRect(r.x0 + ox, y, r.x1 - r.x0, th); }
      });
    });

    // depth: a block of copies in the second colour, leaning away from the pointer
    const steps = Math.round(depth * (it.crowd > 6 ? 4 : 14));
    if (steps) {
      let dx = .7071, dy = .7071;
      if (it.ptr) {
        const vx = it.hx - it.ptr.x, vy = it.hy - it.ptr.y, d = Math.hypot(vx, vy);
        if (d > 1) { dx = vx / d; dy = vy / d; }
      }
      const cs = Math.cos(it.rot), sn = Math.sin(it.rot), st = f * .24 * depth / steps;
      const lx = (dx * cs + dy * sn) * st, ly = (-dx * sn + dy * cs) * st, shade = LI.fill2Of(el);
      for (let j = steps; j >= 1; j--) run(lx * j, ly * j, shade, false);
    }
    run(0, 0, pt.at ? null : pt.flat, el.paint === 'outline');
    it.bw = tb.bw; it.bh = tb.bh;
  }

  LI.drawItem = function (c, it, seed) {
    const el = it.el, s = it.sizePx;
    if (it.op <= .003 || s <= .5) return;
    c.save();
    c.translate(it.x, it.y); c.rotate(it.rot); c.globalAlpha = it.op;
    if (el.type === 'text') drawText(c, it, seed);
    else {
      const bb = LI.ptsBounds(el.points), b = { x: bb.x0 * s * it.sx, y: bb.y0 * s, w: (bb.x1 - bb.x0) * s * it.sx, h: (bb.y1 - bb.y0) * s };
      LI.tracePath(c, el.points, s, it.sx, el.smooth);
      if (el.type === 'image') {
        if (el.image && el.image.complete && el.image.naturalWidth) { c.clip(); drawCover(c, el.image, b.x, b.y, b.w, b.h); }
        else { c.fillStyle = 'rgba(128,128,128,.3)'; c.fill(); }
      } else if (el.style === 'line') {
        c.strokeStyle = painter(c, el, it, b).flat; c.lineWidth = Math.max(1, (el.weight || .16) * s); c.lineJoin = el.smooth ? 'round' : 'miter';
        c.stroke();
      } else { c.fillStyle = painter(c, el, it, b).flat; c.fill(); }
    }
    c.restore();
  };

  // opts.clear below 1 leaves a share of the last frame behind, which is how trails are made
  LI.renderScene = function (c, w, h, t, opts = {}) {
    return LI.within(opts.medium, () => {
      c.save();
      c.globalAlpha = opts.clear == null ? 1 : opts.clear;
      c.fillStyle = LI.palette().bg;
      c.fillRect(0, 0, w, h);
      c.globalAlpha = 1;
      // rules can zoom and tilt the whole poster about its centre
      const live = opts.live;
      if (live && (live.zoom !== 1 || live.tilt)) {
        c.translate(w / 2, h / 2); c.rotate(live.tilt * Math.PI / 180); c.scale(live.zoom, live.zoom); c.translate(-w / 2, -h / 2);
      }
      const items = LI.evalScene(w, h, t, opts);
      const order = { image: 0, shape: 1, text: 2 };
      items.slice().sort((p, q) => order[p.el.type] - order[q.el.type] || p.i - q.i || q.k - p.k).forEach(it => LI.drawItem(c, it, items.seed));
      c.restore();
      return items;
    });
  };

  // ---------- master effects ----------

  LI.newBuf = () => ({});
  function layer(buf, name, pw, ph) {
    let L = buf[name];
    if (!L || L.cv.width !== pw || L.cv.height !== ph) {
      const cv = document.createElement('canvas');
      cv.width = pw; cv.height = ph;
      L = buf[name] = { cv, c: cv.getContext('2d') };
    }
    return L;
  }

  let grainTile = null;
  function addGrain(c, pw, ph, t, amount) {
    if (!grainTile) {
      grainTile = document.createElement('canvas');
      grainTile.width = grainTile.height = 128;
      const g = grainTile.getContext('2d'), im = g.createImageData(128, 128);
      for (let i = 0; i < im.data.length; i += 4) {
        im.data[i] = im.data[i + 1] = im.data[i + 2] = Math.random() < .5 ? 0 : 255;
        im.data[i + 3] = Math.random() * 150;
      }
      g.putImageData(im, 0, 0);
    }
    const sc = Math.max(1, pw / 800), step = Math.floor(t * 12);
    const ox = Math.floor(hash(step * 1.7) * 128), oy = Math.floor(hash(step * 3.3 + 5) * 128);
    c.save();
    c.setTransform(sc, 0, 0, sc, -ox * sc, -oy * sc);
    c.imageSmoothingEnabled = false;
    c.globalAlpha = amount * .55;
    c.fillStyle = c.createPattern(grainTile, 'repeat');
    c.fillRect(ox, oy, pw / sc + 1, ph / sc + 1);
    c.restore();
  }

  // Draws one finished frame into c: the scene, then whatever master effects the medium has switched on.
  // buf keeps the working canvases between frames; without it only grain can run.
  LI.paint = function (c, w, h, t, opts = {}) {
    return LI.within(opts.medium, () => {
      const fx = (opts.live && opts.live.fx) || LI.cur.fx || {}, play = opts.play == null ? 1 : opts.play, hit = 1 + (opts.press || 0) * .8;
      const pw = c.canvas.width, ph = c.canvas.height, buf = opts.buf;
      const trail = (fx.trail || 0) * play, mosaic = (fx.mosaic || 0) * play, wave = (fx.wave || 0) * play;
      const slice = (fx.slice || 0) * play * hit, split = (fx.split || 0) * play * hit, grain = fx.grain || 0;
      c.setTransform(pw / w, 0, 0, ph / h, 0, 0);
      if (!buf || trail + mosaic + wave + slice + split < .004) {
        const items = LI.renderScene(c, w, h, t, opts);
        if (grain > 0) addGrain(c, pw, ph, t, grain);
        return items;
      }

      const scene = layer(buf, 'scene', pw, ph), a = layer(buf, 'a', pw, ph), b = layer(buf, 'b', pw, ph), bg = LI.palette().bg;
      scene.c.setTransform(pw / w, 0, 0, ph / h, 0, 0);
      const items = LI.renderScene(scene.c, w, h, t, Object.assign({}, opts, { clear: lerp(1, .1, trail) }));
      let src = scene.cv;

      if (mosaic > .004) {
        const cell = lerp(3, 44, mosaic * mosaic) * pw / 800;
        const sw = Math.max(2, Math.round(pw / cell)), sh = Math.max(2, Math.round(ph / cell)), small = layer(buf, 'small', sw, sh);
        small.c.drawImage(src, 0, 0, sw, sh);
        a.c.imageSmoothingEnabled = false;
        a.c.drawImage(small.cv, 0, 0, sw, sh, 0, 0, pw, ph);
        src = a.cv;
      }

      if (slice > .004 || wave > .004) {
        // horizontal bands slide sideways and wrap: stepped jumps for slice, a rolling sine for wave
        const dst = src === a.cv ? b : a, n = 36, beat = Math.floor(t * 5);
        for (let i = 0; i < n; i++) {
          const y0 = Math.round(i * ph / n), bh = Math.round((i + 1) * ph / n) - y0, grp = Math.floor(i / 3);
          let dx = hash(grp * 7.3 + beat * 3.1, items.seed) < .2 + slice * .5 ? (hash(grp * 2.7 + beat * 9.7, items.seed) - .5) * 2 * slice * pw * .3 : 0;
          dx = Math.round(dx + Math.sin(i / n * TAU * 2 + t * 2.4) * wave * pw * .07);
          dst.c.drawImage(src, 0, y0, pw, bh, dx, y0, pw, bh);
          if (dx) dst.c.drawImage(src, 0, y0, pw, bh, dx > 0 ? dx - pw : dx + pw, y0, pw, bh);
        }
        src = dst.cv;
      }

      if (split > .004) {
        // each colour channel is shifted on its own, then the three are multiplied back together
        const dst = src === a.cv ? b : a, tmp = layer(buf, 'tmp', pw, ph);
        const d = Math.max(1, Math.round(split * pw * .022 * (.7 + .3 * Math.sin(t * 2.6))));
        dst.c.globalCompositeOperation = 'source-over';
        dst.c.fillStyle = '#fff'; dst.c.fillRect(0, 0, pw, ph);
        [[-d, '#00ffff'], [0, '#ff00ff'], [d, '#ffff00']].forEach(([dx, keep]) => {
          tmp.c.globalCompositeOperation = 'source-over';
          tmp.c.fillStyle = bg; tmp.c.fillRect(0, 0, pw, ph);
          tmp.c.drawImage(src, dx, 0);
          tmp.c.globalCompositeOperation = 'lighter';
          tmp.c.fillStyle = keep; tmp.c.fillRect(0, 0, pw, ph);
          dst.c.globalCompositeOperation = 'multiply';
          dst.c.drawImage(tmp.cv, 0, 0);
        });
        dst.c.globalCompositeOperation = tmp.c.globalCompositeOperation = 'source-over';
        src = dst.cv;
      }

      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.drawImage(src, 0, 0);
      if (grain > 0) addGrain(c, pw, ph, t, grain);
      c.setTransform(pw / w, 0, 0, ph / h, 0, 0);
      return items;
    });
  };

  // bounding box in the item's own rotated frame, in px
  LI.itemBounds = function (it, seed) {
    const el = it.el, s = it.sizePx;
    if (el.type === 'text') {
      const tb = LI.textBlock(el, s, (el.tracking || 0) * 1.2 + it.track, it.maxW, it.fitW, it.k, it.drift, seed);
      return { x: -tb.bw / 2, y: -tb.bh / 2, w: tb.bw, h: tb.bh };
    }
    const b = LI.ptsBounds(el.points), pad = el.type === 'shape' && el.style === 'line' ? (el.weight || .16) * s / 2 : 0;
    return { x: b.x0 * s * it.sx - pad, y: b.y0 * s - pad, w: (b.x1 - b.x0) * s * it.sx + pad * 2, h: (b.y1 - b.y0) * s + pad * 2 };
  };

  LI.toLocal = (it, px, py) => {
    const dx = px - it.x, dy = py - it.y, cs = Math.cos(it.rot), sn = Math.sin(it.rot);
    return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs };
  };
  LI.toWorld = (it, lx, ly) => {
    const cs = Math.cos(it.rot), sn = Math.sin(it.rot);
    return { x: it.x + lx * cs - ly * sn, y: it.y + lx * sn + ly * cs };
  };

  LI.hitItem = function (it, px, py, seed, tol = 0) {
    const l = LI.toLocal(it, px, py);
    if (it.el.type === 'text') {
      const b = LI.itemBounds(it, seed);
      return l.x >= b.x - tol && l.x <= b.x + b.w + tol && l.y >= b.y - tol && l.y <= b.y + b.h + tol;
    }
    LI.tracePath(mctx, it.el.points, it.sizePx, it.sx, it.el.smooth);
    if (mctx.isPointInPath(l.x, l.y)) return true;
    mctx.lineWidth = (it.el.style === 'line' ? (it.el.weight || .16) * it.sizePx : 0) + tol * 2 + 6;
    return mctx.isPointInStroke(l.x, l.y);
  };

  // tiny still of one element for the layer list and the DNA sheet
  LI.drawGlyph = function (c, el, cx, cy, box, color) {
    c.save();
    c.translate(cx, cy);
    c.fillStyle = c.strokeStyle = color;
    if (el.type === 'text') {
      c.font = `${el.fontWeight} ${box * .82}px ${LI.FONT_MAP[el.fontFamily] || LI.FONT_MAP.sans}`;
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillText((String(el.text).trim()[0] || 'T'), 0, box * .3);
    } else {
      const b = LI.ptsBounds(el.points), s = box / Math.max(b.x1 - b.x0, b.y1 - b.y0, .01);
      c.translate(-(b.x0 + b.x1) / 2 * s, -(b.y0 + b.y1) / 2 * s);
      LI.tracePath(c, el.points, s, 1, el.smooth);
      if (el.type === 'image') { c.lineWidth = 1; c.stroke(); c.globalAlpha = .25; c.fill(); }
      else if (el.style === 'line') { c.lineWidth = Math.max(1, (el.weight || .16) * s * .8); c.stroke(); }
      else c.fill();
    }
    c.restore();
  };
})();

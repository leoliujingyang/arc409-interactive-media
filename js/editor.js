(() => {
  'use strict';

  // Direct editing on the poster: select, move, scale, rotate, and reshape by dragging points.
  const LI = window.LI, { clamp, TAU } = LI, S = LI.state;
  const ACCENT = '#ff3d00';

  // live values shared by the editor, the main loop and the panels
  const rt = LI.rt = {
    t: 0, hold: 0, px: 1, W: LI.FORMAT.w, H: LI.FORMAT.h, q: 1,
    ptr: { x: .5, y: .5, inside: false }, down: false,
    drag: null, hoverId: null, vertex: -1,
    items: [], memo: LI.newMemo(), buf: LI.newBuf(), live: null
  };

  let canvas, ctx;
  const primary = id => rt.items.find(it => it.el.id === id && it.k === 0) || null;
  const near = (h, p, r) => Math.hypot(h.x - p.x, h.y - p.y) <= r;

  function pos(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width * rt.W, y: (ev.clientY - r.top) / r.height * rt.H };
  }

  function pick(p) {
    const sorted = rt.items.slice().sort((a, b) => a.i - b.i || b.k - a.k);
    for (let j = sorted.length - 1; j >= 0; j--) {
      if (sorted[j].op > .02 && LI.hitItem(sorted[j], p.x, p.y, rt.items.seed, 4 * rt.px)) return sorted[j];
    }
    return null;
  }

  function handles(it) {
    const el = it.el, k = rt.px, s = it.sizePx, out = [];
    if (el.type !== 'text') {
      const n = el.points.length;
      const edge = i => { const p = el.points[i], q = el.points[(i + 1) % n]; return Math.hypot((q.x - p.x) * s * it.sx, (q.y - p.y) * s); };
      // points shrink when they sit close together, so a dense outline stays readable
      const r = clamp(Math.min(...el.points.map((_, i) => edge(i))) / k * .36, 2.4, 4.5);
      el.points.forEach((p, i) => out.push(Object.assign({ kind: 'vertex', i, r }, LI.toWorld(it, p.x * s * it.sx, p.y * s))));
      el.points.forEach((p, i) => {
        const q = el.points[(i + 1) % n];
        if (edge(i) > 30 * k) out.push(Object.assign({ kind: 'mid', i }, LI.toWorld(it, (p.x + q.x) / 2 * s * it.sx, (p.y + q.y) / 2 * s)));
      });
    }
    const b = LI.itemBounds(it, rt.items.seed);
    out.push(Object.assign({ kind: 'scale' }, LI.toWorld(it, b.x + b.w + 9 * k, b.y + b.h + 9 * k)));
    out.push(Object.assign({ kind: 'rotate' }, LI.toWorld(it, b.x + b.w / 2, b.y - 24 * k)));
    return out;
  }

  function handleAt(it, p) {
    const hs = handles(it), R = 9 * rt.px;
    return hs.find(h => h.kind === 'vertex' && near(h, p, R))
      || hs.find(h => (h.kind === 'scale' || h.kind === 'rotate') && near(h, p, R))
      || hs.find(h => h.kind === 'mid' && near(h, p, R * .8)) || null;
  }

  // ---------- pointer ----------

  function down(ev) {
    if (ev.button) return;
    const p = pos(ev);
    rt.ptr = { x: clamp(p.x / rt.W, 0, 1), y: clamp(p.y / rt.H, 0, 1), inside: true };
    rt.down = true;
    if (S.mode === 'live') return;
    canvas.setPointerCapture(ev.pointerId);
    const sel = LI.selected(), it = sel && primary(sel.id);
    const h = it && handleAt(it, p);
    if (h) {
      if (h.kind === 'vertex') { rt.vertex = h.i; rt.drag = { kind: 'vertex', i: h.i }; }
      else if (h.kind === 'mid') {
        const a = sel.points[h.i], b = sel.points[(h.i + 1) % sel.points.length];
        sel.points.splice(h.i + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        sel.kind = 'custom';
        rt.vertex = h.i + 1; rt.drag = { kind: 'vertex', i: h.i + 1 };
      }
      else if (h.kind === 'scale') rt.drag = { kind: 'scale', size0: sel.size, d0: Math.hypot(p.x - it.x, p.y - it.y) };
      else rt.drag = { kind: 'rotate', rot0: sel.rotation, a0: Math.atan2(p.y - it.y, p.x - it.x) };
      LI.onEdit('start');
      return;
    }
    const hit = pick(p);
    rt.vertex = -1;
    if (hit) {
      const n = S.layout.nudge[hit.el.id] || { x: 0, y: 0 };
      S.selectedId = hit.el.id;
      rt.drag = { kind: 'body', p0: p, n0: { x: n.x, y: n.y } };
    } else S.selectedId = null;
    LI.onEdit('select');
  }

  function move(ev) {
    if (!canvas) return;
    const p = pos(ev);
    rt.ptr = { x: clamp(p.x / rt.W, 0, 1), y: clamp(p.y / rt.H, 0, 1), inside: ev.target === canvas };
    const d = rt.drag;
    if (!d) { hover(p); return; }
    const el = LI.selected(), it = el && primary(el.id);
    if (!el || !it) return;
    if (d.kind === 'body') {
      S.layout.nudge[el.id] = { x: d.n0.x + (p.x - d.p0.x) / rt.W, y: d.n0.y + (p.y - d.p0.y) / rt.H };
    } else if (d.kind === 'vertex') {
      const l = LI.toLocal(it, p.x, p.y);
      let x = l.x / (it.sizePx * it.sx), y = l.y / it.sizePx;
      if (ev.shiftKey) { x = Math.round(x * 20) / 20; y = Math.round(y * 20) / 20; }
      el.points[d.i] = { x: clamp(x, -4, 4), y: clamp(y, -4, 4) };
      el.kind = 'custom';
    } else if (d.kind === 'scale') {
      el.size = clamp(d.size0 * Math.hypot(p.x - it.x, p.y - it.y) / Math.max(4, d.d0), .01, 1.4);
    } else if (d.kind === 'rotate') {
      let deg = d.rot0 + (Math.atan2(p.y - it.y, p.x - it.x) - d.a0) * 180 / Math.PI;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      el.rotation = Math.round(((deg + 540) % 360 + 360) % 360 - 180);
    }
    LI.onEdit('drag');
  }

  function up(ev) {
    rt.down = false;
    // a finger leaves no hover behind, so let the poster play again
    if (ev && ev.pointerType === 'touch' && S.mode === 'design') rt.ptr.inside = false;
    if (!rt.drag) return;
    rt.drag = null;
    LI.onEdit('end');
  }

  function dbl(ev) {
    if (S.mode !== 'design') return;
    const el = LI.selected(), it = el && primary(el.id);
    if (!it) return;
    if (el.type === 'text') { LI.onEdit('focus-text'); return; }
    const h = handles(it).find(h => h.kind === 'vertex' && near(h, pos(ev), 9 * rt.px));
    if (h && el.points.length > 3) {
      el.points.splice(h.i, 1);
      el.kind = 'custom';
      rt.vertex = -1;
      LI.onEdit('end');
    }
  }

  function hover(p) {
    if (S.mode === 'live') { canvas.style.cursor = 'crosshair'; rt.hoverId = null; return; }
    if (!rt.ptr.inside) { rt.hoverId = null; return; }
    const sel = LI.selected(), it = sel && primary(sel.id), h = it && handleAt(it, p);
    if (h) {
      rt.hoverId = null;
      canvas.style.cursor = h.kind === 'scale' ? 'nwse-resize' : h.kind === 'rotate' ? 'grab' : 'pointer';
      return;
    }
    const hit = pick(p);
    rt.hoverId = hit ? hit.el.id : null;
    canvas.style.cursor = hit ? 'move' : 'default';
  }

  LI.removeVertex = () => {
    const el = LI.selected();
    if (!el || el.type === 'text' || rt.vertex < 0 || el.points.length <= 3) return false;
    el.points.splice(rt.vertex, 1);
    el.kind = 'custom';
    rt.vertex = -1;
    return true;
  };

  LI.initEditor = function (cv) {
    canvas = cv; ctx = cv.getContext('2d');
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('dblclick', dbl);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    document.documentElement.addEventListener('mouseleave', () => { rt.ptr.inside = false; });
  };

  // ---------- chrome drawn over the poster ----------

  function halo(draw, k) {
    ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(255,255,255,.75)'; draw();
    ctx.lineWidth = 1.2 * k; ctx.strokeStyle = ACCENT; draw();
  }

  function outline(it, k, dashed) {
    const b = LI.itemBounds(it, rt.items.seed);
    ctx.save();
    ctx.translate(it.x, it.y); ctx.rotate(it.rot);
    if (dashed) ctx.setLineDash([4 * k, 4 * k]);
    halo(() => ctx.strokeRect(b.x, b.y, b.w, b.h), k);
    ctx.restore();
  }

  function drawHandle(h, k, active) {
    ctx.save();
    ctx.lineWidth = 1.2 * k;
    if (h.kind === 'vertex') {
      const r = h.r * k;
      ctx.fillStyle = active ? ACCENT : '#fff'; ctx.strokeStyle = active ? '#fff' : '#0c0c0c';
      ctx.fillRect(h.x - r, h.y - r, r * 2, r * 2); ctx.strokeRect(h.x - r, h.y - r, r * 2, r * 2);
    } else if (h.kind === 'mid') {
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.strokeStyle = '#0c0c0c';
      ctx.beginPath(); ctx.arc(h.x, h.y, 3 * k, 0, TAU); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#0c0c0c'; ctx.strokeStyle = '#fff';
      ctx.beginPath();
      if (h.kind === 'rotate') ctx.arc(h.x, h.y, 5 * k, 0, TAU);
      else ctx.rect(h.x - 4.5 * k, h.y - 4.5 * k, 9 * k, 9 * k);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // a small label with the element's name, so it is clear which one an outline belongs to
  function nameTag(it, k, name) {
    const label = String(name || '').slice(0, 26);
    if (!label) return;
    const b = LI.itemBounds(it, rt.items.seed);
    // it hangs on the highest corner, so it stays attached when the element is turned
    const top = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([x, y]) => LI.toWorld(it, x, y))
      .sort((p, q) => Math.abs(p.y - q.y) > k ? p.y - q.y : p.x - q.x)[0];
    ctx.save();
    ctx.font = `600 ${10 * k}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    const w = ctx.measureText(label).width + 10 * k, h = 15 * k;
    const x = clamp(top.x - k, 2 * k, Math.max(2 * k, rt.W - w - 2 * k)), y = clamp(top.y - h - 5 * k, 2 * k, Math.max(2 * k, rt.H - h - 2 * k));
    ctx.fillStyle = ACCENT; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 5 * k, y + h / 2 + .5 * k);
    ctx.restore();
  }

  LI.drawChrome = function () {
    const k = rt.px = rt.W / (canvas.getBoundingClientRect().width || rt.W);
    if (S.mode === 'live') return;
    const sel = LI.selected(), it = sel && primary(sel.id);
    // the elements an open rule drives are pointed out by name
    (rt.focus || []).forEach(id => {
      const f = (!sel || id !== sel.id) && id !== rt.hoverId && primary(id);
      if (f) { outline(f, k, true); nameTag(f, k, f.el.name); }
    });
    if (rt.hoverId && (!sel || rt.hoverId !== sel.id) && !rt.drag) {
      const hv = primary(rt.hoverId);
      if (hv) { outline(hv, k, true); nameTag(hv, k, hv.el.name); }
    }
    if (!it) return;
    outline(it, k, false);
    nameTag(it, k, sel.name);
    if (rt.hold < .7 && !rt.drag) return;
    handles(it).forEach(h => drawHandle(h, k, h.kind === 'vertex' && h.i === rt.vertex));
  };
})();

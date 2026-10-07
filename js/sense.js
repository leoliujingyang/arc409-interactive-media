(() => {
  'use strict';

  // Sensing: where the body comes from (the camera, or the pointer playing a hand),
  // which trackers run on it, and how landmarks become the signals that rules read.
  const LI = window.LI, { clamp, lerp, smooth, frac, noise, TAU } = LI;

  // Everything fetched from outside lives here. To run offline, copy these files next to the app and point at them.
  LI.SENSE = {
    lib: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs',
    wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm',
    models: {
      hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      body: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
    }
  };

  const NAMES = ['hand', 'face', 'body'];
  const sense = LI.sense = {
    source: 'pointer',                               // camera or pointer
    status: { hand: 'idle', face: 'idle', body: 'idle' },   // idle, loading, ready, error
    error: '', raw: null, aspect: 4 / 3, ms: 0, still: null,
    pad: { x: .5, y: .5, down: false, pinch: 0, open: 1 }
  };
  let vision = null, fileset = null, stream = null, video = null, turn = 0;
  const det = {}, last = { hand: null, face: null, body: null };
  const notify = () => { if (LI.onSense) LI.onSense(); };

  // ---------- view and poster coordinates ----------
  // Landmarks are kept mirrored (like a mirror) and normalised to the camera frame.
  // The poster listens to the central window of that frame that has the poster's proportions.

  const win = () => (LI.FORMAT.w / LI.FORMAT.h) / sense.aspect;
  LI.toPoster = p => { const cw = win(); return { x: (p.x - (1 - cw) / 2) / cw, y: p.y }; };
  LI.fromPoster = p => { const cw = win(); return { x: p.x * cw + (1 - cw) / 2, y: p.y }; };
  const dist = (a, b) => Math.hypot((a.x - b.x) * sense.aspect, a.y - b.y);

  // ---------- landmarks to features ----------

  function handFeatures(p) {
    const palm = dist(p[0], p[9]) || .001;
    const reach = (tip, mcp) => dist(p[tip], p[0]) / (dist(p[mcp], p[0]) || .001);
    const r = [reach(8, 5), reach(12, 9), reach(16, 13), reach(20, 17)];
    const up = r.map(v => v > 1.45), thumb = dist(p[4], p[17]) > dist(p[3], p[17]) * 1.08 && dist(p[4], p[5]) > palm * .55;
    const n = up.filter(Boolean).length;
    const ang = Math.atan2(p[9].y - p[0].y, (p[9].x - p[0].x) * sense.aspect);
    return {
      tip: p[8], palm: { x: (p[0].x + p[9].x) / 2, y: (p[0].y + p[9].y) / 2 }, thumbTip: p[4],
      pinch: 1 - clamp((dist(p[4], p[8]) / palm - .18) / .75, 0, 1),
      open: r.reduce((s, v) => s + clamp((v - 1.1) / .75, 0, 1), 0) / 4,
      spin: clamp(.5 + (ang + Math.PI / 2) / Math.PI, 0, 1),
      near: clamp((palm - .07) / .23, 0, 1),
      fingers: (n + (thumb ? 1 : 0)) / 5,
      fist: n === 0 ? 1 : 0,
      peace: up[0] && up[1] && !up[2] && !up[3] ? 1 : 0,
      point: up[0] && !up[1] && !up[2] && !up[3] ? 1 : 0
    };
  }

  function bodyFeatures(p) {
    const ok = i => p[i] && (p[i].v == null || p[i].v > .4);
    if (!ok(11) || !ok(12)) return null;
    const ls = p[11], rs = p[12], mid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    const sw = dist(ls, rs) || .001;
    const torso = ok(23) && ok(24) ? dist(mid, { x: (p[23].x + p[24].x) / 2, y: (p[23].y + p[24].y) / 2 }) : sw * 1.35;
    const lift = (w, s) => ok(w) ? clamp(((p[s].y - p[w].y) / torso + .25) / 1.25, 0, 1) : 0;
    const left = lift(15, 11), right = lift(16, 12);
    return {
      chest: mid, lw: ok(15) ? p[15] : null, rw: ok(16) ? p[16] : null,
      left, right, arms: (left + right) / 2,
      span: ok(15) && ok(16) ? clamp((dist(p[15], p[16]) / sw - .8) / 2.8, 0, 1) : 0,
      lean: clamp(.5 + Math.atan2(rs.y - ls.y, Math.abs(rs.x - ls.x) * sense.aspect) / (Math.PI / 3), 0, 1),
      near: clamp((sw - .12) / .43, 0, 1)
    };
  }

  function faceFeatures(p, b) {
    const fw = dist(p[234], p[454]) || .001, fh = dist(p[10], p[152]) || .001;
    const has = k => b && b[k] != null, avg = (x, y) => ((b[x] || 0) + (b[y] || 0)) / 2;
    const eyeL = p[33].x < p[263].x ? p[33] : p[263], eyeR = eyeL === p[33] ? p[263] : p[33];
    const midX = (p[234].x + p[454].x) / 2, midY = (p[10].y + p[152].y) / 2;
    return {
      nose: p[1],
      mouth: has('jawOpen') ? clamp(b.jawOpen / .55, 0, 1) : clamp((dist(p[13], p[14]) / fh - .02) / .16, 0, 1),
      smile: has('mouthSmileLeft') ? clamp(avg('mouthSmileLeft', 'mouthSmileRight') / .7, 0, 1) : clamp((dist(p[61], p[291]) / fw - .36) / .14, 0, 1),
      brow: has('browInnerUp') ? clamp(Math.max(b.browInnerUp, avg('browOuterUpLeft', 'browOuterUpRight')) / .6, 0, 1) : clamp((dist(p[105], p[159]) / fh - .1) / .06, 0, 1),
      blink: has('eyeBlinkLeft') ? clamp((avg('eyeBlinkLeft', 'eyeBlinkRight') - .2) / .5, 0, 1) : clamp(1 - (dist(p[159], p[145]) / fh - .012) / .03, 0, 1),
      tilt: clamp(.5 + Math.atan2(eyeR.y - eyeL.y, (eyeR.x - eyeL.x) * sense.aspect) / (Math.PI / 3), 0, 1),
      turn: clamp(.5 + ((p[1].x - midX) * sense.aspect / fw) / .5, 0, 1),
      nod: clamp(.5 - ((p[1].y - midY) / fh - .04) / .3, 0, 1),
      near: clamp((fh - .15) / .45, 0, 1)
    };
  }

  // ---------- the hand the pointer plays ----------

  function pointerHand(cx, cy, s, rot, open, pinch, flip) {
    // local points in palm units, y down; the wrist sits below the palm
    const L = [[0, .9]], th = lerp(.25, 1, open);
    L[1] = [-.38, .55]; L[2] = [lerp(-.42, -.62, th), lerp(.38, .3, th)];
    L[3] = [lerp(-.4, -.8, th), lerp(.2, .05, th)]; L[4] = [lerp(-.3, -.92, th), lerp(.08, -.18, th)];
    [[-.34, -.05, -.14, .95], [-.1, -.14, 0, 1.05], [.13, -.1, .1, .97], [.34, .02, .24, .78]].forEach(([bx, by, fan, len], f) => {
      const e = lerp(.08, 1, open), dx = Math.sin(fan), dy = -Math.cos(fan), i = 5 + f * 4;
      L[i] = [bx, by];
      [.45, .75, 1].forEach((u, j) => { L[i + 1 + j] = [bx + dx * len * e * u, by + dy * len * e * u]; });
    });
    [4, 8].forEach(i => { L[i] = [lerp(L[i][0], -.5, pinch), lerp(L[i][1], -.35, pinch)]; });
    L[3] = [lerp(L[3][0], -.62, pinch * .7), lerp(L[3][1], -.08, pinch * .7)];
    L[7] = [lerp(L[7][0], -.46, pinch * .7), lerp(L[7][1], -.5, pinch * .7)];
    const cs = Math.cos(rot), sn = Math.sin(rot), k = flip ? -1 : 1;
    return L.map(([x, y]) => ({ x: cx + (x * k * cs - y * sn) * s / sense.aspect, y: cy + (x * k * sn + y * cs) * s }));
  }

  // ---------- features to signals ----------

  LI.newReader = () => ({ v: {}, tip: null, joints: null, energy: 0, sig: { v: {}, p: {}, has: { hand: false, face: false, body: false, clock: true } } });

  // Fills reader.sig from raw landmarks. A light smoothing takes the tremble out of the tracking.
  LI.readSignals = function (raw, t, dt, rd) {
    const sig = rd.sig, k = dt > 0 ? 1 - Math.exp(-dt * 22) : 0;
    const set = (id, target) => { const prev = rd.v[id]; sig.v[id] = rd.v[id] = prev == null ? target : prev + (target - prev) * k; };
    const point = (id, p) => { sig.p[id] = p ? Object.assign(LI.toPoster(p), { on: true }) : { x: .5, y: .5, on: false }; };

    // the hand that was leading stays the leader
    let hands = raw.hands || [];
    if (hands.length > 1 && rd.tip && dist(hands[1][8], rd.tip) < dist(hands[0][8], rd.tip)) hands = [hands[1], hands[0]];
    sig.has.hand = hands.length > 0;
    if (hands.length) {
      const h = handFeatures(hands[0]), pos = LI.toPoster(h.tip);
      ['pinch', 'open', 'spin', 'near', 'fingers'].forEach(n => set('hand.' + n, h[n]));
      ['fist', 'peace', 'point'].forEach(n => set('hand.' + n, h[n]));
      set('hand.x', clamp(pos.x, 0, 1)); set('hand.y', clamp(1 - pos.y, 0, 1));
      set('hand.speed', rd.tip && dt > 0 ? clamp(dist(h.tip, rd.tip) / dt / 1.6, 0, 1) : 0);
      set('hand.spread', hands.length > 1 ? clamp(dist(h.palm, handFeatures(hands[1]).palm) / .9, 0, 1) : 0);
      rd.tip = { x: h.tip.x, y: h.tip.y };
      point('hand.tip', h.tip); point('hand.palm', h.palm);
      point('hand2.tip', hands.length > 1 ? hands[1][8] : null);
    } else { rd.tip = null; ['hand.tip', 'hand.palm', 'hand2.tip'].forEach(id => point(id, null)); }

    const face = raw.face;
    sig.has.face = !!face;
    if (face) {
      const f = face.f, pos = LI.toPoster(f.nose);
      ['mouth', 'smile', 'brow', 'blink', 'tilt', 'turn', 'nod', 'near'].forEach(n => set('face.' + n, f[n]));
      set('face.x', clamp(pos.x, 0, 1));
      point('face.nose', f.nose);
    } else point('face.nose', null);

    const b = raw.body && bodyFeatures(raw.body);
    sig.has.body = !!b;
    if (b) {
      ['arms', 'left', 'right', 'span', 'lean', 'near'].forEach(n => set('body.' + n, b[n]));
      set('body.x', clamp(LI.toPoster(b.chest).x, 0, 1));
      const joints = [b.chest, b.lw, b.rw].filter(Boolean);
      let move = 0;
      if (rd.joints && rd.joints.length === joints.length && dt > 0) joints.forEach((j, i) => { move += dist(j, rd.joints[i]) / dt; });
      rd.energy = Math.max(clamp(move / joints.length / .9, 0, 1), rd.energy * Math.exp(-dt * 2.2));
      rd.joints = joints.map(j => ({ x: j.x, y: j.y }));
      set('body.energy', rd.energy);
      point('body.chest', b.chest); point('body.lw', b.lw); point('body.rw', b.rw);
    } else { rd.joints = null; ['body.chest', 'body.lw', 'body.rw'].forEach(id => point(id, null)); }

    const beat = t * lerp(.35, 2, LI.cur.tempo);
    sig.v['clock.wave'] = .5 - .5 * Math.cos(beat * .9);
    sig.v['clock.beat'] = Math.pow(1 - frac(beat * .8), 3);
    sig.v['clock.drift'] = noise(beat * .35, 7);
    return sig;
  };

  // ---------- trackers ----------

  async function ensure(name) {
    if (det[name] || sense.status[name] === 'loading') return;
    sense.status[name] = 'loading';
    notify();
    try {
      if (!vision) vision = await import(LI.SENSE.lib);
      if (!fileset) fileset = await vision.FilesetResolver.forVisionTasks(LI.SENSE.wasm);
      const make = delegate => {
        const base = { baseOptions: { modelAssetPath: LI.SENSE.models[name], delegate }, runningMode: 'VIDEO' };
        if (name === 'hand') return vision.HandLandmarker.createFromOptions(fileset, Object.assign(base, { numHands: 2 }));
        if (name === 'face') return vision.FaceLandmarker.createFromOptions(fileset, Object.assign(base, { numFaces: 1, outputFaceBlendshapes: true }));
        return vision.PoseLandmarker.createFromOptions(fileset, Object.assign(base, { numPoses: 1 }));
      };
      try { det[name] = await make('GPU'); } catch (e) { det[name] = await make('CPU'); }
      sense.status[name] = 'ready';
    } catch (e) {
      sense.status[name] = 'error';
      sense.error = 'The ' + name + ' tracker could not load, check the connection';
    }
    notify();
  }

  const flip = p => ({ x: 1 - p.x, y: p.y, v: p.visibility });
  function run(name, src) {
    const r = det[name].detectForVideo(src, performance.now());
    if (name === 'hand') last.hand = (r.landmarks || []).map(l => l.map(flip));
    else if (name === 'body') last.body = r.landmarks && r.landmarks[0] ? r.landmarks[0].map(flip) : null;
    else if (r.faceLandmarks && r.faceLandmarks[0]) {
      const pts = r.faceLandmarks[0].map(flip), blend = {};
      ((r.faceBlendshapes && r.faceBlendshapes[0] && r.faceBlendshapes[0].categories) || []).forEach(c => { blend[c.categoryName] = c.score; });
      last.face = { f: faceFeatures(pts, blend), ring: { x: (pts[10].x + pts[152].x) / 2, y: (pts[10].y + pts[152].y) / 2, r: dist(pts[10], pts[152]) / 2 } };
    } else last.face = null;
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach(tr => tr.stop());
    stream = null;
    if (video) video.srcObject = null;
  }

  sense.init = el => { video = el; };

  sense.setSource = async function (src) {
    sense.error = '';
    if (src !== 'camera') {
      stopCamera();
      sense.source = src; sense.aspect = 4 / 3;
      notify();
      return;
    }
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('insecure');
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      video.srcObject = stream;
      await video.play();
      sense.aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;
      sense.source = 'camera';
    } catch (e) {
      stopCamera();
      sense.source = 'pointer';
      sense.error = e && e.message === 'insecure' ? 'The camera needs localhost or an https address'
        : e && e.name === 'NotAllowedError' ? 'Camera permission was refused, the pointer plays the hand instead'
          : 'No camera could be opened, the pointer plays the hand instead';
    }
    notify();
  };

  // run the trackers on a still picture instead of the camera (handy for testing without one)
  sense.usePhoto = async function (url) {
    sense.still = url ? await createImageBitmap(await (await fetch(url)).blob()) : null;
    if (sense.still) sense.aspect = sense.still.width / sense.still.height;
    NAMES.forEach(n => { last[n] = null; });
  };

  const reader = LI.newReader();
  LI.sig = reader.sig;

  // one step: gather landmarks from the current source, then refresh the signals
  sense.update = function (t, dt) {
    const tr = LI.cur.trackers, seeing = sense.still || (sense.source === 'camera' && video && video.readyState >= 2);
    let raw;
    if (sense.still || sense.source === 'camera') {
      NAMES.forEach(n => { if (tr[n] && !det[n]) ensure(n); if (!tr[n]) last[n] = null; });
      const live = NAMES.filter(n => tr[n] && det[n]);
      if (seeing && live.length) {
        // one tracker per frame, in turn, so the poster keeps its frame rate
        const name = live[turn++ % live.length], t0 = performance.now();
        try { run(name, sense.still || video); } catch (e) { last[name] = null; }
        sense.ms = lerp(sense.ms, performance.now() - t0, .15);
      }
      raw = { hands: last.hand || [], face: last.face, body: last.body };
    } else {
      // the pointer sits on the index fingertip of a drawn hand
      const pad = sense.pad;
      pad.pinch += ((pad.down ? 1 : 0) - pad.pinch) * (dt > 0 ? 1 - Math.exp(-dt * 16) : 0);
      raw = { hands: tr.hand ? [pointerHand(pad.x + .075 / sense.aspect, pad.y + .15, .15, 0, pad.open, pad.pinch, false)] : [], face: null, body: null };
    }
    // the hand that was leading stays first, so its marks do not jump between hands
    if (raw.hands.length > 1 && reader.tip && dist(raw.hands[1][8], reader.tip) < dist(raw.hands[0][8], reader.tip)) raw.hands = [raw.hands[1], raw.hands[0]];
    sense.raw = raw;
    LI.readSignals(raw, t, dt, reader);
    buildMarks(raw, dt);
  };

  sense.caption = function () {
    if (sense.error) return sense.error;
    const tr = LI.cur.trackers, on = NAMES.filter(n => tr[n]);
    if (!on.length) return 'Switch on a tracker below';
    if (sense.source === 'pointer') return tr.hand ? 'Move here, press to pinch, scroll to open and close' : 'The pointer only plays a hand, switch Hand on or use the camera';
    const loading = on.filter(n => sense.status[n] === 'loading');
    if (loading.length) return 'Loading the ' + loading.join(' and ') + ' tracker';
    const missing = on.filter(n => !LI.sig.has[n]);
    return missing.length === on.length ? 'Step into the frame' : '';
  };

  // ---------- drawing what is seen ----------
  // The body is shown as a few quiet marks, not as a skeleton: a dot on each fingertip and joint,
  // one thin ring for the head. A mark turns orange when a rule is following it.

  const glides = new Map();
  sense.marks = { dots: [], rings: [], links: [] };

  function buildMarks(raw, dt) {
    const used = new Set(LI.cur.rules.filter(r => r.on).map(r => r.source));
    const k = dt > 0 ? 1 - Math.exp(-dt * 20) : 1, seen = new Set(), m = { dots: [], rings: [], links: [] };
    // marks glide to where the tracker says they are, which takes the tremble out
    const glide = (key, to) => {
      seen.add(key);
      let g = glides.get(key);
      if (!g) glides.set(key, g = { x: to.x, y: to.y, r: to.r });
      else { g.x += (to.x - g.x) * k; g.y += (to.y - g.y) * k; if (to.r != null) g.r += (to.r - g.r) * k; }
      return g;
    };

    (raw.hands || []).forEach((h, i) => {
      const tips = [4, 8, 12, 16, 20].map(j => glide('h' + i + j, h[j]));
      tips.forEach((t, n) => m.dots.push({ x: t.x, y: t.y, hot: n === 1 && used.has(i ? 'hand2.tip' : 'hand.tip') }));
      const palm = glide('h' + i + 'p', { x: (h[0].x + h[9].x) / 2, y: (h[0].y + h[9].y) / 2 });
      m.dots.push({ x: palm.x, y: palm.y, faint: true, hot: !i && used.has('hand.palm') });
      // a hairline joins thumb and index as they close
      const pinch = 1 - clamp((dist(h[4], h[8]) / (dist(h[0], h[9]) || .001) - .18) / .75, 0, 1);
      if (pinch > .04) m.links.push({ a: tips[0], b: tips[1], alpha: pinch, hot: !i && used.has('hand.pinch') });
    });

    if (raw.face) {
      const ring = glide('fr', raw.face.ring), nose = glide('fn', raw.face.f.nose);
      m.rings.push({ x: ring.x, y: ring.y, r: ring.r });
      m.dots.push({ x: nose.x, y: nose.y, hot: used.has('face.nose') });
    }

    if (raw.body) {
      const b = raw.body, ok = i => b[i] && (b[i].v == null || b[i].v > .4);
      [[11], [12], [13], [14], [15, 'body.lw'], [16, 'body.rw'], [23], [24]].forEach(([i, id]) => {
        if (!ok(i)) return;
        const g = glide('b' + i, b[i]);
        m.dots.push({ x: g.x, y: g.y, hot: !!id && used.has(id) });
      });
      if (ok(11) && ok(12)) {
        const g = glide('bc', { x: (b[11].x + b[12].x) / 2, y: (b[11].y + b[12].y) / 2 });
        m.dots.push({ x: g.x, y: g.y, faint: true, hot: used.has('body.chest') });
      }
    }
    glides.forEach((v, key) => { if (!seen.has(key)) glides.delete(key); });
    sense.marks = m;
  }

  // map: turns a mirrored camera point into canvas px. unit: px for one camera height. ghost: the version laid over the poster.
  function drawMarks(c, m, map, unit, k, ghost) {
    const ink = ghost ? '#ffffff' : 'rgba(255,255,255,.96)', orange = ghost ? '#ffffff' : '#ff3d00';
    c.lineCap = 'round';
    m.rings.forEach(r => {
      const p = map(r);
      c.globalAlpha = ghost ? .7 : .75;
      c.strokeStyle = ink; c.lineWidth = 1.1 * k;
      c.beginPath(); c.arc(p.x, p.y, Math.max(1, r.r * unit), 0, TAU); c.stroke();
    });
    m.links.forEach(l => {
      const a = map(l.a), b = map(l.b);
      c.globalAlpha = l.alpha * (ghost ? .8 : .95);
      c.strokeStyle = l.hot ? orange : ink; c.lineWidth = 1.1 * k;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    });
    m.dots.forEach(d => {
      const p = map(d);
      c.globalAlpha = d.faint && !d.hot ? .5 : 1;
      if (d.hot && ghost) {
        // over the poster a followed point is a small target, so it never hides what is under it
        c.strokeStyle = ink; c.lineWidth = 1.1 * k;
        c.beginPath(); c.arc(p.x, p.y, 7 * k, 0, TAU); c.stroke();
      }
      c.fillStyle = d.hot ? orange : ink;
      c.beginPath(); c.arc(p.x, p.y, (d.hot && !ghost ? 5 : d.faint ? 2 : 2.6) * k, 0, TAU); c.fill();
    });
    c.globalAlpha = 1;
  }

  // The sensor view: what the tracker sees, with the window the poster listens to.
  // On screen the camera picture is a video element behind this canvas; withVideo paints it in as well, for exports.
  sense.draw = function (c, W, H, withVideo) {
    const cam = sense.source === 'camera' && !sense.still, k = W / 640, over = cam || !!sense.still;
    const mirrored = src => { c.save(); c.translate(W, 0); c.scale(-1, 1); c.drawImage(src, 0, 0, W, H); c.restore(); };
    c.clearRect(0, 0, W, H);
    if (sense.still) mirrored(sense.still);
    else if (cam) { if (withVideo && video && video.readyState >= 2) mirrored(video); }
    else { c.fillStyle = '#0c0c0c'; c.fillRect(0, 0, W, H); }

    // outside the poster's window the picture is dimmed; four fine corners mark the window
    const cw = win(), x0 = (1 - cw) / 2 * W, x1 = W - x0;
    c.fillStyle = over ? 'rgba(12,12,12,.5)' : 'rgba(255,255,255,.06)';
    c.fillRect(0, 0, x0, H); c.fillRect(x1, 0, W - x1, H);
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = k;
    c.beginPath();
    [[x0, 0, 1, 1], [x1, 0, -1, 1], [x0, H, 1, -1], [x1, H, -1, -1]].forEach(([x, y, sx, sy]) => { c.moveTo(x + sx * 12 * k, y + sy * k); c.lineTo(x, y + sy * k); c.lineTo(x, y + sy * 13 * k); });
    c.stroke();

    c.save();
    if (over) { c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 4 * k; }      // keeps white marks readable on a bright room
    drawMarks(c, sense.marks, p => ({ x: p.x * W, y: p.y * H }), H, k, false);
    c.restore();
  };

  // the same marks, laid faintly over the poster so the performer can see where they are
  sense.drawGhost = function (c, w, h, k) {
    c.save();
    c.globalCompositeOperation = 'difference';
    drawMarks(c, sense.marks, p => { const q = LI.toPoster(p); return { x: q.x * w, y: q.y * h }; }, h, k, true);
    c.restore();
  };
})();

(() => {
  'use strict';

  // Moving exports. GIF is encoded here from scratch so the tool stays dependency free;
  // video leans on the browser's own recorder.
  const LI = window.LI;

  // ---------- GIF ----------

  // up to 255 colours chosen from sample frames by median cut; index 255 is kept for "unchanged"
  function buildPalette(samples) {
    const n = new Uint32Array(32768), sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
    samples.forEach(d => {
      for (let i = 0; i < d.length; i += 4) {
        const k = (d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | d[i + 2] >> 3;
        n[k]++; sr[k] += d[i]; sg[k] += d[i + 1]; sb[k] += d[i + 2];
      }
    });
    const cols = [];
    for (let k = 0; k < 32768; k++) if (n[k]) cols.push({ r: sr[k] / n[k], g: sg[k] / n[k], b: sb[k] / n[k], n: n[k] });

    let boxes = cols.length <= 255 ? cols.map(c => [c]) : [cols];
    while (boxes.length < 255) {
      let best = -1, score = 0, axis = 'r';
      boxes.forEach((bx, i) => {
        if (bx.length < 2) return;
        const lo = { r: 255, g: 255, b: 255 }, hi = { r: 0, g: 0, b: 0 };
        let count = 0;
        bx.forEach(c => {
          count += c.n;
          if (c.r < lo.r) lo.r = c.r; if (c.r > hi.r) hi.r = c.r;
          if (c.g < lo.g) lo.g = c.g; if (c.g > hi.g) hi.g = c.g;
          if (c.b < lo.b) lo.b = c.b; if (c.b > hi.b) hi.b = c.b;
        });
        const ax = hi.r - lo.r >= hi.g - lo.g && hi.r - lo.r >= hi.b - lo.b ? 'r' : hi.g - lo.g >= hi.b - lo.b ? 'g' : 'b';
        const sc = (hi[ax] - lo[ax]) * Math.sqrt(count);
        if (sc > score) { score = sc; best = i; axis = ax; }
      });
      if (best < 0) break;
      const bx = boxes[best].sort((p, q) => p[axis] - q[axis]);
      let half = bx.reduce((t, c) => t + c.n, 0) / 2, cut = 0;
      while (cut < bx.length - 1 && half > 0) half -= bx[cut++].n;
      cut = Math.max(1, Math.min(bx.length - 1, cut));
      boxes.splice(best, 1, bx.slice(0, cut), bx.slice(cut));
    }

    const pal = new Uint8Array(768);
    boxes.forEach((bx, i) => {
      let r = 0, g = 0, b = 0, count = 0;
      bx.forEach(c => { r += c.r * c.n; g += c.g * c.n; b += c.b * c.n; count += c.n; });
      pal[i * 3] = Math.round(r / count); pal[i * 3 + 1] = Math.round(g / count); pal[i * 3 + 2] = Math.round(b / count);
    });
    return { pal, size: boxes.length };
  }

  // variable width LZW as GIF expects it, 8 bit symbols
  function lzw(idx) {
    const out = new Uint8Array(idx.length * 2 + 64);
    let o = 0, cur = 0, shift = 0, size = 9, next = 258, table = new Map();
    const emit = code => {
      cur |= code << shift; shift += size;
      while (shift >= 8) { out[o++] = cur & 255; cur >>>= 8; shift -= 8; }
    };
    emit(256);
    let run = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i], key = run << 8 | k, hit = table.get(key);
      if (hit !== undefined) { run = hit; continue; }
      emit(run);
      if (next === 4096) { emit(256); next = 258; size = 9; table = new Map(); }
      else { if (next >= 1 << size) size++; table.set(key, next++); }
      run = k;
    }
    emit(run); emit(257);
    if (shift > 0) out[o++] = cur & 255;
    return out.subarray(0, o);
  }

  LI.gifEncoder = function (w, h, delayCs) {
    const parts = [];
    let pal = null, size = 0, near = null, prev = null;

    const nearest = (r, g, b) => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < size; i++) {
        const dr = pal[i * 3] - r, dg = pal[i * 3 + 1] - g, db = pal[i * 3 + 2] - b, d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    };

    return {
      setPalette(samples) {
        ({ pal, size } = buildPalette(samples));
        near = new Int16Array(32768).fill(-1);
        const head = new Uint8Array(13 + 768 + 19);
        head.set([71, 73, 70, 56, 57, 97, w & 255, w >> 8, h & 255, h >> 8, 0xf7, 0, 0]);
        head.set(pal, 13);
        head.set([0x21, 0xff, 0x0b, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 0x03, 0x01, 0, 0, 0], 13 + 768);
        parts.push(head);
      },
      // rgba: one frame of pixels. Pixels that match the frame before are written as transparent,
      // which is what keeps a mostly still poster small.
      add(rgba) {
        const N = w * h, idx = new Uint8Array(N), first = !prev;
        if (first) prev = new Uint8Array(N);
        for (let i = 0, p = 0; i < N; i++, p += 4) {
          const k = (rgba[p] >> 3) << 10 | (rgba[p + 1] >> 3) << 5 | rgba[p + 2] >> 3;
          let v = near[k];
          if (v < 0) v = near[k] = nearest(rgba[p], rgba[p + 1], rgba[p + 2]);
          idx[i] = !first && prev[i] === v ? 255 : v;
          prev[i] = v;
        }
        const data = lzw(idx);
        const out = new Uint8Array(19 + data.length + Math.ceil(data.length / 255) + 1);
        out.set([0x21, 0xf9, 0x04, first ? 0x04 : 0x05, delayCs & 255, delayCs >> 8, 255, 0,
          0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0, 8]);
        let o = 19;
        for (let i = 0; i < data.length; i += 255) {
          const len = Math.min(255, data.length - i);
          out[o++] = len;
          out.set(data.subarray(i, i + len), o);
          o += len;
        }
        out[o] = 0;
        parts.push(out);
      },
      finish() {
        parts.push(new Uint8Array([0x3b]));
        return new Blob(parts, { type: 'image/gif' });
      }
    };
  };

  // ---------- video ----------

  // mp4 where the browser can write it, since that is what phones and social apps accept
  LI.videoType = () => {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    return ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find(t => MediaRecorder.isTypeSupported(t)) || null;
  };

  // every export goes through here, so there is one place that touches the disk
  LI.saveFile = (href, name) => {
    const a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
})();

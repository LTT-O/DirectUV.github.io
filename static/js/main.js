/* DirectUV project page */

/* ── Probe: one neighbourhood measured two ways, on a torus unwrapped into four UV islands ── */
(function probe() {
  const root = document.getElementById('probe');
  if (!root || !document.createElement('canvas').getContext) return;

  const NI = 32, NJ = 16;        // tokens around the ring / around the tube
  const HI = NI / 2, HJ = NJ / 2; // tokens per island
  const SUBI = 2, SUBJ = 3;      // mesh subdivisions per token
  const R = 1, r = 0.46;         // torus radii (tokens come out roughly square)
  const GUTTER = 1.6, MARGIN = 0.9; // atlas spacing, in token units
  const AW = 2 * MARGIN + NI + GUTTER, AH = 2 * MARGIN + NJ + GUTTER;
  const SIGMA_GRID = 2.0;        // neighbourhood radius in UV-grid tokens
  const SIGMA_SURF = 0.37;       // the same radius expressed in 3D units
  const LIT = 0.32;              // weight above which a token counts as a neighbour
  const TAU = Math.PI * 2;

  // The tube is cut along its top and bottom ridges and the ring is cut twice,
  // giving an inner/outer island for each half. Islands that touch on the mesh
  // are packed far apart in the atlas, as a UV packer is free to do.
  const SLOT = { '0,0': [0, 0], '0,1': [1, 1], '1,0': [0, 1], '1,1': [1, 0] };
  const TINT = { '0,0': [58, 74, 112], '0,1': [42, 92, 98], '1,0': [92, 66, 108], '1,1': [94, 90, 58] };
  const AMBER = [246, 170, 60], CORAL = [255, 98, 84];

  const angles = (i, j) => [TAU * i / NI, Math.PI / 2 + TAU * j / NJ];
  const surf = (th, ph) => [(R + r * Math.cos(ph)) * Math.cos(th), r * Math.sin(ph), (R + r * Math.cos(ph)) * Math.sin(th)];

  const tokens = [];
  for (let i = 0; i < NI; i++) {
    for (let j = 0; j < NJ; j++) {
      const [th, ph] = angles(i + 0.5, j + 0.5);
      const [x, y, z] = surf(th, ph);
      const key = Math.floor(i / HI) + ',' + Math.floor(j / HJ);
      const slot = SLOT[key];
      tokens.push({
        i, j, x, y, z, th, ph, island: key, tint: TINT[key],
        ax: MARGIN + slot[0] * (HI + GUTTER) + (i % HI),
        ay: MARGIN + slot[1] * (HJ + GUTTER) + (j % HJ),
      });
    }
  }
  const idxOf = (i, j) => ((i % NI + NI) % NI) * NJ + ((j % NJ + NJ) % NJ);
  const atlasLookup = new Map();
  tokens.forEach((t, k) => atlasLookup.set(Math.round(t.ax * 10) + ':' + Math.round(t.ay * 10), k));

  // Fixed camera looking down onto the torus
  const TILT = 60 * Math.PI / 180, YAW = -0.5;
  const cT = Math.cos(TILT), sT = Math.sin(TILT), cY = Math.cos(YAW), sY = Math.sin(YAW);
  const view = ([x, y, z]) => {
    const x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
    return [x1, y * cT - z1 * sT, y * sT + z1 * cT];
  };
  const normal = (th, ph) => view([Math.cos(ph) * Math.cos(th), Math.sin(ph), Math.cos(ph) * Math.sin(th)]);
  const LIGHT = (() => { const l = [-0.35, 0.55, 0.76], n = Math.hypot(...l); return l.map(v => v / n); })();

  const quads = [];
  const MI = NI * SUBI, MJ = NJ * SUBJ, SEAM_I = HI * SUBI, SEAM_J = HJ * SUBJ;
  for (let gi = 0; gi < MI; gi++) {
    for (let gj = 0; gj < MJ; gj++) {
      const [t0, p0] = angles(gi / SUBI, gj / SUBJ), [t1, p1] = angles((gi + 1) / SUBI, (gj + 1) / SUBJ);
      const n = normal((t0 + t1) / 2, (p0 + p1) / 2);
      if (n[2] <= 0.02) continue; // back-facing
      const pts = [view(surf(t0, p0)), view(surf(t1, p0)), view(surf(t1, p1)), view(surf(t0, p1))];
      const seams = [];
      if (gi % SEAM_I === 0) seams.push([0, 3]);
      if ((gi + 1) % SEAM_I === 0) seams.push([1, 2]);
      if (gj % SEAM_J === 0) seams.push([0, 1]);
      if ((gj + 1) % SEAM_J === 0) seams.push([3, 2]);
      quads.push({
        pts, seams,
        depth: view(surf((t0 + t1) / 2, (p0 + p1) / 2))[2],
        token: Math.floor(gi / SUBI) * NJ + Math.floor(gj / SUBJ),
        shade: 0.62 + 0.38 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]),
      });
    }
  }
  quads.sort((a, b) => a.depth - b.depth);
  const centre = tokens.map(t => (normal(t.th, t.ph)[2] > 0.1 ? view([t.x, t.y, t.z]) : null));
  const EXT_X = R + r, EXT_Y = R * sT + r;

  // Each row measures the same probe with its own metric.
  const SAY = {
    gridCut: 'Distance is counted in grid cells of the UV map. The neighbourhood stops dead at the seam: the rest of it sits on another island, far away in the map, so attention treats those texels as strangers.',
    gridWhole: 'Distance is counted in grid cells of the UV map. Here the texel is far from any seam, so nothing is lost. Move it next to a seam.',
    surface: 'Distance is counted between 3D surface coordinates. The neighbourhood stays whole on the mesh, and its two halves find each other no matter where the islands were packed.',
  };
  const rows = Array.from(root.querySelectorAll('.probe__row')).map(el => ({
    mode: el.dataset.mode,
    atlas: el.querySelector('[data-atlas]'),
    mesh: el.querySelector('[data-mesh]'),
    say: el.querySelector('[data-say]'),
    num: el.querySelector('[data-num]'),
    state: new Float32Array(tokens.length), // >0 attended (weight), -1 missed, 0 neither
    scale: 1, ox: 0, oy: 0,
  }));

  let probeIdx = idxOf(8, NJ - 1);

  function classify(row) {
    const p = tokens[probeIdx];
    let real = 0, reached = 0;
    for (let k = 0; k < tokens.length; k++) {
      const t = tokens[k];
      const ws = Math.exp(-((t.x - p.x) ** 2 + (t.y - p.y) ** 2 + (t.z - p.z) ** 2) / (2 * SIGMA_SURF * SIGMA_SURF));
      const w = row.mode === 'surface' ? ws
        : Math.exp(-((t.ax - p.ax) ** 2 + (t.ay - p.ay) ** 2) / (2 * SIGMA_GRID * SIGMA_GRID));
      const isReal = ws > LIT, isLit = w > LIT;
      if (isReal) real++;
      if (isReal && isLit) reached++;
      row.state[k] = isLit ? w : (isReal ? -1 : 0);
    }
    row.num.textContent = reached + ' / ' + real;
    row.num.classList.toggle('is-full', reached === real);
    const say = row.mode === 'surface' ? SAY.surface : (reached < real ? SAY.gridCut : SAY.gridWhole);
    if (row.say.textContent !== say) row.say.textContent = say;
  }

  function colour(t, s, shade) {
    let c = t.tint;
    if (s > 0) { const a = 0.6 + 0.4 * (s - LIT) / (1 - LIT); c = c.map((v, n) => v + (AMBER[n] - v) * a); }
    else if (s < 0) c = c.map((v, n) => v + (CORAL[n] - v) * 0.62);
    return 'rgb(' + (c[0] * shade | 0) + ',' + (c[1] * shade | 0) + ',' + (c[2] * shade | 0) + ')';
  }

  function fit(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return dpr;
  }

  function drawAtlas(row) {
    const cv = row.atlas, dpr = fit(cv), ctx = cv.getContext('2d');
    const u = cv.width / AW, gap = Math.max(1, 0.08 * u);
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let k = 0; k < tokens.length; k++) {
      const t = tokens[k], s = row.state[k], X = t.ax * u + gap / 2, Y = t.ay * u + gap / 2, w = u - gap;
      ctx.fillStyle = colour(t, s, 1);
      ctx.fillRect(X, Y, w, w);
      if (s < 0) { // hatch the neighbours that are out of reach
        ctx.save(); ctx.beginPath(); ctx.rect(X, Y, w, w); ctx.clip();
        ctx.strokeStyle = 'rgba(13,18,32,0.55)'; ctx.lineWidth = Math.max(1, 0.13 * u);
        ctx.beginPath();
        for (let d = -w; d < w; d += 0.36 * u) { ctx.moveTo(X + d, Y + w); ctx.lineTo(X + d + w, Y); }
        ctx.stroke(); ctx.restore();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    for (let sx = 0; sx < 2; sx++) for (let sy = 0; sy < 2; sy++) {
      const o = 0.3;
      ctx.strokeRect((MARGIN + sx * (HI + GUTTER) - o) * u, (MARGIN + sy * (HJ + GUTTER) - o) * u, (HI + 2 * o) * u, (HJ + 2 * o) * u);
    }
    ctx.setLineDash([]);
    const p = tokens[probeIdx];
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * dpr;
    ctx.strokeRect(p.ax * u - dpr, p.ay * u - dpr, u + 2 * dpr, u + 2 * dpr);
  }

  function drawMesh(row) {
    const cv = row.mesh, dpr = fit(cv), ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, pad = 8 * dpr;
    const sc = row.scale = Math.min((W - 2 * pad) / (2 * EXT_X), (H - 2 * pad) / (2 * EXT_Y));
    const ox = row.ox = W / 2, oy = row.oy = H / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const q of quads) {
      const c = colour(tokens[q.token], row.state[q.token], q.shade), p = q.pts;
      ctx.beginPath();
      for (let v = 0; v < 4; v++) {
        const X = ox + p[v][0] * sc, Y = oy - p[v][1] * sc;
        v ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      ctx.closePath();
      ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 0.7 * dpr;
      ctx.fill(); ctx.stroke();
      if (q.seams.length) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.4 * dpr;
        ctx.setLineDash([3 * dpr, 4 * dpr]);
        ctx.beginPath();
        for (const [a, b] of q.seams) {
          ctx.moveTo(ox + p[a][0] * sc, oy - p[a][1] * sc);
          ctx.lineTo(ox + p[b][0] * sc, oy - p[b][1] * sc);
        }
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    const c = centre[probeIdx];
    if (c) {
      const X = ox + c[0] * sc, Y = oy - c[1] * sc;
      ctx.beginPath(); ctx.arc(X, Y, 6.5 * dpr, 0, TAU);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * dpr; ctx.stroke();
    }
  }

  const redraw = () => rows.forEach(row => { drawAtlas(row); drawMesh(row); });
  function render() { rows.forEach(classify); redraw(); }
  function setProbe(idx) { if (idx == null || idx === probeIdx) return; probeIdx = idx; render(); }

  // Picking
  function pickAtlas(row, e) {
    const rect = row.atlas.getBoundingClientRect();
    const ux = (e.clientX - rect.left) / rect.width * AW - MARGIN;
    const uy = (e.clientY - rect.top) / rect.height * AH - MARGIN;
    const cell = (v, half) => {
      const s = v < half + GUTTER / 2 ? 0 : 1;
      return Math.round((MARGIN + s * (half + GUTTER) + Math.min(half - 1, Math.max(0, Math.floor(v - s * (half + GUTTER))))) * 10);
    };
    return atlasLookup.get(cell(ux, HI) + ':' + cell(uy, HJ));
  }
  function pickMesh(row, e) {
    const rect = row.mesh.getBoundingClientRect(), k = row.mesh.width / rect.width;
    const px = ((e.clientX - rect.left) * k - row.ox) / row.scale;
    const py = -((e.clientY - rect.top) * k - row.oy) / row.scale;
    for (let q = quads.length - 1; q >= 0; q--) {
      const p = quads[q].pts;
      let sign = 0, inside = true;
      for (let v = 0; v < 4; v++) {
        const a = p[v], b = p[(v + 1) % 4];
        const cross = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
        if (cross !== 0) {
          if (sign === 0) sign = Math.sign(cross);
          else if (Math.sign(cross) !== sign) { inside = false; break; }
        }
      }
      if (inside) return quads[q].token;
    }
    return null;
  }

  // Until someone takes over, the texel walks back and forth across the seam on top of the tube.
  const PATH = [NJ - 4, NJ - 3, NJ - 2, NJ - 1, NJ - 1, 0, 0, 1, 2, 3];
  const STEP = 850;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let touring = !reduced, onScreen = true, resumeTimer = 0, t0 = performance.now(), pausedAt = 0;
  function tick(now) {
    if (touring && onScreen) {
      const n = Math.floor((now - t0) / STEP) % (2 * PATH.length - 2);
      setProbe(idxOf(8, PATH[n < PATH.length ? n : 2 * PATH.length - 2 - n]));
    }
    requestAnimationFrame(tick);
  }
  function takeOver() { if (touring) pausedAt = performance.now(); touring = false; clearTimeout(resumeTimer); }
  function letGo() {
    if (reduced) return;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { t0 += performance.now() - pausedAt; touring = true; }, 3000);
  }
  rows.forEach(row => {
    [[row.atlas, pickAtlas], [row.mesh, pickMesh]].forEach(([cv, pick]) => {
      const move = e => { takeOver(); setProbe(pick(row, e)); };
      cv.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') move(e); });
      cv.addEventListener('pointerdown', move);
      cv.addEventListener('pointerleave', letGo);
      cv.addEventListener('pointerup', e => { if (e.pointerType === 'touch') letGo(); });
    });
  });

  if ('IntersectionObserver' in window) new IntersectionObserver(es => { onScreen = es[0].isIntersecting; }).observe(root);
  if ('ResizeObserver' in window) new ResizeObserver(redraw).observe(root);
  else window.addEventListener('resize', redraw);

  render();
  requestAnimationFrame(tick);
})();

/* ── Figure lightbox ── */
(function lightbox() {
  const dlg = document.getElementById('lightbox');
  if (!dlg || !dlg.showModal) return;
  const img = dlg.querySelector('img');
  document.querySelectorAll('[data-zoom]').forEach(btn => {
    btn.addEventListener('click', () => {
      img.src = btn.dataset.zoom;
      img.alt = btn.querySelector('img') ? btn.querySelector('img').alt : '';
      dlg.showModal();
    });
  });
  dlg.querySelector('.lightbox__close').addEventListener('click', () => dlg.close());
  dlg.querySelector('.lightbox__scroll').addEventListener('click', () => dlg.close());
})();

/* ── Gallery expand ── */
(function gallery() {
  const fig = document.getElementById('gallery');
  if (!fig) return;
  const btn = fig.querySelector('.fig__more');
  btn.addEventListener('click', () => {
    const open = fig.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Collapse the gallery' : 'Show the full gallery';
    if (!open) fig.scrollIntoView({ block: 'start' });
  });
})();

/* ── Copy BibTeX ── */
(function copyBib() {
  const btn = document.getElementById('copy-bib'), src = document.getElementById('bib');
  if (!btn || !src) return;
  btn.addEventListener('click', async () => {
    const text = src.innerText.trim();
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const sel = window.getSelection(), range = document.createRange();
      range.selectNodeContents(src); sel.removeAllRanges(); sel.addRange(range);
      document.execCommand('copy'); sel.removeAllRanges();
    }
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
  });
})();

// Scribbler Too – Ze-ish (Pressure + Apple Pencil)
// This version switches to Pointer Events and uses evt.pressure (0..1) to scale brush size.
// Works on iPad with Apple Pencil and prevents scrolling while drawing.
(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

  // UI elements
  const toolEl = document.getElementById('tool');
  const colorEl = document.getElementById('color');
  const sizeEl = document.getElementById('size');
  const alphaEl = document.getElementById('alpha');
  const symmetryEl = document.getElementById('symmetry');
  const undoEl = document.getElementById('undo');
  const redoEl = document.getElementById('redo');
  const clearEl = document.getElementById('clear');
  const saveEl = document.getElementById('save');
  const helpEl = document.getElementById('help');
  const helpDialog = document.getElementById('helpDialog');
  const closeHelp = document.getElementById('closeHelp');

  // Resize canvas to device size
  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * DPR);
    canvas.height = Math.floor(rect.height * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    redraw();
  }
  window.addEventListener('resize', resize, { passive: true });

  // State
  let strokes = []; // history of drawn paths
  let redoStack = [];
  let drawing = false;
  let currentStroke = null;

  function pushHistory(stroke) {
    strokes.push(stroke);
    if (strokes.length > 500) strokes.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (strokes.length) {
      redoStack.push(strokes.pop());
      redraw();
    }
  }
  function redo() {
    if (redoStack.length) {
      strokes.push(redoStack.pop());
      redraw();
    }
  }

  
  function fillWhite() {
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.restore();
  }

  function clearAll() {
    strokes = [];
    redoStack = [];
    fillWhite();
    redraw();
  }

  // Tools
  function penStrokePoint(last, pt, size, jitter=0) {
    const jx = (Math.random()-0.5)*jitter;
    const jy = (Math.random()-0.5)*jitter;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pt.x + jx, pt.y + jy);
    ctx.stroke();
  }

  function markerStrokePoint(last, pt, size) {
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = size * 1.6;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  }

  function eraserStrokePoint(last, pt, size) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 2;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.restore();
  }

  function stampScribble(pt, size, color) {
    // Stamps random small shapes for the "scribble" flavor
    const count = 2 + Math.floor(Math.random()*3);
    for (let i=0;i<count;i++) {
      const r = size * (0.4 + Math.random()*0.8);
      const dx = (Math.random()-0.5) * size * 1.2;
      const dy = (Math.random()-0.5) * size * 1.2;
      ctx.save();
      ctx.translate(pt.x + dx, pt.y + dy);
      ctx.rotate(Math.random()*Math.PI*2);
      ctx.globalAlpha *= 0.7;
      ctx.beginPath();
      if (Math.random() < 0.33) {
        // Circle
        ctx.arc(0,0,r*0.5,0,Math.PI*2);
        ctx.fillStyle = color;
        ctx.fill();
      } else if (Math.random() < 0.66) {
        // Triangle
        ctx.moveTo(-r/2, r/2);
        ctx.lineTo(0, -r/2);
        ctx.lineTo(r/2, r/2);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        // Short line
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, r/6);
        ctx.moveTo(-r/2, 0);
        ctx.lineTo(r/2, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function applySymmetry(drawFn) {
    const mode = symmetryEl.value;
    if (mode === 'none') return drawFn(0);
    if (mode === 'mirror') {
      drawFn(0);
      ctx.save();
      ctx.translate(canvas.width/DPR, 0);
      ctx.scale(-1, 1);
      drawFn(1);
      ctx.restore();
      return;
    }
    if (mode.startsWith('radial-')) {
      const n = parseInt(mode.split('-')[1], 10);
      const cx = canvas.width/(2*DPR), cy = canvas.height/(2*DPR);
      for (let i=0;i<n;i++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((i * 2*Math.PI)/n);
        ctx.translate(-cx, -cy);
        drawFn(i);
        ctx.restore();
      }
    }
  }

  // Drawing pipeline
  function startStroke(x, y, pressure=1) {
    drawing = true;
    const stroke = {
      tool: toolEl.value,
      color: colorEl.value,
      size: parseFloat(sizeEl.value),
      alpha: parseFloat(alphaEl.value),
      symmetry: symmetryEl.value,
      points: [{x, y, t: performance.now(), p: pressure}]
    };
    currentStroke = stroke;
  }

  function extendStroke(x, y, pressure=1) {
    if (!drawing || !currentStroke) return;
    const pts = currentStroke.points;
    const last = pts[pts.length-1];
    const pt = {x, y, t: performance.now(), p: pressure};
    pts.push(pt);

    const dt = Math.max(1, pt.t - last.t);
    const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
    const speed = dist / dt; // px/ms
    const baseSize = currentStroke.size;
    // pressure influences size; speed still tapers pen for feel
    const pressureScale = Math.max(0.15, Math.min(1, pressure || 1));
    const dynamicBase = baseSize * pressureScale;
    const dynamicSize = (currentStroke.tool === 'pen')
      ? Math.max(0.5, dynamicBase * (1 - Math.min(0.7, speed*2)))
      : dynamicBase;

    ctx.save();
    ctx.globalAlpha = currentStroke.alpha;
    ctx.strokeStyle = currentStroke.color;
    ctx.fillStyle = currentStroke.color;

    applySymmetry(() => {
      if (currentStroke.tool === 'eraser') {
        eraserStrokePoint(last, pt, dynamicBase);
      } else if (currentStroke.tool === 'marker') {
        markerStrokePoint(last, pt, dynamicSize);
      } else if (currentStroke.tool === 'scribble') {
        penStrokePoint(last, pt, dynamicSize, dynamicBase*0.6);
        if (Math.random() < 0.25) stampScribble(pt, dynamicBase, currentStroke.color);
      } else {
        penStrokePoint(last, pt, dynamicSize, 0);
      }
    });

    ctx.restore();
  }

  function endStroke() {
    if (!drawing || !currentStroke) return;
    pushHistory(currentStroke);
    drawing = false;
    currentStroke = null;
  }

  // Redraw from history
  function redraw() {
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fillWhite();
    for (const s of strokes) {
      ctx.globalAlpha = s.alpha;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      const pts = s.points;
      if (!pts || pts.length<2) continue;

      const draw = () => {
        if (s.tool === 'eraser') {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (let i=1;i<pts.length;i++) {
            const b = Math.max(0.5, s.size * (pts[i].p || 1));
            ctx.lineWidth = b * 2;
            ctx.beginPath();
            ctx.moveTo(pts[i-1].x, pts[i-1].y);
            ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
          }
          ctx.restore();
          return;
        }

        for (let i=1;i<pts.length;i++) {
          const last = pts[i-1], pt = pts[i];
          const pressureScale = Math.max(0.15, Math.min(1, pt.p || 1));
          const dynamicBase = s.size * pressureScale;
          const width = (s.tool === 'marker') ? dynamicBase*1.6 : dynamicBase;
          ctx.lineCap = (s.tool === 'marker') ? 'butt' : 'round';
          ctx.lineJoin = (s.tool === 'marker') ? 'miter' : 'round';
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(pt.x, pt.y);
          ctx.stroke();
          if (s.tool === 'scribble' && Math.random() < 0.07) {
            stampScribble(pt, dynamicBase, s.color);
          }
        }
      };

      applySymmetry(draw);
    }
    ctx.restore();
  }

  // Pointer handlers (touch + mouse + pencil) with pressure
  let rectCache = null;
  function updateRect() { rectCache = canvas.getBoundingClientRect(); }
  window.addEventListener('resize', updateRect);
  updateRect();

  function toXYFromClient(clientX, clientY) {
    return { x: (clientX - rectCache.left), y: (clientY - rectCache.top) };
  }
  function pressureOf(evt) {
    // evt.pressure is 0..1 for pens; for mouse it may be 0 -> use 1
    const p = (typeof evt.pressure === 'number' && evt.pressure > 0) ? evt.pressure : (evt.pointerType === 'mouse' ? 1 : 0.5);
    return Math.max(0.15, Math.min(1, p));
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const {x,y} = toXYFromClient(e.clientX, e.clientY);
    startStroke(x, y, pressureOf(e));
  }, { passive: false });

  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    e.preventDefault();
    const {x,y} = toXYFromClient(e.clientX, e.clientY);
    extendStroke(x, y, pressureOf(e));
  }, { passive: false });

  function finish(e){ endStroke(); try{ canvas.releasePointerCapture(e.pointerId); }catch{} }
  canvas.addEventListener('pointerup', e => { e.preventDefault(); finish(e); }, { passive: false });
  canvas.addEventListener('pointercancel', e => { e.preventDefault(); finish(e); }, { passive: false });

  // Prevent scrolling while drawing on iPad
  document.body.addEventListener('touchmove', (e) => { if (e.target === canvas) e.preventDefault(); }, {passive:false});

  // Buttons
  undoEl.addEventListener('click', undo);
  redoEl.addEventListener('click', redo);
  clearEl.addEventListener('click', clearAll);
  saveEl.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'scribbler-too.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  });

  helpEl?.addEventListener('click', () => helpDialog?.showModal && helpDialog.showModal());
  closeHelp?.addEventListener('click', () => helpDialog?.close && helpDialog.close());

  // Keyboard shortcuts (for desktop)
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) redo(); else undo();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      redo();
    }
  });

  // Persist simple settings
  const LS = 'scribbler-too-v1';
  function saveSettings() {
    const s = {
      tool: toolEl.value, color: colorEl.value, size: sizeEl.value,
      alpha: alphaEl.value, symmetry: symmetryEl.value
    };
    localStorage.setItem(LS, JSON.stringify(s));
  }
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(LS) || '{}');
      if (s.tool) toolEl.value = s.tool;
      if (s.color) colorEl.value = s.color;
      if (s.size) sizeEl.value = s.size;
      if (s.alpha) alphaEl.value = s.alpha;
      if (s.symmetry) symmetryEl.value = s.symmetry;
    } catch {}
  }
  [toolEl, colorEl, sizeEl, alphaEl, symmetryEl].forEach(el => el?.addEventListener('change', saveSettings));
  loadSettings();

  // Initial setup
  resize();
  setTimeout(resize, 100);
})();

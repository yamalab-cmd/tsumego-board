// 詰碁ボード ― 自由配置エディタ
// 盤面データ: Map<"x,y", "B"|"W">  (x,y は 0..N-1)

(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('status');
  const toolbar = document.getElementById('toolbar');
  const sizeSel = document.getElementById('boardSize');

  const state = {
    N: 19,
    stones: new Map(),   // "x,y" -> "B" | "W"
    mode: 'alternate',   // alternate | black | white | erase | move | group
    nextColor: 'B',      // 交互モード用
    history: [],         // スナップショット(直前まで)
    drag: null,          // {from:"x,y", color, px, py}
    gdrag: null,         // 全体移動中 {base:Map, start:{gx,gy}}
    cornerIdx: 0,        // 「隅へ配置」の巡回位置
  };

  // ---- 幾何計算 ----
  let geom = { size: 0, cell: 0, margin: 0, dpr: 1 };

  function computeGeom() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssSize = Math.max(1, Math.min(rect.width, rect.height));
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    const size = canvas.width;
    const units = (state.N - 1) + 1.2;      // 端の余白 0.6セル ×2
    const cell = size / units;
    const margin = cell * 0.6;
    geom = { size, cell, margin, dpr, cssSize };
  }

  function ix2px(i) { return geom.margin + i * geom.cell; }

  // クライアント座標 -> 最寄りの交点 {x,y} または null
  function clientToIntersection(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    const fx = (px - geom.margin) / geom.cell;
    const fy = (py - geom.margin) / geom.cell;
    const x = Math.round(fx);
    const y = Math.round(fy);
    if (x < 0 || y < 0 || x >= state.N || y >= state.N) return null;
    // 交点から離れすぎたタップは無効(誤操作防止)
    const dx = fx - x, dy = fy - y;
    if (Math.hypot(dx, dy) > 0.5) return null;
    return { x, y, px, py };
  }

  // ---- 星の座標 ----
  function starPoints(N) {
    if (N === 19) return [3, 9, 15];
    if (N === 13) return [3, 6, 9];
    if (N === 9) return [2, 4, 6];
    return [];
  }

  // ---- 描画 ----
  function draw() {
    const { size, cell, margin } = geom;
    ctx.clearRect(0, 0, size, size);

    // 盤面
    ctx.fillStyle = getVar('--board');
    ctx.fillRect(0, 0, size, size);

    // 罫線
    ctx.strokeStyle = getVar('--line');
    ctx.lineWidth = Math.max(1, cell * 0.03);
    ctx.beginPath();
    for (let i = 0; i < state.N; i++) {
      const p = ix2px(i);
      ctx.moveTo(ix2px(0), p); ctx.lineTo(ix2px(state.N - 1), p);
      ctx.moveTo(p, ix2px(0)); ctx.lineTo(p, ix2px(state.N - 1));
    }
    ctx.stroke();

    // 星
    const stars = starPoints(state.N);
    ctx.fillStyle = getVar('--line');
    for (const sx of stars) for (const sy of stars) {
      ctx.beginPath();
      ctx.arc(ix2px(sx), ix2px(sy), cell * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }

    // 石
    for (const [key, color] of state.stones) {
      if (state.drag && state.drag.from === key) continue; // ドラッグ中は元位置を隠す
      const [x, y] = key.split(',').map(Number);
      drawStone(ix2px(x), ix2px(y), color);
    }

    // ドラッグ中のゴースト
    if (state.drag) {
      drawStone(state.drag.px, state.drag.py, state.drag.color, 0.85);
    }
  }

  function drawStone(cx, cy, color, alpha = 1) {
    const r = geom.cell * 0.46;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (color === 'B') {
      ctx.fillStyle = '#141414';
    } else {
      ctx.fillStyle = '#f7f7f7';
      ctx.strokeStyle = '#8a8a8a';
      ctx.lineWidth = Math.max(1, r * 0.06);
    }
    ctx.fill();
    if (color === 'W') ctx.stroke();
    ctx.restore();
  }

  function getVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ---- 操作 ----
  // 盤面だけでなく手番(次に置く色)も一緒に保存し、元に戻すで手番も復元する。
  function snapshot() {
    state.history.push({ stones: new Map(state.stones), nextColor: state.nextColor });
    if (state.history.length > 200) state.history.shift();
  }

  function inBoard(x, y) {
    return x >= 0 && y >= 0 && x < state.N && y < state.N;
  }

  // (x,y)の同色連(グループ)と、その呼吸点(空点)数を返す。
  function groupLiberties(x, y) {
    const color = state.stones.get(`${x},${y}`);
    const seen = new Set();
    const libs = new Set();
    const group = [];
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      const k = `${cx},${cy}`;
      if (seen.has(k)) continue;
      seen.add(k);
      group.push(k);
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        if (!inBoard(nx, ny)) continue;
        const nk = `${nx},${ny}`;
        const nc = state.stones.get(nk);
        if (nc === undefined) libs.add(nk);
        else if (nc === color) stack.push([nx, ny]);
      }
    }
    return { group, libs: libs.size };
  }

  // (x,y)に置いた color の石で、呼吸点の無くなった相手の連を取り上げる。
  function captureAround(x, y, color) {
    const opp = color === 'B' ? 'W' : 'B';
    let removed = 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (!inBoard(nx, ny) || state.stones.get(`${nx},${ny}`) !== opp) continue;
      const { group, libs } = groupLiberties(nx, ny);
      if (libs === 0) {
        for (const k of group) state.stones.delete(k);
        removed += group.length;
      }
    }
    return removed;
  }

  function placeAt(x, y) {
    const key = `${x},${y}`;
    const mode = state.mode;
    if (mode === 'erase') {
      if (!state.stones.has(key)) return;
      snapshot();
      state.stones.delete(key);
    } else {
      let color;
      if (mode === 'black') color = 'B';
      else if (mode === 'white') color = 'W';
      else if (mode === 'alternate') color = state.nextColor;
      else return;
      snapshot();
      state.stones.set(key, color);
      // 取りは「交互(打ち進め)」モードのときだけ適用。
      // 単色配置・写真取り込みは配置(問題設定)用なので取らない。
      if (mode === 'alternate') {
        captureAround(x, y, color);
        state.nextColor = (color === 'B') ? 'W' : 'B';
      }
    }
    updateStatus();
    draw();
  }

  function updateStatus() {
    let b = 0, w = 0;
    for (const c of state.stones.values()) (c === 'B') ? b++ : w++;
    let txt = `黒 ${b} ・ 白 ${w}`;
    if (state.mode === 'alternate') txt += `　次は${state.nextColor === 'B' ? '黒' : '白'}`;
    else if (state.mode === 'group') txt += '　盤をドラッグで全体移動';
    statusEl.textContent = txt;
    updateAltLabel();
  }

  // 「交互」ボタンの文言を、次に置く色にあわせて更新
  const altBtn = document.getElementById('altBtn');
  function updateAltLabel() {
    altBtn.textContent = `交互 次:${state.nextColor === 'B' ? '黒' : '白'}`;
  }

  // クライアント座標 -> 最寄り交点(盤内にクランプ、距離チェックなし)。全体移動用。
  function clientToGridPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    const clamp = (v) => Math.max(0, Math.min(state.N - 1, v));
    return {
      gx: clamp(Math.round((px - geom.margin) / geom.cell)),
      gy: clamp(Math.round((py - geom.margin) / geom.cell)),
    };
  }

  // gdrag.base を (dx,dy) だけ平行移動して stones を再構築(盤外に出ないようクランプ)。
  function shiftGroup(dx, dy) {
    const base = state.gdrag.base;
    const bb = bboxOf(base);
    dx = Math.max(-bb.minX, Math.min(state.N - 1 - bb.maxX, dx));
    dy = Math.max(-bb.minY, Math.min(state.N - 1 - bb.maxY, dy));
    const next = new Map();
    for (const [key, color] of base) {
      const [x, y] = key.split(',').map(Number);
      next.set(`${x + dx},${y + dy}`, color);
    }
    state.stones = next;
    draw();
  }

  function bboxOf(map) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const key of map.keys()) {
      const [x, y] = key.split(',').map(Number);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  }

  // 石全体を指定の隅へ寄せる(タップのたび 右下→左下→左上→右上 と巡回)。
  function snapToCorner() {
    if (!state.stones.size) return;
    const bb = bboxOf(state.stones);
    const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
    const corners = [
      { x: state.N - 1 - w, y: state.N - 1 - h }, // 右下
      { x: 0,               y: state.N - 1 - h }, // 左下
      { x: 0,               y: 0 },               // 左上
      { x: state.N - 1 - w, y: 0 },               // 右上
    ];
    const c = corners[state.cornerIdx % corners.length];
    state.cornerIdx++;
    snapshot();
    const dx = c.x - bb.minX, dy = c.y - bb.minY;
    const next = new Map();
    for (const [key, color] of state.stones) {
      const [x, y] = key.split(',').map(Number);
      next.set(`${x + dx},${y + dy}`, color);
    }
    state.stones = next;
    updateStatus();
    draw();
  }

  // ---- ポインタ操作 ----
  let downPt = null;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const hit = clientToIntersection(e.clientX, e.clientY);
    downPt = hit;
    if (state.mode === 'move' && hit) {
      const key = `${hit.x},${hit.y}`;
      if (state.stones.has(key)) {
        state.drag = { from: key, color: state.stones.get(key), px: hit.px, py: hit.py };
        draw();
      }
    } else if (state.mode === 'group' && state.stones.size) {
      // 全体移動: 石全体を一括で平行移動する
      snapshot();
      state.gdrag = { base: new Map(state.stones), start: clientToGridPoint(e.clientX, e.clientY) };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (state.gdrag) {
      const cur = clientToGridPoint(e.clientX, e.clientY);
      shiftGroup(cur.gx - state.gdrag.start.gx, cur.gy - state.gdrag.start.gy);
      return;
    }
    if (!state.drag) return;
    const rect = canvas.getBoundingClientRect();
    state.drag.px = (e.clientX - rect.left) * (canvas.width / rect.width);
    state.drag.py = (e.clientY - rect.top) * (canvas.height / rect.height);
    draw();
  });

  canvas.addEventListener('pointerup', (e) => {
    const hit = clientToIntersection(e.clientX, e.clientY);

    if (state.gdrag) {
      state.gdrag = null;
      updateStatus();
      draw();
      downPt = null;
      return;
    }

    if (state.drag) {
      if (hit) {
        const toKey = `${hit.x},${hit.y}`;
        if (toKey !== state.drag.from) {
          snapshot();
          state.stones.delete(state.drag.from);
          state.stones.set(toKey, state.drag.color); // 移動先に既存石があれば上書き
        }
      }
      state.drag = null;
      updateStatus();
      draw();
      downPt = null;
      return;
    }

    // タップ配置(move以外)
    if (hit && downPt && hit.x === downPt.x && hit.y === downPt.y) {
      placeAt(hit.x, hit.y);
    }
    downPt = null;
  });

  canvas.addEventListener('pointercancel', () => {
    state.drag = null; state.gdrag = null; downPt = null; draw();
  });

  // ---- UI ----
  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('button.mode');
    if (!btn) return;
    const m = btn.dataset.mode;
    // 交互を選択中に再タップ → 次に置く色を黒/白で切り替え
    if (m === 'alternate' && state.mode === 'alternate') {
      state.nextColor = (state.nextColor === 'B') ? 'W' : 'B';
    } else {
      state.mode = m;
      [...toolbar.querySelectorAll('button.mode')].forEach(b => b.classList.toggle('active', b === btn));
    }
    updateStatus();
  });

  document.getElementById('undoBtn').addEventListener('click', () => {
    if (!state.history.length) return;
    const prev = state.history.pop();
    state.stones = prev.stones;
    state.nextColor = prev.nextColor;   // 手番も元に戻す
    updateStatus();
    draw();
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    if (!state.stones.size) return;
    snapshot();
    state.stones.clear();
    state.nextColor = 'B';
    updateStatus();
    draw();
  });

  // ---- 隅へ配置 ----
  document.getElementById('cornerBtn').addEventListener('click', snapToCorner);

  // ※ 公開版(web-editor)は写真からの読み込み機能を外しています。
  //   （認識はローカルのサーバー版でのみ利用可能）

  sizeSel.addEventListener('change', () => {
    state.N = Number(sizeSel.value);
    state.stones.clear();
    state.history = [];
    state.nextColor = 'B';
    computeGeom();
    updateStatus();
    draw();
  });

  window.addEventListener('resize', () => { computeGeom(); draw(); });

  // 端末に応じた初期の路数: iPhone→9, iPad→13, PC等→19
  function pickDefaultBoardSize() {
    const isTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    if (!isTouch) return 19;                       // PC など(タッチ非対応)
    const minDim = Math.min(window.screen.width, window.screen.height);
    if (minDim <= 500) return 9;                   // iPhone クラス
    if (minDim <= 1100) return 13;                 // iPad クラス
    return 19;
  }

  // 初期化
  state.N = pickDefaultBoardSize();
  sizeSel.value = String(state.N);
  computeGeom();
  updateStatus();
  draw();
})();

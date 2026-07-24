/* ==========================================================================
   タッチで打て！野球盤ゲーム - ゲーム本体スクリプト
   外部ライブラリ非依存。Canvas 2D + Pointer Events のみで動作する。
   スマートフォン（縦画面）専用のシンプルなバッティングゲーム。
   ========================================================================== */
'use strict';

/* ==========================================================================
   1. 設定値（数値調整はすべてここに集約する）
   ========================================================================== */
const CONFIG = {
  innings: 3,
  pitch: {
    minDurationMs: 700,  // 投球がホームベースに到達するまでの最短時間
    maxDurationMs: 1000, // 最長時間
  },
  // スイングタイミングと判定の対応。値は「理想タイミングとのズレ(ms)」の許容幅
  timing: {
    perfectMs: 45,    // ほぼ完全一致 → ホームラン
    greatMs: 90,       // 非常に良い → 三塁打/二塁打
    goodMs: 150,        // 良い → ヒット
    okMs: 260,          // 少し早い・遅い → ファウル/アウト（これを超えると空振り）
    randomness: 0.15,   // ランダム要素の強さ（0〜1）
    lookGraceMs: 90,    // ボール通過後、見逃しストライクと確定させるまでの猶予
  },
  // 打球アニメーションの飛距離・軌道パラメータ（W・H に対する比率）
  battedBall: {
    foul:    { durationMs: 420, dx: 0.55, dyFactor: 0.16, arc: 40 },
    out:     { durationMs: 550, dx: 0.20, dyFactor: 0.40, arc: 60 },
    hit:     { durationMs: 600, dx: 0.30, dyFactor: 0.55, arc: 90 },
    double:  { durationMs: 700, dx: 0.42, dyFactor: 0.68, arc: 130 },
    triple:  { durationMs: 800, dx: 0.46, dyFactor: 0.82, arc: 160 },
    homerun: { durationMs: 750, dx: 0.12, dyFactor: 1.20, arc: 50 },
  },
  storageKeys: {
    highScore: 'baseballGame_highScore',
    totalHomeruns: 'baseballGame_totalHomeruns',
    playCount: 'baseballGame_playCount',
    sound: 'baseballGame_soundEnabled',
    vibration: 'baseballGame_vibrationEnabled',
    howto: 'baseballGame_howtoSeen',
  },
  // タイミング評価(グレード)のしきい値。timing.xxxMs の何倍までかで判定する
  grade: {
    sMul: 1.3, aMul: 1.3, bMul: 1.3, cMul: 1.3,
  },
  face: {
    outputSize: 320, // 保存する顔画像の一辺(px)
    dbName: 'baseballGamePitcherDB',
    storeName: 'faceStore',
    dbKey: 'pitcherFace',
  },
};

const FACE_LS_KEY = 'baseballGame_pitcherFaceDataUrl'; // IndexedDB不可時のフォールバック保存先
const CIRCLE_DIAMETER = 260; // ピッチャー顔編集キャンバス内の円形マスクの直径
const EDIT_CANVAS_SIZE = 300;

/* ==========================================================================
   2. ユーティリティ関数
   ========================================================================== */
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function rand(min, max) { return Math.random() * (max - min) + min; }

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = src;
  });
}

function imgSize(img) {
  return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
}

// 元画像が大きすぎる場合、最大辺が maxDim に収まるよう縮小した作業用画像(Canvas)を返す
function downscaleIfNeeded(img, maxDim) {
  const { w, h } = imgSize(img);
  const longSide = Math.max(w, h);
  if (longSide <= maxDim) return img;
  const scale = maxDim / longSide;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// ボタンの二重タップ・二重処理を防止するラッパー
function bindTapButton(el, handler) {
  if (!el) return;
  let locked = false;
  el.addEventListener('pointerdown', (e) => {
    if (el.disabled) return;
    e.preventDefault();
    if (locked) return;
    locked = true;
    handler();
    setTimeout(() => { locked = false; }, 150);
  }, { passive: false });
}

function vibrateSafe(pattern) {
  if (!Game.settings.vibration) return;
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (err) { /* 非対応端末やエラーは無視する */ }
}

// 塁上ランナーを advanceBases 個ぶん進める。打者自身は含まない。
// 返り値: 新しい塁状況（打者はまだ配置しない）と、得点したランナー数
function advanceRunners(bases, advanceBases) {
  const newBases = [false, false, false];
  let runsScored = 0;
  for (let i = 2; i >= 0; i--) {
    if (bases[i]) {
      const newPos = i + advanceBases;
      if (newPos >= 3) runsScored++;
      else newBases[newPos] = true;
    }
  }
  return { newBases, runsScored };
}

// スイングの平均タイミング誤差(ms)からタイミング評価(グレード)を算出する
function computeTimingGrade(avgDeltaMs) {
  if (avgDeltaMs == null) return '-';
  const t = CONFIG.timing, g = CONFIG.grade;
  if (avgDeltaMs <= t.perfectMs * g.sMul) return 'S';
  if (avgDeltaMs <= t.greatMs * g.aMul) return 'A';
  if (avgDeltaMs <= t.goodMs * g.bMul) return 'B';
  if (avgDeltaMs <= t.okMs * g.cMul) return 'C';
  return 'D';
}

// スイングタイミングのズレ(ms)から打撃結果を判定する。
// タイミングが結果に強く影響しつつ、一定のランダム要素を加える。
function judgeSwingTiming(deltaMs) {
  const t = CONFIG.timing;
  const abs = Math.abs(deltaMs);
  const jitter = abs * t.randomness * (Math.random() * 2 - 1);
  const adjusted = Math.max(0, abs + jitter);

  if (adjusted <= t.perfectMs) return 'homerun';
  if (adjusted <= t.greatMs) return Math.random() < 0.5 ? 'triple' : 'double';
  if (adjusted <= t.goodMs) return 'hit';
  if (adjusted <= t.okMs) return Math.random() < 0.5 ? 'foul' : 'out';
  return 'miss';
}

/* ==========================================================================
   3. データ保存（localStorage / IndexedDB）
   すべて端末内で完結し、外部サーバーへは一切送信しない
   ========================================================================== */
function loadSettings() {
  try {
    const s = localStorage.getItem(CONFIG.storageKeys.sound);
    const v = localStorage.getItem(CONFIG.storageKeys.vibration);
    Game.settings.sound = s === null ? true : s === '1';
    Game.settings.vibration = v === null ? true : v === '1';
  } catch (err) { /* プライベートモード等は無視 */ }
}
function saveSetting(key, value) {
  try { localStorage.setItem(key, value ? '1' : '0'); } catch (err) { /* 無視 */ }
}
function loadHighScore() {
  try { return parseInt(localStorage.getItem(CONFIG.storageKeys.highScore), 10) || 0; }
  catch (err) { return 0; }
}
function saveHighScore(value) {
  try { localStorage.setItem(CONFIG.storageKeys.highScore, String(value)); } catch (err) { /* 無視 */ }
}
function loadNumber(key) {
  try { return parseInt(localStorage.getItem(key), 10) || 0; } catch (err) { return 0; }
}
function saveNumber(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (err) { /* 無視 */ }
}
function saveHowtoSeen() {
  try { localStorage.setItem(CONFIG.storageKeys.howto, '1'); } catch (err) { /* 無視 */ }
}

// ピッチャー顔画像の保存先。対応端末では IndexedDB、不可の場合は localStorage にフォールバックする
const FaceStore = {
  dbPromise: null,
  useIndexedDB: typeof indexedDB !== 'undefined',
  openDB() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(CONFIG.face.dbName, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(CONFIG.face.storeName); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (err) { reject(err); }
    });
    return this.dbPromise;
  },
  async save(dataUrl) {
    if (this.useIndexedDB) {
      try {
        const db = await this.openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(CONFIG.face.storeName, 'readwrite');
          tx.objectStore(CONFIG.face.storeName).put(dataUrl, CONFIG.face.dbKey);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        return;
      } catch (err) {
        console.error('IndexedDBへの保存に失敗、localStorageにフォールバックします:', err);
      }
    }
    try { localStorage.setItem(FACE_LS_KEY, dataUrl); } catch (err) { /* 容量超過等は無視 */ }
  },
  async load() {
    if (this.useIndexedDB) {
      try {
        const db = await this.openDB();
        const result = await new Promise((resolve, reject) => {
          const tx = db.transaction(CONFIG.face.storeName, 'readonly');
          const req = tx.objectStore(CONFIG.face.storeName).get(CONFIG.face.dbKey);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        });
        if (result) return result;
      } catch (err) {
        console.error('IndexedDBからの読み込みに失敗:', err);
      }
    }
    try { return localStorage.getItem(FACE_LS_KEY); } catch (err) { return null; }
  },
  async clear() {
    if (this.useIndexedDB) {
      try {
        const db = await this.openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(CONFIG.face.storeName, 'readwrite');
          tx.objectStore(CONFIG.face.storeName).delete(CONFIG.face.dbKey);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) { /* 無視 */ }
    }
    try { localStorage.removeItem(FACE_LS_KEY); } catch (err) { /* 無視 */ }
  },
};

/* ==========================================================================
   4. サウンド（外部音源なしのシンプルなビープ音合成）
   スマホの自動再生制限を考慮し、最初のユーザー操作後に AudioContext を生成する
   ========================================================================== */
const AudioEngine = {
  ctx: null,
  unlock() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch (err) { this.ctx = null; }
  },
  beep(freq, duration, type, vol, freqEnd) {
    if (!Game.settings.sound || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  },
  pitchSound() { this.beep(300, 0.12, 'sine', 0.09, 220); },
  swingSound() { this.beep(700, 0.08, 'sawtooth', 0.06, 300); },
  contactSound() { this.beep(150, 0.1, 'square', 0.12, 90); },
  hitSound() { this.contactSound(); this.beep(880, 0.12, 'triangle', 0.1, 1200); },
  foulSound() { this.contactSound(); this.beep(500, 0.15, 'sawtooth', 0.08, 260); },
  swingMissSound() { this.beep(220, 0.14, 'sawtooth', 0.09, 90); },
  lookSound() { this.beep(260, 0.16, 'square', 0.08, 140); },
  outSound() { this.beep(180, 0.3, 'sawtooth', 0.14, 60); },
  homerunSound() { this.contactSound(); this.beep(660, 0.2, 'square', 0.14, 1320); },
  scoreSound() { this.beep(1046, 0.18, 'triangle', 0.12, 1568); },
  gameEndSound() { this.beep(440, 0.5, 'sine', 0.14, 220); },
};

/* ==========================================================================
   5. ピッチャー顔画像
   ========================================================================== */
// 画像未設定時に描画するデフォルトの顔（外部画像に依存しない簡易シルエット）
function drawDefaultFace(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = '#e8f0ff';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = 'rgba(113,128,150,0.45)';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.12, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.68, cy + r * 0.62);
  ctx.quadraticCurveTo(cx, cy + r * 0.05, cx + r * 0.68, cy + r * 0.62);
  ctx.lineTo(cx + r * 0.68, cy + r);
  ctx.lineTo(cx - r * 0.68, cy + r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const PitcherFace = {
  hasCustom: false,
  image: null,
  async init() {
    try {
      const dataUrl = await FaceStore.load();
      if (dataUrl) await this.loadCustom(dataUrl);
    } catch (err) { console.error('顔画像の読み込みに失敗:', err); }
  },
  loadCustom(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { this.image = img; this.hasCustom = true; resolve(); };
      img.onerror = () => { this.hasCustom = false; resolve(); };
      img.src = dataUrl;
    });
  },
  clearCustom() { this.image = null; this.hasCustom = false; },
  // 円形にクリップして描画する（ゲーム画面のピッチャー・設定画面のプレビュー両方で使用）
  drawInto(ctx, cx, cy, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (this.hasCustom && this.image) {
      const iw = this.image.naturalWidth, ih = this.image.naturalHeight;
      const scale = Math.max((r * 2) / iw, (r * 2) / ih);
      const dw = iw * scale, dh = ih * scale;
      ctx.drawImage(this.image, cx - dw / 2, cy - dh / 2, dw, dh);
    } else {
      drawDefaultFace(ctx, cx, cy, r);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.stroke();
  },
};

/* ==========================================================================
   6. ピッチャー顔写真エディタ（選択・ドラッグ移動・ピンチ/スライダー拡大縮小）
   処理はすべて端末内で完結し、外部サーバーへは送信しない
   ========================================================================== */
const FaceEditor = {
  canvas: null, ctx: null, slider: null, status: null, saveBtn: null, resetBtn: null, wrap: null, input: null,
  img: null, scale: 1, minScale: 1, offsetX: 0, offsetY: 0,
  pointers: new Map(),
  dragLast: null,
  pinchStartDist: null,
  pinchStartScale: null,

  init() {
    this.canvas = document.getElementById('pitcher-edit-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.slider = document.getElementById('pitcher-zoom-slider');
    this.status = document.getElementById('pitcher-status');
    this.saveBtn = document.getElementById('btn-pitcher-save');
    this.resetBtn = document.getElementById('btn-pitcher-reset');
    this.input = document.getElementById('pitcher-face-input');

    this.input.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) this.handleFile(file);
      this.input.value = '';
    });

    this.slider.addEventListener('input', () => {
      if (!this.img) return;
      const val = Number(this.slider.value);
      this.scale = this.minScale + (val / 100) * (this.minScale * 2);
      this.clampOffset();
      this.draw();
    });

    bindTapButton(this.saveBtn, () => this.save());
    bindTapButton(this.resetBtn, () => this.resetToDefault());

    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    this.canvas.addEventListener('pointerup', (e) => this.onPointerEnd(e), { passive: false });
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerEnd(e), { passive: false });
    this.canvas.addEventListener('pointerleave', (e) => this.onPointerEnd(e), { passive: false });

    this.draw();
  },

  // ピッチャー設定画面を開くたびに編集状態をリセットする（未保存の変更は破棄）
  reset() {
    this.img = null;
    this.pointers.clear();
    this.dragLast = null;
    this.pinchStartDist = null;
    this.saveBtn.disabled = true;
    this.status.textContent = '';
    this.slider.value = 0;
  },

  setStatus(text) { this.status.textContent = text; },

  async handleFile(file) {
    if (!file.type || !file.type.startsWith('image/')) { this.setStatus('画像ファイルを選択してください'); return; }
    if (file.size > 25 * 1024 * 1024) { this.setStatus('ファイルサイズが大きすぎます（25MB以下でお試しください）'); return; }
    this.setStatus('読み込み中…');
    await nextFrame();
    const objectUrl = URL.createObjectURL(file);
    try {
      const rawImg = await loadImage(objectUrl);
      const img = downscaleIfNeeded(rawImg, 1600);
      const size = imgSize(img);
      this.img = img;
      this.minScale = CIRCLE_DIAMETER / Math.min(size.w, size.h);
      this.scale = this.minScale;
      this.offsetX = 0;
      this.offsetY = 0;
      this.slider.value = 0;
      this.saveBtn.disabled = false;
      this.draw();
      this.setStatus('位置と大きさを調整して「保存」を押してください');
    } catch (err) {
      console.error('画像の読み込みに失敗:', err);
      this.setStatus('画像の読み込みに失敗しました。別の画像でお試しください');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  },

  clampOffset() {
    if (!this.img) return;
    const size = imgSize(this.img);
    this.scale = clamp(this.scale, this.minScale, this.minScale * 3);
    const dispW = size.w * this.scale;
    const dispH = size.h * this.scale;
    const maxOffX = Math.max(0, (dispW - CIRCLE_DIAMETER) / 2);
    const maxOffY = Math.max(0, (dispH - CIRCLE_DIAMETER) / 2);
    this.offsetX = clamp(this.offsetX, -maxOffX, maxOffX);
    this.offsetY = clamp(this.offsetY, -maxOffY, maxOffY);
  },

  syncSlider() {
    const val = ((this.scale - this.minScale) / (this.minScale * 2)) * 100;
    this.slider.value = String(clamp(val, 0, 100));
  },

  draw() {
    const ctx = this.ctx;
    const W = EDIT_CANVAS_SIZE, H = EDIT_CANVAS_SIZE;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#e8f0ff';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, r = CIRCLE_DIAMETER / 2;
    if (this.img) {
      const size = imgSize(this.img);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      const dispW = size.w * this.scale;
      const dispH = size.h * this.scale;
      ctx.drawImage(this.img, cx - dispW / 2 + this.offsetX, cy - dispH / 2 + this.offsetY, dispW, dispH);
      ctx.restore();
    } else {
      drawDefaultFace(ctx, cx, cy, r);
    }
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  },

  // CSS表示サイズと内部解像度の比率（ポインタ移動量を内部座標系に変換するため）
  canvasScaleFactor() {
    const rect = this.canvas.getBoundingClientRect();
    return rect.width ? EDIT_CANVAS_SIZE / rect.width : 1;
  },

  onPointerDown(e) {
    if (!this.img) return;
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.dragLast = { x: e.clientX, y: e.clientY };
    } else if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.pinchStartScale = this.scale;
      this.dragLast = null;
    }
  },

  onPointerMove(e) {
    if (!this.img || !this.pointers.has(e.pointerId)) return;
    e.preventDefault();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const f = this.canvasScaleFactor();
    if (this.pointers.size === 1 && this.dragLast) {
      this.offsetX += (e.clientX - this.dragLast.x) * f;
      this.offsetY += (e.clientY - this.dragLast.y) * f;
      this.dragLast = { x: e.clientX, y: e.clientY };
      this.clampOffset();
      this.draw();
    } else if (this.pointers.size === 2 && this.pinchStartDist) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.scale = clamp(this.pinchStartScale * (dist / this.pinchStartDist), this.minScale, this.minScale * 3);
      this.syncSlider();
      this.clampOffset();
      this.draw();
    }
  },

  onPointerEnd(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 1) {
      const [p] = this.pointers.values();
      this.dragLast = { x: p.x, y: p.y };
      this.pinchStartDist = null;
    } else if (this.pointers.size === 0) {
      this.dragLast = null;
      this.pinchStartDist = null;
    }
  },

  // 編集内容を正方形画像として書き出す（minScaleにより全域が画像で埋まることを保証）
  renderOutput() {
    const size = imgSize(this.img);
    const out = document.createElement('canvas');
    out.width = CONFIG.face.outputSize;
    out.height = CONFIG.face.outputSize;
    const octx = out.getContext('2d');
    const ratio = CONFIG.face.outputSize / CIRCLE_DIAMETER;
    const dispW = size.w * this.scale * ratio;
    const dispH = size.h * this.scale * ratio;
    const cx = CONFIG.face.outputSize / 2, cy = CONFIG.face.outputSize / 2;
    octx.drawImage(this.img, cx - dispW / 2 + this.offsetX * ratio, cy - dispH / 2 + this.offsetY * ratio, dispW, dispH);
    return out.toDataURL('image/jpeg', 0.85);
  },

  async save() {
    if (!this.img) return;
    this.saveBtn.disabled = true;
    this.setStatus('保存中…');
    try {
      const dataUrl = this.renderOutput();
      await FaceStore.save(dataUrl);
      await PitcherFace.loadCustom(dataUrl);
      this.setStatus('保存しました');
      setTimeout(() => Screens.show('title'), 400);
    } catch (err) {
      console.error('顔画像の保存に失敗:', err);
      this.setStatus('保存に失敗しました');
      this.saveBtn.disabled = false;
    }
  },

  async resetToDefault() {
    await FaceStore.clear();
    PitcherFace.clearCustom();
    this.reset();
    this.draw();
    this.setStatus('デフォルトの顔に戻しました');
  },

  // 保存済みの顔画像を編集の初期状態として読み込む（再調整できるようにする）
  loadFromImage(img) {
    const size = imgSize(img);
    this.img = img;
    this.minScale = CIRCLE_DIAMETER / Math.min(size.w, size.h);
    this.scale = this.minScale;
    this.offsetX = 0;
    this.offsetY = 0;
    this.slider.value = 0;
    this.saveBtn.disabled = false;
    this.draw();
  },
};

function openPitcherSettings() {
  FaceEditor.reset();
  if (PitcherFace.hasCustom && PitcherFace.image) {
    FaceEditor.loadFromImage(PitcherFace.image);
    FaceEditor.setStatus('現在の顔写真です。必要に応じて調整し直せます');
  } else {
    FaceEditor.draw();
  }
  Screens.show('pitcher');
}

/* ==========================================================================
   7. 画面遷移
   ========================================================================== */
const Screens = {
  ids: ['title', 'howto', 'pitcher', 'game', 'result'],
  show(name) {
    this.ids.forEach((id) => {
      const el = document.getElementById('screen-' + id);
      if (el) el.classList.toggle('hidden', id !== name);
    });
  },
};

function refreshTitleMetrics() {
  const best = document.getElementById('title-best');
  const hr = document.getElementById('title-hr');
  const play = document.getElementById('title-play');
  if (best) best.textContent = Game.match.highScore;
  if (hr) hr.textContent = Game.totalHomeruns;
  if (play) play.textContent = Game.playCount;
}

function toggleSound() {
  Game.settings.sound = !Game.settings.sound;
  saveSetting(CONFIG.storageKeys.sound, Game.settings.sound);
  updateSoundToggleUI();
}
function toggleVibration() {
  Game.settings.vibration = !Game.settings.vibration;
  saveSetting(CONFIG.storageKeys.vibration, Game.settings.vibration);
  updateVibrationToggleUI();
}
function updateSoundToggleUI() {
  const label = Game.settings.sound ? '🔊 音声: ON' : '🔇 音声: OFF';
  ['btn-toggle-sound', 'btn-toggle-sound-pause'].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.textContent = label;
    btn.classList.toggle('off', !Game.settings.sound);
  });
}
function updateVibrationToggleUI() {
  const label = Game.settings.vibration ? '📳 振動: ON' : '📴 振動: OFF';
  ['btn-toggle-vibration', 'btn-toggle-vibration-pause'].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.textContent = label;
    btn.classList.toggle('off', !Game.settings.vibration);
  });
}

/* ==========================================================================
   8. スマホでの誤操作防止（画面スクロール・ズーム抑止）
   ========================================================================== */
function setupGlobalGuards() {
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  let lastTouchEnd = 0, lastTouchX = 0, lastTouchY = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    const touch = e.changedTouches && e.changedTouches[0];
    const x = touch ? touch.clientX : 0;
    const y = touch ? touch.clientY : 0;
    const distance = Math.hypot(x - lastTouchX, y - lastTouchY);
    if (now - lastTouchEnd <= 500 && distance < 40) e.preventDefault();
    lastTouchEnd = now;
    lastTouchX = x;
    lastTouchY = y;
  }, { passive: false, capture: true });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  document.addEventListener('pointerdown', () => AudioEngine.unlock(), { once: true });
}

/* ==========================================================================
   9. ゲーム本体
   ========================================================================== */
const Game = {
  canvas: null,
  ctx: null,
  W: 0,
  H: 0,
  lastTime: 0,
  paused: false,
  processing: false,
  _pauseStartedAt: 0,
  _msgTimer: null,
  dom: {},

  match: {
    inning: 1,
    outs: 0,
    strikes: 0,
    bases: [false, false, false], // [1塁, 2塁, 3塁]
    score: 0,
    stats: { hit: 0, double: 0, triple: 0, homerun: 0 },
    streak: 0,        // 現在の連続出塁数
    maxStreak: 0,     // 今試合での最大連続出塁数
    swingCount: 0,    // 空振り以外も含む実スイング回数（タイミング評価の算出用）
    timingDeltaSum: 0,// スイングタイミング誤差(ms)の合計
    highScore: 0,
  },
  totalHomeruns: 0, // 通算ホームラン数（端末に保存）
  playCount: 0,     // 通算プレイ回数（端末に保存）
  settings: { sound: true, vibration: true },
  pitch: { phase: 'idle', startTime: 0, duration: 0, swung: false }, // idle / pitching / resolving
  swingAnim: { active: false, start: 0, duration: 150 },
  battedBall: null,

  init() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.dom = {
      btnStart: document.getElementById('btn-start'),
      btnHowto: document.getElementById('btn-howto'),
      btnHowtoClose: document.getElementById('btn-howto-close'),
      btnPitcherSetting: document.getElementById('btn-pitcher-setting'),
      btnPitcherBack: document.getElementById('btn-pitcher-back'),
      btnPitch: document.getElementById('btn-pitch'),
      btnSwing: document.getElementById('btn-swing'),
      btnPause: document.getElementById('btn-pause'),
      btnResume: document.getElementById('btn-resume'),
      btnRestart: document.getElementById('btn-restart'),
      btnPauseTitle: document.getElementById('btn-pause-title'),
      btnPlayAgain: document.getElementById('btn-play-again'),
      btnResultTitle: document.getElementById('btn-result-title'),
      hudScoreValue: document.getElementById('hud-score-value'),
      hudInning: document.getElementById('hud-inning'),
      strikeDots: [
        document.getElementById('strike-dot-1'),
        document.getElementById('strike-dot-2'),
        document.getElementById('strike-dot-3'),
      ],
      outDots: [
        document.getElementById('out-dot-1'),
        document.getElementById('out-dot-2'),
        document.getElementById('out-dot-3'),
      ],
      resultMessage: document.getElementById('result-message'),
      resultMessageText: document.querySelector('#result-message span'),
      inningBanner: document.getElementById('inning-banner'),
      inningBannerText: document.querySelector('#inning-banner span'),
      screenPause: document.getElementById('screen-pause'),
      resultScore: document.getElementById('result-score'),
      resultHighscore: document.getElementById('result-highscore'),
      resultCopy: document.getElementById('result-copy'),
      resultHit: document.getElementById('result-hit'),
      resultDouble: document.getElementById('result-double'),
      resultTriple: document.getElementById('result-triple'),
      resultHomerun: document.getElementById('result-homerun'),
      resultStreak: document.getElementById('result-streak'),
      resultGrade: document.getElementById('result-grade'),
      resultBestCallout: document.getElementById('result-best-callout'),
    };

    bindTapButton(this.dom.btnStart, () => this.startNewMatch());
    bindTapButton(this.dom.btnHowto, () => { saveHowtoSeen(); Screens.show('howto'); });
    bindTapButton(this.dom.btnHowtoClose, () => Screens.show('title'));
    bindTapButton(document.getElementById('btn-howto-back'), () => Screens.show('title'));
    bindTapButton(document.getElementById('btn-pitcher-setting'), () => openPitcherSettings());
    bindTapButton(this.dom.btnPitcherBack, () => Screens.show('title'));
    bindTapButton(this.dom.btnPitch, () => this.onPitchTap());
    bindTapButton(this.dom.btnSwing, () => this.onSwingTap());
    bindTapButton(this.dom.btnPause, () => this.openPause());
    bindTapButton(this.dom.btnResume, () => this.resumePause());
    bindTapButton(this.dom.btnRestart, () => { this.resumePauseSilent(); this.startNewMatch(); });
    bindTapButton(this.dom.btnPauseTitle, () => { this.resumePauseSilent(); refreshTitleMetrics(); Screens.show('title'); });
    bindTapButton(this.dom.btnPlayAgain, () => this.startNewMatch());
    bindTapButton(this.dom.btnResultTitle, () => { refreshTitleMetrics(); Screens.show('title'); });
    bindTapButton(document.getElementById('btn-toggle-sound'), toggleSound);
    bindTapButton(document.getElementById('btn-toggle-sound-pause'), toggleSound);
    bindTapButton(document.getElementById('btn-toggle-vibration'), toggleVibration);
    bindTapButton(document.getElementById('btn-toggle-vibration-pause'), toggleVibration);

    setupGlobalGuards();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
    if (window.ResizeObserver) {
      new ResizeObserver(() => this.resize()).observe(document.getElementById('game-field'));
    }

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  resize() {
    const area = document.getElementById('game-field');
    if (!area) return;
    const w = area.clientWidth || this.W || 360;
    const h = area.clientHeight || this.H || 480;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w;
    this.H = h;
  },

  /* ---------------- メインループ ---------------- */
  loop(now) {
    let dt = now - this.lastTime;
    this.lastTime = now;
    dt = Math.min(dt, 50);
    try {
      const screenGame = document.getElementById('screen-game');
      if (screenGame && !screenGame.classList.contains('hidden')) {
        this.update(dt);
        this.render();
      }
    } catch (err) {
      // 想定外のエラーが発生してもゲーム全体が停止しないようにする
      console.error('ゲームループエラー:', err);
    }
    requestAnimationFrame((t) => this.loop(t));
  },

  update() {
    if (this.paused) return;
    const now = performance.now();
    if (this.pitch.phase === 'pitching' && !this.pitch.swung) {
      const elapsed = now - this.pitch.startTime;
      if (elapsed >= this.pitch.duration + CONFIG.timing.lookGraceMs) {
        this.pitch.swung = true;
        this.resolveAtBat('look');
      }
    }
    if (this.swingAnim.active && now - this.swingAnim.start >= this.swingAnim.duration) {
      this.swingAnim.active = false;
    }
  },

  /* ---------------- 試合の開始／一時停止 ---------------- */
  startNewMatch() {
    this.resize();
    this.match.inning = 1;
    this.match.outs = 0;
    this.match.strikes = 0;
    this.match.bases = [false, false, false];
    this.match.score = 0;
    this.match.stats = { hit: 0, double: 0, triple: 0, homerun: 0 };
    this.match.streak = 0;
    this.match.maxStreak = 0;
    this.match.swingCount = 0;
    this.match.timingDeltaSum = 0;
    this.pitch = { phase: 'idle', startTime: 0, duration: 0, swung: false };
    this.swingAnim = { active: false, start: 0, duration: 150 };
    this.battedBall = null;
    this.processing = false;
    this.paused = false;
    this.playCount++;
    saveNumber(CONFIG.storageKeys.playCount, this.playCount);
    this.updateHud();
    Screens.show('game');
    this.dom.btnPitch.disabled = false;
    this.dom.btnSwing.disabled = true;
    this.showInningBanner(this.match.inning + '回開始');
  },

  openPause() {
    if (this.processing) return; // 打撃結果処理中は一時停止不可（状態の整合性を保つため）
    this.paused = true;
    this._pauseStartedAt = performance.now();
    this.dom.screenPause.classList.remove('hidden');
  },
  resumePause() {
    const now = performance.now();
    const pausedFor = now - (this._pauseStartedAt || now);
    if (this.pitch.phase === 'pitching') this.pitch.startTime += pausedFor;
    if (this.swingAnim.active) this.swingAnim.start += pausedFor;
    if (this.battedBall) this.battedBall.startTime += pausedFor;
    this.paused = false;
    this.dom.screenPause.classList.add('hidden');
  },
  resumePauseSilent() {
    this.paused = false;
    this.dom.screenPause.classList.add('hidden');
  },

  /* ---------------- 投球・スイング ---------------- */
  onPitchTap() {
    if (this.pitch.phase !== 'idle' || this.processing) return;
    this.pitch.phase = 'pitching';
    this.pitch.swung = false;
    this.pitch.startTime = performance.now();
    this.pitch.duration = rand(CONFIG.pitch.minDurationMs, CONFIG.pitch.maxDurationMs);
    this.dom.btnPitch.disabled = true;
    this.dom.btnSwing.disabled = false;
    AudioEngine.pitchSound();
  },

  onSwingTap() {
    if (this.pitch.phase !== 'pitching' || this.pitch.swung || this.processing) return;
    this.pitch.swung = true;
    const now = performance.now();
    const idealTime = this.pitch.startTime + this.pitch.duration;
    const deltaMs = now - idealTime;
    this.match.swingCount++;
    this.match.timingDeltaSum += Math.abs(deltaMs);
    this.swingAnim.active = true;
    this.swingAnim.start = now;
    AudioEngine.swingSound();
    const outcome = judgeSwingTiming(deltaMs);
    this.resolveAtBat(outcome);
  },

  resolveAtBat(outcome) {
    this.processing = true;
    this.pitch.phase = 'resolving';
    this.dom.btnPitch.disabled = true;
    this.dom.btnSwing.disabled = true;

    if (outcome === 'homerun') return this.onHomerun();
    if (outcome === 'triple') return this.onExtraBaseHit(3, 'triple', '三塁打！');
    if (outcome === 'double') return this.onExtraBaseHit(2, 'double', '二塁打！');
    if (outcome === 'hit') return this.onExtraBaseHit(1, 'hit', 'ヒット！');
    if (outcome === 'foul') return this.onFoul();
    if (outcome === 'out') return this.onOut();
    if (outcome === 'miss') return this.onStrike('miss');
    if (outcome === 'look') return this.onStrike('look');
  },

  showMessage(text, ms, isHomerun) {
    const el = this.dom.resultMessage;
    this.dom.resultMessageText.textContent = text;
    el.classList.remove('hidden');
    el.classList.toggle('homerun', !!isHomerun);
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => el.classList.add('hidden'), ms || 900);
  },

  onFoul() {
    AudioEngine.foulSound();
    if (this.match.strikes < 2) this.match.strikes++;
    this.updateHud();
    this.showMessage('ファウル');
    this.spawnBattedBall('foul');
    this.finishPitch(700);
  },

  onStrike(kind) {
    this.match.strikes++;
    if (kind === 'miss') AudioEngine.swingMissSound(); else AudioEngine.lookSound();
    if (this.match.strikes >= 3) {
      this.showMessage(kind === 'miss' ? '三振（空振り）' : '三振（見逃し）');
      AudioEngine.outSound();
      this.vibrateOut();
      this.registerOut();
    } else {
      this.showMessage(kind === 'miss' ? '空振り' : '見逃しストライク');
    }
    this.updateHud();
    this.finishPitch(700);
  },

  onOut() {
    AudioEngine.contactSound();
    AudioEngine.outSound();
    this.vibrateOut();
    this.showMessage('アウト');
    this.spawnBattedBall('out');
    this.registerOut();
    this.finishPitch(900);
  },

  onExtraBaseHit(advanceBases, kind, message) {
    const { newBases, runsScored } = advanceRunners(this.match.bases, advanceBases);
    newBases[advanceBases - 1] = true; // 打者を進塁させる
    this.match.bases = newBases;
    this.match.score += runsScored;
    this.match.stats[kind]++;
    this.match.strikes = 0;
    this.match.streak++;
    this.match.maxStreak = Math.max(this.match.maxStreak, this.match.streak);
    AudioEngine.hitSound();
    if (runsScored > 0) AudioEngine.scoreSound();
    this.vibrateHit();
    this.showMessage(message);
    this.spawnBattedBall(kind);
    this.updateHud();
    this.finishPitch(1000);
  },

  onHomerun() {
    const { runsScored } = advanceRunners(this.match.bases, 4);
    this.match.bases = [false, false, false];
    this.match.score += runsScored + 1;
    this.match.stats.homerun++;
    this.match.strikes = 0;
    this.match.streak++;
    this.match.maxStreak = Math.max(this.match.maxStreak, this.match.streak);
    AudioEngine.homerunSound();
    AudioEngine.scoreSound();
    this.vibrateHomerun();
    this.showMessage('HOME RUN!!', 1400, true);
    this.spawnBattedBall('homerun');
    this.updateHud();
    this.finishPitch(1500);
  },

  registerOut() {
    this.match.strikes = 0;
    this.match.streak = 0;
    this.match.outs++;
    this.updateHud();
    if (this.match.outs >= 3) {
      setTimeout(() => this.endInning(), 700);
    }
  },

  endInning() {
    this.match.inning++;
    this.match.outs = 0;
    this.match.strikes = 0;
    this.match.bases = [false, false, false];
    this.updateHud();
    if (this.match.inning > CONFIG.innings) {
      this.endGame();
      return;
    }
    this.pitch.phase = 'idle';
    this.processing = false;
    this.showInningBanner(this.match.inning + '回開始');
  },

  showInningBanner(text) {
    const el = this.dom.inningBanner;
    this.dom.inningBannerText.textContent = text;
    el.classList.remove('hidden');
    this.dom.btnPitch.disabled = true;
    this.dom.btnSwing.disabled = true;
    setTimeout(() => {
      el.classList.add('hidden');
      this.dom.btnPitch.disabled = false;
      this.dom.btnSwing.disabled = true;
    }, 1300);
  },

  endGame() {
    AudioEngine.gameEndSound();
    let isNewBest = false;
    if (this.match.score > this.match.highScore) {
      this.match.highScore = this.match.score;
      saveHighScore(this.match.highScore);
      isNewBest = true;
    }
    this.totalHomeruns += this.match.stats.homerun;
    saveNumber(CONFIG.storageKeys.totalHomeruns, this.totalHomeruns);

    const avgDelta = this.match.swingCount > 0 ? this.match.timingDeltaSum / this.match.swingCount : null;
    const grade = computeTimingGrade(avgDelta);

    this.dom.resultScore.textContent = this.match.score;
    this.dom.resultHighscore.textContent = this.match.highScore;
    this.dom.resultCopy.textContent = this.match.score > 0 ? 'ナイスバッティング！' : 'ドンマイ、次はヒットを狙おう！';
    this.dom.resultHit.textContent = this.match.stats.hit;
    this.dom.resultDouble.textContent = this.match.stats.double;
    this.dom.resultTriple.textContent = this.match.stats.triple;
    this.dom.resultHomerun.textContent = this.match.stats.homerun;
    this.dom.resultStreak.textContent = this.match.maxStreak;
    this.dom.resultGrade.textContent = grade;
    this.dom.resultBestCallout.classList.toggle('hidden', !isNewBest);
    Screens.show('result');
  },

  finishPitch(delayMs) {
    setTimeout(() => {
      if (this.match.outs >= 3) return; // イニング交代処理は endInning 側でボタン状態を制御する
      this.pitch.phase = 'idle';
      this.processing = false;
      this.dom.btnSwing.disabled = true;
      this.dom.btnPitch.disabled = false;
    }, delayMs);
  },

  vibrateHit() { vibrateSafe(30); },
  vibrateHomerun() { vibrateSafe([40, 40, 40, 40, 80]); },
  vibrateOut() { vibrateSafe(50); },

  /* ---------------- HUD ---------------- */
  updateHud() {
    const d = this.dom;
    d.hudScoreValue.textContent = this.match.score;
    d.hudInning.textContent = this.match.inning + '回 / ' + CONFIG.innings + '回';
    d.strikeDots.forEach((dot, i) => dot.classList.toggle('active', i < this.match.strikes));
    d.outDots.forEach((dot, i) => dot.classList.toggle('active', i < this.match.outs));
  },

  /* ---------------- 打球アニメーション ---------------- */
  spawnBattedBall(kind) {
    this.battedBall = { kind, startTime: performance.now(), side: Math.random() < 0.5 ? -1 : 1 };
  },

  /* ---------------- 描画 ---------------- */
  render() {
    const ctx = this.ctx, W = this.W, H = this.H;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#f3f8ff');
    grad.addColorStop(1, '#dcefe3');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    this.drawField(ctx, W, H);
    this.drawPitchBall(ctx, W, H);
    this.drawBattedBall(ctx, W, H);
  },

  drawField(ctx, W, H) {
    const home = { x: W * 0.5, y: H * 0.80 };
    const first = { x: W * 0.74, y: H * 0.55 };
    const second = { x: W * 0.5, y: H * 0.38 };
    const third = { x: W * 0.26, y: H * 0.55 };
    const pitcherPos = { x: W * 0.5, y: H * 0.16 };
    const pitcherR = Math.min(W, H) * 0.085;

    // 外野（アウトフィールドの弧）
    ctx.save();
    ctx.fillStyle = '#dcefe3';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(home.x, home.y);
    ctx.lineTo(third.x - (third.x - home.x) * 0.15, third.y);
    ctx.quadraticCurveTo(second.x, second.y - (second.y - pitcherPos.y) * 0.55, first.x + (first.x - home.x) * 0.15, first.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 内野ダイヤモンド（白）
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(home.x, home.y);
    ctx.lineTo(first.x, first.y);
    ctx.lineTo(second.x, second.y);
    ctx.lineTo(third.x, third.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    this.drawBase(ctx, first, this.match.bases[0]);
    this.drawBase(ctx, second, this.match.bases[1]);
    this.drawBase(ctx, third, this.match.bases[2]);
    this.drawHomePlate(ctx, home);

    // ピッチャー（ハロー + ジャージ）
    ctx.save();
    ctx.fillStyle = '#e8f0ff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pitcherPos.x, pitcherPos.y, pitcherR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.moveTo(pitcherPos.x - pitcherR * 0.9, pitcherPos.y + pitcherR * 1.1);
    ctx.quadraticCurveTo(pitcherPos.x, pitcherPos.y + pitcherR * 1.7, pitcherPos.x + pitcherR * 0.9, pitcherPos.y + pitcherR * 1.1);
    ctx.lineTo(pitcherPos.x + pitcherR * 1.05, pitcherPos.y + pitcherR * 2.7);
    ctx.lineTo(pitcherPos.x - pitcherR * 1.05, pitcherPos.y + pitcherR * 2.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    PitcherFace.drawInto(ctx, pitcherPos.x, pitcherPos.y, pitcherR);

    this.drawBatter(ctx, home.x, home.y);
  },

  drawBase(ctx, pos, occupied) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(Math.PI / 4);
    const s = 16;
    ctx.fillStyle = occupied ? '#2563eb' : '#ffffff';
    ctx.strokeStyle = occupied ? '#ffffff' : '#2563eb';
    ctx.lineWidth = 2;
    if (occupied) {
      ctx.shadowColor = 'rgba(37,99,235,0.7)';
      ctx.shadowBlur = 12;
    }
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  },

  drawHomePlate(ctx, pos) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pos.x - 12, pos.y - 8);
    ctx.lineTo(pos.x + 12, pos.y - 8);
    ctx.lineTo(pos.x + 12, pos.y + 2);
    ctx.lineTo(pos.x, pos.y + 12);
    ctx.lineTo(pos.x - 12, pos.y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },

  drawBatter(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y - 6);
    ctx.fillStyle = 'rgba(113,128,150,0.85)';
    ctx.beginPath();
    ctx.arc(0, -34, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(18,32,51,0.88)';
    ctx.fillRect(-9, -24, 18, 26);
    ctx.fillStyle = 'rgba(18,32,51,0.88)';
    ctx.fillRect(-8, 2, 7, 16);
    ctx.fillRect(1, 2, 7, 16);

    let angle = -0.9;
    if (this.swingAnim.active) {
      const now = performance.now();
      const t = clamp((now - this.swingAnim.start) / this.swingAnim.duration, 0, 1);
      angle = -0.9 + t * 2.6;
    }
    ctx.save();
    ctx.translate(7, -16);
    ctx.rotate(angle);
    ctx.strokeStyle = '#718096';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(28, 0);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  },

  drawPitchBall(ctx, W, H) {
    if (this.pitch.phase !== 'pitching') return;
    const now = performance.now();
    const p = clamp((now - this.pitch.startTime) / this.pitch.duration, 0, 1);
    const pitcherY = H * 0.16;
    const homeY = H * 0.78;
    const x = W * 0.5;
    const y = pitcherY + (homeY - pitcherY) * p;
    const r = 5 + p * 4;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(37,99,235,0.35)';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  },

  drawBattedBall(ctx, W, H) {
    if (!this.battedBall) return;
    const cfg = CONFIG.battedBall[this.battedBall.kind];
    const now = performance.now();
    const p = clamp((now - this.battedBall.startTime) / cfg.durationMs, 0, 1);
    if (p >= 1) { this.battedBall = null; return; }
    const homeX = W * 0.5, homeY = H * 0.78;
    const targetX = homeX + this.battedBall.side * cfg.dx * W;
    const targetY = homeY - cfg.dyFactor * H;
    const x = homeX + (targetX - homeX) * p;
    const linY = homeY + (targetY - homeY) * p;
    const arcOffset = Math.sin(Math.PI * p) * cfg.arc;
    const y = linY - arcOffset;
    const r = Math.max(2, 6 * (1 - p * 0.3));
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(37,99,235,0.4)';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  },
};

/* ==========================================================================
   10. 起動
   ========================================================================== */
async function boot() {
  loadSettings();
  Game.match.highScore = loadHighScore();
  Game.totalHomeruns = loadNumber(CONFIG.storageKeys.totalHomeruns);
  Game.playCount = loadNumber(CONFIG.storageKeys.playCount);
  updateSoundToggleUI();
  updateVibrationToggleUI();
  refreshTitleMetrics();
  FaceEditor.init();
  await PitcherFace.init();
  Game.init();
}

window.addEventListener('DOMContentLoaded', () => {
  boot().catch((err) => {
    console.error('ゲーム初期化エラー:', err);
    document.body.innerHTML = '<p style="color:#fff;padding:20px;">読み込みに失敗しました。ページを再読み込みしてください。</p>';
  });
});

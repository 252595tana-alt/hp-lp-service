/* ==========================================================================
   STAR INVADERS - ゲーム本体スクリプト
   外部ライブラリ非依存。Canvas 2D + Pointer Events のみで動作する。
   スマートフォン（縦画面）専用のシンプルなシューティングゲーム。
   ========================================================================== */
'use strict';

/* ==========================================================================
   1. 設定値（数値調整はすべてここに集約する）
   ========================================================================== */
const CONFIG = {
  player: {
    width: 32,
    height: 26,
    speed: 260,          // 移動速度 (px/秒)
    fireCooldownMs: 230, // 連射間隔（上限）
    bulletSpeed: 520,
    invincibleMs: 1400,  // 被弾後の無敵時間
    startLife: 3,
    bottomMargin: 64,    // 画面下端からの初期位置オフセット
  },
  bullet: {
    playerW: 4, playerH: 14,
    enemyW: 5, enemyH: 11,
    enemySpeed: 210,
  },
  enemy: {
    width: 28,
    height: 22,
    hitboxScale: 0.72,   // 見た目より少し小さい当たり判定
  },
  // ステージ1・ステージ2の編成
  stages: [
    {
      label: 'STAGE 1',
      rows: 3,
      cols: 5,
      hp: () => 1,
      moveSpeed: 42,          // 集団の横移動速度 (px/秒)
      dropAmount: 16,         // 端に到達した際の下降量
      fireChancePerSec: 0.55, // 敵全体での発射確率係数
      maxEnemyBullets: 5,
      bulletSpeedMul: 1,
    },
    {
      label: 'STAGE 2',
      rows: 4,
      cols: 6,
      hp: (r, c) => ((r + c) % 3 === 0 ? 2 : 1), // 一部の敵は2回攻撃で撃破
      moveSpeed: 72,
      dropAmount: 18,
      fireChancePerSec: 1.1,
      maxEnemyBullets: 9,
      bulletSpeedMul: 1.2,
    },
  ],
  boss: {
    width: 150,
    height: 130,
    hp: 30,
    moveSpeed: 95,
    fireIntervalMs: 950,
    hitboxScale: 0.7,
    // ボス画像のファイルパス。ここを変更するだけで画像を差し替え可能。
    imagePath: 'assets/boss.png',
  },
  score: {
    normal: 100,
    strong: 200,
    boss: 3000,
  },
};

/* ==========================================================================
   2. ユーティリティ関数
   ========================================================================== */
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function rand(min, max) { return Math.random() * (max - min) + min; }

// 軸平行境界ボックス（AABB）による当たり判定
function aabbHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ==========================================================================
   3. サウンド（外部音源なしのシンプルなビープ音合成）
   スマホの自動再生制限を考慮し、最初のユーザー操作後に AudioContext を生成する
   ========================================================================== */
const AudioEngine = {
  ctx: null,
  unlock() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch (e) {
      this.ctx = null;
    }
  },
  beep(freq, duration, type, vol, freqEnd) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  },
  shoot() { this.beep(880, 0.07, 'square', 0.07, 520); },
  enemyHit() { this.beep(320, 0.09, 'square', 0.1, 140); },
  playerHit() { this.beep(180, 0.25, 'sawtooth', 0.16, 60); },
  explosionBig() { this.beep(110, 0.55, 'sawtooth', 0.2, 35); },
  stageClear() { this.beep(660, 0.14, 'square', 0.14, 990); },
  gameClear() { this.beep(523, 0.5, 'square', 0.15, 1046); },
  gameOver() { this.beep(200, 0.6, 'sawtooth', 0.16, 45); },
};

/* ==========================================================================
   4. 描画クラス群
   ========================================================================== */

// 背景に流れる星
class Star {
  constructor(w, h) { this.reset(w, h, true); }
  reset(w, h, initial) {
    this.x = Math.random() * w;
    this.y = initial ? Math.random() * h : -2;
    this.speed = 20 + Math.random() * 70;
    this.size = Math.random() * 1.6 + 0.5;
  }
  update(dt, w, h) {
    this.y += this.speed * dt / 1000;
    if (this.y > h) this.reset(w, h, false);
  }
  draw(ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}

// 弾（プレイヤー弾・敵弾共通）
class Bullet {
  constructor(x, y, vx, vy, w, h, color) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.w = w; this.h = h; this.color = color;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt / 1000;
    this.y += this.vy * dt / 1000;
  }
  offscreen(w, h) {
    return this.y < -30 || this.y > h + 30 || this.x < -30 || this.x > w + 30;
  }
  get hitbox() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    ctx.fillRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
    ctx.restore();
  }
}

// 自機
class Player {
  constructor(canvasW, canvasH) {
    this.w = CONFIG.player.width;
    this.h = CONFIG.player.height;
    this.x = canvasW / 2;
    this.y = canvasH - CONFIG.player.bottomMargin;
    this.life = CONFIG.player.startLife;
    this.fireCooldown = 0;
    this.invincibleTimer = 0;
    this.visible = true;
  }
  update(dt, canvasW, canvasH, input) {
    if (input.left) this.x -= CONFIG.player.speed * dt / 1000;
    if (input.right) this.x += CONFIG.player.speed * dt / 1000;
    const half = this.w / 2;
    this.x = clamp(this.x, half + 4, canvasW - half - 4);
    this.y = canvasH - CONFIG.player.bottomMargin;

    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= dt;
      this.visible = Math.floor(this.invincibleTimer / 90) % 2 === 0;
    } else {
      this.visible = true;
    }
  }
  canFire() { return this.fireCooldown <= 0; }
  fire() { this.fireCooldown = CONFIG.player.fireCooldownMs; }
  // 被弾処理。無敵中なら false を返す
  hit() {
    if (this.invincibleTimer > 0) return false;
    this.life = Math.max(0, this.life - 1);
    this.invincibleTimer = CONFIG.player.invincibleMs;
    return true;
  }
  get hitbox() {
    const s = 0.7;
    return { x: this.x - this.w * s / 2, y: this.y - this.h * s / 2, w: this.w * s, h: this.h * s };
  }
  draw(ctx) {
    if (!this.visible) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = '#7ef9ff';
    ctx.shadowColor = '#7ef9ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, -this.h / 2);
    ctx.lineTo(this.w / 2, this.h / 2);
    ctx.lineTo(0, this.h / 4);
    ctx.lineTo(-this.w / 2, this.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// 通常敵
class Enemy {
  constructor(x, y, hp) {
    this.x = x; this.y = y;
    this.w = CONFIG.enemy.width;
    this.h = CONFIG.enemy.height;
    this.hp = hp;
    this.maxHp = hp;
    this.strong = hp > 1;
    this.alive = true;
  }
  // ダメージを受ける。撃破したら true を返す
  hit() {
    this.hp -= 1;
    if (this.hp <= 0) { this.alive = false; return true; }
    return false;
  }
  get hitbox() {
    const s = CONFIG.enemy.hitboxScale;
    return { x: this.x - this.w * s / 2, y: this.y - this.h * s / 2, w: this.w * s, h: this.h * s };
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const damaged = this.hp < this.maxHp;
    ctx.fillStyle = this.strong ? (damaged ? '#ffcf80' : '#ff9f43') : '#8affc1';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 6;
    // レトロインベーダー風の簡易シルエット（後から画像に差し替え可能な形状）
    const w = this.w, h = this.h;
    ctx.fillRect(-w / 2, -h / 2, w, h * 0.45);
    ctx.fillRect(-w / 2 + 4, -h * 0.05, w - 8, h * 0.4);
    ctx.fillRect(-w / 2, h * 0.28, w * 0.22, h * 0.22);
    ctx.fillRect(w / 2 - w * 0.22, h * 0.28, w * 0.22, h * 0.22);
    ctx.restore();
  }
}

// ボス
class Boss {
  constructor(canvasW) {
    this.w = CONFIG.boss.width;
    this.h = CONFIG.boss.height;
    this.x = canvasW / 2;
    this.y = 120;
    this.dir = 1;
    this.speed = CONFIG.boss.moveSpeed;
    this.hp = CONFIG.boss.hp;
    this.maxHp = CONFIG.boss.hp;
    this.fireTimer = CONFIG.boss.fireIntervalMs * 0.5;
    this.flashTimer = 0;
    this.alive = true;
  }
  update(dt, canvasW) {
    this.x += this.dir * this.speed * dt / 1000;
    const half = this.w / 2 * 0.5; // 画像幅の半分より少し狭い範囲で往復させる
    if (this.x < half) { this.x = half; this.dir = 1; }
    if (this.x > canvasW - half) { this.x = canvasW - half; this.dir = -1; }
    if (this.fireTimer > 0) this.fireTimer -= dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;
  }
  readyToFire() { return this.fireTimer <= 0; }
  resetFireTimer() { this.fireTimer = CONFIG.boss.fireIntervalMs; }
  hit() {
    this.hp = Math.max(0, this.hp - 1);
    this.flashTimer = 140;
    if (this.hp <= 0) { this.alive = false; return true; }
    return false;
  }
  get hitbox() {
    const s = CONFIG.boss.hitboxScale;
    return { x: this.x - this.w * s / 2, y: this.y - this.h * s / 2, w: this.w * s, h: this.h * s };
  }
  draw(ctx, image, imageLoaded) {
    ctx.save();
    if (imageLoaded) {
      // 画像の縦横比を維持して描画（アスペクト比フィット）
      const iw = image.naturalWidth, ih = image.naturalHeight;
      const scale = Math.min(this.w / iw, this.h / ih);
      const dw = iw * scale, dh = ih * scale;
      const dx = this.x - dw / 2, dy = this.y - dh / 2;
      ctx.drawImage(image, dx, dy, dw, dh);
      if (this.flashTimer > 0) {
        // 透過PNGでもシルエット部分のみ白く光らせる
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(dx, dy, dw, dh);
      }
    } else {
      // 仮図形（画像未設置の場合のフォールバック表示）
      ctx.translate(this.x, this.y);
      ctx.fillStyle = this.flashTimer > 0 ? '#ffffff' : '#c44dff';
      ctx.shadowColor = '#c44dff';
      ctx.shadowBlur = 18;
      const w = this.w, h = this.h;
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, 0);
      ctx.lineTo(-w * 0.28, -h * 0.5);
      ctx.lineTo(w * 0.28, -h * 0.5);
      ctx.lineTo(w * 0.5, 0);
      ctx.lineTo(w * 0.28, h * 0.5);
      ctx.lineTo(-w * 0.28, h * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2a0a3a';
      ctx.beginPath();
      ctx.arc(-w * 0.14, -h * 0.08, w * 0.07, 0, Math.PI * 2);
      ctx.arc(w * 0.14, -h * 0.08, w * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// 爆発エフェクト
class Explosion {
  constructor(x, y, big) {
    this.x = x; this.y = y;
    this.duration = big ? 650 : 320;
    this.maxR = big ? 78 : 24;
    this.color = big ? '#ffcf4d' : '#ffb04d';
    this.t = 0;
    this.done = false;
  }
  update(dt) {
    this.t += dt;
    if (this.t >= this.duration) this.done = true;
  }
  draw(ctx) {
    const p = Math.min(this.t / this.duration, 1);
    const r = this.maxR * p;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = this.color;
    ctx.globalAlpha = (1 - p) * 0.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ==========================================================================
   5. 入力管理（Pointer Events、マルチタッチ対応）
   ========================================================================== */
const Input = { left: false, right: false, fire: false };

function bindHoldButton(el, onDown, onUp) {
  const activeIds = new Set();
  const down = (e) => {
    e.preventDefault();
    activeIds.add(e.pointerId);
    el.classList.add('active');
    onDown();
  };
  const up = (e) => {
    if (!activeIds.has(e.pointerId)) return;
    activeIds.delete(e.pointerId);
    if (activeIds.size === 0) {
      el.classList.remove('active');
      onUp();
    }
  };
  el.addEventListener('pointerdown', down, { passive: false });
  el.addEventListener('pointerup', up, { passive: false });
  el.addEventListener('pointercancel', up, { passive: false });
  el.addEventListener('pointerleave', up, { passive: false });
}

function setupInput() {
  bindHoldButton(document.getElementById('ctrl-left'),
    () => { Input.left = true; }, () => { Input.left = false; });
  bindHoldButton(document.getElementById('ctrl-right'),
    () => { Input.right = true; }, () => { Input.right = false; });
  bindHoldButton(document.getElementById('ctrl-fire'),
    () => { Input.fire = true; }, () => { Input.fire = false; });

  // 画面全体のスクロール・ズーム・コンテキストメニューを抑止
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // iOSのdouble-tap-to-zoomはtouch-action:noneだけでは抑止しきれない端末があるため、
  // 「短時間・ほぼ同じ位置」の連続タップだけをズーム操作とみなしてtouchendをキャンセルする。
  // 位置を見ずに時間だけで判定すると、別々のボタンへの素早い連続タップまで
  // キャンセルしてしまう（例：ホームに戻る→別ボタン）ため、距離も必ず併せて判定する。
  let lastTouchEnd = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
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
  // 一部ブラウザが発火させる合成dblclickイベントによる拡大も念のため防止
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  // 最初のユーザー操作でオーディオを解放する
  document.addEventListener('pointerdown', () => AudioEngine.unlock(), { once: true });
}

/* ==========================================================================
   6. ボス画像の読み込み（差し替えが容易な構造）
   ========================================================================== */
const BossImage = {
  el: new Image(),
  loaded: false,
};
BossImage.el.onload = () => { BossImage.loaded = true; };
BossImage.el.onerror = () => { BossImage.loaded = false; };
BossImage.el.src = CONFIG.boss.imagePath;

/* ==========================================================================
   6.5 ボス画像アップロード＆顔検出（任意機能）
   スタート画面から人物写真を選ぶと、顔部分を検出して正方形に切り出し、
   ボス画像として利用する。画像は端末内だけで処理され、外部へは送信しない。
   対応端末（一部のChromeなど）ではShape Detection APIで顔を検出し、
   非対応端末（iOS Safari等）では写真上部中央を顔とみなして切り出す。
   ========================================================================== */
const CUSTOM_BOSS_STORAGE_KEY = 'starInvaders_customBossFace';

const BossFaceUpload = {
  outputSize: 480, // 生成する正方形画像の一辺(px)

  init() {
    const input = document.getElementById('boss-face-input');
    const resetBtn = document.getElementById('btn-face-reset');
    if (!input || !resetBtn) return;

    input.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) this.handleFile(file);
      input.value = ''; // 同じファイルを選び直しても change が発火するようにする
    });
    resetBtn.addEventListener('click', () => this.reset());

    // 前回選択した画像が保存されていれば復元する
    let saved = null;
    try { saved = localStorage.getItem(CUSTOM_BOSS_STORAGE_KEY); } catch (err) { /* プライベートモード等は無視 */ }
    if (saved) {
      BossImage.el.src = saved;
      this.showPreview(saved);
    }
  },

  setStatus(text) {
    const el = document.getElementById('face-upload-status');
    if (el) el.textContent = text;
  },

  showPreview(dataUrl) {
    const preview = document.getElementById('face-preview');
    if (!preview) return;
    preview.src = dataUrl;
    preview.classList.remove('hidden');
  },

  async handleFile(file) {
    if (!file.type || !file.type.startsWith('image/')) {
      this.setStatus('画像ファイルを選択してください');
      return;
    }
    this.setStatus('画像を読み込み中…');
    try {
      const dataUrl = await this.readFileAsDataUrl(file);
      const img = await this.loadImage(dataUrl);
      const region = await this.detectFaceRegion(img);
      const croppedDataUrl = this.cropToSquare(img, region);

      BossImage.el.src = croppedDataUrl;
      this.showPreview(croppedDataUrl);
      try { localStorage.setItem(CUSTOM_BOSS_STORAGE_KEY, croppedDataUrl); } catch (err) { /* 容量超過等は無視 */ }

      this.setStatus(region.detected
        ? '顔を検出してボス画像に設定しました'
        : 'この端末では自動検出に対応していないため、中央付近を切り出しました');
    } catch (err) {
      console.error('ボス画像の処理に失敗:', err);
      this.setStatus('画像の処理に失敗しました。別の画像でお試しください');
    }
  },

  readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('ファイル読み込みエラー'));
      reader.readAsDataURL(file);
    });
  },

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.src = src;
    });
  },

  // 顔領域を検出する。対応端末ではShape Detection APIを使用し、
  // 非対応・検出失敗時はフォールバック領域を返す
  async detectFaceRegion(img) {
    if ('FaceDetector' in window) {
      try {
        const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        const faces = await detector.detect(img);
        if (faces && faces.length > 0) {
          const box = faces[0].boundingBox;
          const region = this.expandToSquare(box.x, box.y, box.width, box.height, img.naturalWidth, img.naturalHeight);
          return { ...region, detected: true };
        }
      } catch (err) {
        // 検出に失敗した場合はフォールバックへ進む
      }
    }
    return { ...this.fallbackRegion(img.naturalWidth, img.naturalHeight), detected: false };
  },

  // 検出したボックスに髪や輪郭が収まるよう余白を持たせつつ正方形化する
  expandToSquare(x, y, w, h, imgW, imgH) {
    const pad = Math.max(w, h) * 0.5;
    let size = Math.min(Math.max(w, h) + pad * 2, imgW, imgH);
    const cx = x + w / 2;
    const cy = y + h / 2 - size * 0.05; // 頭頂部が入るよう少し上寄りにする
    const sx = clamp(cx - size / 2, 0, imgW - size);
    const sy = clamp(cy - size / 2, 0, imgH - size);
    return { sx, sy, size };
  },

  // 顔検出非対応端末向け：人物写真は顔が上部中央にあることが多いと仮定して切り出す
  fallbackRegion(imgW, imgH) {
    const size = Math.min(imgW, imgH * 0.9);
    const sx = clamp((imgW - size) / 2, 0, imgW - size);
    const sy = clamp(imgH * 0.05, 0, imgH - size);
    return { sx, sy, size };
  },

  cropToSquare(img, region) {
    const canvas = document.createElement('canvas');
    canvas.width = this.outputSize;
    canvas.height = this.outputSize;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, region.sx, region.sy, region.size, region.size, 0, 0, this.outputSize, this.outputSize);
    return canvas.toDataURL('image/jpeg', 0.85);
  },

  reset() {
    try { localStorage.removeItem(CUSTOM_BOSS_STORAGE_KEY); } catch (err) { /* 無視 */ }
    BossImage.el.src = CONFIG.boss.imagePath;
    const preview = document.getElementById('face-preview');
    if (preview) preview.classList.add('hidden');
    this.setStatus('デフォルトのボス画像に戻しました');
  },
};

/* ==========================================================================
   7. ゲーム本体
   ========================================================================== */
const Game = {
  canvas: null,
  ctx: null,
  W: 0,
  H: 0,

  state: 'START', // START / BANNER / PLAYING / BOSS_DEFEAT / GAMEOVER / GAMECLEAR
  stageIndex: 0,  // 0:STAGE1 1:STAGE2 2:BOSS
  score: 0,
  startTime: 0,
  clearTimeSec: 0,

  player: null,
  enemies: [],
  boss: null,
  playerBullets: [],
  enemyBullets: [],
  explosions: [],
  stars: [],

  groupDir: 1,
  bossDefeatTimer: 0,

  shakeTime: 0,
  shakeMag: 0,

  bannerTimer: 0,
  bannerCallback: null,

  lastTime: 0,

  dom: {},

  init() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.dom.hudStage = document.getElementById('hud-stage');
    this.dom.hudScore = document.getElementById('hud-score');
    this.dom.hudLife = document.getElementById('hud-life');
    this.dom.bossHpWrap = document.getElementById('boss-hp-wrap');
    this.dom.bossHpBar = document.getElementById('boss-hp-bar');
    this.dom.stageBanner = document.getElementById('stage-banner');
    this.dom.stageBannerText = document.getElementById('stage-banner-text');
    this.dom.screenStart = document.getElementById('screen-start');
    this.dom.screenGameover = document.getElementById('screen-gameover');
    this.dom.screenClear = document.getElementById('screen-clear');
    this.dom.overScore = document.getElementById('over-score');
    this.dom.clearScore = document.getElementById('clear-score');
    this.dom.clearLife = document.getElementById('clear-life');
    this.dom.clearTime = document.getElementById('clear-time');

    setupInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
    if (window.ResizeObserver) {
      new ResizeObserver(() => this.resize()).observe(document.getElementById('game-area'));
    }

    this.stars = [];
    for (let i = 0; i < 70; i++) this.stars.push(new Star(this.W, this.H));

    document.getElementById('btn-start').addEventListener('click', () => this.startGame());
    document.getElementById('btn-retry-over').addEventListener('click', () => this.startGame());
    document.getElementById('btn-retry-clear').addEventListener('click', () => this.startGame());
    document.getElementById('btn-home-over').addEventListener('click', () => this.returnToHome());
    document.getElementById('btn-home-clear').addEventListener('click', () => this.returnToHome());

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  // Canvasの実サイズをデバイスピクセル比に合わせて調整し、描画のぼやけを防ぐ
  resize() {
    const area = document.getElementById('game-area');
    const w = area.clientWidth;
    const h = area.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w;
    this.H = h;
    if (this.player) {
      this.player.x = clamp(this.player.x, this.player.w / 2, w - this.player.w / 2);
      this.player.y = h - CONFIG.player.bottomMargin;
    }
  },

  /* ---------------- 画面遷移 ---------------- */

  showScreen(name) {
    this.dom.screenStart.classList.add('hidden');
    this.dom.screenGameover.classList.add('hidden');
    this.dom.screenClear.classList.add('hidden');
    if (name === 'start') this.dom.screenStart.classList.remove('hidden');
    if (name === 'gameover') this.dom.screenGameover.classList.remove('hidden');
    if (name === 'clear') this.dom.screenClear.classList.remove('hidden');
  },

  showBanner(text, durationMs, callback) {
    this.state = 'BANNER';
    this.dom.stageBannerText.textContent = text;
    this.dom.stageBanner.classList.remove('hidden');
    this.bannerTimer = durationMs;
    this.bannerCallback = callback || null;
  },

  hideBanner() {
    this.dom.stageBanner.classList.add('hidden');
  },

  // ゲームオーバー／クリア画面からタイトル（スタート画面）に戻る
  returnToHome() {
    this.state = 'START';
    this.player = null;
    this.enemies = [];
    this.boss = null;
    this.playerBullets = [];
    this.enemyBullets = [];
    this.explosions = [];
    this.hideBanner();
    this.dom.bossHpWrap.classList.add('hidden');
    this.showScreen('start');
  },

  startGame() {
    this.score = 0;
    this.stageIndex = 0;
    this.player = new Player(this.W, this.H);
    this.enemies = [];
    this.boss = null;
    this.playerBullets = [];
    this.enemyBullets = [];
    this.explosions = [];
    this.startTime = performance.now();
    this.dom.bossHpWrap.classList.add('hidden');
    this.showScreen('none');
    this.updateHud();
    this.showBanner(CONFIG.stages[0].label, 1300, () => this.spawnStage(0));
  },

  /* ---------------- ステージ生成 ---------------- */

  spawnStage(index) {
    this.stageIndex = index;
    this.groupDir = 1;
    this.enemies = [];
    const def = CONFIG.stages[index];
    const marginX = 30;
    const usableW = this.W - marginX * 2;
    const spacingX = usableW / def.cols;
    const startY = 70;
    const spacingY = 34;
    for (let r = 0; r < def.rows; r++) {
      for (let c = 0; c < def.cols; c++) {
        const x = marginX + spacingX * c + spacingX / 2;
        const y = startY + r * spacingY;
        this.enemies.push(new Enemy(x, y, def.hp(r, c)));
      }
    }
    this.dom.bossHpWrap.classList.add('hidden');
    this.state = 'PLAYING';
    this.updateHud();
  },

  spawnBoss() {
    this.stageIndex = 2;
    this.boss = new Boss(this.W);
    this.dom.bossHpWrap.classList.remove('hidden');
    this.updateBossHpBar();
    this.state = 'PLAYING';
    this.updateHud();
  },

  /* ---------------- メインループ ---------------- */

  loop(now) {
    let dt = now - this.lastTime;
    this.lastTime = now;
    dt = Math.min(dt, 50); // タブ非表示復帰時などの大きな時間跳躍を防ぐ

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  },

  update(dt) {
    // 星の演出はどの画面でも流れ続ける
    this.stars.forEach((s) => s.update(dt, this.W, this.H));

    if (this.shakeTime > 0) this.shakeTime -= dt;

    if (this.state === 'BANNER') {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.hideBanner();
        const cb = this.bannerCallback;
        this.bannerCallback = null;
        this.state = 'PLAYING';
        if (cb) cb();
      }
      return;
    }

    if (this.state !== 'PLAYING' && this.state !== 'BOSS_DEFEAT') return;

    if (this.state === 'BOSS_DEFEAT') {
      this.bossDefeatTimer -= dt;
      this.explosions.forEach((e) => e.update(dt));
      this.explosions = this.explosions.filter((e) => !e.done);
      if (this.bossDefeatTimer <= 0) this.finishGameClear();
      return;
    }

    this.player.update(dt, this.W, this.H, Input);

    // プレイヤーの発射
    if (Input.fire && this.player.canFire()) {
      this.player.fire();
      this.playerBullets.push(new Bullet(
        this.player.x, this.player.y - this.player.h / 2,
        0, -CONFIG.player.bulletSpeed,
        CONFIG.bullet.playerW, CONFIG.bullet.playerH, '#7ef9ff'
      ));
      AudioEngine.shoot();
    }

    this.playerBullets.forEach((b) => b.update(dt));
    this.playerBullets = this.playerBullets.filter((b) => !b.offscreen(this.W, this.H));

    this.enemyBullets.forEach((b) => b.update(dt));
    this.enemyBullets = this.enemyBullets.filter((b) => !b.offscreen(this.W, this.H));

    this.explosions.forEach((e) => e.update(dt));
    this.explosions = this.explosions.filter((e) => !e.done);

    if (this.stageIndex < 2) {
      this.updateNormalStage(dt);
    } else {
      this.updateBossStage(dt);
    }

    this.handleCollisions();

    if (this.player.life <= 0) {
      this.gameOver();
    }
  },

  updateNormalStage(dt) {
    const def = CONFIG.stages[this.stageIndex];
    const alive = this.enemies.filter((e) => e.alive);

    if (alive.length === 0) {
      this.onStageCleared();
      return;
    }

    // 集団移動：端に到達したら反転して下降する
    const dx = this.groupDir * def.moveSpeed * dt / 1000;
    let newMin = Infinity, newMax = -Infinity;
    alive.forEach((e) => {
      newMin = Math.min(newMin, e.x + dx - e.w / 2);
      newMax = Math.max(newMax, e.x + dx + e.w / 2);
    });
    if (newMin < 6 || newMax > this.W - 6) {
      this.groupDir *= -1;
      alive.forEach((e) => { e.y += def.dropAmount; });
    } else {
      alive.forEach((e) => { e.x += dx; });
    }

    // 敵が画面下部（プレイヤー付近）まで到達した場合
    const dangerY = this.H - CONFIG.player.bottomMargin - 40;
    alive.forEach((e) => {
      if (e.y > dangerY) {
        e.alive = false;
        this.explosions.push(new Explosion(e.x, e.y, false));
        this.registerPlayerDamage();
      }
    });

    // 敵弾の発射
    if (this.enemyBullets.length < def.maxEnemyBullets) {
      const chance = def.fireChancePerSec * dt / 1000;
      alive.forEach((e) => {
        if (!e.alive) return;
        if (Math.random() < chance / def.rows) {
          this.enemyBullets.push(new Bullet(
            e.x, e.y + e.h / 2,
            0, CONFIG.bullet.enemySpeed * def.bulletSpeedMul,
            CONFIG.bullet.enemyW, CONFIG.bullet.enemyH, '#ff5d8f'
          ));
        }
      });
    }

    this.enemies = this.enemies.filter((e) => e.alive);
  },

  updateBossStage(dt) {
    if (!this.boss || !this.boss.alive) return;
    this.boss.update(dt, this.W);

    if (this.boss.readyToFire()) {
      this.boss.resetFireTimer();
      const angles = [-0.38, 0, 0.38];
      angles.forEach((a) => {
        const speed = CONFIG.bullet.enemySpeed * 1.25;
        this.enemyBullets.push(new Bullet(
          this.boss.x, this.boss.y + this.boss.h * 0.3,
          Math.sin(a) * speed, Math.cos(a) * speed,
          CONFIG.bullet.enemyW + 1, CONFIG.bullet.enemyH + 3, '#c44dff'
        ));
      });
    }
  },

  handleCollisions() {
    // プレイヤー弾 vs 通常敵
    if (this.stageIndex < 2) {
      for (const bullet of this.playerBullets) {
        if (bullet.dead) continue;
        for (const enemy of this.enemies) {
          if (!enemy.alive) continue;
          if (aabbHit(bullet.hitbox, enemy.hitbox)) {
            bullet.dead = true;
            const killed = enemy.hit();
            AudioEngine.enemyHit();
            if (killed) {
              this.score += enemy.strong ? CONFIG.score.strong : CONFIG.score.normal;
              this.explosions.push(new Explosion(enemy.x, enemy.y, false));
              this.updateHud();
            }
            break;
          }
        }
      }
      this.playerBullets = this.playerBullets.filter((b) => !b.dead);
      this.enemies = this.enemies.filter((e) => e.alive);
    }

    // プレイヤー弾 vs ボス
    if (this.stageIndex === 2 && this.boss && this.boss.alive) {
      for (const bullet of this.playerBullets) {
        if (bullet.dead) continue;
        if (aabbHit(bullet.hitbox, this.boss.hitbox)) {
          bullet.dead = true;
          const killed = this.boss.hit();
          this.updateBossHpBar();
          AudioEngine.enemyHit();
          if (killed) {
            this.onBossDefeated();
          }
        }
      }
      this.playerBullets = this.playerBullets.filter((b) => !b.dead);
    }

    // 敵弾 vs プレイヤー
    for (const bullet of this.enemyBullets) {
      if (bullet.dead) continue;
      if (aabbHit(bullet.hitbox, this.player.hitbox)) {
        bullet.dead = true;
        this.registerPlayerDamage();
      }
    }
    this.enemyBullets = this.enemyBullets.filter((b) => !b.dead);

    // 通常敵 vs プレイヤー（直接衝突）
    if (this.stageIndex < 2) {
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (aabbHit(enemy.hitbox, this.player.hitbox)) {
          enemy.alive = false;
          this.explosions.push(new Explosion(enemy.x, enemy.y, false));
          this.registerPlayerDamage();
        }
      }
      this.enemies = this.enemies.filter((e) => e.alive);
    }
  },

  registerPlayerDamage() {
    const damaged = this.player.hit();
    if (damaged) {
      AudioEngine.playerHit();
      this.shakeTime = 260;
      this.shakeMag = 8;
      this.updateHud();
    }
  },

  onStageCleared() {
    AudioEngine.stageClear();
    if (this.stageIndex === 0) {
      this.showBanner('STAGE CLEAR', 1100, () => {
        this.showBanner(CONFIG.stages[1].label, 1300, () => this.spawnStage(1));
      });
    } else {
      this.showBanner('STAGE CLEAR', 1100, () => {
        this.showBanner('BOSS BATTLE', 1400, () => this.spawnBoss());
      });
    }
  },

  onBossDefeated() {
    this.score += CONFIG.score.boss;
    this.updateHud();
    this.explosions.push(new Explosion(this.boss.x, this.boss.y, true));
    AudioEngine.explosionBig();
    this.state = 'BOSS_DEFEAT';
    this.bossDefeatTimer = 900;
  },

  finishGameClear() {
    this.clearTimeSec = ((performance.now() - this.startTime) / 1000).toFixed(1);
    this.dom.clearScore.textContent = this.score;
    this.dom.clearLife.textContent = this.player.life;
    this.dom.clearTime.textContent = this.clearTimeSec;
    AudioEngine.gameClear();
    this.state = 'GAMECLEAR';
    this.showScreen('clear');
  },

  gameOver() {
    AudioEngine.gameOver();
    this.dom.overScore.textContent = this.score;
    this.state = 'GAMEOVER';
    this.showScreen('gameover');
  },

  /* ---------------- HUD ---------------- */

  updateHud() {
    const stageLabel = this.stageIndex === 2 ? 'BOSS' : `STAGE ${this.stageIndex + 1}`;
    this.dom.hudStage.textContent = stageLabel;
    this.dom.hudScore.textContent = `SCORE ${this.score}`;
    this.dom.hudLife.textContent = 'LIFE ' + '❤'.repeat(Math.max(0, this.player ? this.player.life : 0));
  },

  updateBossHpBar() {
    if (!this.boss) return;
    const pct = Math.max(0, (this.boss.hp / this.boss.maxHp) * 100);
    this.dom.bossHpBar.style.width = pct + '%';
  },

  /* ---------------- 描画 ---------------- */

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    ctx.save();
    if (this.shakeTime > 0) {
      ctx.translate((Math.random() - 0.5) * this.shakeMag, (Math.random() - 0.5) * this.shakeMag);
    }

    // 背景（暗い宇宙空間 + 流れる星）
    ctx.fillStyle = '#05050f';
    ctx.fillRect(-10, -10, this.W + 20, this.H + 20);
    this.stars.forEach((s) => s.draw(ctx));

    if (this.state === 'PLAYING' || this.state === 'BANNER' || this.state === 'BOSS_DEFEAT') {
      this.enemies.forEach((e) => e.draw(ctx));
      if (this.boss && this.boss.alive) this.boss.draw(ctx, BossImage.el, BossImage.loaded);
      this.enemyBullets.forEach((b) => b.draw(ctx));
      this.playerBullets.forEach((b) => b.draw(ctx));
      if (this.player && this.state !== 'BOSS_DEFEAT') this.player.draw(ctx);
      this.explosions.forEach((e) => e.draw(ctx));
    }

    ctx.restore();
  },
};

/* ==========================================================================
   8. 起動
   ========================================================================== */
window.addEventListener('DOMContentLoaded', () => {
  try {
    Game.init();
    BossFaceUpload.init();
  } catch (err) {
    // 想定外のエラーでも真っ黒画面のまま固まらないよう最低限の表示を行う
    console.error('ゲーム初期化エラー:', err);
    document.body.innerHTML = '<p style="color:#fff;padding:20px;">読み込みに失敗しました。ページを再読み込みしてください。</p>';
  }
});


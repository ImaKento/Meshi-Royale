"use client";
import React, { useEffect, useRef, useState } from "react";

// Dodge Game (Start → 3s countdown → Run 30s → Result, light theme)
// - 矢印/WASDで移動（斜めは速度正規化）
// - 700ms → 250ms まで徐々に湧き間隔が短縮、落下速度も上昇
// - 当たったら即終了。30秒生存でクリア
// - スマホ/タブ: キャンバス上でドラッグでも移動可能
// - 一回きりのプレイ（Startは一度だけ）

type GameState =
  | { kind: "idle" }
  | { kind: "countdown"; endAt: number }
  | { kind: "running"; startedAt: number; endsAt: number }
  | { kind: "result"; survivedMs: number; cleared: boolean };

type Obstacle = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
};

const COUNTDOWN_MS = 3000;
const ROUND_MS = 30_000;

// プレイヤー
const PLAYER_RADIUS = 14;
const PLAYER_SPEED = 320;

// 障害物（難易度）
const SPAWN_INTERVAL_START = 700;
const SPAWN_INTERVAL_END = 250;
const OB_SPEED_START = 180;
const OB_SPEED_END = 360;
const OB_W_MIN = 24, OB_W_MAX = 56;
const OB_H_MIN = 16, OB_H_MAX = 44;

// レイアウト・フォント
const DESIGN_H = 480;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const uiScale = (H: number) => clamp(H / DESIGN_H, 0.6, 1.15);
const infobarH = (H: number) => Math.max(40, Math.round(56 * uiScale(H)));
const font = (px: number, H: number, weight = "600") =>
  `${weight} ${Math.max(10, Math.round(px * uiScale(H)))}px ui-sans-serif, system-ui`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fmtSec = (ms: number) => (ms / 1000).toFixed(2) + "s";

function circleRectHit(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

export default function DodgeGame() {
  const [state, setState] = useState<GameState>({ kind: "idle" });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const hasPlayedRef = useRef(false); // 一回きり制御

  // ★ 生存秒（ローカル保持用・表示には使わない）
  const survivedSecRef = useRef<number>(0);

  // 入力 & ワールド
  const keysRef = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef(false);

  const worldRef = useRef<{
    px: number; py: number;
    obstacles: Obstacle[];
    lastTs: number | null;
    lastSpawnMs: number;
    startMsRef: number;
  }>({
    px: 0, py: 0,
    obstacles: [],
    lastTs: null,
    lastSpawnMs: 0,
    startMsRef: 0,
  });

  // ===== 画面遷移 =====
  function start() {
    if (hasPlayedRef.current) return;      // 一回きり
    if (state.kind !== "idle") return;
    hasPlayedRef.current = true;
    setState({ kind: "countdown", endAt: performance.now() + COUNTDOWN_MS });
  }

  function startRunning() {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width));
    const H = Math.max(240, Math.round(rect.height));
    const barH = infobarH(H);

    worldRef.current.px = W / 2;
    worldRef.current.py = Math.min(H - PLAYER_RADIUS - 4, Math.max(barH + PLAYER_RADIUS + 4, H * 0.7));
    worldRef.current.obstacles = [];
    worldRef.current.lastTs = null;
    worldRef.current.lastSpawnMs = 0;
    worldRef.current.startMsRef = performance.now();

    const startedAt = performance.now();
    setState({ kind: "running", startedAt, endsAt: startedAt + ROUND_MS });
  }

  function finish(cleared: boolean) {
    setState(prev => {
      let survivedMs = 0;
      if (prev.kind === "running") survivedMs = performance.now() - prev.startedAt;
      else if (prev.kind === "countdown") survivedMs = 0;

      // ★ ローカルに「秒」で保持（小数も保持）
      survivedSecRef.current = survivedMs / 1000;

      return { kind: "result", survivedMs, cleared };
    });
  }

  // カウントダウン完了 → running
  useEffect(() => {
    if (state.kind !== "countdown") return;
    const t = window.setTimeout(startRunning, Math.max(0, state.endAt - performance.now()));
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind]);

  // ===== 入力（キーボード） =====
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Enter") {
        if (state.kind === "idle" && !hasPlayedRef.current) { e.preventDefault(); start(); }
        return;
      }
      if (state.kind !== "running") return;
      const k = e.key.toLowerCase();
      if (["arrowup","w","arrowdown","s","arrowleft","a","arrowright","d"].includes(k)) {
        e.preventDefault();
        keysRef.current.add(k);
      }
    }
    function up(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      keysRef.current.delete(k);
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [state.kind]);

  // ===== 入力（ポインタ: ドラッグ） =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function getLocalPos(ev: PointerEvent): { x: number; y: number } {
      const r = canvas!.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }
    function clampPlayer(x: number, y: number): { x: number; y: number } {
      const r = PLAYER_RADIUS;
      const rect = canvas!.getBoundingClientRect();
      const W = Math.max(1, Math.round(rect.width));
      const H = Math.max(240, Math.round(rect.height));
      const barH = infobarH(H);
      return { x: Math.max(r, Math.min(W - r, x)), y: Math.max(barH + r, Math.min(H - r, y)) };
    }

    function onDown(e: PointerEvent) {
      if (state.kind !== "running") return;
      isDraggingRef.current = true;
      const p = getLocalPos(e);
      const c = clampPlayer(p.x, p.y);
      worldRef.current.px = c.x;
      worldRef.current.py = c.y;
      canvas!.setPointerCapture(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (state.kind !== "running" || !isDraggingRef.current) return;
      const p = getLocalPos(e);
      const c = clampPlayer(p.x, p.y);
      worldRef.current.px = c.x;
      worldRef.current.py = c.y;
    }
    function onUp(e: PointerEvent) {
      isDraggingRef.current = false;
      try { canvas!.releasePointerCapture(e.pointerId); } catch {}
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [state.kind]);

  // ===== Canvas描画 & ゲームループ =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxRaw = canvas.getContext("2d");
    if (!ctxRaw) return;
    const ctx: CanvasRenderingContext2D = ctxRaw;
    const canvasEl: HTMLCanvasElement = canvas;

    function fitCanvas(c: HTMLCanvasElement, context: CanvasRenderingContext2D): { W: number; H: number } {
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = Math.max(240, Math.round(rect.height));
      if (c.width !== Math.round(cssW * dpr) || c.height !== Math.round(cssH * dpr)) {
        c.width = Math.round(cssW * dpr);
        c.height = Math.round(cssH * dpr);
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return { W: cssW, H: cssH };
    }

    function spawnObstacle(W: number, H: number, elapsedMs: number) {
      const t = Math.min(1, elapsedMs / ROUND_MS);
      const speed = lerp(OB_SPEED_START, OB_SPEED_END, t);
      const side = Math.random() < 0.85 ? "top" : (Math.random() < 0.5 ? "left" : "right");
      const barH = infobarH(H);

      if (side === "top") {
        const w = OB_W_MIN + Math.random() * (OB_W_MAX - OB_W_MIN);
        const h = OB_H_MIN + Math.random() * (OB_H_MAX - OB_H_MIN);
        const x = Math.random() * (W - w);
        const y = barH - h;
        worldRef.current.obstacles.push({ x, y, w, h, vx: 0, vy: speed });
      } else if (side === "left") {
        const w = OB_H_MIN + Math.random() * (OB_H_MAX - OB_H_MIN);
        const h = OB_W_MIN + Math.random() * (OB_W_MAX - OB_W_MIN);
        const x = -w;
        const y = barH + Math.random() * (H - barH - h);
        worldRef.current.obstacles.push({ x, y, w, h, vx: speed * 0.8, vy: 0 });
      } else {
        const w = OB_H_MIN + Math.random() * (OB_H_MAX - OB_H_MIN);
        const h = OB_W_MIN + Math.random() * (OB_W_MAX - OB_W_MIN);
        const x = W;
        const y = barH + Math.random() * (H - barH - h);
        worldRef.current.obstacles.push({ x, y, w, h, vx: -speed * 0.8, vy: 0 });
      }
    }

    function drawBg(W: number, H: number, remainingMs: number) {
      const barH = infobarH(H);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(0, 0, W, barH);
      ctx.fillStyle = "#111827";
      ctx.font = font(16, H, "600");
      ctx.textAlign = "center";

      const title =
        state.kind === "running"
          ? `避けろ！ 残り ${Math.ceil(remainingMs / 1000)} 秒`
          : state.kind === "countdown"
          ? "カウントダウン中…"
          : state.kind === "result"
          ? "" // 結果では何も表示しない
          : (hasPlayedRef.current ? "このゲームは一度だけプレイできます" : "Start で開始");

      if (title) ctx.fillText(title, W / 2, Math.round(barH * 0.6));
      ctx.textAlign = "start";
    }

    // カウントダウン（中央）
    function drawCountdownBig(W: number, H: number, remainingMs: number) {
      const bar = infobarH(H);
      const areaH = H - bar;
      const centerY = bar + areaH / 2;

      const text = String(Math.ceil(remainingMs / 1000));

      let px = Math.round(96 * uiScale(H));
      const minPx = 24;
      const maxPxByH = Math.floor(areaH * 0.45);
      px = Math.min(px, maxPxByH);

      const setFont = (size: number) => {
        ctx.font = `${800} ${size}px ui-sans-serif, system-ui`;
      };

      setFont(px);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const maxW = Math.floor(W * 0.9);
      while (px > minPx && ctx.measureText(text).width > maxW) {
        px -= 2;
        setFont(px);
      }

      ctx.fillStyle = "#111827";
      ctx.fillText(text, W / 2, centerY);

      ctx.font = font(14, H, "600");
      const offset = Math.max(28, Math.round(px * 0.66));
      const captionY = Math.min(H - 20, centerY + offset);
      ctx.fillText("まもなく開始します", W / 2, captionY);

      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }

    function drawPlayer(x: number, y: number) {
      ctx.beginPath();
      ctx.arc(x, y, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#2563eb";
      ctx.fill();
    }

    function drawObstacles() {
      ctx.fillStyle = "#ef4444";
      for (const o of worldRef.current.obstacles) {
        ctx.fillRect(o.x, o.y, o.w, o.h);
      }
    }

    function loop(ts: number) {
      const { W, H } = fitCanvas(canvasEl, ctx);

      if (state.kind === "running") {
        const startRef = worldRef.current.startMsRef || state.startedAt;
        const elapsedMs = performance.now() - startRef;
        const remainingMs = Math.max(0, state.endsAt - performance.now());
        const dt = worldRef.current.lastTs ? (ts - worldRef.current.lastTs) / 1000 : 0;
        worldRef.current.lastTs = ts;

        // 入力
        const k = keysRef.current;
        let dx = 0, dy = 0;
        if (k.has("arrowup") || k.has("w")) dy -= 1;
        if (k.has("arrowdown") || k.has("s")) dy += 1;
        if (k.has("arrowleft") || k.has("a")) dx -= 1;
        if (k.has("arrowright") || k.has("d")) dx += 1;
        if (dx !== 0 || dy !== 0) {
          const mag = Math.hypot(dx, dy) || 1;
          dx /= mag; dy /= mag;
          worldRef.current.px += dx * PLAYER_SPEED * dt;
          worldRef.current.py += dy * PLAYER_SPEED * dt;
        }

        // クランプ
        const r = PLAYER_RADIUS;
        worldRef.current.px = Math.max(r, Math.min(W - r, worldRef.current.px));
        const barH = infobarH(H);
        worldRef.current.py = Math.max(barH + r, Math.min(H - r, worldRef.current.py));

        // スポーン
        const spawnInterval = lerp(SPAWN_INTERVAL_START, SPAWN_INTERVAL_END, Math.min(1, elapsedMs / ROUND_MS));
        if (elapsedMs - worldRef.current.lastSpawnMs >= spawnInterval) {
          spawnObstacle(W, H, elapsedMs);
          worldRef.current.lastSpawnMs = elapsedMs;
        }

        // 更新 & 当たり判定
        const obs = worldRef.current.obstacles;
        for (let i = obs.length - 1; i >= 0; i--) {
          const o = obs[i];
          o.x += o.vx * dt;
          o.y += o.vy * dt;
          if (o.y > H || o.x + o.w < 0 || o.x > W || o.y + o.h < barH) {
            obs.splice(i, 1);
            continue;
          }
          if (circleRectHit(worldRef.current.px, worldRef.current.py, r, o.x, o.y, o.w, o.h)) {
            finish(false);
            break;
          }
        }

        drawBg(W, H, remainingMs);
        drawPlayer(worldRef.current.px, worldRef.current.py);
        drawObstacles();

        if (remainingMs <= 0) finish(true);
      } else {
        const remainingMs =
          state.kind === "countdown" ? Math.max(0, state.endAt - performance.now()) : ROUND_MS;
        drawBg(W, H, remainingMs);

        ctx.textAlign = "center";
        ctx.fillStyle = "#111827";
        if (state.kind === "idle") {
          ctx.font = font(20, H, "600");
          ctx.fillText(
            hasPlayedRef.current ? "このゲームは一度だけプレイできます" : "Start を押すと 3 秒カウントダウン",
            W / 2, H / 2
          );
        } else if (state.kind === "countdown") {
          drawCountdownBig(W, H, remainingMs);
        } else if (state.kind === "result") {
          const cleared = state.cleared;
          ctx.font = font(48, H, "800");
          ctx.fillText(cleared ? "CLEAR!" : "GAME OVER", W / 2, H / 2 - 24);
          ctx.font = font(18, H, "600");
          ctx.fillText(`生存時間: ${fmtSec(state.survivedMs)}`, W / 2, H / 2 + 8);
        }
        ctx.textAlign = "start";
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [state]);

  // ===== UI =====
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-white p-4 sm:p-6">
      <div className="w-full max-w-3xl grid gap-4">
        <header className="flex items-center justify-between">
          <h1 className="text-slate-900 text-xl sm:text-2xl font-bold">Avoidance Game</h1>
          <div className="flex gap-2 items-center">
            {state.kind === "idle" && !hasPlayedRef.current && (
              <button
                onClick={start}
                className="px-3 py-1.5 rounded-2xl bg-emerald-600 text-white font-semibold shadow hover:bg-emerald-500"
              >
                Start
              </button>
            )}
            {state.kind === "countdown" && (
              <span className="px-2 py-0.5 rounded-xl bg-amber-500 text-white font-semibold shadow text-xs sm:text-sm">
                Countdown…
              </span>
            )}
            {state.kind === "running" && (
              <span className="px-3 py-1.5 rounded-2xl bg-blue-600 text-white font-semibold shadow text-xs sm:text-sm">
                Playing…
              </span>
            )}
            {/* 一回きり：resultでも再プレイボタンは出さない */}
          </div>
        </header>

        <div className="rounded-2xl overflow-hidden ring-1 ring-slate-200 shadow">
          {/* モバイルは縦長、md以上は16:9 */}
          <div className="w-full aspect-[9/16] md:aspect-[16/9]">
            <canvas ref={canvasRef} className="w-full h-full" />
          </div>
        </div>

        <p className="text-slate-600 text-xs sm:text-sm">
          操作: 矢印 / WASD（モバイルはキャンバス上をドラッグ）。当たったら即終了、30秒耐えられたらクリア！
        </p>
      </div>
    </div>
  );
}

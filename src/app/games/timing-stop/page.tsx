"use client";
import React, { useEffect, useRef, useState } from "react";

// Timing Stop (Start → 3s countdown → Run → Result, one-shot, light theme)
// Start → 3秒カウントダウン → タイマー開始。表示は 0.3×目標（1秒刻みで切り上げ）まで。
// Stop で結果表示。結果後は一回限りで終了。

type GameState =
  | { kind: "idle" }
  | { kind: "countdown"; endAt: number }
  | { kind: "running"; startedAt: number }
  | { kind: "result"; elapsedMs: number; targetMs: number; signedErrorMs: number; rating: string };

const BASE_HEIGHT = 260;           // キャンバスのCSS高さ（px）※幅はコンテナに合わせる
const INFOBAR_HEIGHT = 64;         // 上部グレーのバー高さ
const TARGET_SEC = 10;             // 固定の目標時間（必要なら変更）

const THRESHOLDS = { perfect: 15, great: 50, good: 150 };

function visibleUntilMsFor(targetMs: number) {
  const raw = 0.3 * targetMs;
  const step = 1000;
  const snapped = Math.ceil(raw / step) * step; // 切り上げ
  return Math.max(step, snapped);
}
function ratingFor(absErrorMs: number) {
  if (absErrorMs <= THRESHOLDS.perfect) return "Perfect";
  if (absErrorMs <= THRESHOLDS.great) return "Great";
  if (absErrorMs <= THRESHOLDS.good) return "Good";
  return "Miss";
}
function formatSignedSeconds(ms: number) {
  const s = ms / 1000;
  const sign = s > 0 ? "+" : s < 0 ? "−" : "±";
  return `${sign}${Math.abs(s).toFixed(3)}s`;
}

export default function TimingStopBlind() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [state, setState] = useState<GameState>({ kind: "idle" });
  const [bestErrorMs, setBestErrorMs] = useState<number>(Infinity);

  // ベスト誤差の復元（任意）
  useEffect(() => {
    try {
      const savedBest = localStorage.getItem("timing_best_error_ms");
      if (savedBest != null) setBestErrorMs(Number(savedBest));
    } catch {}
  }, []);

  const targetMs = TARGET_SEC * 1000;
  const visibleUntilMs = visibleUntilMsFor(targetMs);

  function start() {
    if (state.kind !== "idle") return;
    setState({ kind: "countdown", endAt: performance.now() + 3000 });
  }
  function stop() {
    if (state.kind !== "running") return;
    const now = performance.now();
    const elapsedMs = now - state.startedAt;
    const absErr = Math.abs(elapsedMs - targetMs); // ← 誤差の絶対値のみ保持
    const rating = ratingFor(absErr);
    setState({ kind: "result", elapsedMs, targetMs, signedErrorMs: absErr, rating });
    if (absErr < bestErrorMs) {
      setBestErrorMs(absErr);
      try { localStorage.setItem("timing_best_error_ms", String(absErr)); } catch {}
    }
  }
  useEffect(() => {
    if (state.kind !== "countdown") return;
    const delay = Math.max(0, state.endAt - performance.now());
    const t = setTimeout(() => setState({ kind: "running", startedAt: performance.now() }), delay);
    return () => clearTimeout(t);
  }, [state]);

  // キーボード: 一回限り（resultでの再開なし）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (state.kind === "idle") start();
        else if (state.kind === "running") stop();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    

    // デバイスピクセル比に合わせてキャンバスをフィット
    function fitCanvas() {
      
      if (!canvas) return;
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = BASE_HEIGHT; // 高さは固定（必要なら可変に）
      const needResize =
        canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr);
      if (needResize) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 以降はCSSピクセルで描画
      }
      return { W: cssW, H: cssH };
    }

    function drawBg(W: number, H: number) {
      // 背景: 白
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      // 上部インフォバー（右端までしっかり塗る）
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(0, 0, W, INFOBAR_HEIGHT);

      // テキスト（中央寄せで2項目を1行に）
      ctx.fillStyle = "#111827";
      ctx.font = "600 16px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      const centerText = `目標時間: ${TARGET_SEC}s　|　${(visibleUntilMs / 1000).toFixed(0)}秒から隠れるよ`;
      ctx.fillText(centerText, W / 2, 24);
      ctx.textAlign = "start";
    }

    function drawIdle(W: number, H: number) {
      if (!ctx) return;
      ctx.textAlign = "center";
      ctx.fillStyle = "#111827";
      ctx.font = "600 18px ui-sans-serif, system-ui";
      ctx.fillText("Start を押すと 3 秒カウントダウン", W / 2, H / 2 + 10);
      ctx.textAlign = "start";
    }

    function drawCountdown(W: number, H: number) {
      if (!ctx) return;
      const now = performance.now();
      const leftMs = state.kind === "countdown" ? Math.max(0, state.endAt - now) : 0;
      const leftSec = Math.ceil(leftMs / 1000); // 3,2,1
      ctx.textAlign = "center";
      ctx.fillStyle = "#111827";
      ctx.font = "800 72px ui-sans-serif, system-ui";
      ctx.fillText(String(leftSec), W / 2, H / 2 + 24);
      ctx.font = "600 16px ui-sans-serif, system-ui";
      ctx.fillText("まもなく開始…", W / 2, H - 28);
      ctx.textAlign = "start";
    }

    function drawTimer(W: number, H: number, elapsedMs: number) {
      const show = elapsedMs <= visibleUntilMs;
      if (!ctx) return;
      ctx.textAlign = "center";
      ctx.fillStyle = "#111827";
      if (show) {
        ctx.font = "700 64px ui-sans-serif, system-ui";
        ctx.fillText((elapsedMs / 1000).toFixed(3) + "s", W / 2, H / 2 + 18);
      } else {
        ctx.font = "700 54px ui-sans-serif, system-ui";
        ctx.globalAlpha = 0.5;
        ctx.fillText("— — —", W / 2, H / 2 + 14);
        ctx.globalAlpha = 1;
        ctx.font = "500 16px ui-sans-serif, system-ui";
        ctx.fillText("研ぎ澄ませ", W / 2, H - 28);
      }
      ctx.textAlign = "start";
    }

    function drawResult(W: number, H: number, elapsedMs: number, absErrorMs: number, _rating: string) {
      if (!ctx) return;
      
      const actual = (elapsedMs / 1000).toFixed(3) + "s";
      const signedDisplay = (elapsedMs - targetMs >= 0 ? +1 : -1) * absErrorMs;
      const diffStr = formatSignedSeconds(signedDisplay);
      const hint = signedDisplay > 0 ? "遅い" : signedDisplay < 0 ? "早い" : "ピタ";

      ctx.textAlign = "center";
      ctx.fillStyle = "#111827";
      ctx.font = "800 56px ui-sans-serif, system-ui";
      ctx.fillText(actual, W / 2, H / 2 - 8);
      ctx.font = "600 18px ui-sans-serif, system-ui";
      ctx.fillText(`目標時間: ${TARGET_SEC}s  |  ${hint}`, W / 2, H / 2 + 24);
      ctx.font = "700 22px ui-sans-serif, system-ui";
      ctx.fillText(`誤差: ${diffStr}`, W / 2, H / 2 + 50);
      ctx.textAlign = "start";
    }

    function loop() {
      const size = fitCanvas(); // 戻り値: {W,H} | undefined
      if (!size) return;        // ここでナローイング
      const { W, H } = size;

      drawBg(W, H);

      if (state.kind === "idle") {
        drawIdle(W, H);
      } else if (state.kind === "countdown") {
        drawCountdown(W, H);
      } else if (state.kind === "running") {
        const elapsedMs = performance.now() - state.startedAt;
        drawTimer(W, H, elapsedMs);
      } else if (state.kind === "result") {
        drawResult(W, H, state.elapsedMs, state.signedErrorMs, state.rating);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    // リサイズ時も自動フィット
    const onResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(BASE_HEIGHT * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    window.addEventListener("resize", onResize);

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [state, visibleUntilMs, targetMs]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-white p-6">
      <div className="w-full max-w-3xl grid gap-4">
        <header className="flex items-center justify-between">
          <h1 className="text-slate-900 text-2xl font-bold">ビタ押しチャレンジ</h1>
          <div className="flex gap-2">
            {state.kind === "idle" && (
              <button
                className="px-3 py-1.5 rounded-2xl bg-emerald-600 text-white font-semibold shadow hover:bg-emerald-500"
                onClick={() => {
                  if (state.kind === "idle") {
                    setState({ kind: "countdown", endAt: performance.now() + 3000 });
                  }
                }}
              >
                Start
              </button>
            )}
            {state.kind === "countdown" && (
              <span className="px-3 py-1.5 rounded-2xl bg-amber-500 text-white font-semibold shadow">
                Countdown…
              </span>
            )}
            {state.kind === "running" && (
              <button
                className="px-3 py-1.5 rounded-2xl bg-blue-600 text-white font-semibold shadow hover:bg-blue-500"
                onClick={() => {
                  if (state.kind === "running") {
                    const now = performance.now();
                    const elapsedMs = now - state.startedAt;
                    const absErr = Math.abs(elapsedMs - targetMs);
                    const rating = ratingFor(absErr);
                    setState({ kind: "result", elapsedMs, targetMs, signedErrorMs: absErr, rating });
                    if (absErr < bestErrorMs) {
                      setBestErrorMs(absErr);
                      try { localStorage.setItem("timing_best_error_ms", String(absErr)); } catch {}
                    }
                  }
                }}
              >
                Stop
              </button>
            )}
            {/* result ではボタンなし（やり直し不可） */}
          </div>
        </header>

        <div className="rounded-2xl overflow-hidden ring-1 ring-slate-200 shadow">
          {/* キャンバスは幅100%に広げ、JS側で高DPI対応＆右端まで塗りつぶし */}
          <canvas ref={canvasRef} style={{ width: "100%", height: BASE_HEIGHT }} />
        </div>
      </div>
    </div>
  );
}

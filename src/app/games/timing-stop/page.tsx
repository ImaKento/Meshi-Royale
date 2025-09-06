"use client";
import React, { useEffect, useRef, useState } from "react";

// Timing Stop (Start → 3s countdown → Run → Result, one-shot, light theme)

type GameState =
  | { kind: "idle" }
  | { kind: "countdown"; endAt: number }
  | { kind: "running"; startedAt: number }
  // absErrorMs は誤差の絶対値(ms)のみを保持（±は表示時に算出）
  | { kind: "result"; elapsedMs: number; targetMs: number; absErrorMs: number };

const BASE_HEIGHT = 260;
const INFOBAR_HEIGHT = 64;
const TARGET_SEC = 10;

function visibleUntilMsFor(targetMs: number) {
  const raw = 0.3 * targetMs;
  const step = 1000;
  const snapped = Math.ceil(raw / step) * step; // 1秒刻みで切り上げ
  return Math.max(step, snapped);
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
    const absErrorMs = Math.abs(elapsedMs - targetMs);
    setState({ kind: "result", elapsedMs, targetMs, absErrorMs });
    if (absErrorMs < bestErrorMs) {
      setBestErrorMs(absErrorMs);
      try {
        localStorage.setItem("timing_best_error_ms", String(absErrorMs));
      } catch {}
    }
  }

  // カウントダウン終了で自動的に running へ
  useEffect(() => {
    if (state.kind !== "countdown") return;
    const delay = Math.max(0, state.endAt - performance.now());
    const t = setTimeout(
      () => setState({ kind: "running", startedAt: performance.now() }),
      delay
    );
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

  // ====== Canvas render loop ======
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function fitCanvas(): { W: number; H: number } | undefined {
      if (!canvas) return;
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = BASE_HEIGHT;
      const needResize =
        canvas.width !== Math.round(cssW * dpr) ||
        canvas.height !== Math.round(cssH * dpr);
      if (needResize) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return { W: cssW, H: cssH };
    }

    function drawBg(W: number, H: number) {
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(0, 0, W, INFOBAR_HEIGHT);
      ctx.fillStyle = "#111827";
      ctx.font = "600 16px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      const centerText = `目標時間: ${TARGET_SEC}s　|　${(
        visibleUntilMs / 1000
      ).toFixed(0)}秒から隠れるよ`;
      ctx.fillText(centerText, W / 2, 24);
      ctx.textAlign = "start";
    }

// 例：drawIdle
    function drawIdle(W: number, H: number) {
      if (!ctx) return;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#111827";
      ctx.font = "600 18px ui-sans-serif, system-ui";
      ctx.fillText("Start を押すと 3 秒カウントダウン", Math.round(W/2), Math.round(H/2 + 10));
    }


    function drawCountdown(W: number, H: number) {
      if (!ctx) return;

      const now = performance.now();
      const leftMs = state.kind === "countdown" ? Math.max(0, state.endAt - now) : 0;
      const leftSec = Math.ceil(leftMs / 1000); // 3,2,1

      // 追加：ベースライン固定 & 中央座標は整数にスナップ
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // 等幅フォント系で数字の見た目ブレを抑制（太字72px）
      ctx.fillStyle = "#111827";
      ctx.font = "800 72px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

      const cx = Math.round(W / 2);
      const cy = Math.round(H / 2 + 24);
      ctx.fillText(String(leftSec), cx, cy);

      // サブテキストも整数座標に
      ctx.font = "600 16px ui-sans-serif, system-ui";
      ctx.fillText("まもなく開始…", cx, Math.round(H - 28));
    }


    function drawTimer(W: number, H: number, elapsedMs: number) {
      if (!ctx) return;
      const show = elapsedMs <= visibleUntilMs;
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

    function drawResult(
      W: number,
      H: number,
      elapsedMs: number,
      absErrorMs: number
    ) {
      const actual = (elapsedMs / 1000).toFixed(3) + "s";
      const signedDisplay =
        (elapsedMs - targetMs >= 0 ? +1 : -1) * absErrorMs;
      const diffStr = formatSignedSeconds(signedDisplay);
      const hint =
        signedDisplay > 0 ? "遅い" : signedDisplay < 0 ? "早い" : "ピタ";
      
      if (!ctx) return;
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
      const size = fitCanvas();
      if (!size) return;
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
        drawResult(W, H, state.elapsedMs, state.absErrorMs);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state, visibleUntilMs, targetMs]);

  return (
    // 画面全体。上ヘッダー/下アクションの固定分だけ余白を確保
    <div className="min-h-[100dvh] bg-white overflow-x-hidden pt-16 pb-24 sm:pb-28 [padding-top:calc(4rem+env(safe-area-inset-top))] [padding-bottom:calc(6rem+env(safe-area-inset-bottom))]">
      {/* 固定ヘッダー */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-16 flex items-center justify-center">
          <h1 className="text-slate-900 text-xl sm:text-2xl font-bold tracking-tight truncate">
            ビタ押しチャレンジ
          </h1>
        </div>
      </header>

      {/* コンテンツ */}
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-4">
        <div className="rounded-2xl overflow-hidden ring-1 ring-slate-200 shadow">
          <canvas ref={canvasRef} style={{ width: "100%", height: BASE_HEIGHT }} />
        </div>
      </main>

      {/* 画面中央下に固定：丸ボタン単体（背後の長方形カードは削除） */}
      {state.kind !== "result" && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-20 w-full max-w-sm px-4 sm:px-0 pb-[env(safe-area-inset-bottom)]">
          <div className="mb-4 sm:mb-6 flex items-center justify-center">
            {state.kind === "idle" && (
              <button
                aria-label="Start"
                onClick={start}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-emerald-600 text-white font-bold text-lg sm:text-xl shadow-xl
                           hover:bg-emerald-500 active:scale-[0.98] transition
                           focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/50
                           grid place-items-center select-none"
              >
                Start
              </button>
            )}
            {state.kind === "countdown" && (
              <span
                aria-live="polite"
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-amber-500 text-white font-bold text-base sm:text-lg shadow-xl
                           grid place-items-center select-none"
              >
                Ready…
              </span>
            )}
            {state.kind === "running" && (
              <button
                aria-label="Stop"
                onClick={stop}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-blue-600 text-white font-bold text-lg sm:text-xl shadow-xl
                           hover:bg-blue-500 active:scale-[0.98] transition
                           focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/50
                           grid place-items-center select-none"
              >
                Stop
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

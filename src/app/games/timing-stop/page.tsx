"use client";
import React, { useEffect, useRef, useState } from "react";

// Timing Stop (Start → 3s countdown → Run → Result, one-shot, light theme)
// 仕様: Start で 3 秒カウントダウン → タイマー開始。表示は 0.3×目標時間（1秒刻みで切り上げ）まで。
// Stop で結果表示。結果後は再開・リセット不可（このページ滞在中は一回限り）。
// Space/Enter: Idle=Start, Running=Stop（Countdown/Result中は無効）。

// --- Types ---
type GameState =
  | { kind: "idle" }
  | { kind: "countdown"; endAt: number }
  | { kind: "running"; startedAt: number }
  // 誤差の絶対値(ms)のみ保持（±は表示時に算出）
  | { kind: "result"; elapsedMs: number; targetMs: number; signedErrorMs: number; rating: string };

// --- Constants ---
const WIDTH = 720;
const HEIGHT = 260;

// 固定の目標時間（秒）
const TARGET_SEC = 10;

const THRESHOLDS = {
  perfect: 15,
  great: 50,
  good: 150,
};

// 約30%を 1.0 s 刻みで「切り上げ」
function visibleUntilMsFor(targetMs: number) {
  const raw = 0.3 * targetMs; // 30%
  const step = 1000;          // 1.0 s
  const snapped = Math.ceil(raw / step) * step; // 切り上げ
  return Math.max(step, snapped);               // 最低1.0s 可視
}

function ratingFor(absErrorMs: number) {
  if (absErrorMs <= THRESHOLDS.perfect) return "Perfect";
  if (absErrorMs <= THRESHOLDS.great) return "Great";
  if (absErrorMs <= THRESHOLDS.good) return "Good";
  return "Miss";
}

function formatSignedSeconds(ms: number) {
  const s = ms / 1000;
  const sign = s > 0 ? "+" : s < 0 ? "−" : "±"; // U+2212
  return `${sign}${Math.abs(s).toFixed(3)}s`;
}

export default function TimingStopBlind() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [state, setState] = useState<GameState>({ kind: "idle" });
  const [bestErrorMs, setBestErrorMs] = useState<number>(Infinity);

  // ベスト誤差は復元（任意）
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const savedBest = localStorage.getItem("timing_best_error_ms");
      if (savedBest != null) setBestErrorMs(Number(savedBest));
    } catch {}
  }, []);

  const targetMs = TARGET_SEC * 1000;
  const visibleUntilMs = visibleUntilMsFor(targetMs);

  function start() {
    if (state.kind !== "idle") return; // 一回限り
    const endAt = performance.now() + 3000; // 3秒後に走行開始
    setState({ kind: "countdown", endAt });
  }

  function stop() {
    if (state.kind !== "running") return;
    const now = performance.now();
    const elapsedMs = now - state.startedAt;
    const signed = elapsedMs - targetMs; // 表示用の符号（保持はしない）
    const absErr = Math.abs(signed);     // ← 誤差の絶対値のみ保持
    const rating = ratingFor(absErr);
    setState({ kind: "result", elapsedMs, targetMs, signedErrorMs: absErr, rating });

    if (absErr < bestErrorMs) {
      setBestErrorMs(absErr);
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem("timing_best_error_ms", String(absErr));
        }
      } catch {}
    }
  }

  // カウントダウン完了で自動的に running へ
  useEffect(() => {
    if (state.kind !== "countdown") return;
    const delay = Math.max(0, state.endAt - performance.now());
    const t = setTimeout(() => {
      setState({ kind: "running", startedAt: performance.now() });
    }, delay);
    return () => clearTimeout(t);
  }, [state]);

  // Keyboard（一回限り仕様に合わせて result では Start しない。Reset もなし）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (state.kind === "idle") start();
        else if (state.kind === "running") stop();
        // countdown/result 中は無効
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  // --- Render (Canvas loop) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    function drawBg() {
      if (!canvas || !ctx) return;
      // 背景: 白
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // top info bar: 薄いグレー
      ctx.fillStyle = "#f3f4f6"; // gray-100
      ctx.fillRect(0, 0, WIDTH, 64);

      // テキスト: 濃いグレー
      ctx.fillStyle = "#111827"; // gray-900
      ctx.font = "600 16px ui-sans-serif, system-ui";
      ctx.fillText(`目標時間: ${TARGET_SEC}s`, 16, 24);
      ctx.fillText(`${(visibleUntilMs / 1000).toFixed(0)}秒から隠れるよ`, 220, 24);
    }

    function drawIdle() {
      if (!canvas || !ctx) return;
      ctx.textAlign = "center";
      ctx.fillStyle = "#111827";
      ctx.font = "600 18px ui-sans-serif, system-ui";
      ctx.fillText("Start を押すと 3 秒カウントダウン", WIDTH / 2, HEIGHT / 2 + 10);
      ctx.textAlign = "start";
    }

    function drawCountdown() {
      if (!canvas || !ctx) return;
      const now = performance.now();
      let leftMs = 0;
      if (state.kind === "countdown") leftMs = Math.max(0, state.endAt - now);
      const leftSec = Math.ceil(leftMs / 1000); // 3,2,1
      ctx.textAlign = "center";
      ctx.fillStyle = "#111827";
      ctx.font = "800 72px ui-sans-serif, system-ui";
      ctx.fillText(String(leftSec), WIDTH / 2, HEIGHT / 2 + 24);
      ctx.font = "600 16px ui-sans-serif, system-ui";
      ctx.fillText("まもなく開始…", WIDTH / 2, HEIGHT - 28);
      ctx.textAlign = "start";
    }

    function drawTimer(elapsedMs: number) {
      if (!canvas || !ctx) return;
      const show = elapsedMs <= visibleUntilMs;
      ctx.textAlign = "center";
      ctx.fillStyle = "#111827";

      if (show) {
        if (!canvas || !ctx) return;
        ctx.font = "700 64px ui-sans-serif, system-ui";
        ctx.fillText((elapsedMs / 1000).toFixed(3) + "s", WIDTH / 2, HEIGHT / 2 + 18);
      } else {
        ctx.font = "700 54px ui-sans-serif, system-ui";
        ctx.globalAlpha = 0.5;
        ctx.fillText("— — —", WIDTH / 2, HEIGHT / 2 + 14);
        ctx.globalAlpha = 1;
        ctx.font = "500 16px ui-sans-serif, system-ui";
        ctx.fillText("研ぎ澄ませ", WIDTH / 2, HEIGHT - 28);
      }
      ctx.textAlign = "start";
    }

    // 最終結果: 1) 実測タイム（大） 2) 目標時間＋早い/遅い 3) 目標の下に誤差（±）
    function drawResult(elapsedMs: number, absErrorMs: number, _rating: string) {
      if (!canvas || !ctx) return;

      const actual = (elapsedMs / 1000).toFixed(3) + "s";
      const signedDisplay = (elapsedMs - targetMs >= 0 ? +1 : -1) * absErrorMs;
      const diffStr = formatSignedSeconds(signedDisplay);
      const hint = signedDisplay > 0 ? "遅い" : signedDisplay < 0 ? "早い" : "ピタ";

      ctx.textAlign = "center";
      ctx.fillStyle = "#111827";

      // 1行目：実測タイム（大）
      ctx.font = "800 56px ui-sans-serif, system-ui";
      ctx.fillText(actual, WIDTH / 2, HEIGHT / 2 - 8);

      // 2行目：目標時間 + 早い/遅い
      ctx.font = "600 18px ui-sans-serif, system-ui";
      ctx.fillText(`目標時間: ${TARGET_SEC}s  |  ${hint}`, WIDTH / 2, HEIGHT / 2 + 24);

      // 3行目：誤差（±表記）
      ctx.font = "700 22px ui-sans-serif, system-ui";
      ctx.fillText(`誤差: ${diffStr}`, WIDTH / 2, HEIGHT / 2 + 50);

      ctx.textAlign = "start";
    }

    function loop() {
      drawBg();

      if (state.kind === "idle") {
        drawIdle();
      } else if (state.kind === "countdown") {
        drawCountdown();
      } else if (state.kind === "running") {
        const elapsedMs = performance.now() - state.startedAt;
        drawTimer(elapsedMs);
      } else if (state.kind === "result") {
        drawResult(state.elapsedMs, state.signedErrorMs, state.rating);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
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
                onClick={start}
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
                onClick={stop}
              >
                Stop
              </button>
            )}
            {/* result では何も出さない（再挑戦不可） */}
          </div>
        </header>

        <div className="rounded-2xl overflow-hidden ring-1 ring-slate-200 shadow">
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="block" />
        </div>


      </div>
    </div>
  );
}

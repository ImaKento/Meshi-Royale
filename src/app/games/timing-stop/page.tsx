"use client";
import React, { useEffect, useRef, useState } from "react";

// Timing Stop (Target-Time, Blind until ~30% with clean cutoff)
// 仕様: 表示は「目標時間の約30%」まで。ただしゲーム性のため、切りのいい値(1.0秒刻み)に切り上げて打ち切り。
// ここでは 0.5 秒刻みで、0.3×Target を切り捨て（例: 10s→3.0s, 15s→4.5s, 7s→2.0s）。
// Space/Enter = Start/Stop, R = Reset。

// --- Types ---
type GameState =
  | { kind: "idle" }
  | { kind: "running"; startedAt: number }
  | { kind: "result"; elapsedMs: number; targetMs: number; errorMs: number; score: number; rating: string };

// --- Constants ---
const WIDTH = 720;
const HEIGHT = 260;

const THRESHOLDS = {
  perfect: 15,
  great: 50,
  good: 150,
};

// 約30%を "切りの良い" 値にスナップする（0.5秒刻みで切り捨て）
function visibleUntilMsFor(targetMs: number) {
  const raw = 0.3 * targetMs; // 30%
  const step = 1000; // 1.0 s 刻み
  const snapped = Math.ceil(raw / step) * step; // 切り上げ
  return Math.max(step, snapped); // 最低1.0s 可視
}

export default function TimingStopBlind() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  const [state, setState] = useState<GameState>({ kind: "idle" });
  const [targetSec, setTargetSec] = useState<number>(() => Number(localStorage.getItem("timing_target_sec") ?? 10.0));
  const [bestErrorMs, setBestErrorMs] = useState<number>(() => Number(localStorage.getItem("timing_best_error_ms") ?? Infinity));

  const targetMs = Math.max(1, Math.min(60, targetSec)) * 1000; // 1〜60s にクランプ
  const visibleUntilMs = visibleUntilMsFor(targetMs);

  function ratingFor(error: number) {
    if (error <= THRESHOLDS.perfect) return "Perfect";
    if (error <= THRESHOLDS.great) return "Great";
    if (error <= THRESHOLDS.good) return "Good";
    return "Miss";
  }
  function scoreFor(error: number) {
    const s = Math.max(0, 100 - (error / 2000) * 100);
    return Math.round(s);
  }

  function start() {
    if (state.kind === "running") return;
    setState({ kind: "running", startedAt: performance.now() });
  }
  function stop() {
    if (state.kind !== "running") return;
    const now = performance.now();
    const elapsedMs = now - state.startedAt;
    const errorMs = Math.abs(elapsedMs - targetMs);
    const score = scoreFor(errorMs);
    const rating = ratingFor(errorMs);
    setState({ kind: "result", elapsedMs, targetMs, errorMs, score, rating });
    if (errorMs < bestErrorMs) {
      setBestErrorMs(errorMs);
      localStorage.setItem("timing_best_error_ms", String(errorMs));
    }
  }
  function reset() {
    setState({ kind: "idle" });
  }

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (state.kind === "idle") start();
        else if (state.kind === "running") stop();
        else if (state.kind === "result") reset();
      }
      if (e.key.toLowerCase() === "r") { e.preventDefault(); reset(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  useEffect(() => { localStorage.setItem("timing_target_sec", String(targetSec)); }, [targetSec]);

  // --- Render ---
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    function drawBg() {
      ctx.fillStyle = "#0b1020";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // top info bar
      ctx.fillStyle = "#111827"; // gray-900
      ctx.fillRect(0, 0, WIDTH, 64);

      ctx.fillStyle = "#ffffff";
      ctx.font = "600 16px ui-sans-serif, system-ui";
      ctx.fillText(`Target: ${(targetMs/1000).toFixed(1)}s`, 16, 24);
      ctx.fillText(`Visible until: ${(visibleUntilMs/1000).toFixed(1)}s`, 220, 24);

      if (Number.isFinite(bestErrorMs)) {
        ctx.font = "500 14px ui-sans-serif, system-ui";
        ctx.fillText(`Best Error: ${Math.round(bestErrorMs)} ms`, 16, 46);
      }
    }

    function drawTimer(elapsedMs: number) {
      const show = elapsedMs <= visibleUntilMs;
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";

      if (show) {
        ctx.font = "700 64px ui-sans-serif, system-ui";
        ctx.fillText((elapsedMs/1000).toFixed(3) + "s", WIDTH/2, HEIGHT/2 + 18);
        ctx.font = "500 16px ui-sans-serif, system-ui";
        ctx.fillText("Timer visible (~30% of target)", WIDTH/2, HEIGHT - 28);
      } else {
        ctx.font = "700 54px ui-sans-serif, system-ui";
        ctx.globalAlpha = 0.5;
        ctx.fillText("— — —", WIDTH/2, HEIGHT/2 + 14);
        ctx.globalAlpha = 1;
        ctx.font = "500 16px ui-sans-serif, system-ui";
        ctx.fillText("研ぎ澄ませ", WIDTH/2, HEIGHT - 28);
      }
      ctx.textAlign = "start";
    }

    function drawResult(elapsedMs: number, errorMs: number, score: number, rating: string) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 40px ui-sans-serif, system-ui";
      ctx.fillText(rating, WIDTH/2, HEIGHT/2 - 12);

      ctx.font = "600 18px ui-sans-serif, system-ui";
      ctx.fillText(`Your time: ${(elapsedMs/1000).toFixed(3)}s`, WIDTH/2, HEIGHT/2 + 16);
      ctx.fillText(`Target: ${(targetMs/1000).toFixed(3)}s`, WIDTH/2, HEIGHT/2 + 40);
      ctx.fillText(`Error: ${errorMs.toFixed(0)} ms  |  Score: ${score}`, WIDTH/2, HEIGHT/2 + 64);
      ctx.textAlign = "start";
    }

    function loop(ts: number) {
      if (lastRef.current == null) lastRef.current = ts;
      lastRef.current = ts;

      drawBg();

      if (state.kind === "running") {
        const elapsedMs = performance.now() - state.startedAt;
        drawTimer(elapsedMs);
      } else if (state.kind === "result") {
        drawResult(state.elapsedMs, state.errorMs, state.score, state.rating);
      } else {
        // idle hint
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.font = "600 18px ui-sans-serif, system-ui";
        ctx.fillText("Press Start, watch until cutoff, then count in your head.", WIDTH/2, HEIGHT/2 + 10);
        ctx.textAlign = "start";
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [state, targetMs, bestErrorMs, visibleUntilMs]);

  const disabled = state.kind === "running";

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-3xl grid gap-4">
        <header className="flex items-center justify-between">
          <h1 className="text-white text-2xl font-bold">ビタ押しチャレンジ</h1>
          <div className="flex gap-2">
            {state.kind !== "running" && (
              <button
                className="px-3 py-1.5 rounded-2xl bg-emerald-400 text-slate-900 font-semibold shadow hover:bg-emerald-300"
                onClick={start}
              >
                Start
              </button>
            )}
            {state.kind === "running" && (
              <button
                className="px-3 py-1.5 rounded-2xl bg-blue-400 text-slate-900 font-semibold shadow hover:bg-blue-300"
                onClick={stop}
              >
                Stop
              </button>
            )}
            {(state.kind === "result" || state.kind === "idle") && (
              <button
                className="px-3 py-1.5 rounded-2xl bg-white/10 text-white font-medium shadow hover:bg-white/20"
                onClick={reset}
              >
                Reset
              </button>
            )}
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
          <label className="text-slate-200 text-sm">
            設定時間 (5.0〜60.0 秒)
            <input
              type="number"
              step={1}
              min={5}
              max={60}
              value={targetSec}
              onChange={(e) => setTargetSec(Number(e.target.value))}
              disabled={disabled}
              className="mt-1 w-32 rounded-xl bg-white/10 text-white px-3 py-1.5 outline-none ring-1 ring-white/10 focus:ring-white/30"
            />
          </label>
          <div className="flex gap-2">
            {[5, 10, 15].map((t) => (
              <button
                key={t}
                disabled={disabled}
                onClick={() => setTargetSec(t)}
                className="px-3 py-1.5 rounded-2xl bg-white/10 text-white font-medium hover:bg-white/20 disabled:opacity-50"
              >
                {t}s
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden ring-1 ring-white/10 shadow">
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="block" />
        </div>

        <aside className="text-slate-300 text-sm leading-relaxed">
          <p className="mb-1">Start でタイマー開始。<span className="font-semibold">表示は 0.3×設定時間 を **1.0 秒刻みで切り上げ**た時点</span>までです。</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>Space / Enter でも Start/Stop、<span className="font-semibold">R</span> でリセット。</li>
            <li>Stop 時点の実測タイムと目標との差で評価とスコアを表示。</li>
            <li>自己ベスト（最小誤差）はローカルに保存。</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

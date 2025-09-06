"use client";
import React, { useEffect, useRef, useState } from "react";

// Timing Stop (Target-Time, Blind until ~30% with 1s ceil cutoff, light theme)
// 仕様: 表示は「目標時間の約30%」まで。ただし 1.0秒刻みで【切り上げ】て打ち切り。
// 設定時間は 5〜60 秒の整数。Space/Enter = Start/Stop, R = Reset。

// --- Types ---
type GameState =
  | { kind: "idle" }
  | { kind: "running"; startedAt: number }
  // signedErrorMs: 誤差の絶対値(ms)を保持（＋/−の符号は表示時に算出）
  | { kind: "result"; elapsedMs: number; targetMs: number; signedErrorMs: number; rating: string };

// --- Constants ---
const WIDTH = 720;
const HEIGHT = 260;

const THRESHOLDS = {
  perfect: 15,
  great: 50,
  good: 150,
};

// 1秒刻みで整数に正規化（範囲 5〜60）
function clampIntSeconds(v: number) {
  return Math.min(60, Math.max(5, Math.round(Number.isFinite(v) ? v : 10)));
}

// 約30%を 1.0 s 刻みで「切り上げ」
function visibleUntilMsFor(targetMs: number) {
  const raw = 0.3 * targetMs; // 30%
  const step = 1000; // 1.0 s
  const snapped = Math.ceil(raw / step) * step; // 切り上げ
  return Math.max(step, snapped); // 最低1.0s 可視
}

function ratingFor(absErrorMs: number) {
  if (absErrorMs <= THRESHOLDS.perfect) return "Perfect";
  if (absErrorMs <= THRESHOLDS.great) return "Great";
  if (absErrorMs <= THRESHOLDS.good) return "Good";
  return "Miss";
}

function formatSignedSeconds(ms: number) {
  const s = ms / 1000;
  const sign = s > 0 ? "+" : s < 0 ? "−" : "±"; // U+2212 マイナス
  return `${sign}${Math.abs(s).toFixed(3)}s`;
}

export default function TimingStopBlind() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  const [state, setState] = useState<GameState>({ kind: "idle" });
  // 初期値は即値。localStorage 復元はマウント後に行う（SSR安全）
  const [targetSec, setTargetSec] = useState<number>(10);
  const [bestErrorMs, setBestErrorMs] = useState<number>(Infinity);

  // マウント後に localStorage から復元
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const savedTarget = localStorage.getItem("timing_target_sec");
      if (savedTarget != null) setTargetSec(clampIntSeconds(Number(savedTarget)));
      const savedBest = localStorage.getItem("timing_best_error_ms");
      if (savedBest != null) setBestErrorMs(Number(savedBest));
    } catch {
      // Safari プライベート等の例外は無視
    }
  }, []);

  const targetMs = clampIntSeconds(targetSec) * 1000; // 整数秒→ms
  const visibleUntilMs = visibleUntilMsFor(targetMs);

  function start() {
    if (state.kind === "running") return;
    setState({ kind: "running", startedAt: performance.now() });
  }

  function stop() {
    if (state.kind !== "running") return;
    const now = performance.now();
    const elapsedMs = now - state.startedAt;
    const signed = elapsedMs - targetMs;                // 符号つき誤差（表示専用）
    const absErr = Math.abs(signed);                    // ← 保持するのは絶対値
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
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        reset();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  // 永続化（整数秒で保存）
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const normalized = clampIntSeconds(targetSec);
      if (normalized !== targetSec) setTargetSec(normalized);
      localStorage.setItem("timing_target_sec", String(normalized));
    } catch {}
  }, [targetSec]);

  // --- Render ---
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    function drawBg() {
      if (!ctx) return;
      // 背景: 白
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // top info bar: 薄いグレー
      ctx.fillStyle = "#f3f4f6"; // gray-100
      ctx.fillRect(0, 0, WIDTH, 64);

      // テキスト: 濃いグレー
      ctx.fillStyle = "#111827"; // gray-900
      ctx.font = "600 16px ui-sans-serif, system-ui";
      ctx.fillText(`目標時間: ${(targetMs / 1000).toFixed(0)}s`, 16, 24);
      ctx.fillText(`${(visibleUntilMs / 1000).toFixed(0)}秒から隠れるよ`, 220, 24);
    }

    function drawTimer(elapsedMs: number) {
      const show = elapsedMs <= visibleUntilMs;
      if (!ctx) return;
      ctx.textAlign = "center";
      ctx.fillStyle = "#111827"; // 濃いグレー

      if (show) {
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
      const actual = (elapsedMs / 1000).toFixed(3) + "s";
      // 表示用の符号は elapsed と target の比較で決める
      const signedDisplay = (elapsedMs - targetMs >= 0 ? +1 : -1) * absErrorMs;
      const diffStr = formatSignedSeconds(signedDisplay);
      const hint = signedDisplay > 0 ? "遅い" : signedDisplay < 0 ? "早い" : "ピタ";
      
      if (!ctx) return;
      ctx.textAlign = "center";
      ctx.fillStyle = "#111827";

      // 1行目：実測タイム（大）
      ctx.font = "800 56px ui-sans-serif, system-ui";
      ctx.fillText(actual, WIDTH / 2, HEIGHT / 2 - 8);

      // 2行目：目標時間 + 早い/遅い
      ctx.font = "600 18px ui-sans-serif, system-ui";
      ctx.fillText(`目標時間: ${(targetMs / 1000).toFixed(0)}s  |  ${hint}`, WIDTH / 2, HEIGHT / 2 + 24);

      // 3行目：誤差（±表記）— 目標時間の下
      ctx.font = "700 22px ui-sans-serif, system-ui";
      ctx.fillText(`誤差: ${diffStr}`, WIDTH / 2, HEIGHT / 2 + 50);

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
        drawResult(state.elapsedMs, state.signedErrorMs, state.rating);
      } else {
        if (!ctx) return;
        // idle hint
        ctx.fillStyle = "#111827";
        ctx.textAlign = "center";
        ctx.font = "600 18px ui-sans-serif, system-ui";
        ctx.fillText("心の準備ができたら，押しなよ", WIDTH / 2, HEIGHT / 2 + 10);
        ctx.textAlign = "start";
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state, targetMs, bestErrorMs, visibleUntilMs]);

  const disabled = state.kind === "running";

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-white p-6">
      <div className="w-full max-w-3xl grid gap-4">
        <header className="flex items-center justify-between">
          <h1 className="text-slate-900 text-2xl font-bold">ビタ押しチャレンジ</h1>
          <div className="flex gap-2">
            {state.kind !== "running" && (
              <button
                className="px-3 py-1.5 rounded-2xl bg-emerald-600 text-white font-semibold shadow hover:bg-emerald-500"
                onClick={start}
              >
                Start
              </button>
            )}
            {state.kind === "running" && (
              <button
                className="px-3 py-1.5 rounded-2xl bg-blue-600 text-white font-semibold shadow hover:bg-blue-500"
                onClick={stop}
              >
                Stop
              </button>
            )}
            {(state.kind === "result" || state.kind === "idle") && (
              <button
                className="px-3 py-1.5 rounded-2xl bg-slate-100 text-slate-900 font-medium shadow hover:bg-slate-200"
                onClick={reset}
              >
                Reset
              </button>
            )}
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
          <label className="text-slate-700 text-sm">
            設定時間 (5〜60 秒)
            <input
              type="number"
              step={1}
              min={5}
              max={60}
              value={targetSec}
              onChange={(e) => setTargetSec(clampIntSeconds(Number(e.target.value)))}
              disabled={disabled}
              className="mt-1 w-32 rounded-xl bg-white text-slate-900 px-3 py-1.5 outline-none ring-1 ring-slate-300 focus:ring-slate-400"
            />
          </label>
          <div className="flex gap-2">
            {[5, 10, 15].map((t) => (
              <button
                key={t}
                disabled={disabled}
                onClick={() => setTargetSec(t)}
                className="px-3 py-1.5 rounded-2xl bg-slate-100 text-slate-900 font-medium hover:bg-slate-200 disabled:opacity-50"
              >
                {t}s
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden ring-1 ring-slate-200 shadow">
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="block" />
        </div>

        <aside className="text-slate-700 text-sm leading-relaxed">
          <p className="mb-1">
            Start でタイマー開始。<span className="font-semibold">表示は 0.3×設定時間 を 1.0 秒刻みで切り上げ</span>た時点までです。
          </p>
          <ul className="list-disc ml-5 space-y-1">
            <li>Space / Enter でも Start/Stop、<span className="font-semibold">R</span> でリセット。</li>
            <li>結果は <span className="font-semibold">ビタ押しタイム（大）</span>、その下に <span className="font-semibold">目標時間</span>、さらに <span className="font-semibold">誤差（±）</span> を表示します。</li>
            <li>自己ベスト（最小誤差）はローカルに保存。</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

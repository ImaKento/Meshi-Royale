'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

// Dodge Game (Start → 3s countdown → Run 30s → Result, light theme)
// ===== 型 =====
type GameState =
  | { kind: 'idle' }
  | { kind: 'countdown'; endAt: number }
  | { kind: 'running'; startedAt: number; endsAt: number }
  | { kind: 'result'; survivedMs: number; cleared: boolean };

type Obstacle = { x: number; y: number; w: number; h: number; vx: number; vy: number };

// ===== 定数 =====
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
const font = (px: number, H: number, weight = '600') =>
  `${weight} ${Math.max(10, Math.round(px * uiScale(H)))}px ui-sans-serif, system-ui`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fmtSec = (ms: number) => (ms / 1000).toFixed(2) + 's';

function circleRectHit(
  cx: number, cy: number, r: number,
  rx: number, ry: number, rw: number, rh: number
) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

// ===== ランキング生成（競技順位: 1,2,2,4） =====
// order: 'desc' は大きいほど上位（生存時間ms）、'asc' は小さいほど上位（誤差msなど）
function buildLeaderboard<T extends { id?: string; scores?: number; created_at?: string; createdAt?: string }>(
  rows: T[], order: 'asc' | 'desc' = 'desc'
) {
  const sorted = rows.slice().sort((a, b) => {
    const as = Number(a?.scores ?? (order === 'asc' ? Infinity : -Infinity));
    const bs = Number(b?.scores ?? (order === 'asc' ? Infinity : -Infinity));
    if (as !== bs) return order === 'asc' ? as - bs : bs - as;
    // タイブレーク: created_at/createdAt → id
    const at = a.created_at ?? a.createdAt ?? '';
    const bt = b.created_at ?? b.createdAt ?? '';
    if (at && bt && at !== bt) return String(at).localeCompare(String(bt));
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
  const ranks: number[] = new Array(sorted.length);
  let lastScore: number | null = null;
  let lastRank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const s = Number(sorted[i]?.scores ?? (order === 'asc' ? Infinity : -Infinity));
    if (lastScore === null || s !== lastScore) {
      lastRank = i + 1;
      lastScore = s;
    }
    ranks[i] = lastRank;
  }
  return { sorted, ranks };
}

function DodgeGameContent() {
  // ===== URL / ルーム / リアルタイム関連 =====
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  const roomCode = searchParams.get('roomCode');
  const joindUserCount = searchParams.get('joindUserCount'); // 前コード互換のtypo名を踏襲
  const totalPlayers = parseInt(joindUserCount || '0', 10);
  const gameType = 'avoidance';

  const [roomId, setRoomId] = useState<string | null>(null);
  const [gameResults, setGameResults] = useState<any[]>([]);
  const [allDone, setAllDone] = useState(false);

  // ===== ゲーム状態 =====
  const [state, setState] = useState<GameState>({ kind: 'idle' });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const hasPlayedRef = useRef(false); // 一回きり制御
  const survivedSecRef = useRef<number>(0);
  const postedRef = useRef(false); // 結果POSTの多重防止

  const keysRef = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef(false);

  const worldRef = useRef<{
    px: number; py: number; obstacles: Obstacle[]; lastTs: number | null;
    lastSpawnMs: number; startMsRef: number;
  }>({ px: 0, py: 0, obstacles: [], lastTs: null, lastSpawnMs: 0, startMsRef: 0 });

  // ===== ルームID取得 =====
  useEffect(() => {
    if (!roomCode) return;
    let aborted = false;
    (async () => {
      try {
        const res = await fetch(`/api/rooms?roomCode=${encodeURIComponent(roomCode)}`);
        const data = await res.json();
        if (!aborted && res.ok && data?.room?.id) setRoomId(data.room.id);
      } catch (e) {
        console.error('ルームID取得エラー:', e);
      }
    })();
    return () => { aborted = true; };
  }, [roomCode]);

  // ===== Realtime購読（INSERT/UPDATE）: サーバーフィルタ無し＋手動チェック =====
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`game-results-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'GameResults' }, // フィルタ外す
        async (payload: any) => {
          const n = payload?.new ?? payload?.record ?? {};
          const payloadRoomId = n.roomId ?? n.room_id;
          const payloadGameType = n.gameType ?? n.game_type;
          if (payloadRoomId !== roomId) return;
          if (payloadGameType !== gameType) return;

          try {
            const resp = await fetch(
              `/api/gameResults?roomId=${encodeURIComponent(roomId)}&gameType=${encodeURIComponent(gameType)}`
            );
            const data = await resp.json();
            if (resp.ok && data?.gameResults) {
              const list = data.gameResults as any[];
              setGameResults(list);
              if (totalPlayers > 0 && list.length >= totalPlayers) setAllDone(true); // state.kind ガード無し
            }
          } catch (e) {
            console.error('Realtime データ取得エラー:', e);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, gameType, totalPlayers]);

  // ===== 初期データ取得（ガード無しで allDone 判定） =====
  useEffect(() => {
    if (!roomId) return;
    (async () => {
      try {
        const resp = await fetch(
          `/api/gameResults?roomId=${encodeURIComponent(roomId)}&gameType=${encodeURIComponent(gameType)}`
        );
        const data = await resp.json();
        if (resp.ok && data?.gameResults) {
          const list = data.gameResults as any[];
          setGameResults(list);
          if (totalPlayers > 0 && list.length >= totalPlayers) setAllDone(true);
        }
      } catch (e) {
        console.error('初期データ取得エラー:', e);
      }
    })();
  }, [roomId, gameType, totalPlayers]);

  // ===== 画面遷移 =====
  function start() {
    if (hasPlayedRef.current) return; // 一回きり
    if (state.kind !== 'idle') return;
    hasPlayedRef.current = true;
    setState({ kind: 'countdown', endAt: performance.now() + COUNTDOWN_MS });
  }

  function startRunning() {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width));
    const H = Math.max(240, Math.round(rect.height));
    const barHVal = infobarH(H);

    worldRef.current.px = W / 2;
    worldRef.current.py = Math.min(H - PLAYER_RADIUS - 4, Math.max(barHVal + PLAYER_RADIUS + 4, H * 0.7));
    worldRef.current.obstacles = [];
    worldRef.current.lastTs = null;
    worldRef.current.lastSpawnMs = 0;
    worldRef.current.startMsRef = performance.now();

    postedRef.current = false;
    setAllDone(false);

    const startedAt = performance.now();
    setState({ kind: 'running', startedAt, endsAt: startedAt + ROUND_MS });
  }

  function finish(cleared: boolean) {
    setState(prev => {
      let survivedMs = 0;
      if (prev.kind === 'running') survivedMs = performance.now() - prev.startedAt;
      else if (prev.kind === 'countdown') survivedMs = 0;
      survivedSecRef.current = survivedMs / 1000;
      return { kind: 'result', survivedMs, cleared };
    });
  }

  // カウントダウン完了 → running
  useEffect(() => {
    if (state.kind !== 'countdown') return;
    const t = window.setTimeout(startRunning, Math.max(0, state.endAt - performance.now()));
    return () => window.clearTimeout(t);
  }, [state.kind]);

  // ===== 結果保存（INSERT/UPSERT → Realtimeで全員同期） =====
  useEffect(() => {
    if (state.kind !== 'result') return;
    if (!userId || !roomId) return;
    if (postedRef.current) return;

    postedRef.current = true; // 多重POST防止
    (async () => {
      try {
        const res = await fetch(`/api/gameResults`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            roomId,
            gameType,
            // スコアは生存ミリ秒（大きいほど上位）
            scores: Math.round(state.survivedMs),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);

        // 保険で最新取得
        const resp = await fetch(
          `/api/gameResults?roomId=${encodeURIComponent(roomId)}&gameType=${encodeURIComponent(gameType)}`
        );
        const listJson = await resp.json();
        if (resp.ok && listJson?.gameResults) {
          const list = listJson.gameResults as any[];
          setGameResults(list);
          if (totalPlayers > 0 && list.length >= totalPlayers) setAllDone(true);
        }
      } catch (e) {
        console.error('ゲーム結果の保存に失敗:', e);
        postedRef.current = false; // 失敗時は再試行可
      }
    })();
  }, [state, userId, roomId, gameType, totalPlayers]);

  // ===== 入力（キーボード） =====
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Enter') {
        if (state.kind === 'idle' && !hasPlayedRef.current) { e.preventDefault(); start(); }
        return;
      }
      if (state.kind !== 'running') return;
      const k = e.key.toLowerCase();
      if (['arrowup','w','arrowdown','s','arrowleft','a','arrowright','d'].includes(k)) {
        e.preventDefault();
        keysRef.current.add(k);
      }
    }
    function up(e: KeyboardEvent) { keysRef.current.delete(e.key.toLowerCase()); }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [state.kind]);

  // ===== 入力（ポインタ: ドラッグ） =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function getLocalPos(ev: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }
    function clampPlayer(x: number, y: number) {
      const r = PLAYER_RADIUS;
      const rect = canvas!.getBoundingClientRect();
      const W = Math.max(1, Math.round(rect.width));
      const H = Math.max(240, Math.round(rect.height));
      const barHVal = infobarH(H);
      return { x: Math.max(r, Math.min(W - r, x)), y: Math.max(barHVal + r, Math.min(H - r, y)) };
    }

    function onDown(e: PointerEvent) {
      if (state.kind !== 'running') return;
      isDraggingRef.current = true;
      const p = getLocalPos(e);
      const c = clampPlayer(p.x, p.y);
      worldRef.current.px = c.x; worldRef.current.py = c.y;
      canvas!.setPointerCapture(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (state.kind !== 'running' || !isDraggingRef.current) return;
      const p = getLocalPos(e);
      const c = clampPlayer(p.x, p.y);
      worldRef.current.px = c.x; worldRef.current.py = c.y;
    }
    function onUp(e: PointerEvent) {
      isDraggingRef.current = false;
      try { canvas!.releasePointerCapture(e.pointerId); } catch {}
    }

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [state.kind]);

  // ===== Canvas描画 & ゲームループ =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxRaw = canvas.getContext('2d');
    if (!ctxRaw) return;
    const ctx: CanvasRenderingContext2D = ctxRaw;
    const canvasEl: HTMLCanvasElement = canvas;

    function fitCanvas(c: HTMLCanvasElement, context: CanvasRenderingContext2D) {
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
      const side = Math.random() < 0.85 ? 'top' : (Math.random() < 0.5 ? 'left' : 'right');
      const barHVal = infobarH(H);

      if (side === 'top') {
        const w = OB_W_MIN + Math.random() * (OB_W_MAX - OB_W_MIN);
        const h = OB_H_MIN + Math.random() * (OB_H_MAX - OB_H_MIN);
        const x = Math.random() * (W - w);
        const y = barHVal - h;
        worldRef.current.obstacles.push({ x, y, w, h, vx: 0, vy: speed });
      } else if (side === 'left') {
        const w = OB_H_MIN + Math.random() * (OB_H_MAX - OB_H_MIN);
        const h = OB_W_MIN + Math.random() * (OB_W_MAX - OB_W_MIN);
        const x = -w;
        const y = barHVal + Math.random() * (H - barHVal - h);
        worldRef.current.obstacles.push({ x, y, w, h, vx: speed * 0.8, vy: 0 });
      } else {
        const w = OB_H_MIN + Math.random() * (OB_H_MAX - OB_H_MIN);
        const h = OB_W_MIN + Math.random() * (OB_W_MAX - OB_W_MIN);
        const x = W;
        const y = barHVal + Math.random() * (H - barHVal - h);
        worldRef.current.obstacles.push({ x, y, w, h, vx: -speed * 0.8, vy: 0 });
      }
    }

    function drawBg(W: number, H: number, remainingMs: number) {
      const barHVal = infobarH(H);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, W, barHVal);
      ctx.fillStyle = '#111827';
      ctx.font = font(16, H, '600');
      ctx.textAlign = 'center';

      const title =
        state.kind === 'running' ? `避けろ！ 残り ${Math.ceil(remainingMs / 1000)} 秒`
        : state.kind === 'countdown' ? 'カウントダウン中…'
        : state.kind === 'result' ? ''
        : hasPlayedRef.current ? 'このゲームは一度だけプレイできます'
        : 'Start で開始';

      if (title) ctx.fillText(title, W / 2, Math.round(barHVal * 0.6));
      ctx.textAlign = 'start';
    }

    function drawCountdownBig(W: number, H: number, remainingMs: number) {
      const bar = infobarH(H);
      const areaH = H - bar;
      const centerY = bar + areaH / 2;
      const text = String(Math.ceil(remainingMs / 1000));

      let px = Math.round(96 * uiScale(H));
      const minPx = 24;
      const maxPxByH = Math.floor(areaH * 0.45);
      px = Math.min(px, maxPxByH);

      const setFont = (size: number) => { ctx.font = `${800} ${size}px ui-sans-serif, system-ui`; };
      setFont(px);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const maxW = Math.floor(W * 0.9);
      while (px > minPx && ctx.measureText(text).width > maxW) { px -= 2; setFont(px); }

      ctx.fillStyle = '#111827';
      ctx.fillText(text, W / 2, centerY);

      ctx.font = font(14, H, '600');
      const offset = Math.max(28, Math.round(px * 0.66));
      const captionY = Math.min(H - 20, centerY + offset);
      ctx.fillText('まもなく開始します', W / 2, captionY);

      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    function drawPlayer(x: number, y: number) {
      ctx.beginPath();
      ctx.arc(x, y, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#2563eb';
      ctx.fill();
    }

    function drawObstacles() {
      ctx.fillStyle = '#ef4444';
      for (const o of worldRef.current.obstacles) ctx.fillRect(o.x, o.y, o.w, o.h);
    }

    function loop(ts: number) {
      const { W, H } = fitCanvas(canvasEl, ctx);

      if (state.kind === 'running') {
        const startRef = worldRef.current.startMsRef || state.startedAt;
        const elapsedMs = performance.now() - startRef;
        const remainingMs = Math.max(0, state.endsAt - performance.now());
        const dt = worldRef.current.lastTs ? (ts - worldRef.current.lastTs) / 1000 : 0;
        worldRef.current.lastTs = ts;

        // 入力
        const k = keysRef.current;
        let dx = 0, dy = 0;
        if (k.has('arrowup') || k.has('w')) dy -= 1;
        if (k.has('arrowdown') || k.has('s')) dy += 1;
        if (k.has('arrowleft') || k.has('a')) dx -= 1;
        if (k.has('arrowright') || k.has('d')) dx += 1;
        if (dx !== 0 || dy !== 0) {
          const mag = Math.hypot(dx, dy) || 1;
          dx /= mag; dy /= mag;
          worldRef.current.px += dx * PLAYER_SPEED * dt;
          worldRef.current.py += dy * PLAYER_SPEED * dt;
        }

        // クランプ
        const r = PLAYER_RADIUS;
        worldRef.current.px = Math.max(r, Math.min(W - r, worldRef.current.px));
        const barHVal = infobarH(H);
        worldRef.current.py = Math.max(barHVal + r, Math.min(H - r, worldRef.current.py));

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
          if (o.y > H || o.x + o.w < 0 || o.x > W || o.y + o.h < barHVal) { obs.splice(i, 1); continue; }
          if (circleRectHit(worldRef.current.px, worldRef.current.py, r, o.x, o.y, o.w, o.h)) { finish(false); break; }
        }

        drawBg(W, H, remainingMs);
        drawPlayer(worldRef.current.px, worldRef.current.py);
        drawObstacles();

        if (remainingMs <= 0) finish(true);
      } else {
        const remainingMs = state.kind === 'countdown' ? Math.max(0, state.endAt - performance.now()) : ROUND_MS;
        drawBg(W, H, remainingMs);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#111827';
        if (state.kind === 'idle') {
          // Start画面
        } else if (state.kind === 'countdown') {
          drawCountdownBig(W, H, remainingMs);
        } else if (state.kind === 'result') {
          const cleared = state.cleared;
          ctx.font = font(48, H, '800');
          ctx.fillText(cleared ? 'CLEAR!' : 'GAME OVER', W / 2, H / 2 - 24);
          ctx.font = font(18, H, '600');
          ctx.fillText(`生存時間: ${fmtSec(state.survivedMs)}`, W / 2, H / 2 + 8);
        }
        ctx.textAlign = 'start';
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [state]);

  // ===== UI =====
  const StartScreen = (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-white p-6">
      <h1 className="text-slate-900 text-3xl sm:text-4xl font-extrabold tracking-tight mb-8 text-center">
        Avoidance Game
      </h1>
      <button
        aria-label="Start"
        onClick={start}
        className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-emerald-600 text-white font-bold text-xl sm:text-2xl shadow-xl
                   hover:bg-emerald-500 active:scale-[0.98] transition
                   focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/50
                   grid place-items-center select-none"
      >
        Start
      </button>
      <p className="mt-8 text-slate-600 text-sm text-center">
        矢印 / WASD で移動 <br />
        （モバイルはドラッグ）<br />
        30秒耐えればクリア！
      </p>
    </div>
  );

  // 最終結果カード（Realtime対応＋タイ処理）
  const ResultPanel =
    state.kind === 'result' ? (
      <div className="max-w-3xl w-full mx-auto mt-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow">
          <h2 className="text-slate-900 text-2xl font-bold mb-4">結果</h2>
          <div className="grid gap-2">
            <div className="flex items-baseline gap-3">
              <span className="text-slate-500 text-sm">あなたの生存時間</span>
              <span className="text-slate-900 text-xl font-extrabold">
                {fmtSec(state.survivedMs)}
              </span>
              <span className="text-slate-500 text-sm">（{state.cleared ? 'CLEAR' : 'FAIL'}）</span>
            </div>
          </div>

          {!roomId || !totalPlayers ? (
            <p className="mt-4 text-slate-600 text-sm">
              ルーム連携なしの単体プレイです。URLに <code>userId</code>, <code>roomCode</code>, <code>joindUserCount</code> を付けると対戦待ち＆リザルトが有効になります。
            </p>
          ) : !allDone ? (
            <p className="mt-4 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
              他のプレイヤーの完了を待っています…
              <br />
              参加人数: {totalPlayers} / 受信済: {gameResults.length}
            </p>
          ) : (
            <div className="mt-6">
              <h3 className="text-slate-900 font-semibold mb-3">🏆 最終結果（生存時間が長い順）</h3>
              <div className="space-y-2">
                {(() => {
                  const { sorted, ranks } = buildLeaderboard(gameResults, 'desc');
                  const myIdx = sorted.findIndex(r => r.userId === userId);
                  const myRank = myIdx >= 0 ? ranks[myIdx] : undefined;
                  return (
                    <>
                      {typeof myRank === 'number' && (
                        <div className="mb-3 text-slate-700 text-sm">
                          あなたの順位: <span className="font-bold">{myRank}位</span>
                        </div>
                      )}
                      {sorted.map((r: any, idx: number) => {
                        const isMe = r.userId === userId;
                        const rank = ranks[idx];
                        return (
                          <div
                            key={r.id ?? `${r.userId}-${idx}`}
                            className={`flex items-center justify-between rounded-lg border p-3 ${
                              isMe ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-slate-500 text-sm w-8 text-right">{rank}位</span>
                              <span className="text-slate-900 font-semibold">
                                {r?.user?.name || 'ゲスト'}
                                {isMe ? '（あなた）' : ''}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-slate-900 font-bold">
                                {fmtSec(Number(r?.scores ?? 0))}
                              </div>
                              <div className="text-slate-500 text-xs">生存時間</div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    ) : null;

  const GameScreen = (
    <div className="min-h-[100dvh] flex flex-col items-center justify-start bg-white p-4 sm:p-6">
      <div className="w-full max-w-3xl grid gap-4">
        {/* ヘッダ：ゲーム名のみ（ボタン類はナシ） */}
        <header className="flex items-center justify-center">
          <h1 className="text-slate-900 text-xl sm:text-2xl font-bold tracking-tight">
            Avoidance Game
          </h1>
        </header>

        {/* キャンバスカード */}
        <div className="rounded-2xl overflow-hidden ring-1 ring-slate-200 shadow">
          <div className="w-full aspect-[9/16] md:aspect-[16/9]">
            <canvas ref={canvasRef} className="w-full h-full" />
          </div>
        </div>

        {/* 結果パネル（roomがある場合は待機/最終結果をここに出す） */}
        {ResultPanel}
      </div>
    </div>
  );

  // idle の間は Start 専用画面、それ以降はゲーム画面
  if (state.kind === 'idle') return StartScreen;
  return GameScreen;
}

export default function DodgeGame() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DodgeGameContent />
    </Suspense>
  );
}

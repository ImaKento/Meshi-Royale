'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

import { supabase } from '../../../lib/supabase';

// Timing Stop (Start → 3s countdown → Run → Result, one-shot, light theme)

type GameState =
  | { kind: 'idle' }
  | { kind: 'countdown'; endAt: number }
  | { kind: 'running'; startedAt: number }
  // absErrorMs は誤差の絶対値(ms)のみを保持（±は表示時に算出）
  | { kind: 'result'; elapsedMs: number; targetMs: number; absErrorMs: number };

type GameResultRow = {
  id?: string;
  userId?: string;
  user?: { name?: string } | null;
  scores?: number; // ← API上のスコア。ここでは absErrorMs (小さいほど良い)
  created_at?: string; // あればタイブレークで使用
  createdAt?: string; // あればタイブレークで使用
};

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
  const sign = s > 0 ? '+' : s < 0 ? '−' : '±';
  return `${sign}${Math.abs(s).toFixed(3)}s`;
}

function formatAbsSeconds(ms: number) {
  return `${(ms / 1000).toFixed(3)}s`;
}

// ===== ランキング生成（タイ処理あり） =====
// order: 'asc' は小さいほど上位（例: 誤差ms）、'desc' は大きいほど上位（例: クリック数）
function buildLeaderboard(rows: GameResultRow[], order: 'asc' | 'desc' = 'asc') {
  const sorted = rows.slice().sort((a, b) => {
    const as = Number(a?.scores ?? (order === 'asc' ? Infinity : -Infinity));
    const bs = Number(b?.scores ?? (order === 'asc' ? Infinity : -Infinity));
    if (as !== bs) return order === 'asc' ? as - bs : bs - as;
    // タイブレーク: created_at/createdAt → id の順
    const at = a.created_at ?? a.createdAt ?? '';
    const bt = b.created_at ?? b.createdAt ?? '';
    if (at && bt && at !== bt) return String(at).localeCompare(String(bt));
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
  // 競技順位 (1,2,2,4) 方式
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

function TimingStopBlindComponent() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const router = useRouter();

  const [state, setState] = useState<GameState>({ kind: 'idle' });
  const [bestErrorMs, setBestErrorMs] = useState<number>(Infinity);

  // ===== URL / ルーム / リアルタイム関連 =====
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  const roomCode = searchParams.get('roomCode');
  const joindUserCount = searchParams.get('joindUserCount'); // 互換のためそのまま
  const totalPlayers = parseInt(joindUserCount || '0', 10);
  const gameType = 'timing-stop';

  const [roomId, setRoomId] = useState<string | null>(null);
  const [gameResults, setGameResults] = useState<GameResultRow[]>([]);
  const [allDone, setAllDone] = useState(false);
  const postedRef = useRef(false); // 結果POSTの多重防止
  const [destinatedStore, setDestinatedStore] = useState<string | null>(null);

  // ベスト誤差の復元（任意）
  useEffect(() => {
    try {
      const savedBest = localStorage.getItem('timing_best_error_ms');
      if (savedBest != null) setBestErrorMs(Number(savedBest));
    } catch {}
  }, []);

  const targetMs = TARGET_SEC * 1000;
  const visibleUntilMs = visibleUntilMsFor(targetMs);

  // ===== ルームID解決 =====
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
    return () => {
      aborted = true;
    };
  }, [roomCode]);

  // ===== 初期結果取得（ガードなしで allDone 判定）=====
  useEffect(() => {
    if (!roomId) return;
    (async () => {
      try {
        const resp = await fetch(
          `/api/gameResults?roomId=${encodeURIComponent(roomId)}&gameType=${encodeURIComponent(gameType)}`
        );
        const data = await resp.json();
        if (resp.ok && data?.gameResults) {
          const list: GameResultRow[] = data.gameResults;
          setGameResults(list);
          if (list.length >= totalPlayers && totalPlayers > 0) setAllDone(true);
        }
      } catch (e) {
        console.error('初期データ取得エラー:', e);
      }
    })();
  }, [roomId, gameType, totalPlayers]);

  // ===== Realtime購読（INSERT/UPDATEで最新取得）※サーバーフィルタなし・手動チェック =====
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`game-results-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'GameResults' }, // ← ここではフィルタを外す
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
              const list: GameResultRow[] = data.gameResults;
              setGameResults(list);
              const userResponse = await fetch(`/api/users/${list[0].userId}`);
              const userData = await userResponse.json();
              setDestinatedStore(userData.item.food_candidates);
              if (list.length >= totalPlayers && totalPlayers > 0) setAllDone(true); // ← state.kind ガードなし
            }
          } catch (e) {
            console.error('Realtime データ取得エラー:', e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, gameType, totalPlayers]);

  // ===== ゲーム遷移 =====
  function start() {
    if (state.kind !== 'idle') return;
    setState({ kind: 'countdown', endAt: performance.now() + 3000 });
  }

  function stop() {
    if (state.kind !== 'running') return;
    const now = performance.now();
    const elapsedMs = now - state.startedAt;
    const absErrorMs = Math.abs(elapsedMs - targetMs);
    setState({ kind: 'result', elapsedMs, targetMs, absErrorMs });
    if (absErrorMs < bestErrorMs) {
      setBestErrorMs(absErrorMs);
      try {
        localStorage.setItem('timing_best_error_ms', String(absErrorMs));
      } catch {}
    }
  }

  // カウントダウン終了で自動的に running へ
  useEffect(() => {
    if (state.kind !== 'countdown') return;
    const delay = Math.max(0, state.endAt - performance.now());
    const t = setTimeout(() => setState({ kind: 'running', startedAt: performance.now() }), delay);
    return () => clearTimeout(t);
  }, [state]);

  // ===== 結果保存（INSERT/UPSERT → Realtimeで全員同期） =====
  useEffect(() => {
    if (state.kind !== 'result') return;
    if (!userId || !roomId) return; // 単体プレイ時は保存しない
    if (postedRef.current) return;

    postedRef.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/gameResults`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            roomId,
            gameType,
            // スコアは absErrorMs（小さいほど良い）
            scores: Math.round(state.absErrorMs),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);

        // 直後に最新取得（保険）
        const resp = await fetch(
          `/api/gameResults?roomId=${encodeURIComponent(roomId)}&gameType=${encodeURIComponent(gameType)}`
        );
        const listJson = await resp.json();
        if (resp.ok && listJson?.gameResults) {
          const list: GameResultRow[] = listJson.gameResults;
          setGameResults(list);
          if (list.length >= totalPlayers && totalPlayers > 0) setAllDone(true); // ← ガードなし
        }
      } catch (e) {
        console.error('ゲーム結果の保存に失敗:', e);
        postedRef.current = false; // 失敗時は再試行可
      }
    })();
  }, [state, userId, roomId, gameType, totalPlayers]);

  // ===== キーボード（resultでの再開なし） =====
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (state.kind === 'idle') start();
        else if (state.kind === 'running') stop();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  // ====== Canvas render loop ======
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function fitCanvas(): { W: number; H: number } | undefined {
      if (!canvas) return;
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = BASE_HEIGHT;
      const needResize =
        canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr);
      if (needResize) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return { W: cssW, H: cssH };
    }

    function drawBg(W: number, H: number) {
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, W, INFOBAR_HEIGHT);
      ctx.fillStyle = '#111827';
      ctx.font = '600 16px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      const centerText = `目標時間: ${TARGET_SEC}s　|　${(visibleUntilMs / 1000).toFixed(
        0
      )}秒から隠れるよ`;
      ctx.fillText(centerText, W / 2, 24);
      ctx.textAlign = 'start';
    }

    function drawIdle(W: number, H: number) {
      if (!ctx) return;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#111827';
      ctx.font = '600 18px ui-sans-serif, system-ui';
      ctx.fillText('Start を押すと 3 秒カウントダウン', Math.round(W / 2), Math.round(H / 2 + 10));
    }

    function drawCountdown(W: number, H: number) {
      if (!ctx) return;

      const now = performance.now();
      const leftMs = state.kind === 'countdown' ? Math.max(0, state.endAt - now) : 0;
      const leftSec = Math.ceil(leftMs / 1000); // 3,2,1

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 太字72px 等幅
      ctx.fillStyle = '#111827';
      ctx.font = '800 72px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

      const cx = Math.round(W / 2);
      const cy = Math.round(H / 2 + 24);
      ctx.fillText(String(leftSec), cx, cy);

      ctx.font = '600 16px ui-sans-serif, system-ui';
      ctx.fillText('まもなく開始…', cx, Math.round(H - 28));
    }

    function drawTimer(W: number, H: number, elapsedMs: number) {
      if (!ctx) return;
      const show = elapsedMs <= visibleUntilMs;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#111827';
      if (show) {
        ctx.font = '700 64px ui-sans-serif, system-ui';
        ctx.fillText((elapsedMs / 1000).toFixed(3) + 's', W / 2, H / 2 + 18);
      } else {
        ctx.font = '700 54px ui-sans-serif, system-ui';
        ctx.globalAlpha = 0.5;
        ctx.fillText('— — —', W / 2, H / 2 + 14);
        ctx.globalAlpha = 1;
        ctx.font = '500 16px ui-sans-serif, system-ui';
        ctx.fillText('研ぎ澄ませ', W / 2, H - 28);
      }
      ctx.textAlign = 'start';
    }

    function drawResult(W: number, H: number, elapsedMs: number, absErrorMs: number) {
      const actual = (elapsedMs / 1000).toFixed(3) + 's';
      const signedDisplay = (elapsedMs - targetMs >= 0 ? +1 : -1) * absErrorMs;
      const diffStr = formatSignedSeconds(signedDisplay);
      const hint = signedDisplay > 0 ? '遅い' : signedDisplay < 0 ? '早い' : 'ピタ';

      if (!ctx) return;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#111827';
      ctx.font = '800 56px ui-sans-serif, system-ui';
      ctx.fillText(actual, W / 2, H / 2 - 8);
      ctx.font = '600 18px ui-sans-serif, system-ui';
      ctx.fillText(`目標時間: ${TARGET_SEC}s  |  ${hint}`, W / 2, H / 2 + 24);
      ctx.font = '700 22px ui-sans-serif, system-ui';
      ctx.fillText(`誤差: ${diffStr}`, W / 2, H / 2 + 50);
      ctx.textAlign = 'start';
    }

    function loop() {
      const size = fitCanvas();
      if (!size) return;
      const { W, H } = size;

      drawBg(W, H);

      if (state.kind === 'idle') {
        drawIdle(W, H);
      } else if (state.kind === 'countdown') {
        drawCountdown(W, H);
      } else if (state.kind === 'running') {
        const elapsedMs = performance.now() - state.startedAt;
        drawTimer(W, H, elapsedMs);
      } else if (state.kind === 'result') {
        drawResult(W, H, state.elapsedMs, state.absErrorMs);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state, visibleUntilMs, targetMs]);

  // ===== UI =====
  return (
    // 画面全体。上ヘッダー/下アクションの固定分だけ余白を確保
    <div className='min-h-[100dvh] overflow-x-hidden bg-white [padding-top:calc(4rem+env(safe-area-inset-top))] [padding-bottom:calc(6rem+env(safe-area-inset-bottom))] text-black sm:pb-28'>
      {/* 固定ヘッダー */}
      <header className='fixed top-0 right-0 left-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur'>
        <div className='mx-auto flex h-16 max-w-3xl items-center justify-center px-4 sm:px-6'>
          <h1 className='truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl'>
            ビタ押しチャレンジ
          </h1>
        </div>
      </header>

      {/* コンテンツ */}
      <main className='mx-auto max-w-3xl px-4 py-4 sm:px-6'>
        <div className='overflow-hidden rounded-2xl shadow ring-1 ring-slate-200'>
          <canvas ref={canvasRef} style={{ width: '100%', height: BASE_HEIGHT }} />
        </div>

        {/* 結果/ランキング（ルーム連携時） */}
        {state.kind === 'result' && (
          <div className='mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow'>
            <h2 className='mb-4 text-2xl font-bold text-slate-900'>結果</h2>
            <div className='grid gap-2'>
              <div className='flex items-baseline gap-3'>
                <span className='text-sm text-slate-500'>あなたの計測</span>
                <span className='text-xl font-extrabold text-slate-900'>
                  {(state.elapsedMs / 1000).toFixed(3)}s
                </span>
              </div>
              <div className='flex items-baseline gap-3'>
                <span className='text-sm text-slate-500'>誤差</span>
                <span className='text-xl font-extrabold text-slate-900'>
                  {formatAbsSeconds(state.absErrorMs)}
                </span>
              </div>
            </div>

            {/* ルーム未連携の注意 */}
            {!roomId || !totalPlayers ? (
              <p className='mt-4 text-sm text-slate-600'>
                ルーム連携なしの単体プレイです。URL に <code>userId</code>, <code>roomCode</code>,{' '}
                <code>joindUserCount</code> を付けると対戦待ち＆最終結果が有効になります。
              </p>
            ) : !allDone ? (
              <p className='mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700'>
                他のプレイヤーの完了を待っています…
                <br />
                参加人数: {totalPlayers} / 受信済: {gameResults.length}
              </p>
            ) : (
              <div className='mt-6'>
                <div className='my-4 rounded-lg border border-gray-300 p-8'>
                  <h2 className='flex justify-center text-4xl font-bold text-black'>
                    {destinatedStore} に決定！！
                  </h2>
                </div>
                <h3 className='mb-3 font-semibold text-slate-900'>🏁 最終結果（誤差が小さい順）</h3>
                <div className='space-y-2'>
                  {(() => {
                    const { sorted, ranks } = buildLeaderboard(gameResults, 'asc');
                    const myIdx = sorted.findIndex(r => r.userId === userId);
                    const myRank = myIdx >= 0 ? ranks[myIdx] : undefined;
                    return (
                      <>
                        {typeof myRank === 'number' && (
                          <div className='mb-3 text-sm text-slate-700'>
                            あなたの順位: <span className='font-bold'>{myRank}位</span>
                          </div>
                        )}
                        {sorted.map((r: GameResultRow, idx: number) => {
                          const isMe = r.userId === userId;
                          const rank = ranks[idx];
                          return (
                            <div
                              key={r.id ?? `${r.userId}-${idx}`}
                              className={`flex items-center justify-between rounded-lg border p-3 ${
                                isMe
                                  ? 'border-emerald-300 bg-emerald-50'
                                  : 'border-slate-200 bg-slate-50'
                              }`}
                            >
                              <div className='flex items-center gap-3'>
                                <span className='w-8 text-right text-sm text-slate-500'>
                                  {rank}位
                                </span>
                                <span className='font-semibold text-slate-900'>
                                  {r?.user?.name || 'ゲスト'}
                                  {isMe ? '（あなた）' : ''}
                                </span>
                              </div>
                              <div className='text-right'>
                                <div className='font-bold text-slate-900'>
                                  {formatAbsSeconds(Number(r?.scores ?? 0))}
                                </div>
                                <div className='text-xs text-slate-500'>誤差</div>
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
        )}
      </main>

      {/* 画面中央下に固定：丸ボタン単体（背後の長方形カードは削除） */}
      {state.kind !== 'result' && (
        <div className='fixed bottom-0 left-1/2 z-20 w-full max-w-sm -translate-x-1/2 px-4 pb-[env(safe-area-inset-bottom)] sm:px-0'>
          <div className='mb-4 flex items-center justify-center sm:mb-6'>
            {state.kind === 'idle' && (
              <button
                aria-label='Start'
                onClick={start}
                className='grid h-24 w-24 place-items-center rounded-full bg-emerald-600 text-lg font-bold text-white shadow-xl transition select-none hover:bg-emerald-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/50 active:scale-[0.98] sm:h-28 sm:w-28 sm:text-xl'
              >
                Start
              </button>
            )}
            {state.kind === 'countdown' && (
              <span
                aria-live='polite'
                className='grid h-24 w-24 place-items-center rounded-full bg-amber-500 text-base font-bold text-white shadow-xl select-none sm:h-28 sm:w-28 sm:text-lg'
              >
                Ready…
              </span>
            )}
            {state.kind === 'running' && (
              <button
                aria-label='Stop'
                onClick={stop}
                className='grid h-24 w-24 place-items-center rounded-full bg-blue-600 text-lg font-bold text-white shadow-xl transition select-none hover:bg-blue-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/50 active:scale-[0.98] sm:h-28 sm:w-28 sm:text-xl'
              >
                Stop
              </button>
            )}
          </div>
        </div>
      )}
      {state.kind === 'result' && (
        <div className='fixed bottom-0 left-1/2 z-20 w-full max-w-sm -translate-x-1/2 px-4 pb-[env(safe-area-inset-bottom)] sm:px-0'>
          <div className='mb-4 flex items-center justify-center gap-3 sm:mb-6'>
            <button
              type='button'
              onClick={() => router.push('/')}
              className='inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/50'
            >
              ホームへ戻る
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default function TimingStopBlind() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TimingStopBlindComponent />
    </Suspense>
  );
}

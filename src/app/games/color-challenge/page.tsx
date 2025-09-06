'use client';

import { useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect, useRef, useState } from 'react';
import Header from '@/components/ui/header';

import { supabase } from '../../../lib/supabase';

type GameState = 'ready' | 'countdown' | 'playing' | 'finished';

type GameResultRow = {
  id?: string;
  userId?: string;
  user?: { name?: string } | null;
  scores?: number; // ここでは最終スコア（大きいほど上位）
  created_at?: string; // あればタイブレーク用
  createdAt?: string; // あればタイブレーク用
};

// ===== ランキング生成（競技順位: 1,2,2,4） =====
function buildLeaderboard<
  T extends { id?: string; scores?: number; created_at?: string; createdAt?: string },
>(rows: T[], order: 'asc' | 'desc' = 'desc') {
  const sorted = rows.slice().sort((a, b) => {
    const as = Number(a?.scores ?? (order === 'asc' ? Infinity : -Infinity));
    const bs = Number(b?.scores ?? (order === 'asc' ? Infinity : -Infinity));
    if (as !== bs) return order === 'asc' ? as - bs : bs - as;
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

function ColorRushGameComponent() {
  // ===== 対戦用パラメータ =====
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  const roomCode = searchParams.get('roomCode');
  const joindUserCount = searchParams.get('joindUserCount'); // 互換のためtypo名のまま
  const totalPlayers = parseInt(joindUserCount || '0', 10);
  const gameType = 'color-rush';

  const [roomId, setRoomId] = useState<string | null>(null);
  const [gameResults, setGameResults] = useState<GameResultRow[]>([]);
  const [allDone, setAllDone] = useState(false);
  const postedRef = useRef(false); // 結果POSTの多重防止

  // ===== ゲーム状態 =====
  const [gameState, setGameState] = useState<GameState>('ready');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(20);
  const [score, setScore] = useState(0);
  const [currentProblem, setCurrentProblem] = useState({
    text: '',
    color: '',
    correctAnswer: '',
    type: '',
  });
  const [totalProblems, setTotalProblems] = useState(0);
  const [destinatedStore, setDestinatedStore] = useState<string | null>(null);

  // 4色に絞る
  const colors = [
    { name: '赤', value: 'red', class: 'text-red-500', bg: 'bg-red-500' },
    { name: '緑', value: 'green', class: 'text-green-500', bg: 'bg-green-500' },
    { name: '青', value: 'blue', class: 'text-blue-500', bg: 'bg-blue-500' },
    { name: '黄', value: 'yellow', class: 'text-yellow-500', bg: 'bg-yellow-500' },
  ];

  // 新しい問題を生成
  const generateProblem = () => {
    const textColor = colors[Math.floor(Math.random() * colors.length)];
    const displayColor = colors[Math.floor(Math.random() * colors.length)];
    const problemType = Math.random() < 0.5 ? 'color' : 'text'; // ランダムで色か読みを選択
    setCurrentProblem({
      text: textColor.name,
      color: displayColor.class,
      correctAnswer: problemType === 'color' ? displayColor.name : textColor.name,
      type: problemType === 'color' ? 'いろ' : 'よみ',
    });
  };

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
          const list: GameResultRow[] = data.gameResults;
          setGameResults(list);
          if (totalPlayers > 0 && list.length >= totalPlayers) setAllDone(true);
        }
      } catch (e) {
        console.error('初期データ取得エラー:', e);
      }
    })();
  }, [roomId, gameType, totalPlayers]);

  // ===== Realtime購読（INSERT/UPDATE）: サーバーフィルタ無し＋手動チェック =====
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`game-results-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'GameResults' },
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
              const userResponse = await fetch(`/api/users/${list[0].userId}`);
              const userData = await userResponse.json();
              setDestinatedStore(userData.item.food_candidates);
              setGameResults(list);
              if (totalPlayers > 0 && list.length >= totalPlayers) setAllDone(true); // stateガード無し
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

  // カウントダウン処理
  useEffect(() => {
    if (gameState === 'countdown' && countdown > 0) {
      const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else if (gameState === 'countdown' && countdown === 0) {
      setGameState('playing');
      setTimeLeft(20);
      setScore(0);
      setTotalProblems(0);
      postedRef.current = false; // 新規ラウンドのためリセット
      setAllDone(false); // 新規ラウンドのためリセット
      generateProblem();
    }
  }, [gameState, countdown]);

  // ゲーム時間処理
  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else if (gameState === 'playing' && timeLeft === 0) {
      setGameState('finished');
    }
  }, [gameState, timeLeft]);

  // ゲーム開始
  const startGame = () => {
    setGameState('countdown');
    setCountdown(3);
  };

  // 答えを選択
  const selectAnswer = (selectedColor: string) => {
    if (gameState !== 'playing') return;
    setTotalProblems(prev => prev + 1);
    if (selectedColor === currentProblem.correctAnswer) setScore(prev => prev + 1);
    generateProblem();
  };

  // ===== 結果保存（INSERT/UPSERT → Realtimeで全員同期） =====
  useEffect(() => {
    if (gameState !== 'finished') return;
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
            // スコアは正答数（大きいほど上位）
            scores: score,
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
          const list: GameResultRow[] = listJson.gameResults;
          setGameResults(list);
          if (totalPlayers > 0 && list.length >= totalPlayers) setAllDone(true);
        }
      } catch (e) {
        console.error('ゲーム結果の保存に失敗:', e);
        postedRef.current = false; // 失敗時は再試行可
      }
    })();
  }, [gameState, userId, roomId, gameType, score, totalPlayers]);

  return (
    <div className='min-h-screen bg-white'>
      <Header />
      
      <main className='flex flex-col' style={{ height: 'calc(100vh - 80px)' }}>
        {/* ゲーム開始画面 */}
        {gameState === 'ready' && (
          <div className='flex h-full flex-col items-center justify-center p-4'>
            <h1 className='mb-8 text-4xl font-bold text-black md:text-6xl'>カラーラッシュ</h1>

            <div className='mb-8 max-w-md rounded-2xl bg-gray-100 p-8'>
              <div className='mb-6 text-center'>
                <div className='mb-2 text-4xl font-bold text-blue-500'>緑</div>
                <div className='mb-3 rounded px-3 py-1 text-lg font-bold text-black'>いろ</div>
                <p className='text-lg text-gray-700'>指示に従って選んでください</p>
                <p className='mt-2 text-sm text-gray-500'>この場合の答え：青</p>
                <div className='mt-4 text-sm text-gray-600'>
                  <p>「いろ」→ 文字の色を選択</p>
                  <p>「よみ」→ 文字の内容を選択</p>
                </div>
              </div>
            </div>

            <button
              onClick={startGame}
              className='rounded-xl bg-black px-12 py-4 text-2xl font-bold text-white transition-all duration-300 hover:bg-gray-800'
            >
              ゲーム開始
            </button>
          </div>
        )}

        {/* カウントダウン画面 */}
        {gameState === 'countdown' && (
          <div className='flex h-full items-center justify-center'>
            <div className='text-9xl font-bold text-black'>{countdown || 'START!'}</div>
          </div>
        )}

        {/* ゲーム画面 */}
        {gameState === 'playing' && (
          <div className='flex h-full flex-col'>
            {/* 上部：時間バーとスコア */}
            <div className='flex items-center justify-between p-4'>
              <div className='mr-4 h-6 flex-1 rounded-full bg-gray-200'>
                <div
                  className='h-6 rounded-full bg-blue-500 transition-all duration-1000'
                  style={{ width: `${(timeLeft / 20) * 100}%` }}
                ></div>
              </div>
              <div className='flex h-12 w-12 items-center justify-center rounded-full border-2 border-black bg-white'>
                <span className='text-lg font-bold'>{timeLeft}</span>
              </div>
            </div>

            {/* メイン：4コーナーレイアウト */}
            <div className='relative flex-1'>
              {/* 中央の問題表示 */}
              <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center'>
                <div className='flex h-60 w-60 flex-col items-center justify-center rounded-2xl border-4 border-black bg-white text-center shadow-lg'>
                  <div className={`text-5xl font-bold md:text-6xl ${currentProblem.color} mb-3`}>
                    {currentProblem.text}
                  </div>
                  <div className='rounded-lg px-3 py-1 text-xl font-bold text-black md:text-2xl'>
                    {currentProblem.type}
                  </div>
                </div>
              </div>

              {/* 4つのコーナーボタン */}
              <button
                onClick={() => selectAnswer('赤')}
                className='absolute top-0 left-0 flex h-1/2 w-1/2 items-center justify-center bg-red-500 transition-all duration-150 hover:bg-red-600 active:bg-red-700'
              >
                <span className='text-2xl font-bold text-white opacity-20 md:text-4xl'>赤</span>
              </button>

              <button
                onClick={() => selectAnswer('緑')}
                className='absolute top-0 right-0 flex h-1/2 w-1/2 items-center justify-center bg-green-500 transition-all duration-150 hover:bg-green-600 active:bg-green-700'
              >
                <span className='text-2xl font-bold text-white opacity-20 md:text-4xl'>緑</span>
              </button>

              <button
                onClick={() => selectAnswer('黄')}
                className='absolute bottom-0 left-0 flex h-1/2 w-1/2 items-center justify-center bg-yellow-500 transition-all duration-150 hover:bg-yellow-600 active:bg-yellow-700'
              >
                <span className='text-2xl font-bold text-white opacity-20 md:text-4xl'>黄</span>
              </button>

              <button
                onClick={() => selectAnswer('青')}
                className='absolute right-0 bottom-0 flex h-1/2 w-1/2 items-center justify-center bg-blue-500 transition-all duration-150 hover:bg-blue-600 active:bg-blue-700'
              >
                <span className='text-2xl font-bold text-white opacity-20 md:text-4xl'>青</span>
              </button>
            </div>
          </div>
        )}

        {/* 結果画面（Realtime対応＋ランキング） */}
        {gameState === 'finished' && (
          <div className='flex h-full flex-col items-center justify-center p-4'>
            <h2 className='mb-8 text-4xl font-bold text-black md:text-5xl'>結果発表</h2>

            <div className='mb-8 rounded-2xl bg-gray-100 p-8 text-center'>
              <div className='mb-4 text-6xl font-bold text-black md:text-7xl'>{score}</div>
              <div className='mb-2 text-xl font-bold text-black md:text-2xl'>
                {totalProblems} 問中 {score} 問正解
              </div>
            </div>

            {/* 単体プレイ or 待機 or 最終結果 */}
            {!roomId || !totalPlayers ? (
              <p className='text-sm text-slate-600'>
                ルーム連携なしの単体プレイです。URLに <code>userId</code>, <code>roomCode</code>,{' '}
                <code>joindUserCount</code> を付けると対戦待ち＆最終結果が有効になります。
              </p>
            ) : !allDone ? (
              <p className='rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700'>
                他のプレイヤーの完了を待っています…
                <br />
                参加人数: {totalPlayers} / 受信済: {gameResults.length}
              </p>
            ) : (
              <div className='mt-6 w-full max-w-xl'>
                <div className='my-4 rounded-lg border border-gray-300 p-8'>
                  <h2 className='flex justify-center text-4xl font-bold text-black'>
                    {destinatedStore} に決定！！
                  </h2>
                </div>
                <h3 className='mb-3 font-semibold text-slate-900'>🏆 最終結果（スコア高い順）</h3>
                <div className='space-y-2'>
                  {(() => {
                    const { sorted, ranks } = buildLeaderboard(gameResults, 'desc');
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
                                <div className='font-bold text-slate-900'>{r?.scores ?? 0}</div>
                                <div className='text-xs text-slate-500'>スコア</div>
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
    </div>
  );
}

export default function ColorRushGame() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ColorRushGameComponent />
    </Suspense>
  );
}
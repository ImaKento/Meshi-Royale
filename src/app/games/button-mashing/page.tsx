'use client';

import { useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect, useRef, useState } from 'react';
import Header from '@/components/ui/header';

import { supabase } from '../../../lib/supabase';

function ClickGameContent() {
  const searchParams = useSearchParams();

  // URLパラメータから値を取得
  const userId = searchParams.get('userId');
  const roomCode = searchParams.get('roomCode');
  const joindUserCount = searchParams.get('joindUserCount');
  const gameType = 'button-mashing'; // 固定値またはパラメータから取得

  const [gameState, setGameState] = useState<
    'ready' | 'countdown' | 'playing' | 'finished' | 'results'
  >('ready');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(10);
  const [clickCount, setClickCount] = useState(0);
  const [gameResults, setGameResults] = useState<any[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const clickButtonRef = useRef<HTMLButtonElement>(null);

  // カウントダウン処理
  useEffect(() => {
    if (gameState === 'countdown' && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (gameState === 'countdown' && countdown === 0) {
      setGameState('playing');
      setTimeLeft(10);
      setClickCount(0);
    }
  }, [gameState, countdown]);

  // ゲーム時間処理
  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (gameState === 'playing' && timeLeft === 0) {
      setGameState('finished');
    }
  }, [gameState, timeLeft]);

  // ルームIDを取得
  useEffect(() => {
    if (roomCode) {
      const fetchRoomId = async () => {
        try {
          const roomResponse = await fetch(`/api/rooms?roomCode=${roomCode}`);
          const roomData = await roomResponse.json();

          if (roomResponse.ok && roomData?.room?.id) {
            setRoomId(roomData.room.id);
          }
        } catch (error) {
          console.error('ルームID取得エラー:', error);
        }
      };

      fetchRoomId();
    }
  }, [roomCode]);

  // Supabaseリアルタイム監視
  useEffect(() => {
    if (!roomId || !gameType) return;

    const channel = supabase
      .channel(`game-results-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'GameResults',
          // filter: `roomId=eq.${roomId}`, // 一時的にフィルター無効
        },
        async payload => {
          // カラム名を確認（roomId vs room_id）
          const payloadRoomId = payload.new?.roomId || payload.new?.room_id;

          // 手動でroomIdをチェック
          if (payloadRoomId !== roomId) {
            console.log('❌ 異なるroomId - スキップ:', payloadRoomId);
            return;
          }

          try {
            const response = await fetch(`/api/gameResults?roomId=${roomId}&gameType=${gameType}`);
            const data = await response.json();

            if (response.ok && data?.gameResults) {
              setGameResults(data.gameResults);

              const completedCount = data.gameResults.length;
              const totalPlayers = parseInt(joindUserCount || '0');

              if (completedCount >= totalPlayers) {
                setGameState('results');
              }
            }
          } catch (error) {
            console.error('❌ データ取得エラー:', error);
          }
        }
      )
      .subscribe(status => {
        console.log('📡 接続状態:', status);
      });

    return () => {
      console.log('🔌 監視停止');
      supabase.removeChannel(channel);
    };
  }, [roomId, gameType, joindUserCount]);

  // 初期データ取得も追加
  useEffect(() => {
    if (!roomId || !gameType) return;

    const fetchInitialData = async () => {
      try {
        const response = await fetch(`/api/gameResults?roomId=${roomId}&gameType=${gameType}`);
        const data = await response.json();

        if (response.ok && data?.gameResults) {
          setGameResults(data.gameResults);

          const completedCount = data.gameResults.length;
          const totalPlayers = parseInt(joindUserCount || '0');

          if (completedCount >= totalPlayers && gameState === 'finished') {
            setGameState('results');
          }
        }
      } catch (error) {
        console.error('初期データ取得エラー:', error);
      }
    };

    fetchInitialData();
  }, [roomId, gameType, gameState, joindUserCount]);

  // ゲーム結果を保存
  useEffect(() => {
    if (gameState === 'finished' && userId && roomId) {
      const saveGameResult = async () => {
        try {
          // ゲーム結果を保存
          const resultResponse = await fetch(`/api/gameResults`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: userId,
              roomId: roomId,
              gameType: gameType,
              scores: clickCount,
            }),
          });

          const resultData = await resultResponse.json();
          if (!resultResponse.ok || !resultData?.ok) {
            throw new Error(resultData?.error || `HTTP ${resultResponse.status}`);
          }

          console.log('ゲーム結果を保存しました:', resultData);
        } catch (error) {
          console.error('ゲーム結果の保存に失敗しました:', error);
        }
      };

      saveGameResult();
    }
  }, [gameState, userId, roomId, gameType, clickCount]);

  // ゲーム開始
  const startGame = () => {
    setGameState('countdown');
    setCountdown(3);
  };

  // クリック処理
  const handleClick = () => {
    if (gameState === 'playing') {
      setClickCount(prev => prev + 1);

      if (clickButtonRef.current) {
        clickButtonRef.current.style.transform = 'scale(0.95)';
        setTimeout(() => {
          if (clickButtonRef.current) {
            clickButtonRef.current.style.transform = 'scale(1)';
          }
        }, 100);
      }
    }
  };

  return (
    <div className='min-h-screen bg-white'>
      <Header />
      
      <main className='p-4 text-black'>
        <div className='mx-auto max-w-2xl'>
          {/* ヘッダー */}
          <div className='mb-8 text-center'>
            <h1 className='mb-4 text-5xl font-bold text-black'>クリック連打ゲーム</h1>
          </div>

          {/* ゲーム開始画面 */}
          {gameState === 'ready' && (
            <div className='space-y-6 text-center'>
              {/* ゲーム情報表示エリア */}
              <div className='h-24'></div>

              {/* 中央の丸ボタン */}
              <div className='flex justify-center'>
                <button
                  onClick={startGame}
                  className='h-80 w-80 rounded-full bg-black text-3xl font-bold text-white transition-all duration-300 hover:bg-gray-800'
                >
                  ゲーム開始
                </button>
              </div>
            </div>
          )}

          {/* カウントダウン画面 */}
          {gameState === 'countdown' && (
            <div className='space-y-6 text-center'>
              {/* ゲーム情報表示エリア */}
              <div className='h-24'></div>

              {/* 中央の丸ボタン（カウントダウン表示） */}
              <div className='flex justify-center'>
                <div className='flex h-80 w-80 items-center justify-center rounded-full border-4 border-black bg-gray-200'>
                  <div className='text-9xl font-bold text-black'>{countdown || 'START!'}</div>
                </div>
              </div>
            </div>
          )}

          {/* ゲーム画面 */}
          {gameState === 'playing' && (
            <div className='space-y-6 text-center'>
              {/* ゲーム情報 */}
              <div className='rounded-lg border border-gray-300 p-6'>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='text-center'>
                    <div className='text-4xl font-bold text-black'>{timeLeft}</div>
                    <div className='text-sm text-black'>残り時間</div>
                  </div>
                  <div className='text-center'>
                    <div className='text-5xl font-bold text-black'>{clickCount}</div>
                    <div className='text-sm text-black'>クリック数</div>
                  </div>
                </div>
              </div>

              {/* 中央の丸ボタン（クリック用） */}
              <div className='flex justify-center'>
                <button
                  ref={clickButtonRef}
                  onClick={handleClick}
                  className='h-80 w-80 rounded-full bg-black text-3xl font-bold text-white transition-all duration-100 hover:bg-gray-800 active:scale-95'
                  style={{ userSelect: 'none' }}
                >
                  クリック！
                </button>
              </div>
            </div>
          )}

          {/* 個人結果画面 */}
          {gameState === 'finished' && (
            <div className='text-center'>
              <div className='rounded-lg border border-gray-300 p-8'>
                <h2 className='mb-6 text-4xl font-bold text-black'>結果</h2>

                <div className='mb-6 rounded-lg border border-gray-200 p-6'>
                  <div className='mb-2 text-7xl font-bold text-black'>{clickCount}</div>
                  <div className='text-2xl font-bold text-black'>クリック</div>
                </div>

                <div className='text-center'>
                  <p className='text-lg font-semibold text-black'>
                    他のプレイヤーの完了を待っています...
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 全体結果画面 */}
          {gameState === 'results' && (
            <div className='text-center'>
              <div className='rounded-lg border border-gray-300 p-8'>
                <h2 className='mb-6 text-4xl font-bold text-black'>🏆 最終結果</h2>

                <div className='space-y-4'>
                  {gameResults.map((result, index) => (
                    <div
                      key={result.id}
                      className={`rounded-lg border p-4 ${
                        result.userId === userId
                          ? 'border-yellow-300 bg-yellow-100'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className='flex items-center justify-between'>
                        <div className='text-left'>
                          <div className='text-xl font-bold text-black'>
                            {index + 1}位: {result.user.name || 'ゲスト'}
                          </div>
                          <div className='text-sm text-gray-600'>
                            {result.userId === userId ? '(あなた)' : ''}
                          </div>
                        </div>
                        <div className='text-right'>
                          <div className='text-2xl font-bold text-black'>{result.scores}</div>
                          <div className='text-sm text-gray-600'>クリック</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className='mt-6'>
                  <button
                    onClick={() => (window.location.href = '/')}
                    className='rounded-lg bg-blue-500 px-6 py-3 text-white transition-colors hover:bg-blue-600'
                  >
                    ホームに戻る
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ClickGame() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ClickGameContent />
    </Suspense>
  );
}
'use client';

import React, { useState, useEffect, useRef } from 'react';

export default function ClickGame() {
  const [gameState, setGameState] = useState<'ready' | 'countdown' | 'playing' | 'finished'>('ready');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(10);
  const [clickCount, setClickCount] = useState(0);
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
    <div className="min-h-screen bg-white text-black p-4">
      <div className="max-w-2xl mx-auto">
        
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-4 text-black">
            クリック連打ゲーム
          </h1>
        </div>

        {/* ゲーム開始画面 */}
        {gameState === 'ready' && (
          <div className="text-center space-y-6">
            
            {/* ゲーム情報表示エリア */}
            <div className="h-24"></div>
            
            {/* 中央の丸ボタン */}
            <div className="flex justify-center">
              <button
                onClick={startGame}
                className="w-80 h-80 bg-black text-white rounded-full font-bold text-3xl hover:bg-gray-800 transition-all duration-300"
              >
                ゲーム開始
              </button>
            </div>
          </div>
        )}

        {/* カウントダウン画面 */}
        {gameState === 'countdown' && (
          <div className="text-center space-y-6">
            
            {/* ゲーム情報表示エリア */}
            <div className="h-24"></div>
            
            {/* 中央の丸ボタン（カウントダウン表示） */}
            <div className="flex justify-center">
              <div className="w-80 h-80 bg-gray-200 border-4 border-black rounded-full flex items-center justify-center">
                <div className="text-9xl font-bold text-black">
                  {countdown || "START!"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ゲーム画面 */}
        {gameState === 'playing' && (
          <div className="text-center space-y-6">
            
            {/* ゲーム情報 */}
            <div className="border border-gray-300 rounded-lg p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-4xl font-bold text-black">{timeLeft}</div>
                  <div className="text-sm text-black">残り時間</div>
                </div>
                <div className="text-center">
                  <div className="text-5xl font-bold text-black">{clickCount}</div>
                  <div className="text-sm text-black">クリック数</div>
                </div>
              </div>
            </div>
            
            {/* 中央の丸ボタン（クリック用） */}
            <div className="flex justify-center">
              <button
                ref={clickButtonRef}
                onClick={handleClick}
                className="w-80 h-80 bg-black text-white rounded-full font-bold text-3xl hover:bg-gray-800 active:scale-95 transition-all duration-100"
                style={{ userSelect: 'none' }}
              >
                クリック！
              </button>
            </div>
          </div>
        )}

        {/* 結果画面 */}
        {gameState === 'finished' && (
          <div className="text-center">
            <div className="border border-gray-300 rounded-lg p-8">
              <h2 className="text-4xl font-bold mb-6 text-black">結果</h2>
              
              <div className="border border-gray-200 rounded-lg p-6 mb-6">
                <div className="text-7xl font-bold text-black mb-2">
                  {clickCount}
                </div>
                <div className="text-2xl text-black font-bold">クリック</div>
              </div>

              <div className="text-center">
                <p className="text-lg text-black font-semibold">お疲れ様でした</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
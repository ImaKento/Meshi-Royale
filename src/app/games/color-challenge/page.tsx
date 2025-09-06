'use client';

import React, { useState, useEffect } from 'react';

export default function ColorRushGame() {
  const [gameState, setGameState] = useState<'ready' | 'countdown' | 'playing' | 'finished'>('ready');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(20);
  const [score, setScore] = useState(0);
  const [currentProblem, setCurrentProblem] = useState({ text: '', color: '', correctAnswer: '', type: '' });
  const [totalProblems, setTotalProblems] = useState(0);

  // 4色に絞る
  const colors = [
    { name: '赤', value: 'red', class: 'text-red-500', bg: 'bg-red-500' },
    { name: '緑', value: 'green', class: 'text-green-500', bg: 'bg-green-500' },
    { name: '青', value: 'blue', class: 'text-blue-500', bg: 'bg-blue-500' },
    { name: '黄', value: 'yellow', class: 'text-yellow-500', bg: 'bg-yellow-500' }
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
      type: problemType === 'color' ? 'いろ' : 'よみ'
    });
  };

  // カウントダウン処理
  useEffect(() => {
    if (gameState === 'countdown' && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (gameState === 'countdown' && countdown === 0) {
      setGameState('playing');
      setTimeLeft(20);
      setScore(0);
      setTotalProblems(0);
      generateProblem();
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

  // 答えを選択
  const selectAnswer = (selectedColor: string) => {
    if (gameState !== 'playing') return;
    
    setTotalProblems(prev => prev + 1);
    
    if (selectedColor === currentProblem.correctAnswer) {
      setScore(prev => prev + 1);
    }
    
    // 新しい問題を生成
    generateProblem();
  };

  return (
    <div className="h-screen bg-white flex flex-col">
      
      {/* ゲーム開始画面 */}
      {gameState === 'ready' && (
        <div className="h-full flex flex-col items-center justify-center p-4">
          <h1 className="text-4xl md:text-6xl font-bold mb-8 text-black">
            カラーラッシュ
          </h1>
          
          <div className="bg-gray-100 rounded-2xl p-8 mb-8 max-w-md">
            <div className="text-center mb-6">
              <div className="text-4xl font-bold text-blue-500 mb-2">緑</div>
              <div className="text-lg font-bold text-black px-3 py-1 rounded mb-3">いろ</div>
              <p className="text-lg text-gray-700">指示に従って選んでください</p>
              <p className="text-sm text-gray-500 mt-2">この場合の答え：青</p>
              <div className="mt-4 text-sm text-gray-600">
                <p>「いろ」→ 文字の色を選択</p>
                <p>「よみ」→ 文字の内容を選択</p>
              </div>
            </div>
          </div>
          
          <button
            onClick={startGame}
            className="bg-black text-white font-bold py-4 px-12 rounded-xl text-2xl hover:bg-gray-800 transition-all duration-300"
          >
            ゲーム開始
          </button>
        </div>
      )}

      {/* カウントダウン画面 */}
      {gameState === 'countdown' && (
        <div className="h-full flex items-center justify-center">
          <div className="text-9xl font-bold text-black">
            {countdown || "START!"}
          </div>
        </div>
      )}

      {/* ゲーム画面 */}
      {gameState === 'playing' && (
        <div className="h-full flex flex-col">
          
          {/* 上部：時間バーとスコア */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex-1 bg-gray-200 rounded-full h-6 mr-4">
              <div 
                className="bg-blue-500 h-6 rounded-full transition-all duration-1000"
                style={{ width: `${(timeLeft / 20) * 100}%` }}
              ></div>
            </div>
            <div className="bg-white border-2 border-black rounded-full w-12 h-12 flex items-center justify-center">
              <span className="font-bold text-lg">{timeLeft}</span>
            </div>
          </div>

          {/* メイン：4コーナーレイアウト */}
          <div className="flex-1 relative">
            
            {/* 中央の問題表示 */}
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="bg-white border-4 border-black rounded-2xl w-60 h-60 flex flex-col items-center justify-center shadow-lg text-center">
                <div className={`text-5xl md:text-6xl font-bold ${currentProblem.color} mb-3`}>
                  {currentProblem.text}
                </div>
                <div className="text-xl md:text-2xl font-bold text-black px-3 py-1 rounded-lg">
                  {currentProblem.type}
                </div>
              </div>
            </div>

            {/* 4つのコーナーボタン */}
            {/* 左上：赤 */}
            <button
              onClick={() => selectAnswer('赤')}
              className="absolute top-0 left-0 w-1/2 h-1/2 bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all duration-150 flex items-center justify-center"
            >
              <span className="text-white text-2xl md:text-4xl font-bold opacity-20">赤</span>
            </button>

            {/* 右上：緑 */}
            <button
              onClick={() => selectAnswer('緑')}
              className="absolute top-0 right-0 w-1/2 h-1/2 bg-green-500 hover:bg-green-600 active:bg-green-700 transition-all duration-150 flex items-center justify-center"
            >
              <span className="text-white text-2xl md:text-4xl font-bold opacity-20">緑</span>
            </button>

            {/* 左下：黄 */}
            <button
              onClick={() => selectAnswer('黄')}
              className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 transition-all duration-150 flex items-center justify-center"
            >
              <span className="text-white text-2xl md:text-4xl font-bold opacity-20">黄</span>
            </button>

            {/* 右下：青 */}
            <button
              onClick={() => selectAnswer('青')}
              className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 transition-all duration-150 flex items-center justify-center"
            >
              <span className="text-white text-2xl md:text-4xl font-bold opacity-20">青</span>
            </button>
          </div>
        </div>
      )}

      {/* 結果画面 */}
      {gameState === 'finished' && (
        <div className="h-full flex flex-col items-center justify-center p-4">
          <h2 className="text-4xl md:text-5xl font-bold mb-8 text-black">結果発表</h2>
          
          <div className="bg-gray-100 rounded-2xl p-8 mb-8 text-center">
            <div className="text-6xl md:text-7xl font-bold text-black mb-4">
              {score}
            </div>
            <div className="text-xl md:text-2xl text-black font-bold mb-2">
              {totalProblems} 問中 {score} 問正解
            </div>
            {totalProblems > 0 && (
              <div className="text-lg md:text-xl text-gray-600">
                正解率: {Math.round((score / totalProblems) * 100)}%
              </div>
            )}
          </div>

          <p className="text-xl md:text-2xl text-black font-semibold">お疲れ様でした！</p>
        </div>
      )}
    </div>
  );
}
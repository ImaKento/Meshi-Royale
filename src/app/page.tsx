'use client';

import { Label } from '@radix-ui/react-label';
import { Gamepad2, LogIn, Plus } from 'lucide-react';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { useUserStore } from '../store/userStore';

export default function Home() {
  const router = useRouter();
  const { setUserId } = useUserStore();
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isJoinLoading, setIsJoinLoading] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

  const createUser = async () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.clear();
      } catch {}
    }

    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ゲスト' }),
    });

    if (!response.ok) {
      throw new Error('ユーザーの作成に失敗しました');
    }

    const data = await response.json();
    const userId: string = data.user.id;

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('selfUserId', userId); // 端末共通の自分ID
      } catch {}
    }

    return userId;
  };

  const createRoomUser = async ({ roomCode, userId }: { roomCode: string; userId: string }) => {
    const response = await fetch('/api/room-users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roomCode: roomCode, userId: userId }),
    });

    if (!response.ok) {
      throw new Error('ルームユーザーの作成に失敗しました');
    }
  };

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleCreateRoom = async () => {
    setIsLoading(true);
    try {
      const newRoomCode = generateRoomCode();

      // APIルートを呼び出してルームを作成
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomCode: newRoomCode }),
      });

      if (response.ok) {
        const userId = await createUser();
        setUserId(userId);
        await createRoomUser({ roomCode: newRoomCode, userId });
        router.push(`/room/${newRoomCode}`);
      } else {
        const error = await response.json();
        alert(error.error || 'ルームの作成に失敗しました');
      }
    } catch (error) {
      console.error('ルーム作成エラー:', error);
      alert('ルームの作成に失敗しました');
    }
    setIsLoading(false);
  };

  const handleJoinRoom = async () => {
    setIsJoinLoading(true);
    if (!roomCode.trim()) return;

    try {
      // APIルートを呼び出してルームを検索
      const response = await fetch(`/api/rooms?roomCode=${roomCode}`);

      if (response.ok) {
        const userId = await createUser();
        setUserId(userId);
        await createRoomUser({ roomCode, userId });
        router.push(`/room/${roomCode}`);
      } else {
        const error = await response.json();
        alert(error.error || 'ルームが見つかりません');
      }
    } catch (error) {
      console.error('ルーム参加エラー:', error);
      alert('ルームの参加に失敗しました');
    }
    setIsJoinLoading(false);
  };

  return (
    <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4'>
      <div className='w-full max-w-md space-y-8'>
        <div className='space-y-6 text-center'>
          <div className='flex justify-center'>
            <div className='flex h-20 w-20 items-center justify-center rounded-3xl border border-white/30 bg-gradient-to-br from-orange-400 to-pink-500 shadow-2xl backdrop-blur-sm'>
              <Gamepad2 className='h-10 w-10 text-white' />
            </div>
          </div>
          <div className='rounded-3xl border border-white/30 bg-white/95 p-6 shadow-xl backdrop-blur-sm'>
            <h1 className='mb-2 text-4xl font-black text-gray-800'>🍽️ グルメバトル</h1>
            <p className='text-lg font-medium text-gray-600'>みんなでお店を決めよう！</p>
          </div>
        </div>

        <div className='space-y-4'>
          <Button
            onClick={handleCreateRoom}
            className='h-16 w-full transform rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-8 py-4 font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:from-purple-600 hover:to-pink-600 hover:shadow-xl disabled:transform-none disabled:cursor-not-allowed disabled:opacity-50'
          >
            {isLoading ? (
              <div className='flex items-center gap-2'>
                <div className='h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600'></div>
                <span>ルーム作成中...</span>
              </div>
            ) : (
              <div className='flex items-center gap-2'>
                <Plus className='mr-3 h-6 w-6' />
                <span>ルーム作成</span>
              </div>
            )}
          </Button>

          <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
            <DialogTrigger asChild>
              <Button className='h-16 w-full transform rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-8 py-4 font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:from-blue-600 hover:to-cyan-600 hover:shadow-xl'>
                <LogIn className='mr-3 h-6 w-6' />
                ルームに入る
              </Button>
            </DialogTrigger>
            <DialogContent className='rounded-3xl border-0 bg-white/95 shadow-2xl backdrop-blur-xl sm:max-w-md'>
              <DialogHeader>
                <DialogTitle className='text-center text-2xl font-bold text-gray-800'>
                  ルームに参加
                </DialogTitle>
              </DialogHeader>
              <div className='space-y-6 p-2'>
                <div className='space-y-3'>
                  <Label htmlFor='roomCode' className='text-lg font-semibold text-gray-700'>
                    ルームコード
                  </Label>
                  <Input
                    id='roomCode'
                    placeholder='コードを入力'
                    value={roomCode}
                    onChange={e => setRoomCode(e.target.value)}
                    className='h-14 rounded-2xl border-2 border-gray-200 bg-white/80 text-center font-mono text-xl tracking-wider focus:border-purple-400'
                  />
                </div>
                <div className='flex space-x-3'>
                  <Button
                    variant='outline'
                    onClick={() => setJoinDialogOpen(false)}
                    className='h-12 flex-1 rounded-2xl border-2 font-semibold'
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleJoinRoom}
                    disabled={!roomCode.trim()}
                    className='h-12 flex-1 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 font-semibold'
                  >
                    {isJoinLoading ? (
                      <div className='flex items-center gap-2'>
                        <div className='h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600'></div>
                        <span>ルーム参加中...</span>
                      </div>
                    ) : (
                      <div className='flex items-center gap-2'>
                        <LogIn className='mr-3 h-6 w-6' />
                        <span>参加</span>
                      </div>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

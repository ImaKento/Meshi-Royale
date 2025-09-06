'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { useUserStore } from '../store/userStore';

export default function Home() {
  const router = useRouter();
  const { setUserId } = useUserStore();
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const createUser = async () => {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'ゲスト' }),
    });

    if (!response.ok) {
      throw new Error('ユーザーの作成に失敗しました');
    }

    const data = await response.json();
    return data.user.id;
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
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) return;

    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='flex h-screen items-center justify-center'>
      <div className='flex flex-col gap-4'>
        <Button onClick={handleCreateRoom} disabled={isLoading}>
          {isLoading ? '作成中...' : 'ルームを作成'}
        </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button disabled={isLoading}>ルームに入る</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>ルームIDを入力</DialogTitle>
            </DialogHeader>

            <div className='space-y-4'>
              <input
                type='text'
                placeholder='ルームIDを入力してください'
                value={roomCode}
                onChange={e => setRoomCode(e.target.value)}
                className='w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none'
                disabled={isLoading}
              />
            </div>

            <DialogFooter>
              <Button onClick={handleJoinRoom} disabled={!roomCode.trim() || isLoading}>
                {isLoading ? '入室中...' : '入室'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

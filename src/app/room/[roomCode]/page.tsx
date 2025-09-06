'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { useUserStore } from '../../../store/userStore';

interface Room {
  id: string;
  name?: string;
  roomCode: string;
  isActive: boolean;
  maxUsers: number;
}

interface RoomUser {
  roomId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    password: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

function RoomPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const router = useRouter();
  const { roomCode } = use(params);
  const { userId } = useUserStore();

  const [room, setRoom] = useState<Room | null>(null);
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const removeRoomUser = async () => {
    try {
      console.log('削除リクエスト:', { roomCode, userId });

      const response = await fetch('/api/room-users', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomCode, userId }),
      });

      console.log('レスポンスステータス:', response.status);
      const data = await response.json();
      console.log('レスポンスデータ:', data);

      if (response.ok) {
        router.push('/');
      } else {
        console.error('ルームユーザー削除エラー:', data.error);
        alert(data.error || 'ルームからの退出に失敗しました');
      }
    } catch (error) {
      console.error('ルームユーザー削除エラー:', error);
      alert('ルームからの退出に失敗しました');
    }
  };

  useEffect(() => {
    const fetchRoomData = async (isInitial = false) => {
      try {
        if (isInitial) {
          setIsInitialLoading(true);
        } else {
          setIsRefreshing(true);
        }

        const response = await fetch(`/api/rooms?roomCode=${roomCode}`);
        const data = await response.json();

        if (response.ok) {
          setRoom(data.room);
          setRoomUsers(data.room.roomUsers || []);
          setLastUpdated(new Date());
        } else {
          console.error('ルーム取得エラー:', data.error);
        }
      } catch (error) {
        console.error('ルーム取得エラー:', error);
      } finally {
        if (isInitial) {
          setIsInitialLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    };

    // 初回データ取得
    fetchRoomData(true);

    // 5秒ごとにデータを更新（バックグラウンドで）
    const interval = setInterval(() => fetchRoomData(false), 5000);

    // クリーンアップ
    return () => clearInterval(interval);
  }, [roomCode]);

  // 初回ローディング中
  if (isInitialLoading) {
    return (
      <div className='flex h-screen items-center justify-center'>
        <div className='text-center'>
          <div className='mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600'></div>
          <p className='text-gray-500'>ルーム情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className='flex h-screen items-center justify-center'>
      <div className='flex flex-col gap-4'>
        <Button
          className='mt-4'
          onClick={() => {
            removeRoomUser();
            router.push('/');
          }}
        >
          ルームを退出
        </Button>
        <div className='flex gap-4'>
          <h1>{room?.name}</h1>
          <p>ルームコード: {room?.roomCode}</p>
          <p>最大参加者数: {room?.maxUsers}人</p>
        </div>
        {isRefreshing && <span className='animate-pulse text-xs text-gray-400'>更新中...</span>}

        <div>
          <h2>参加者 ({roomUsers.length}人)</h2>
          <ul className='space-y-1'>
            <Card className='w-full max-w-sm'>
              <CardContent>
                <p>ユーザー名</p>
                {roomUsers.map((roomUser, index) => (
                  <div key={index} className='grid gap-2'>
                    <Input value={roomUser.user.name} readOnly />
                  </div>
                ))}
              </CardContent>
            </Card>
          </ul>
          <div className='flex gap-4'>
            <Button
              className='mt-4'
              onClick={() => {
                // roomCodeから一意にゲームを決定
                const games = ['/games/timing-stop', '/games/button-mashing'];

                // roomCodeをハッシュ化して一意なインデックスを生成
                const hash = roomCode.split('').reduce((acc, char, index) => {
                  return acc + char.charCodeAt(0) * (index + 1);
                }, 0);

                const gameIndex = Math.abs(hash) % games.length;
                const selectedGame = games[gameIndex];

                router.push(selectedGame);
              }}
            >
              ゲームに進む
            </Button>
          </div>
        </div>

        {lastUpdated && (
          <p className='text-xs text-gray-400'>最終更新: {lastUpdated.toLocaleTimeString()}</p>
        )}
      </div>
    </div>
  );
}

export default RoomPage;

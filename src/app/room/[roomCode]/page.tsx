'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { Search, Utensils } from 'lucide-react';

import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';

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
    name: string | null;
    food_candidates: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

function RoomPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { roomCode } = use(params);

  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('ゲスト');  // name
  const [foodCandidates, setFoodCandidates] = useState<string>('');  // food_candidates

  const [loadingMe, setLoadingMe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [leaving, setLeaving] = useState(false);

  // 空文字は null に、それ以外はtrimして返す
  const normalizeNullable = (v: string | null | undefined) => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length === 0 ? null : t;
  };

  // localStorage から自分のユーザーIDを復元
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('selfUserId');
    if (saved) setSelfUserId(saved);
  }, []);

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


  // 自分のユーザー情報を読み込み（GET /api/users/:id）
  useEffect(() => {
    const fetchMe = async () => {
      if (!selfUserId) return;
      setLoadingMe(true);
      try {
        const r = await fetch(`/api/users/${selfUserId}`, { cache: 'no-store' });
        const json = await r.json();
        if (r.ok && json?.ok && json.item) {
          setDisplayName(json.item.name ?? 'ゲスト');
          setFoodCandidates(json.item.food_candidates ?? '');
        } else {
          console.error('自分の情報の取得に失敗:', json?.error || r.status);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingMe(false);
      }
    };
    fetchMe();
  }, [selfUserId]);

  // 保存（PATCH /api/users/:id）
  const saveProfile = async () => {
    if (!selfUserId) {
      setSaveMsg('自分のユーザーIDが未確定です。前のページでユーザー作成済みか確認してください。');
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch(`/api/users/${selfUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizeNullable(displayName),
          food_candidates: normalizeNullable(foodCandidates),
        }),
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) throw new Error(json?.error || `HTTP ${r.status}`);
      setSaveMsg('保存しました');
    } catch (e: any) {
      setSaveMsg(`保存に失敗しました: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 2500);
    }
  };

  // 選択画面から戻った際の受け取り
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const picked = localStorage.getItem('pendingFoodCandidate');
    if (picked) {
      setFoodCandidates(picked);
      localStorage.removeItem('pendingFoodCandidate');
    }
  }, []);

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

  // 空文字や空白だけも未入力扱いにします
  const isEmpty = (v: unknown) =>
    typeof v !== 'string' || v.trim().length === 0;

  const missingMembers = roomUsers.filter(
    (ru) => isEmpty(ru.user.food_candidates)
  );

  const canStartGame = missingMembers.length === 0;

  // 退出処理
  const leaveRoom = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      const id =
        typeof window !== 'undefined' ? localStorage.getItem('selfUserId') : null;

      if (id) {
        // 自分のユーザーを削除（RoomUserはCascadeで消える）
        await fetch(`/api/users/${id}`, { method: 'DELETE' }).catch(() => {});
      }

      // ローカルストレージを掃除（このサイト用のIDは使い捨て）
      if (typeof window !== 'undefined') {
        try {
          localStorage.clear();
        } catch {}
      }

      // ホームへ
      router.push('/');
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className='flex h-screen items-center justify-center'>
      <div className='flex flex-col gap-4'>
        <Button className='mt-4' onClick={leaveRoom} disabled={leaving}>
          {leaving ? '退出中...' : 'ルームを退出'}
        </Button>

        <div className='flex gap-4'>
          <p>ルームコード: {room?.roomCode}</p>
          <p>最大参加者数: {room?.maxUsers}人</p>
        </div>

        {isRefreshing && <span className='animate-pulse text-xs text-gray-400'>更新中...</span>}

        {/* 参加者一覧（自分の行だけ編集可能） */}
        <div>
          <h2>参加者 ({roomUsers.length}人)</h2>
          <ul className="space-y-3">
            {roomUsers.map((ru) => {
              const isMe = ru.user.id === selfUserId;
              return (
                <Card
                  key={ru.user.id}
                  className={`w-full max-w-2xl ${isMe ? 'ring-2 ring-blue-500/60 bg-blue-50/30' : ''}`}
                >
                  <CardContent className="pt-5">
                    {/* ヘッダー行（ラベルなど） */}
                    <div className="mb-3 flex items-center gap-2">
                      {isMe ? (
                        <>
                          <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            あなた
                          </span>
                          <span className="text-xs text-gray-500">（ここは編集できます）</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">他の人</span>
                      )}
                    </div>

                    {/* 本体：自分は編集UI、他人は読み取り専用表示 */}
                    {isMe ? (
                      <div className="space-y-3">
                        <div className="grid gap-1">
                          <label className="text-xs text-gray-500">ユーザー名</label>
                          <Input
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="例：たなか"
                            disabled={loadingMe}
                          />
                        </div>

                        <div className="grid gap-1">
                          <label className="text-xs text-gray-500">食べたいもの候補</label>

                          {/* 入力 + 右端アイコン */}
                          <div className="relative">
                            <Input
                              value={foodCandidates}
                              onChange={(e) => setFoodCandidates(e.target.value)}
                              placeholder="例：カレー"
                              disabled={loadingMe}
                              className="pr-12"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1/2 -translate-y-1/2"
                              onClick={() => {
                                const returnTo = `/room/${roomCode}`;
                                router.push(`/get-area?returnTo=${encodeURIComponent(returnTo)}`);
                              }}
                              title="近くの店から選ぶ"
                            >
                              <Utensils className="h-5 w-5" />
                            </Button>
                          </div>

                          <span className="text-[11px] text-gray-400">
                            右側のアイコンを押すとお店を直接選べます
                          </span>
                        </div>

                        <div className="mt-4 border-t pt-4">
                          <Button
                            className="w-full h-11 text-base"
                            onClick={saveProfile}
                            disabled={!selfUserId || saving || loadingMe}
                          >
                            {saving ? '保存中...' : '保存する'}
                          </Button>
                          {saveMsg && (
                            <div
                              className={`mt-2 text-sm text-center ${
                                saveMsg.startsWith('保存しました') ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {saveMsg}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">ユーザー名</label>
                        <div className="text-lg font-semibold">{ru.user.name ?? 'ゲスト'}</div>
                        <label className="text-xs text-gray-500">食べたいもの候補</label>
                        <div className="text-lg font-semibold">{ru.user.food_candidates ?? '食べたいもの候補は未入力'}</div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </ul>

          <div className="flex flex-col gap-2 mt-4">
            {!canStartGame && (
              <div className="text-sm text-red-600">
                ゲーム開始できません：食べたいもの候補が未入力のメンバーがいます
                <div className="mt-1 text-xs text-gray-600">
                  未入力:{" "}
                  {missingMembers.map((ru, i) => (
                    <span key={ru.user.id}>
                      {ru.user.name ?? "ゲスト"}
                      {i < missingMembers.length - 1 ? "、" : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Button
              className="w-fit"
              onClick={() => {
                const games = ['/games/timing-stop', '/games/button-mashing'];
                const randomGame = games[Math.floor(Math.random() * games.length)];
                router.push(randomGame);
              }}
              disabled={!canStartGame}
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

'use client';

import { Users } from 'lucide-react';

import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';

import UserCard from '@/components/userCard';

import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { useUserStore } from '../../../store/userStore';

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
  const { roomCode } = use(params);

  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('ゲスト'); // name
  const [foodCandidates, setFoodCandidates] = useState<string>(''); // food_candidates

  const [leaving, setLeaving] = useState(false);

  const editingRef = useRef<Set<string>>(new Set());

  const handleFieldFocus = (userId: string, field: 'name' | 'food_candidates') => {
    editingRef.current.add(`${userId}:${field}`);
  };

  const handleFieldBlur = (userId: string, field: 'name' | 'food_candidates', value: string) => {
    editingRef.current.delete(`${userId}:${field}`);
    flushSave(`${userId}:${field}`, userId, field, value);
  };

  const shallowEqualRoomUsers = (a: RoomUser[], b: RoomUser[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const A = a[i],
        B = b[i];
      if (A.user.id !== B.user.id) return false;
      if (A.user.name !== B.user.name) return false;
      if (A.user.food_candidates !== B.user.food_candidates) return false;
    }
    return true;
  };

  function useDebouncedCallback<T extends (...args: any[]) => void>(cb: T, delay = 600) {
    // 直近のコールバックを保持
    const cbRef = useRef(cb);
    useEffect(() => {
      cbRef.current = cb;
    }, [cb]);

    // ユニークキーごとにタイマーを分離（userId:field 単位で独立ディボンス）
    const timersRef = useRef<Map<string, number>>(new Map());

    const debounced = useCallback(
      (key: string, ...args: Parameters<T>) => {
        const timers = timersRef.current;
        const prev = timers.get(key);
        if (prev) window.clearTimeout(prev);
        const id = window.setTimeout(() => cbRef.current(...args), delay);
        timers.set(key, id);
      },
      [delay]
    );

    // 明示的に即時実行したいとき（blur時など）
    const flush = useCallback((key: string, ...args: Parameters<T>) => {
      const timers = timersRef.current;
      const prev = timers.get(key);
      if (prev) {
        window.clearTimeout(prev);
        timers.delete(key);
      }
      cbRef.current(...args);
    }, []);

    // アンマウントで全タイマー掃除
    useEffect(() => {
      return () => {
        const timers = timersRef.current;
        timers.forEach(id => window.clearTimeout(id));
        timers.clear();
      };
    }, []);

    return { debounced, flush };
  }

  // 空文字は空文字のまま、それ以外はtrimして返す
  const normalizeString = (v: string | null | undefined) => {
    if (typeof v !== 'string') return '';
    return v.trim();
  };

  // localStorage から自分のユーザーIDを復元
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('selfUserId');
    if (saved) setSelfUserId(saved);
  }, []);

  // 取得時にソートしてセット（どちらでもOK：取得時 or render時）
  const sortRoomUsers = (list: RoomUser[]) =>
    [...list].sort((a, b) => {
      const ta =
        (a.createdAt ?? a.user?.createdAt ?? 0) &&
        new Date(a.createdAt ?? a.user?.createdAt ?? 0).getTime();
      const tb =
        (b.createdAt ?? b.user?.createdAt ?? 0) &&
        new Date(b.createdAt ?? b.user?.createdAt ?? 0).getTime();
      return (ta || 0) - (tb || 0);
    });

  useEffect(() => {
    let interval: number | null = null;

    const fetchRoomData = async (isInitial = false) => {
      try {
        if (isInitial) setIsInitialLoading(true);

        const res = await fetch(`/api/rooms?roomCode=${roomCode}`);
        const data = await res.json();

        if (res.ok) {
          const list: RoomUser[] = data.room?.roomUsers ?? [];
          const sorted = sortRoomUsers(list);

          setRoomUsers(prev => {
            // 直前状態を user.id → RoomUser のマップ化
            const prevById = new Map(prev.map(p => [p.user.id, p]));

            // 「編集中フィールドはローカル優先」でマージ
            const merged = sorted.map(ru => {
              const prevRu = prevById.get(ru.user.id);
              if (!prevRu) return ru;

              const id = ru.user.id;
              const keepName = editingRef.current.has(`${id}:name`);
              const keepFood = editingRef.current.has(`${id}:food_candidates`);

              return {
                ...ru,
                user: {
                  ...ru.user,
                  name: keepName ? prevRu.user.name : ru.user.name,
                  food_candidates: keepFood ? prevRu.user.food_candidates : ru.user.food_candidates,
                },
              };
            });

            return shallowEqualRoomUsers(prev, merged) ? prev : merged;
          });
        }
      } finally {
        if (isInitial) setIsInitialLoading(false);
      }
    };

    const start = () => {
      if (interval == null) {
        interval = window.setInterval(() => fetchRoomData(false), 5000);
      }
    };
    const stop = () => {
      if (interval != null) {
        clearInterval(interval);
        interval = null;
      }
    };

    // 初回取得 & 可視なら開始
    fetchRoomData(true).then(() => {
      if (document.visibilityState === 'visible') start();
    });

    const onVis = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [roomCode]);

  // render 時も安全側で並べ替え（取得時ソートしているなら省略可）
  const sortedRoomUsers = sortRoomUsers(roomUsers);

  // 自分のユーザー情報を読み込み（GET /api/users/:id）
  useEffect(() => {
    const fetchMe = async () => {
      if (!selfUserId) return;
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
      }
    };
    fetchMe();
  }, [selfUserId]);

  const { debounced: debouncedSave, flush: flushSave } = useDebouncedCallback(
    (userId: string, field: 'name' | 'food_candidates', value: string) => {
      saveProfile(userId, field, value);
    },
    600 // 待ち時間(ms)
  );

  // ユーザー情報更新（ローカル状態 + API）
  const onUpdateUser = (userId: string, field: 'name' | 'food_candidates', value: string) => {
    // ローカル状態は即時更新
    if (userId === selfUserId) {
      if (field === 'name') setDisplayName(value);
      else setFoodCandidates(value);
    }

    setRoomUsers(prev =>
      prev.map(ru => (ru.userId === userId ? { ...ru, user: { ...ru.user, [field]: value } } : ru))
    );

    // ★ デボンスして保存（キーは userId:field）
    debouncedSave(`${userId}:${field}`, userId, field, value);
  };

  // 保存（PATCH /api/users/:id）
  const saveProfile = async (userId: string, field: 'name' | 'food_candidates', value: string) => {
    try {
      // 更新するフィールドのみを送信
      const updateData: any = {};
      if (field === 'name') {
        updateData.name = normalizeString(value);
      } else if (field === 'food_candidates') {
        updateData.food_candidates = normalizeString(value);
      }

      const r = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) throw new Error(json?.error || `HTTP ${r.status}`);
    } catch (e) {
      console.error(e);
    }
  };

  // 選択画面から戻った際の受け取り
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const readPicked = () => {
      try {
        const raw = localStorage.getItem('pendingFoodCandidate');
        if (!raw) return;

        const picked = raw.trim();
        if (!picked) {
          // 空文字は破棄
          localStorage.removeItem('pendingFoodCandidate');
          return;
        }

        // ★ selfUserId がまだ無いなら「消さずに」待つ（次のフォーカス/可視化や selfUserId 確定後の再実行で拾う）
        if (!selfUserId) return;

        // ここで初めて反映＆削除
        onUpdateUser(selfUserId, 'food_candidates', picked); // 一覧＆DBを即反映
        localStorage.removeItem('pendingFoodCandidate');
      } catch {}
    };

    // 初回（戻り直後）
    readPicked();

    // タブにフォーカスが戻った時
    const onFocus = () => readPicked();
    window.addEventListener('focus', onFocus);

    // ページが再び可視になった時（App Routerの再マウント/キャッシュ対策）
    const onVisibility = () => {
      if (document.visibilityState === 'visible') readPicked();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [selfUserId]);

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

  // 退出処理
  const leaveRoom = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      const id = typeof window !== 'undefined' ? localStorage.getItem('selfUserId') : null;

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

      router.push('/');
    } finally {
      setLeaving(false);
    }
  };

  const handleGemaStart = () => {
    // roomCodeから一意にゲームを決定
    const games = [
      '/games/avoidance-game',
      '/games/button-mashing',
      '/games/color-challenge',
      '/games/timing-stop',
    ];

    // roomCodeをハッシュ化して一意なインデックスを生成
    const hash = roomCode.split('').reduce((acc, char, index) => {
      return acc + char.charCodeAt(0) * (index + 1);
    }, 0);

    const gameIndex = Math.abs(hash) % games.length;
    const selectedGame = games[gameIndex];

    // パラメータを付けてゲームページに遷移
    const params = new URLSearchParams({
      userId: selfUserId || '',
      roomCode: roomCode,
      joindUserCount: roomUsers.length.toString(),
    });

    router.push(`${selectedGame}?${params.toString()}`);
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4'>
      <div className='mx-auto max-w-md space-y-6'>
        <div className='rounded-3xl border border-white/30 bg-gradient-to-br from-orange-400 via-pink-400 to-purple-500 p-4 shadow-xl backdrop-blur-sm'>
          <div className='mb-4 flex items-center justify-between'>
            <Button
              variant='outline'
              onClick={leaveRoom}
              className='rounded-2xl border-white/30 bg-white/20 font-semibold text-white hover:bg-white/30'
            >
              ← ホーム
            </Button>
          </div>
          <div className='text-center'>
            <p className='text-sm font-medium text-white/90 drop-shadow-sm'>ルームコード</p>
            <p className='text-3xl font-black tracking-wider text-white drop-shadow-lg'>
              {roomCode}
            </p>
          </div>
        </div>

        <div className='space-y-4'>
          <div className='flex items-center justify-between px-2'>
            <h2 className='flex items-center text-xl font-bold text-white'>
              <Users className='mr-2 h-6 w-6' />
              メンバー ({roomUsers.length}/4)
            </h2>
          </div>

          <div className='space-y-3'>
            {sortedRoomUsers.map((ru, idx) => {
              const readOnly = ru.userId !== selfUserId;
              return (
                <UserCard
                  key={ru.user.id}
                  user={ru.user}
                  index={idx}
                  onUpdateUser={onUpdateUser}
                  readOnly={readOnly}
                  roomCode={roomCode}
                  onFieldFocus={handleFieldFocus}
                  onFieldBlur={handleFieldBlur}
                />
              );
            })}
          </div>

          {roomUsers.length < 4 && (
            <div className='space-y-3'>
              {Array.from({ length: 4 - roomUsers.length }).map((_, index) => (
                <Card
                  key={`empty-${index}`}
                  className='rounded-3xl border-2 border-dashed border-white/50 bg-white/30 backdrop-blur-sm'
                >
                  <CardContent className='flex h-24 items-center justify-center'>
                    <div className='text-center text-white/80'>
                      <Users className='mx-auto mb-1 h-6 w-6 opacity-60' />
                      <p className='text-sm font-medium'>空きスロット</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
        <Button
          onClick={handleGemaStart}
          // disabled={roomUsers.length < 2}
          className='h-12 w-full justify-center rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 font-semibold'
        >
          <div className='flex items-center justify-center gap-2'>
            <span>ゲーム開始！！</span>
          </div>
        </Button>
      </div>
    </div>
  );
}

export default RoomPage;

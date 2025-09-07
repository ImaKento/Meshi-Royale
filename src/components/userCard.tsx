'use client';

import { Utensils } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface User {
  id: string;
  name: string | null;
  food_candidates: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserCardProps {
  user: User;
  index: number;
  onUpdateUser: (userId: string, field: 'name' | 'food_candidates', value: string) => void;
  readOnly?: boolean;
  roomCode: string;

  onFieldFocus: (userId: string, field: 'name' | 'food_candidates') => void;
  onFieldBlur: (userId: string, field: 'name' | 'food_candidates', value: string) => void;
}

export default function UserCard({
  user,
  index,
  onUpdateUser,
  readOnly = false,
  roomCode,
  onFieldFocus,
  onFieldBlur,
}: UserCardProps) {
  const router = useRouter();

  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const id = localStorage.getItem('selfUserId');
      if (id) setSelfUserId(id);
    } catch {}
  }, []);

  const isMe = user.id === selfUserId;

  const renderColorfulCard = () => {
    const cardColors = [
      'from-pink-400 via-purple-400 to-indigo-400',
      'from-cyan-400 via-blue-400 to-purple-400',
      'from-green-400 via-emerald-400 to-teal-400',
      'from-orange-400 via-red-400 to-pink-400',
    ];

    return (
      <Card
        className={`bg-gradient-to-br ${cardColors[index]} overflow-hidden rounded-3xl border-0 shadow-xl`}
      >
        <CardContent className='relative p-4'>
          <div className='flex items-start space-x-4'>
            <div className='flex-shrink-0'>
              <div className='flex h-16 w-16 items-center justify-center rounded-3xl border border-white/30 bg-white/20 text-2xl font-black text-white shadow-lg backdrop-blur-sm'>
                {['🎮', '🎯', '⭐', '🏆'][index]}
              </div>
              <div className='mt-2 text-center'>
                <div className='flex items-center justify-center space-x-1'>
                  <span
                    className="text-sm font-bold text-white drop-shadow-sm"
                    title={isMe ? 'あなた' : `プレイヤー ${index + 1}`}
                  >
                    {isMe ? 'あなた' : ``}
                  </span>
                </div>
              </div>
            </div>
            <div className='flex-1 space-y-3'>
              <div>
                <Label className='mb-1 block text-sm font-semibold text-white/90 drop-shadow-sm'>
                  名前
                </Label>
                  <Input
                    placeholder="名前を入力"
                    value={user.name ?? "ゲスト"}
                    onChange={readOnly ? undefined : (e) => onUpdateUser(user.id, 'name', e.target.value)}
                    onFocus={readOnly ? undefined : () => onFieldFocus(user.id, 'name')}
                    onBlur={readOnly ? undefined : (e) => onFieldBlur(user.id, 'name', e.currentTarget.value)}
                    readOnly={readOnly}
                    className={[
                      "h-11 rounded-2xl border-0 font-medium shadow-sm",
                      "bg-white/90 text-black placeholder-gray-500",
                      readOnly ? "ring-1 ring-gray-300 cursor-default select-text" : ""
                    ].join(" ")}
                  />
              </div>
              <div>
                <Label className='mb-1 block text-sm font-semibold text-white/90 drop-shadow-sm'>
                  お店
                </Label>
                {/* 入力 + 右端アイコン */}
                <div className="relative">
                  <Input
                    placeholder="お店を入力"
                    value={user.food_candidates ?? ""}
                    onChange={readOnly ? undefined : (e) => onUpdateUser(user.id, 'food_candidates', e.target.value)}
                    onFocus={readOnly ? undefined : () => onFieldFocus(user.id, 'food_candidates')}
                    onBlur={readOnly ? undefined : (e) => onFieldBlur(user.id, 'food_candidates', e.currentTarget.value)}
                    readOnly={readOnly} 
                    className={[
                      "h-11 rounded-2xl border-0 font-medium shadow-sm pr-12",
                      "bg-white/90 text-black placeholder-gray-500",
                      readOnly ? "ring-1 ring-gray-300 cursor-default select-text" : ""
                    ].join(" ")}
                  />
                  {/* アイコンボタンは前回の “薄暗くしない無効化” 方式のままでOK */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-disabled={readOnly}
                    title={readOnly ? "自分のカードのみ選択できます" : "近くの店から選ぶ"}
                    onClick={() => {
                      if (readOnly) return; // 押せないが見た目はくっきり
                      const returnTo = `/room/${roomCode}`;
                      router.push(`/get-area?returnTo=${encodeURIComponent(returnTo)}`);
                    }}
                    className={[
                      "absolute right-1 top-1/2 -translate-y-1/2",
                      // でかめのタップ領域 + 背景つきでコントラストUP
                      "h-9 w-9 rounded-xl bg-white text-gray-900",
                      "shadow-sm ring-1 ring-black/10 hover:shadow-md hover:ring-black/20",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      // 読み取り専用でも薄くしない（押下だけ無効）
                      readOnly ? "cursor-not-allowed hover:bg-white hover:text-gray-900" : ""
                    ].join(" ")}
                  >
                    <Utensils className="h-[22px] w-[22px]" strokeWidth={2.25} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return renderColorfulCard();
}

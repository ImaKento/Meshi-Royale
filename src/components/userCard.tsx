'use client';

import { Utensils } from 'lucide-react';

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
}

export default function UserCard({
  user,
  index,
  onUpdateUser,
  readOnly = false,
  roomCode,
}: UserCardProps) {
  const router = useRouter();
  const avatarColors = [
    'from-purple-400 to-pink-400',
    'from-blue-400 to-cyan-400',
    'from-green-400 to-emerald-400',
    'from-orange-400 to-red-400',
  ];

  const updateUser = (field: 'name' | 'food_candidates', value: string) => {
    onUpdateUser(user.id, field, value);
  };

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
                  <span className='text-sm font-bold text-white drop-shadow-sm'>P{index + 1}</span>
                </div>
              </div>
            </div>
            <div className='flex-1 space-y-3'>
              <div>
                <Label className='mb-1 block text-sm font-semibold text-white/90 drop-shadow-sm'>
                  名前
                </Label>
                <Input
                  placeholder='名前を入力'
                  value={user.name ?? 'ゲスト'}
                  onChange={e => updateUser('name', e.target.value)}
                  disabled={readOnly}
                  className={`h-11 rounded-2xl border-0 font-medium text-gray-800 placeholder-gray-500 shadow-sm ${
                    readOnly
                      ? 'cursor-not-allowed bg-white/90 text-gray-800 ring-1 ring-gray-300'
                      : 'bg-white/90'
                  }`}
                />
              </div>
              <div>
                <Label className='mb-1 block text-sm font-semibold text-white/90 drop-shadow-sm'>
                  お店
                </Label>
                {/* 入力 + 右端アイコン */}

                <div className='relative'>
                  <Input
                    placeholder='お店を入力'
                    value={user.food_candidates ?? ''}
                    onChange={e => updateUser('food_candidates', e.target.value)}
                    disabled={readOnly}
                    className={`h-11 rounded-2xl border-0 font-medium text-gray-800 placeholder-gray-500 shadow-sm ${
                      readOnly
                        ? 'cursor-not-allowed bg-white/90 text-gray-800 ring-1 ring-gray-300'
                        : 'bg-white/90'
                    }`}
                  />
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='absolute top-1/2 right-1 -translate-y-1/2'
                    onClick={() => {
                      const returnTo = `/room/${roomCode}`;
                      router.push(`/get-area?returnTo=${encodeURIComponent(returnTo)}`);
                    }}
                    title='近くの店から選ぶ'
                  >
                    <Utensils className='h-5 w-5' />
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

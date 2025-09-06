'use client';

import { Crown, Plus, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { CardStyle, Room, User } from '../types';
import UserCard from './UserCard';

interface RoomPageProps {
  room: Room;
  cardStyle: CardStyle;
  onGoHome: () => void;
  onUpdateUser: (userId: string, field: 'name' | 'restaurant', value: string) => void;
  onAddUser: () => void;
  onSetCardStyle: (style: CardStyle) => void;
}

export default function RoomPage({
  room,
  cardStyle,
  onGoHome,
  onUpdateUser,
  onAddUser,
  onSetCardStyle,
}: RoomPageProps) {
  return (
    <div className='min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-4'>
      <div className='mx-auto max-w-md space-y-6'>
        <div className='rounded-3xl border border-white/30 bg-gradient-to-br from-orange-400 via-pink-400 to-purple-500 p-4 shadow-xl backdrop-blur-sm'>
          <div className='mb-4 flex items-center justify-between'>
            <Button
              variant='outline'
              onClick={onGoHome}
              className='rounded-2xl border-white/30 bg-white/20 font-semibold text-white hover:bg-white/30'
            >
              ← ホーム
            </Button>
            <div className='flex items-center space-x-2'>
              <Crown className='h-5 w-5 text-yellow-200' />
              <span className='font-bold text-white drop-shadow-sm'>ルーム</span>
            </div>
          </div>
          <div className='text-center'>
            <p className='text-sm font-medium text-white/90 drop-shadow-sm'>ルームコード</p>
            <p className='text-3xl font-black tracking-wider text-white drop-shadow-lg'>
              {room.code}
            </p>
          </div>
        </div>

        <div className='rounded-3xl border border-white/30 bg-gradient-to-br from-cyan-400 via-blue-400 to-purple-500 p-4 shadow-xl backdrop-blur-sm'>
          <p className='mb-3 text-center font-semibold text-white drop-shadow-sm'>カードスタイル</p>
          <div className='grid grid-cols-5 gap-2'>
            <Button
              onClick={() => onSetCardStyle('default')}
              className={`h-10 rounded-2xl text-xs font-medium ${
                cardStyle === 'default'
                  ? 'bg-white text-purple-600'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              標準
            </Button>
            <Button
              onClick={() => onSetCardStyle('gaming')}
              className={`h-10 rounded-2xl text-xs font-medium ${
                cardStyle === 'gaming'
                  ? 'bg-white text-purple-600'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              ゲーム
            </Button>
            <Button
              onClick={() => onSetCardStyle('minimal')}
              className={`h-10 rounded-2xl text-xs font-medium ${
                cardStyle === 'minimal'
                  ? 'bg-white text-purple-600'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              シンプル
            </Button>
            <Button
              onClick={() => onSetCardStyle('colorful')}
              className={`h-10 rounded-2xl text-xs font-medium ${
                cardStyle === 'colorful'
                  ? 'bg-white text-purple-600'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              カラフル
            </Button>
            <Button
              onClick={() => onSetCardStyle('ios')}
              className={`h-10 rounded-2xl text-xs font-medium ${
                cardStyle === 'ios'
                  ? 'bg-white text-purple-600'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              iOS
            </Button>
          </div>
        </div>

        <div className='space-y-4'>
          <div className='flex items-center justify-between px-2'>
            <h2 className='flex items-center text-xl font-bold text-white'>
              <Users className='mr-2 h-6 w-6' />
              メンバー ({room.users.length}/4)
            </h2>
            {room.users.length < 4 && (
              <Button
                onClick={onAddUser}
                className='rounded-2xl border border-white/30 bg-white/20 font-semibold text-white backdrop-blur-sm hover:bg-white/30'
                size='sm'
              >
                <Plus className='mr-1 h-4 w-4' />
                追加
              </Button>
            )}
          </div>

          <div className='space-y-3'>
            {room.users.map((user, index) => (
              <UserCard
                key={user.id}
                user={user}
                index={index}
                cardStyle={cardStyle}
                onUpdateUser={onUpdateUser}
              />
            ))}
          </div>

          {room.users.length < 4 && (
            <div className='space-y-3'>
              {Array.from({ length: 4 - room.users.length }).map((_, index) => (
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
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { Users, Plus, X, Edit3, Store, Copy, Check, MapPin } from 'lucide-react';

interface User {
  id: string;
  name: string;
  restaurant: string;
  color: string;
  avatar: string;
}

interface Room {
  code: string;
  users: User[];
}

const GRADIENT_COLORS = [
  'from-purple-500 to-pink-500',
  'from-blue-500 to-cyan-500', 
  'from-green-500 to-emerald-500',
  'from-orange-500 to-red-500'
];

const AVATAR_COLORS = [
  'bg-gradient-to-br from-purple-400 to-purple-600',
  'bg-gradient-to-br from-blue-400 to-blue-600',
  'bg-gradient-to-br from-green-400 to-green-600',
  'bg-gradient-to-br from-orange-400 to-orange-600'
];

function App() {
  const [currentView, setCurrentView] = useState<'home' | 'room'>('home');
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'name' | 'restaurant' | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // モックユーザーデータ
  const mockUsers: User[] = [
    { id: '1', name: '太郎', restaurant: 'イタリアン', color: GRADIENT_COLORS[0], avatar: AVATAR_COLORS[0] },
    { id: '2', name: '花子', restaurant: '焼肉', color: GRADIENT_COLORS[1], avatar: AVATAR_COLORS[1] },
    { id: '3', name: 'ケンジ', restaurant: '寿司', color: GRADIENT_COLORS[2], avatar: AVATAR_COLORS[2] }
  ];

  const createRoom = () => {
    const newRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newRoom: Room = {
      code: newRoomCode,
      users: [mockUsers[0]] // 作成者として最初のユーザーを追加
    };
    setCurrentRoom(newRoom);
    setCurrentView('room');
  };

  const joinRoom = () => {
    if (roomCode.trim()) {
      // モックルームを作成（実際の実装では API 呼び出し）
      const existingRoom: Room = {
        code: roomCode.toUpperCase(),
        users: mockUsers.slice(0, Math.floor(Math.random() * 3) + 1)
      };
      setCurrentRoom(existingRoom);
      setCurrentView('room');
      setShowJoinDialog(false);
      setRoomCode('');
    }
  };

  const updateUser = (userId: string, field: 'name' | 'restaurant', value: string) => {
    if (currentRoom) {
      const updatedUsers = currentRoom.users.map(user =>
        user.id === userId ? { ...user, [field]: value } : user
      );
      setCurrentRoom({ ...currentRoom, users: updatedUsers });
    }
  };

  const copyRoomCode = async () => {
    if (currentRoom?.code) {
      try {
        await navigator.clipboard.writeText(currentRoom.code);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } catch (err) {
        console.error('Failed to copy room code:', err);
      }
    }
  };

  const renderHomeScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="text-center space-y-8">
        <div className="space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mb-6">
            <Users className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2">ルーム管理</h1>
          <p className="text-gray-600 text-lg">友達と一緒に楽しもう！</p>
        </div>
        
        <div className="space-y-4 w-80">
          <button
            onClick={createRoom}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-4 px-8 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
          >
            <Plus className="w-5 h-5 inline mr-2" />
            ルーム作成
          </button>
          
          <button
            onClick={() => setShowJoinDialog(true)}
            className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold py-4 px-8 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
          >
            <Users className="w-5 h-5 inline mr-2" />
            ルームに入る
          </button>
        </div>
      </div>

      {/* Join Room Dialog */}
      {showJoinDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md transform transition-all duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">ルームに参加</h2>
              <button
                onClick={() => setShowJoinDialog(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ルームコード
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  placeholder="ABCDEF"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-lg font-mono uppercase tracking-wider"
                  maxLength={6}
                />
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowJoinDialog(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={joinRoom}
                  disabled={!roomCode.trim()}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:from-blue-600 hover:to-cyan-600 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  参加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderUserCard = (user: User, index: number) => (
    <div
      key={user.id}
      className={`bg-gradient-to-br ${user.color} rounded-2xl p-8 text-white transform transition-all duration-300 hover:scale-105 hover:shadow-2xl`}
    >
      <div className="flex items-center space-x-4">
        {/* Avatar */}
        <div className={`w-16 h-16 ${user.avatar} rounded-full flex items-center justify-center text-xl font-bold shadow-lg flex-shrink-0`}>
          {user.name.charAt(0)}
        </div>
        
        {/* Name and Restaurant */}
        <div className="flex-1 space-y-3">
          {/* Name */}
          <div>
            {editingUser === user.id && editingField === 'name' ? (
              <input
                type="text"
                value={user.name}
                onChange={(e) => updateUser(user.id, 'name', e.target.value)}
                onBlur={() => {
                  setEditingUser(null);
                  setEditingField(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEditingUser(null);
                    setEditingField(null);
                  }
                }}
                className="w-full bg-white text-gray-800 placeholder-gray-400 rounded-lg px-3 py-2 font-bold text-base focus:ring-2 focus:ring-blue-500 focus:outline-none"
                autoFocus
              />
            ) : (
              <div
                className="bg-white bg-opacity-95 text-gray-800 rounded-lg px-3 py-2 flex items-center justify-between hover:bg-opacity-100 transition-colors cursor-pointer"
                onClick={() => {
                  setEditingUser(user.id);
                  setEditingField('name');
                }}
              >
                <span className="font-bold text-base">{user.name}</span>
                <Edit3 className="w-4 h-4 text-gray-500" />
              </div>
            )}
          </div>
          
          {/* Restaurant */}
          <div>
            {editingUser === user.id && editingField === 'restaurant' ? (
              <input
                type="text"
                value={user.restaurant}
                onChange={(e) => updateUser(user.id, 'restaurant', e.target.value)}
                onBlur={() => {
                  setEditingUser(null);
                  setEditingField(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEditingUser(null);
                    setEditingField(null);
                  }
                }}
                className="w-full bg-white text-gray-800 placeholder-gray-400 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                autoFocus
              />
            ) : (
              <div
                className="bg-white bg-opacity-95 text-gray-800 rounded-lg px-3 py-2 flex items-center justify-between hover:bg-opacity-100 transition-colors cursor-pointer"
                onClick={() => {
                  setEditingUser(user.id);
                  setEditingField('restaurant');
                }}
              >
                <div className="flex items-center space-x-2">
                  <Store className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium">{user.restaurant}</span>
                </div>
                <Edit3 className="w-4 h-4 text-gray-500" />
              </div>
            )}
          </div>
          
          {/* Search Button for undecided restaurants */}
          {(!user.restaurant || user.restaurant === '未定' || user.restaurant === '') && (
            <button
              className="w-full bg-white bg-opacity-95 hover:bg-opacity-100 text-gray-800 font-medium py-2 px-3 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2"
              onClick={() => {
                // ここで近くのお店検索機能を呼び出す
                console.log('近くのお店を検索中...');
              }}
            >
              <MapPin className="w-4 h-4 text-gray-600" />
              <span className="text-xs">近くのお店を検索</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderEmptySlot = (index: number) => (
    <div
      key={`empty-${index}`}
      className="border-2 border-dashed border-gray-300 rounded-2xl p-6 flex items-center justify-center space-x-4 text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors cursor-pointer min-h-[120px]"
    >
      <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
        <Plus className="w-8 h-8" />
      </div>
      <div className="flex-1">
        <span className="font-semibold">待機中...</span>
      </div>
    </div>
  );

  const renderRoomScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-4 bg-white rounded-2xl px-6 py-4 shadow-lg">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-xl font-mono font-bold text-lg tracking-wider">
              {currentRoom?.code}
            </div>
            <button
              onClick={copyRoomCode}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="コピー"
            >
              {copiedCode ? (
                <Check className="w-5 h-5 text-green-500" />
              ) : (
                <Copy className="w-5 h-5 text-gray-500" />
              )}
            </button>
          </div>
          <p className="text-gray-600 mt-4 text-lg">参加者: {currentRoom?.users.length || 0}/4</p>
        </div>

        {/* User Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }, (_, index) => {
            const user = currentRoom?.users[index];
            return user ? renderUserCard(user, index) : renderEmptySlot(index);
          })}
        </div>

        {/* Back Button */}
        <div className="text-center mt-8">
          <button
            onClick={() => {
              setCurrentView('home');
              setCurrentRoom(null);
            }}
            className="px-6 py-3 bg-white text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-colors shadow-lg"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {currentView === 'home' ? renderHomeScreen() : renderRoomScreen()}
    </>
  );
}

export default App;
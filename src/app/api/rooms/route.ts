import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomCode = searchParams.get('roomCode');

    if (roomCode) {
      // 特定のルームコードでルームを検索
      const room = await prisma.room.findUnique({
        where: { roomCode },
        include: {
          roomUsers: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!room) {
        return NextResponse.json({ error: 'ルームが見つかりません' }, { status: 404 });
      }

      return NextResponse.json({ room });
    } else {
      // すべてのルームを取得
      const rooms = await prisma.room.findMany({
        include: {
          roomUsers: {
            include: {
              user: true,
            },
          },
        },
      });

      return NextResponse.json({ rooms });
    }
  } catch (error) {
    console.error('ルーム取得エラー:', error);
    return NextResponse.json({ error: 'ルームの取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { roomCode } = await request.json();

    // ルームコードが既に存在するかチェック
    const existingRoom = await prisma.room.findUnique({
      where: { roomCode },
    });

    if (existingRoom) {
      return NextResponse.json({ error: 'ルームコードが既に存在します' }, { status: 400 });
    }

    // 新しいルームを作成
    const room = await prisma.room.create({
      data: {
        roomCode,
        name: '新しいルーム',
      },
    });

    return NextResponse.json({ room });
  } catch (error) {
    console.error('ルーム作成エラー:', error);
    return NextResponse.json({ error: 'ルームの作成に失敗しました' }, { status: 500 });
  }
}

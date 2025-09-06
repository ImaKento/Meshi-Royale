import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomCode = searchParams.get('roomCode');

    if (!roomCode) {
      return NextResponse.json({ error: 'ルームコードが必要です' }, { status: 400 });
    }

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
  } catch (error) {
    return NextResponse.json({ error: 'ルームの検索に失敗しました。' + error }, { status: 500 });
  }
}

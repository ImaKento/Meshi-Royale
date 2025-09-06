import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { roomCode, userId } = await request.json();

    // roomCodeからroomIdを取得
    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: { id: true },
    });

    if (!room) {
      return NextResponse.json({ error: 'ルームが見つかりません' }, { status: 404 });
    }

    // 既に参加しているかチェック
    const existingRoomUser = await prisma.roomUser.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: userId,
        },
      },
    });

    if (existingRoomUser) {
      return NextResponse.json({ error: '既にこのルームに参加しています' }, { status: 400 });
    }

    const roomUser = await prisma.roomUser.create({
      data: {
        roomId: room.id,
        userId: userId,
      },
    });

    return NextResponse.json({ roomUser });
  } catch (error) {
    return NextResponse.json(
      { error: 'ルームユーザーの作成に失敗しました。' + error },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { roomCode, userId } = await request.json();

    // roomCodeからroomIdを取得
    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: { id: true },
    });

    if (!room) {
      return NextResponse.json({ error: 'ルームが見つかりません' }, { status: 404 });
    }

    // 参加しているかチェック
    const existingRoomUser = await prisma.roomUser.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: userId,
        },
      },
    });

    if (!existingRoomUser) {
      return NextResponse.json({ error: 'このルームに参加していません' }, { status: 404 });
    }

    const roomUser = await prisma.roomUser.delete({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: userId,
        },
      },
    });

    return NextResponse.json({ roomUser });
  } catch (error) {
    return NextResponse.json(
      { error: 'ルームユーザーの削除に失敗しました。' + error },
      { status: 500 }
    );
  }
}

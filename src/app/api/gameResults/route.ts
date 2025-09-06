import { NextRequest, NextResponse } from 'next/server';

import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { userId, roomId, gameType, scores } = await request.json();

    // バリデーション
    if (!userId || !roomId || !gameType || scores === undefined) {
      return NextResponse.json({ error: '必要なパラメータが不足しています' }, { status: 400 });
    }

    // ゲーム結果を保存
    const gameResult = await prisma.gameResults.create({
      data: {
        userId,
        roomId,
        gameType,
        scores: Number(scores),
      },
    });

    return NextResponse.json({ ok: true, gameResult });
  } catch (error) {
    console.error('ゲーム結果保存エラー:', error);
    if (error instanceof Error) {
      console.error('エラーの詳細:', error.message);
    }
    return NextResponse.json({ error: 'ゲーム結果の保存に失敗しました' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('roomId');
    const gameType = searchParams.get('gameType');

    if (!roomId || !gameType) {
      return NextResponse.json({ error: 'roomIdとgameTypeが必要です' }, { status: 400 });
    }

    // ルームのゲーム結果を取得（スコア順でソート）
    const gameResults = await prisma.gameResults.findMany({
      where: {
        roomId,
        gameType,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        scores: 'desc', // スコアの高い順
      },
    });

    return NextResponse.json({ ok: true, gameResults });
  } catch (error) {
    console.error('ゲーム結果取得エラー:', error);
    return NextResponse.json({ error: 'ゲーム結果の取得に失敗しました' }, { status: 500 });
  }
}

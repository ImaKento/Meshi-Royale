import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    console.log('ユーザー作成リクエスト受信');
    const body = await request.json();
    console.log('リクエストボディ:', body);
    const { name } = body;

    console.log('Prismaクライアント接続テスト...');
    const user = await prisma.user.create({
      data: { name },
    });
    console.log('ユーザー作成成功:', user);

    return NextResponse.json({ user });
  } catch (error) {
    console.error('ユーザー作成エラー:', error);
    if (error instanceof Error) {
      console.error('エラーの詳細:', error.message);
      console.error('エラースタック:', error.stack);
    }
    return NextResponse.json({ error: 'ユーザーの作成に失敗しました' }, { status: 500 });
  }
}

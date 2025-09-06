import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();

    const user = await prisma.user.create({
      data: { name },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error('ユーザー作成エラー:', error);
    return NextResponse.json({ error: 'ユーザーの作成に失敗しました' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const user = await prisma.user.findUnique({ where: { id: resolvedParams.id } });
  if (!user) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, item: user });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' || body.name === null ? body.name : undefined;
    const food_candidates =
      typeof body.food_candidates === 'string' || body.food_candidates === null
        ? body.food_candidates
        : undefined;

    const updated = await prisma.user.update({
      where: { id: resolvedParams.id },
      data: {
        ...(typeof name !== 'undefined' ? { name } : {}),
        ...(typeof food_candidates !== 'undefined' ? { food_candidates } : {}),
      },
    });
    return NextResponse.json({ ok: true, item: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    // User を削除すると RoomUser は schema の onDelete: Cascade で自動削除される前提
    await prisma.user.delete({ where: { id: resolvedParams.id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

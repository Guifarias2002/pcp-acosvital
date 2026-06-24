import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/middleware';
import { SETOR_CHOICES } from '@/lib/types';

export async function GET(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  return NextResponse.json(SETOR_CHOICES.map(([value, label]) => ({ value, label })));
}

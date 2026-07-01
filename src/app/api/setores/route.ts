
import { SETOR_CHOICES } from '@/lib/types';
export async function GET(req: Request) {
export const dynamic = 'force-dynamic';
import { SETOR_CHOICES } from '@/lib/types';
  const user = await autenticar(req);
export const dynamic = 'force-dynamic';
import { SETOR_CHOICES } from '@/lib/types';
  if (user instanceof NextResponse) return user;
export const dynamic = 'force-dynamic';
import { SETOR_CHOICES } from '@/lib/types';
  return NextResponse.json(SETOR_CHOICES.map(([value, label]) => ({ value, label })));
export const dynamic = 'force-dynamic';
import { SETOR_CHOICES } from '@/lib/types';
}
export const dynamic = 'force-dynamic';

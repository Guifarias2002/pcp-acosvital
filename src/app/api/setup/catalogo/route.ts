import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { autenticar } from '@/lib/middleware';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^﻿/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  const log: string[] = [];

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS producao_catalogo_material (
        id             SERIAL PRIMARY KEY,
        nome           VARCHAR(200) NOT NULL,
        descricao      TEXT,
        categoria      VARCHAR(100),
        storage_path   TEXT NOT NULL,
        nome_arquivo   VARCHAR(255),
        tamanho        INTEGER,
        mime_type      VARCHAR(100),
        criado_por_id  INTEGER REFERENCES usuarios_usuario(id) ON DELETE SET NULL,
        criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_catalogo_nome      ON producao_catalogo_material(nome);
      CREATE INDEX IF NOT EXISTS idx_catalogo_categoria ON producao_catalogo_material(categoria);
    `);
    log.push('Tabela producao_catalogo_material OK.');

    // Bucket de Storage — o upload/download de material falha silenciosamente sem isso
    if (!SERVICE_KEY || !SUPABASE_URL) {
      log.push('AVISO: SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL ausente — bucket não verificado.');
    } else {
      const bucketRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'catalogo', name: 'catalogo', public: false }),
      });
      if (bucketRes.ok) {
        log.push('Bucket "catalogo" criado.');
      } else {
        const txt = await bucketRes.text();
        if (txt.includes('already exists') || bucketRes.status === 409) {
          log.push('Bucket "catalogo" já existia.');
        } else {
          log.push(`AVISO: falha ao criar bucket "catalogo" (${bucketRes.status}): ${txt}`);
        }
      }
    }

    return NextResponse.json({ ok: true, mensagem: log.join(' ') });
  } catch (e) {
    console.error('[setup/catalogo]', e);
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}

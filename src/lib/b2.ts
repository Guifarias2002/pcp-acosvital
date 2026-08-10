// Backblaze B2 — armazenamento de arquivos (anexos de PV/OP).
// Usa a API nativa do B2 via fetch (sem SDK). A chave é restrita a UM bucket,
// então o próprio authorize devolve bucketId/bucketName/URLs — não precisa de
// endpoint nem região configurados.
import { createHash } from 'crypto';

const KEY_ID = process.env.B2_KEY_ID || '';
const APP_KEY = process.env.B2_APP_KEY || '';

/** true quando as variáveis de ambiente do B2 estão presentes. */
export const B2_CONFIGURADO = Boolean(KEY_ID && APP_KEY);

interface B2Auth {
  apiUrl: string;
  downloadUrl: string;
  authToken: string;
  bucketId: string;
  bucketName: string;
}

// Cache do authorize em memória (token vale ~24h). Some no cold start, tudo bem.
let cache: { auth: B2Auth; exp: number } | null = null;

async function authorize(): Promise<B2Auth> {
  if (cache && cache.exp > Date.now()) return cache.auth;
  if (!B2_CONFIGURADO) throw new Error('B2 não configurado (faltam B2_KEY_ID/B2_APP_KEY)');

  const cred = Buffer.from(`${KEY_ID}:${APP_KEY}`).toString('base64');
  const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${cred}` },
  });
  if (!res.ok) throw new Error(`B2 authorize ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();

  const auth: B2Auth = {
    apiUrl: data.apiUrl,
    downloadUrl: data.downloadUrl,
    authToken: data.authorizationToken,
    bucketId: data.allowed?.bucketId,
    bucketName: data.allowed?.bucketName,
  };
  if (!auth.bucketId || !auth.bucketName) {
    // Chave "master" ou com acesso a vários buckets — exigimos uma chave restrita.
    throw new Error('B2: use uma Application Key restrita a UM bucket (bucketId/bucketName ausentes)');
  }
  cache = { auth, exp: Date.now() + 23 * 60 * 60 * 1000 };
  return auth;
}

/** Envia (ou substitui) um arquivo no bucket. Lança em caso de falha. */
export async function b2Upload(fileName: string, contentType: string, bytes: ArrayBuffer): Promise<void> {
  const auth = await authorize();

  const urlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: { Authorization: auth.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId: auth.bucketId }),
  });
  if (!urlRes.ok) throw new Error(`B2 get_upload_url ${urlRes.status}: ${await urlRes.text().catch(() => '')}`);
  const { uploadUrl, authorizationToken } = await urlRes.json();

  const buf = Buffer.from(bytes);
  const sha1 = createHash('sha1').update(buf).digest('hex');

  const putRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(fileName),
      'Content-Type': contentType || 'b2/x-auto',
      'Content-Length': String(buf.length),
      'X-Bz-Content-Sha1': sha1,
    },
    body: buf,
  });
  if (!putRes.ok) throw new Error(`B2 upload ${putRes.status}: ${await putRes.text().catch(() => '')}`);
}

type B2DownloadResult =
  | { ok: true; body: ArrayBuffer; contentType: string }
  | { ok: false; status: number };

/** Baixa um arquivo do bucket (privado). */
export async function b2Download(fileName: string): Promise<B2DownloadResult> {
  const auth = await authorize();
  const res = await fetch(`${auth.downloadUrl}/file/${auth.bucketName}/${encodeURIComponent(fileName)}`, {
    headers: { Authorization: auth.authToken },
  });
  if (!res.ok) return { ok: false, status: res.status };
  return {
    ok: true,
    body: await res.arrayBuffer(),
    contentType: res.headers.get('content-type') || 'application/octet-stream',
  };
}

/** Apaga todas as versões de um arquivo. Best-effort: não lança. */
export async function b2Delete(fileName: string): Promise<void> {
  try {
    const auth = await authorize();
    const listRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_versions`, {
      method: 'POST',
      headers: { Authorization: auth.authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: auth.bucketId, startFileName: fileName, prefix: fileName, maxFileCount: 100 }),
    });
    if (!listRes.ok) return;
    const { files } = await listRes.json();
    for (const f of files || []) {
      if (f.fileName !== fileName) continue;
      await fetch(`${auth.apiUrl}/b2api/v2/b2_delete_file_version`, {
        method: 'POST',
        headers: { Authorization: auth.authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: f.fileName, fileId: f.fileId }),
      });
    }
  } catch (e) {
    console.error('[b2] delete best-effort falhou:', e);
  }
}

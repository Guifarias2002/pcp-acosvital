import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/middleware';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Backup do sistema pode demorar (dump). Timeout nativo do Next (antes vinha do
// vercel.json, cujo glob "functions" passou a quebrar o build).
export const maxDuration = 30;

const PASTA_BACKUP = 'Z:\\Ordens de Serviço - IAPP\\NOSSO SISTEMA';
const PASTA_SRC = 'C:\\pcp_next';

// Copia recursiva via Node (sem robocopy para evitar problemas de exit code)
function copiarDir(origem: string, destino: string) {
  if (!fs.existsSync(destino)) fs.mkdirSync(destino, { recursive: true });
  for (const entry of fs.readdirSync(origem, { withFileTypes: true })) {
    const src = path.join(origem, entry.name);
    const dst = path.join(destino, entry.name);
    if (entry.isDirectory()) {
      copiarDir(src, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

export async function POST(req: Request) {
  const user = await autenticar(req);
  if (user instanceof NextResponse) return user;
  if (!user.is_staff) return NextResponse.json({ erro: 'Sem permissao' }, { status: 403 });

  // Backup do código-fonte só funciona na máquina local (Windows + rede Z:)
  if (process.platform !== 'win32') {
    return NextResponse.json({
      ok: false,
      aviso: 'Backup do código-fonte disponível apenas na máquina local (Windows). No Vercel, use o repositório GitHub.',
    }, { status: 200 });
  }

  const tmpDir = path.join('C:\\Windows\\Temp', `pcp_backup_${Date.now()}`);

  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const nomeArquivo = `sistema_pcp.zip`;

    if (!fs.existsSync(PASTA_BACKUP)) {
      fs.mkdirSync(PASTA_BACKUP, { recursive: true });
    }

    const destino = path.join(PASTA_BACKUP, nomeArquivo);
    if (fs.existsSync(destino)) fs.unlinkSync(destino);

    // Cria pasta temporária e copia os arquivos importantes
    fs.mkdirSync(tmpDir, { recursive: true });

    // Pastas para copiar (exclui node_modules e .next automaticamente pelo filtro)
    for (const pasta of ['src', 'public', 'docs']) {
      const origem = path.join(PASTA_SRC, pasta);
      if (fs.existsSync(origem)) copiarDir(origem, path.join(tmpDir, pasta));
    }

    // Arquivos soltos na raiz
    for (const arq of ['package.json', 'package-lock.json', 'next.config.js', 'next.config.ts', 'tsconfig.json', '.env.local']) {
      const origem = path.join(PASTA_SRC, arq);
      if (fs.existsSync(origem)) fs.copyFileSync(origem, path.join(tmpDir, arq));
    }

    // Zippa tudo via PowerShell
    const script = `Compress-Archive -Path '${tmpDir}\\*' -DestinationPath '${destino}' -Force`;
    execSync(`powershell -NoProfile -NonInteractive -Command "${script}"`, { stdio: 'pipe' });

    // Limpa tmp
    try {
      const rm = `Remove-Item -Recurse -Force '${tmpDir}'`;
      execSync(`powershell -NoProfile -NonInteractive -Command "${rm}"`, { stdio: 'ignore' });
    } catch { /* ignorar erro de limpeza */ }

    let tamanhoMB = '?';
    try { tamanhoMB = (fs.statSync(destino).size / 1024 / 1024).toFixed(1); } catch { /* ignore */ }

    return NextResponse.json({
      ok: true,
      caminho: destino,
      nome: nomeArquivo,
      tamanho_mb: tamanhoMB,
    });
  } catch (e) {
    // Tenta limpar tmp mesmo em caso de erro
    try {
      if (fs.existsSync(tmpDir)) {
        execSync(`powershell -NoProfile -NonInteractive -Command "Remove-Item -Recurse -Force '${tmpDir}'"`, { stdio: 'ignore' });
      }
    } catch { /* ignore */ }
    console.error('[backup/sistema]', e);
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}

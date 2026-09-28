# PCP AcosVital — Guia de Instalação para o TI

## ⚠️ Atualização (28/09/2026) — Situação Atual

Este guia descreve a instalação **definitiva** no servidor próprio do TI (ainda não executada).
Até lá o sistema roda na **Vercel** (nuvem, plano limitado):

- **Link principal:** `https://pcp-acosvital.vercel.app` (voltou a responder após a pausa de 04/08).
- **Link de contorno:** `https://sistemapcp-nine.vercel.app` (ainda no ar; mesmo banco).
- O **banco de dados é o mesmo** nos dois links — tudo que é feito é real.
- **Anexos (desenhos/fotos/OPs)** ficam no **Backblaze B2** desde 31/08/2026 (o Supabase Storage
  bateu o limite de egress e retornava 402).
- Mudanças do período 17/08–28/09 (Planejamento da Usinagem, Caldeiraria HRM, PCP Caldeiraria,
  Análise PCP, flags de acesso, migrações M40–M57): ver
  `docs/Atualizacoes_Sistema_2026-08-17_a_2026-09-28.html`.
- **Isso é temporário.** A solução definitiva continua sendo o TI provisionar o próprio
  servidor seguindo as instruções abaixo — ver também `docs/dossie_ti.html`.

## Requisitos

- Node.js 18 LTS ou superior
- Acesso ao banco PostgreSQL (Supabase)
- Servidor Windows com acesso à pasta de rede `Z:\Ordens de Serviço - IAPP\`

## Instalação

1. Descompacte o arquivo `sistema_pcp.zip`
2. Abra o terminal na pasta descompactada
3. Instale as dependências:
   ```
   npm install
   ```
4. Crie o arquivo `.env.local` na raiz (modelo em `.env.example`):
   ```
   DB_HOST=...            (pooler do Supabase)
   DB_PORT=6543
   DB_NAME=postgres
   DB_USER=...
   DB_PASSWORD=...
   JWT_SECRET=gerar com: openssl rand -hex 32
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   B2_KEY_ID=...          (Backblaze B2 — anexos)
   B2_APP_KEY=...
   CRON_SECRET=...        (backup agendado)
   NEXT_PUBLIC_APP_URL=https://...
   NODE_ENV=production
   ```
5. Compile para produção:
   ```
   npm run build
   ```
6. Inicie o sistema:
   ```
   npm start
   ```
   O sistema estará disponível em `http://localhost:3000`

7. Para manter rodando em background (recomendado):
   ```
   npm install -g pm2
   pm2 start npm --name "pcp" -- start
   pm2 save
   pm2 startup
   ```

## Configuração do Banco

As tabelas e colunas são criadas **automaticamente** na primeira requisição
(`src/lib/migrations.ts`, controlado por `SCHEMA_VERSION` — hoje **59**, migração mais recente M57).
Ao adicionar coluna nova, **sempre** incremente `SCHEMA_VERSION`, senão o login pode cair.

Hardening opcional (logado como admin):
- Acesse o menu **Sistema → Configurar Banco de Dados**
- Execute os 4 scripts na ordem (todos são idempotentes)

## HTTPS (Obrigatório em Produção)

Configure nginx ou IIS na frente do Next.js (porta 3000) com certificado TLS.

## Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|-------------|
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | Conexão PostgreSQL (pooler Supabase) | Sim |
| `JWT_SECRET` | Chave JWT (mín. 32 chars) | Sim |
| `NODE_ENV` | Deve ser `production` em prod | Sim |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Projeto Supabase (realtime/storage legado) | Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço Supabase | Sim |
| `B2_KEY_ID` / `B2_APP_KEY` | Backblaze B2 — desenhos, fotos, OPs | Para anexos |
| `CRON_SECRET` | Autentica `/api/cron/backup` | Para backup |
| `NEXT_PUBLIC_APP_URL` | URL pública do app | Para backup manual |

## Flags de acesso por usuário

Colunas em `usuarios_usuario` (o usuário precisa **sair e entrar de novo** após mudar):
`somente_leitura`, `pode_ver_analise`, `acesso_hrm`, `acesso_conferencia_hrm`,
`acesso_planejamento`, `pode_definir_previsao`, `pode_ver_nao_localizados`,
`pode_desfazer_recebimento`. Detalhe de cada uma no documento de atualizações.

## Backup

**Situação em 28/09/2026:**

- **Automático (nuvem):** cron da Vercel às 00h e 17h (`vercel.json`) grava um snapshot de 4 tabelas
  no Supabase Storage. ⚠️ **Parado desde 16/09/2026** (último: `2026-09-16_1700`) — e não é backup
  completo. Recomendação: mover o destino para o Backblaze B2 e incluir todas as tabelas.
- **Cópia local (pasta de rede):** tarefas agendadas "PCP - Sincronizar Backup" (08:00 e 17:30) rodam
  `scripts/sync-backup-local.ps1` → `\\server\REDE\Ordens de Serviço - IAPP\BACKUPS`. A pasta
  fica inacessível em muitos dias (ver `scripts/backup-sync.log`).
- **Manual completo (confiável):** `Desktop\BACKUPS_PCP` na máquina do Guilherme — banco inteiro (JSON),
  esquema (.sql) e código (.tar.gz). Último: **28/09/2026** (36 tabelas / 42.993 linhas).

## Suporte

Em caso de dúvidas técnicas, consulte o dossiê completo em `docs/dossie_ti.html`.

---

**Stack:** Next.js 14 · TypeScript · PostgreSQL · JWT HS256 · Backblaze B2 · Supabase

_Atualizado em 28/09/2026._

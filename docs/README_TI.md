# PCP AcosVital — Guia de Instalação para o TI

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
4. Crie o arquivo `.env.local` na raiz com as variáveis:
   ```
   DATABASE_URL=postgresql://...
   JWT_SECRET=gerar com: openssl rand -hex 32
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJ...
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

Após iniciar, logue como admin e execute o hardening do banco:
- Acesse o menu **Sistema → Configurar Banco de Dados**
- Execute os 4 scripts na ordem (todos são idempotentes)

## HTTPS (Obrigatório em Produção)

Configure nginx ou IIS na frente do Next.js (porta 3000) com certificado TLS.

## Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|-------------|
| `DATABASE_URL` | String de conexão PostgreSQL | Sim |
| `JWT_SECRET` | Chave JWT (mín. 32 chars) | Sim |
| `NODE_ENV` | Deve ser `production` em prod | Sim |
| `SUPABASE_URL` | URL do projeto Supabase | Para upload |
| `SUPABASE_SERVICE_KEY` | Chave de serviço Supabase | Para upload |

## Backup

O sistema faz backup automático pela interface:
- **Backup Diário** (Excel): `Z:\Ordens de Serviço - IAPP\NOSSO SISTEMA\backup_diario.xlsx`
- **Backup do Código** (ZIP): `Z:\Ordens de Serviço - IAPP\NOSSO SISTEMA\sistema_pcp.zip`

## Suporte

Em caso de dúvidas técnicas, consulte o dossiê completo em `docs/dossie_ti.html`.

---

**Stack:** Next.js 14 · TypeScript · PostgreSQL · JWT HS256 · Supabase Storage

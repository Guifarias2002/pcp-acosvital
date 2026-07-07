<#
  Sincroniza o backup do Sistema PCP (gerado na nuvem as 00h e 17h,
  horario de Brasilia) para uma pasta de rede local.

  Como funciona:
    1. O backup em si roda na nuvem (Vercel), automaticamente, 2x por dia.
    2. Este script roda NA SUA MAQUINA (via Agendador de Tarefas do Windows),
       busca o backup mais recente e salva uma copia na pasta de rede.
    3. So funciona enquanto o computador estiver ligado e a rede acessivel.

  Configuracao necessaria (uma vez so):
    1. Copie "backup-sync.secret.example" para "backup-sync.secret" (mesma pasta
       deste script) e cole dentro o valor de CRON_SECRET (Vercel > Settings >
       Environment Variables). NUNCA coloque esse valor direto neste .ps1.
    2. Ajuste $PastaDestino abaixo se o caminho da pasta mudar.
    3. Agende este script no Agendador de Tarefas do Windows (Task Scheduler)
       2x por dia, por exemplo as 08:00 e as 17:30 (task "PCP - Sincronizar
       Backup" e "PCP - Sincronizar Backup 17h" ja configuradas).

  Uso manual (para testar):
    powershell -ExecutionPolicy Bypass -File .\sync-backup-local.ps1
#>

$ErrorActionPreference = 'Stop'

# ── Configuracao ──────────────────────────────────────────────────────────
$BaseUrl       = 'https://sistemapcp-nine.vercel.app'
# Caminho de rede completo (nao a letra Z:) - tarefas agendadas nem sempre
# enxergam drives mapeados, principalmente sem sessao interativa aberta.
$PastaDestino  = '\\server\REDE\Ordens de Serviço - IAPP\BACKUPS'
$ArquivoSecret = Join-Path $PSScriptRoot 'backup-sync.secret'
$ArquivoLog    = Join-Path $PSScriptRoot 'backup-sync.log'

function Escrever-Log($mensagem) {
    $linha = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $mensagem"
    Write-Host $linha
    Add-Content -Path $ArquivoLog -Value $linha
}

try {
    if (-not (Test-Path $ArquivoSecret)) {
        throw "Arquivo de segredo nao encontrado: $ArquivoSecret (veja as instrucoes no topo deste script)"
    }
    $secret = (Get-Content $ArquivoSecret -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($secret)) {
        throw "Arquivo de segredo esta vazio: $ArquivoSecret"
    }

    if (-not (Test-Path $PastaDestino)) {
        throw "Pasta de destino nao acessivel: $PastaDestino (o drive Z:\ esta mapeado?)"
    }

    $headers = @{ Authorization = "Bearer $secret" }

    Escrever-Log "Buscando lista de backups em $BaseUrl..."
    $resposta = Invoke-RestMethod -Uri "$BaseUrl/api/cron/backup/list" -Headers $headers -Method Get -TimeoutSec 30

    if (-not $resposta.arquivos -or $resposta.arquivos.Count -eq 0) {
        throw "Nenhum backup encontrado no servidor."
    }

    $maisRecente = $resposta.arquivos[0]
    $nomeArquivoLocal = "$($maisRecente.data).json"
    $caminhoLocal = Join-Path $PastaDestino $nomeArquivoLocal

    if (Test-Path $caminhoLocal) {
        Escrever-Log "Backup de $($maisRecente.data) ja existe em $caminhoLocal - nada a fazer."
        exit 0
    }

    Escrever-Log "Baixando backup de $($maisRecente.data)..."
    $urlDownload = "$BaseUrl$($maisRecente.url)"
    Invoke-WebRequest -Uri $urlDownload -Headers $headers -OutFile $caminhoLocal -TimeoutSec 60

    $tamanho = (Get-Item $caminhoLocal).Length
    if ($tamanho -eq 0) {
        Remove-Item $caminhoLocal -Force
        throw "Arquivo baixado ficou vazio (0 bytes) - removido. Backup NAO foi copiado."
    }

    Escrever-Log "OK - backup de $($maisRecente.data) salvo em $caminhoLocal ($tamanho bytes)."
}
catch {
    Escrever-Log "FALHA: $($_.Exception.Message)"
    exit 1
}

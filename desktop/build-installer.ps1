# =====================================================================
#  Giropeças Offline — Gerador do instalador Windows
#  Execute este script NO WINDOWS, dentro da pasta "desktop" do projeto:
#
#      powershell -ExecutionPolicy Bypass -File .\build-installer.ps1
#
#  Resultado: desktop\dist\Giropecas-Setup-1.0.0.exe
#  (copie para o pendrive e instale em qualquer máquina Windows)
# =====================================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Giropeças Offline — build do instalador ===" -ForegroundColor Cyan
Write-Host ""

# 1. Verifica Node.js
try {
    $nodeVersion = node --version
    Write-Host "[1/4] Node.js encontrado: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERRO] Node.js não encontrado." -ForegroundColor Red
    Write-Host "Instale o Node.js LTS em: https://nodejs.org/pt-br (baixe o instalador .msi, clique em avançar até o fim) e rode este script de novo."
    exit 1
}

# 2. Garante que estamos na pasta certa
if (-not (Test-Path ".\package.json") -or -not (Test-Path "..\offline-app\index.html")) {
    Write-Host "[ERRO] Execute este script de dentro da pasta 'desktop' do projeto Giropecas." -ForegroundColor Red
    exit 1
}

# Se sua rede bloquear downloads do github.com, descomente as 2 linhas abaixo
# para baixar o Electron por um espelho alternativo:
# $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
# $env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

# 3. Instala dependências (Electron + electron-builder)
Write-Host "[2/4] Instalando dependências (pode demorar alguns minutos na primeira vez)..." -ForegroundColor Cyan
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Write-Host "[ERRO] npm install falhou." -ForegroundColor Red; exit 1 }

# 4. Gera o instalador
Write-Host "[3/4] Gerando o instalador (NSIS)..." -ForegroundColor Cyan
npm run dist
if ($LASTEXITCODE -ne 0) { Write-Host "[ERRO] Build do instalador falhou." -ForegroundColor Red; exit 1 }

# 5. Mostra o resultado
$setup = Get-ChildItem ".\dist\Giropecas-Setup-*.exe" | Select-Object -First 1
if ($setup) {
    Write-Host ""
    Write-Host "[4/4] Instalador gerado com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "    $($setup.FullName)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Copie esse arquivo para o pendrive. Na máquina do cliente, dê dois"
    Write-Host "cliques para instalar. Ao abrir pela primeira vez, o aplicativo vai"
    Write-Host "pedir a CHAVE DE ACESSO — gere-a no seu painel Admin Provedor."
    Invoke-Item ".\dist"
} else {
    Write-Host "[AVISO] Build terminou mas o .exe não foi encontrado em .\dist" -ForegroundColor Yellow
}

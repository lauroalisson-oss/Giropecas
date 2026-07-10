# =====================================================================
#  Giropecas Offline - Gerador do instalador Windows
#  Execute NO WINDOWS, dentro da pasta "desktop" do projeto:
#
#      powershell -ExecutionPolicy Bypass -File .\build-installer.ps1
#
#  Resultado: desktop\dist\Giropecas-Setup-1.0.0.exe
#  (copie para o pendrive e instale em qualquer maquina Windows)
# =====================================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Giropecas Offline - build do instalador ===" -ForegroundColor Cyan
Write-Host ""

# Se sua rede corporativa bloquear downloads do github.com, remova o "#"
# das duas linhas abaixo para usar um espelho:
# $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
# $env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

# 1. Verifica Node.js
$nodeVersion = ""
try { $nodeVersion = (& node --version) 2>$null } catch { }
if ([string]::IsNullOrEmpty($nodeVersion)) {
    Write-Host "[ERRO] Node.js nao encontrado." -ForegroundColor Red
    Write-Host "Instale o Node.js LTS em https://nodejs.org/pt-br (arquivo .msi) e rode este script de novo."
    exit 1
}
Write-Host "[1/4] Node.js encontrado: $nodeVersion" -ForegroundColor Green

# 2. Garante que estamos na pasta certa
if (-not (Test-Path ".\package.json") -or -not (Test-Path "..\offline-app\index.html")) {
    Write-Host "[ERRO] Execute este script dentro da pasta 'desktop' do projeto Giropecas." -ForegroundColor Red
    exit 1
}

# 3. Instala dependencias
Write-Host "[2/4] Instalando dependencias (a primeira vez demora alguns minutos)..." -ForegroundColor Cyan
& npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] npm install falhou." -ForegroundColor Red
    exit 1
}

# 4. Gera o instalador
Write-Host "[3/4] Gerando o instalador (NSIS)..." -ForegroundColor Cyan
& npm run dist
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] Build do instalador falhou." -ForegroundColor Red
    exit 1
}

# 5. Mostra o resultado
$setup = Get-ChildItem ".\dist\Giropecas-Setup-*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($setup) {
    Write-Host ""
    Write-Host "[4/4] Instalador gerado com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "    $($setup.FullName)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Copie esse .exe para o pendrive. Na maquina do cliente, de dois"
    Write-Host "cliques para instalar. Ao abrir pela primeira vez, o aplicativo"
    Write-Host "vai pedir a CHAVE DE ACESSO - gere no seu painel Admin Provedor."
    Invoke-Item ".\dist"
    exit 0
}

Write-Host "[AVISO] Build terminou mas o .exe nao foi encontrado em .\dist" -ForegroundColor Yellow
exit 1

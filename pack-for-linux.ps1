#!/usr/bin/env pwsh
# ============================================================
# pack-for-linux.ps1
# Genera un paquete .tar.gz LIMPIO listo para USB → Linux Mint.
# Excluye node_modules, dist, .git y archivos locales de Windows
# que romperían el despliegue en Linux.
# ============================================================

$ErrorActionPreference = "Stop"
$repo = $PSScriptRoot

$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$outName   = "pos-fenix-$timestamp.tar.gz"
$outPath   = Join-Path $env:USERPROFILE "Desktop\$outName"

Write-Host "==> Empaquetando POS Fenix para Linux..." -ForegroundColor Cyan
Write-Host "    Origen : $repo"
Write-Host "    Destino: $outPath"
Write-Host ""

# Verificar que tar nativo está disponible (Windows 10+ lo trae)
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: tar no está disponible. Necesitas Windows 10 1803+ o instala git-bash." -ForegroundColor Red
    exit 1
}

# Lista de exclusiones — patrones tar
$excludes = @(
    "--exclude=node_modules",
    "--exclude=*/node_modules",
    "--exclude=dist",
    "--exclude=*/dist",
    "--exclude=.git",
    "--exclude=.claude/worktrees",
    "--exclude=*.log",
    "--exclude=Thumbs.db",
    "--exclude=desktop.ini",
    "--exclude=.DS_Store",
    "--exclude=*.tar.gz",
    "--exclude=*.zip",
    "--exclude=*.7z",
    "--exclude=build_*.mjs",
    "--exclude=build_*.js",
    "--exclude=apps/backend/.env",
    "--exclude=apps/*/.env.production.local"
)

# Cambiar al padre del repo para que el tarball contenga la carpeta raíz
$parent  = Split-Path $repo -Parent
$rootDir = Split-Path $repo -Leaf

Push-Location $parent
try {
    $args = @("-czf", $outPath) + $excludes + @($rootDir)
    & tar @args
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: tar falló con código $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

$sizeMB = [math]::Round((Get-Item $outPath).Length / 1MB, 2)

Write-Host ""
Write-Host "==> Paquete creado correctamente" -ForegroundColor Green
Write-Host "    Archivo: $outPath"
Write-Host "    Tamaño : $sizeMB MB"
Write-Host ""
Write-Host "Pasos en el servidor Linux Mint:" -ForegroundColor Yellow
Write-Host "  1. Copiar el .tar.gz por USB al servidor"
Write-Host "  2. tar -xzf $outName"
Write-Host "  3. cd $rootDir"
Write-Host "  4. chmod +x install-linux-24x7-autostart.sh deploy.sh"
Write-Host "  5a. Primera instalación: ./install-linux-24x7-autostart.sh"
Write-Host "  5b. Actualización rápida: ./deploy.sh"
Write-Host ""

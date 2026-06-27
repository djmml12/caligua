#!/bin/bash
# ============================================================
# git-update.sh
# Actualiza el servidor desde GitHub y redespliega.
# Uso: ./git-update.sh
#
# Seguridad:
#   - Nunca toca PostgreSQL ni .env
#   - Solo hace git pull + deploy.sh
#   - Si git pull falla, NO ejecuta deploy
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
step() { echo -e "\n${BOLD}${CYAN}== $*${NC}"; }
die()  { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v git >/dev/null 2>&1 || die "git no está instalado. Ejecuta: sudo apt install git"

[[ -d "$REPO_DIR/.git" ]] || die "Este directorio no es un repositorio git. Clona el repo primero."

[[ -f "$REPO_DIR/apps/backend/.env" ]] || die "Falta apps/backend/.env — el .env no se sube a git, cópialo manualmente al servidor."

step "Obteniendo cambios de GitHub"
cd "$REPO_DIR"
git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u} 2>/dev/null) || die "No hay rama remota configurada. Ejecuta: git branch --set-upstream-to=origin/main main"

if [[ "$LOCAL" == "$REMOTE" ]]; then
  warn "Ya estás en la versión más reciente. Sin cambios que aplicar."
  exit 0
fi

echo "Commits nuevos:"
git log HEAD..@{u} --oneline
echo ""

git pull --ff-only || die "git pull falló. Resuelve conflictos manualmente antes de continuar."
ok "Código actualizado."

step "Ejecutando deploy"
bash "$REPO_DIR/deploy.sh"

#!/bin/bash
# ============================================================
# deploy.sh
# Actualización rápida tras un cambio de código:
#   - Reinstala dependencias (idempotente)
#   - Recompila pos-tablet y pos-mobile
#   - Republica los assets en /var/www/pos-fenix/{tablet,mobile}
#   - Reinicia el backend systemd
#   - Recarga nginx
#
# NO toca PostgreSQL, .env, datos ni configuración del sistema.
# Para la PRIMERA instalación usa install-linux-24x7-autostart.sh
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
step() { echo -e "\n${BOLD}${CYAN}== $*${NC}"; }
die()  { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/pos-fenix}"
WEB_ROOT_TABLET="${WEB_ROOT}/tablet"
WEB_ROOT_MOBILE="${WEB_ROOT}/mobile"
BACKEND_SERVICE_NAME="${BACKEND_SERVICE_NAME:-pos-fenix-backend}"
APP_USER="${APP_USER:-${SUDO_USER:-$USER}}"
APP_GROUP="${APP_GROUP:-$(id -gn "$APP_USER" 2>/dev/null || echo "$APP_USER")}"

command -v node >/dev/null 2>&1 || die "Node no está instalado. Ejecuta install-linux-24x7-autostart.sh primero."
command -v npm  >/dev/null 2>&1 || die "npm no está instalado."
[[ -d "$WEB_ROOT" ]] || die "$WEB_ROOT no existe. Ejecuta install-linux-24x7-autostart.sh primero."
[[ -f "$REPO_DIR/apps/backend/.env" ]] || die "Falta apps/backend/.env. Ejecuta install-linux-24x7-autostart.sh primero."

# ── 1. Limpiar artefactos de Windows que vinieron en el zip ──────────────
step "Limpiando artefactos de Windows"
# Si node_modules tiene binarios win32 mezclados, mejor borrar y reinstalar
if [[ -d "$REPO_DIR/node_modules" ]] && find "$REPO_DIR/node_modules" -maxdepth 4 -name "*win32*" -print -quit 2>/dev/null | grep -q .; then
  warn "Detectados binarios win32 en node_modules. Borrando para reinstalación limpia..."
  rm -rf "$REPO_DIR/node_modules"
  rm -rf "$REPO_DIR"/apps/*/node_modules
  rm -rf "$REPO_DIR"/packages/*/node_modules
fi

# Borrar cualquier dist viejo (queremos build fresco)
rm -rf "$REPO_DIR/apps/pos-tablet/dist" "$REPO_DIR/apps/pos-mobile/dist"

# Restaurar permisos del repo si root tocó algo en pasadas previas
sudo chown -R "$APP_USER:$APP_GROUP" "$REPO_DIR" 2>/dev/null || true

ok "Estado limpio."

# ── 2. Convertir CRLF → LF en archivos críticos ──────────────────────────
step "Normalizando line endings"
if command -v dos2unix >/dev/null 2>&1; then
  find "$REPO_DIR" \
    -path "*/node_modules" -prune -o \
    -path "*/dist" -prune -o \
    -type f \( -name "*.sh" -o -name "*.js" -o -name "*.mjs" -o -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.css" \) \
    -exec dos2unix -q {} + 2>/dev/null || true
  ok "CRLF→LF aplicado con dos2unix."
else
  # Fallback con sed (más lento)
  find "$REPO_DIR" \
    -path "*/node_modules" -prune -o \
    -path "*/dist" -prune -o \
    -type f \( -name "*.sh" -o -name "*.js" -o -name "*.mjs" -o -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.css" \) \
    -print 2>/dev/null | while read -r f; do
      if grep -q $'\r' "$f" 2>/dev/null; then
        sed -i 's/\r$//' "$f"
      fi
    done
  ok "CRLF→LF aplicado con sed."
fi

# ── 3. Asegurar bit ejecutable en scripts del repo ───────────────────────
chmod +x "$REPO_DIR/install-linux-24x7-autostart.sh" "$REPO_DIR/deploy.sh" 2>/dev/null || true

# ── 4. npm install ───────────────────────────────────────────────────────
step "Instalando dependencias npm"
(
  cd "$REPO_DIR"
  npm install \
    --workspace packages/ui-kit \
    --workspace packages/types \
    --workspace packages/api-client \
    --workspace packages/auth \
    --workspace packages/pos-core \
    --workspace apps/backend \
    --workspace apps/pos-tablet \
    --workspace apps/pos-mobile \
    --include-workspace-root
)
# Restaurar +x en binarios de node_modules (NTFS los pierde, pero aquí venimos de npm install nativo, no debería pasar; lo dejamos por seguridad)
find "$REPO_DIR" -path "*/node_modules/.bin/*" -not -type d -exec chmod +x {} + 2>/dev/null || true
ok "Dependencias listas."

# ── 5. Build pos-tablet ──────────────────────────────────────────────────
step "Compilando pos-tablet"
(cd "$REPO_DIR" && npm run build --workspace=apps/pos-tablet)
[[ -f "$REPO_DIR/apps/pos-tablet/dist/index.html" ]] || die "Build de pos-tablet no produjo dist/index.html"
ok "pos-tablet compilado."

# ── 6. Build pos-mobile ──────────────────────────────────────────────────
step "Compilando pos-mobile"
(cd "$REPO_DIR/apps/pos-mobile" && npx tsc -b --noEmit 2>&1 || true)
(cd "$REPO_DIR/apps/pos-mobile" && BASE_PATH=/mobile/ npx vite build)
[[ -f "$REPO_DIR/apps/pos-mobile/dist/index.html" ]] || die "Build de pos-mobile no produjo dist/index.html"
grep -q '"/mobile/' "$REPO_DIR/apps/pos-mobile/dist/index.html" || die "pos-mobile no aplicó BASE_PATH=/mobile/"
ok "pos-mobile compilado."

# ── 7. Publicar en nginx ─────────────────────────────────────────────────
step "Desplegando en $WEB_ROOT"
sudo rm -rf "$WEB_ROOT_TABLET" "$WEB_ROOT_MOBILE"
sudo mkdir -p "$WEB_ROOT_TABLET" "$WEB_ROOT_MOBILE"
sudo cp -a "$REPO_DIR/apps/pos-tablet/dist/." "$WEB_ROOT_TABLET/"
sudo cp -a "$REPO_DIR/apps/pos-mobile/dist/."  "$WEB_ROOT_MOBILE/"
sudo chown -R root:root "$WEB_ROOT"
sudo find "$WEB_ROOT" -type d -exec chmod 755 {} \;
sudo find "$WEB_ROOT" -type f -exec chmod 644 {} \;
ok "Frontends publicados."

# ── 8. Reiniciar servicios ───────────────────────────────────────────────
step "Reiniciando backend y nginx"
sudo systemctl restart "$BACKEND_SERVICE_NAME"
sudo systemctl reload nginx
ok "Servicios recargados."

# ── 9. Smoke test ────────────────────────────────────────────────────────
step "Verificación rápida"
sleep 3
PUBLIC_PORT="${PUBLIC_PORT:-80}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
curl -sf --max-time 10 "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null \
  || die "Backend no responde en :${BACKEND_PORT}"
curl -sf --max-time 10 "http://127.0.0.1:${PUBLIC_PORT}/" >/dev/null \
  || die "Frontend tablet no responde"
curl -sf --max-time 10 "http://127.0.0.1:${PUBLIC_PORT}/mobile/" >/dev/null \
  || die "Frontend mobile no responde"
ok "Backend y frontends responden."

echo ""
echo -e "${BOLD}${GREEN}Despliegue completado.${NC}"
echo "Si no ves los cambios en el navegador: Ctrl+Shift+R (recarga forzada sin caché)."
echo ""

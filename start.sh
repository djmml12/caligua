#!/usr/bin/env bash
# Lanza Fénix POS localmente en modo desarrollo.
# Uso: ./start.sh [tablet|mobile|all]  (default: all)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-all}"

# ── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── 1. Node ──────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  error "Node.js no encontrado. Instálalo desde https://nodejs.org"
  exit 1
fi
ok "Node $(node -v)"

# ── 2. PostgreSQL ─────────────────────────────────────────────────────────────
# Carga .env del backend para leer las credenciales
ENV_FILE="$ROOT/apps/backend/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  error ".env no encontrado en $ENV_FILE"
  error "Copia apps/backend/.env.example o crea el archivo con PG_HOST, PG_USER, PG_PASSWORD, PG_DATABASE"
  exit 1
fi

# Parsea variables sin hacer source (evita ejecutar código arbitrario)
pg_host=$(grep -E '^PG_HOST=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || echo "localhost")
pg_port=$(grep -E '^PG_PORT=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || echo "5432")
pg_user=$(grep -E '^PG_USER=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || echo "postgres")
pg_db=$(grep   -E '^PG_DATABASE=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || echo "pos")
pg_pass=$(grep -E '^PG_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || echo "")

info "Verificando PostgreSQL en $pg_host:$pg_port..."

# Comprueba si el proceso postgres está corriendo
if ! pg_isready -h "$pg_host" -p "$pg_port" -q 2>/dev/null; then
  warn "pg_isready falló — intentando iniciar PostgreSQL..."

  # Intenta iniciar el servicio (puede requerir sudo)
  if systemctl is-enabled postgresql &>/dev/null 2>&1; then
    sudo systemctl start postgresql || true
  elif command -v pg_ctlcluster &>/dev/null; then
    # Detecta la versión activa y el cluster
    PG_VER=$(pg_lsclusters -h | awk 'NR==1{print $1}')
    PG_CLS=$(pg_lsclusters -h | awk 'NR==1{print $2}')
    sudo pg_ctlcluster "$PG_VER" "$PG_CLS" start || true
  fi

  # Segunda comprobación
  if ! pg_isready -h "$pg_host" -p "$pg_port" -q 2>/dev/null; then
    error "PostgreSQL no responde en $pg_host:$pg_port."
    error "Inicialo manualmente: sudo systemctl start postgresql"
    exit 1
  fi
fi
ok "PostgreSQL activo en $pg_host:$pg_port"

# ── 3. Base de datos ─────────────────────────────────────────────────────────
export PGPASSWORD="$pg_pass"

# Crea la base de datos si no existe
if ! psql -h "$pg_host" -p "$pg_port" -U "$pg_user" -lqt 2>/dev/null \
     | cut -d\| -f1 | grep -qw "$pg_db"; then
  info "Base de datos '$pg_db' no existe — creando..."
  createdb -h "$pg_host" -p "$pg_port" -U "$pg_user" "$pg_db" \
    && ok "Base de datos '$pg_db' creada"
else
  ok "Base de datos '$pg_db' existe"
fi

# Inicializa esquema (init-db es idempotente: usa CREATE TABLE IF NOT EXISTS)
info "Inicializando esquema (idempotente)..."
cd "$ROOT"
npm run init-db --workspace=apps/backend
ok "Esquema listo"

# ── 4. Dependencias ───────────────────────────────────────────────────────────
if [[ ! -d "$ROOT/node_modules" ]]; then
  info "node_modules no encontrado — ejecutando npm install..."
  npm install
  ok "Dependencias instaladas"
else
  ok "node_modules presente"
fi

# ── 5. Lanzar ────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Fénix POS — Modo: $MODE${NC}"
case "$MODE" in
  tablet)
    echo -e "  Backend  → http://localhost:3000"
    echo -e "  Tablet   → http://localhost:5173"
    ;;
  mobile)
    echo -e "  Backend  → http://localhost:3000"
    echo -e "  Mobile   → http://localhost:5174"
    ;;
  *)
    echo -e "  Backend  → http://localhost:3000"
    echo -e "  Tablet   → http://localhost:5173"
    echo -e "  Mobile   → http://localhost:5174"
    ;;
esac
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

case "$MODE" in
  tablet) npm run dev:tablet ;;
  mobile) npm run dev:mobile ;;
  *)      npm run dev        ;;
esac

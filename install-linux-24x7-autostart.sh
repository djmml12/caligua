#!/bin/bash
set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
step() { echo -e "\n${BOLD}${CYAN}== $*${NC}"; }
die()  { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_USER="${APP_USER:-${SUDO_USER:-$USER}}"
APP_GROUP="${APP_GROUP:-$(id -gn "$APP_USER" 2>/dev/null || echo "$APP_USER")}"
DB_NAME="${DB_NAME:-pos}"
DB_USER="${DB_USER:-pos_user}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_PORT="${DB_PORT:-5432}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
PUBLIC_PORT="${PUBLIC_PORT:-80}"
TZ_INPUT="${TZ_INPUT:-America/Guatemala}"
JWT_SECRET="${JWT_SECRET:-}"
ADMIN_NAME="${ADMIN_NAME:-Admin}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@pos.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
WEB_ROOT="${WEB_ROOT:-/var/www/pos-fenix}"
SITE_NAME="${SITE_NAME:-pos-fenix}"
BACKEND_SERVICE_NAME="${BACKEND_SERVICE_NAME:-pos-fenix-backend}"
HEALTHCHECK_SERVICE_NAME="${HEALTHCHECK_SERVICE_NAME:-pos-fenix-healthcheck}"
HEALTHCHECK_TIMER_NAME="${HEALTHCHECK_TIMER_NAME:-pos-fenix-healthcheck}"
STABILITY_SERVICE_NAME="${STABILITY_SERVICE_NAME:-pos-fenix-stability}"
HEALTHCHECK_SCRIPT_PATH="/usr/local/bin/pos-fenix-healthcheck.sh"
STABILITY_SCRIPT_PATH="/usr/local/sbin/pos-fenix-stability-apply.sh"
SKIP_DB="${SKIP_DB:-0}"
BACKEND_ENV_FILE="$REPO_DIR/apps/backend/.env"
FRONTEND_ENV_FILE="$REPO_DIR/apps/pos-tablet/.env.production.local"
FRONTEND_ENV_FILE_MOBILE="$REPO_DIR/apps/pos-mobile/.env.production.local"
WEB_ROOT_TABLET="${WEB_ROOT}/tablet"
WEB_ROOT_MOBILE="${WEB_ROOT}/mobile"
BACKEND_SERVICE_FILE="/etc/systemd/system/${BACKEND_SERVICE_NAME}.service"
HEALTHCHECK_SERVICE_FILE="/etc/systemd/system/${HEALTHCHECK_SERVICE_NAME}.service"
HEALTHCHECK_TIMER_FILE="/etc/systemd/system/${HEALTHCHECK_TIMER_NAME}.timer"
STABILITY_SERVICE_FILE="/etc/systemd/system/${STABILITY_SERVICE_NAME}.service"
NGINX_SITE_FILE="/etc/nginx/sites-available/${SITE_NAME}.conf"
NGINX_SITE_LINK="/etc/nginx/sites-enabled/${SITE_NAME}.conf"
TEMP_DIR="$(mktemp -d)"
GRUB_UPDATED=0

cleanup() {
  if [[ -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}

trap cleanup EXIT

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

require_non_root_direct() {
  if [[ "${EUID:-$(id -u)}" -eq 0 && -z "${SUDO_USER:-}" ]]; then
    die "Ejecuta este script como tu usuario normal, no directamente como root."
  fi
}

require_sudo() {
  command_exists sudo || die "sudo es requerido."
  if ! sudo -n true 2>/dev/null; then
    info "Se requieren permisos de administrador. Ingresa tu contraseña si se solicita."
    sudo -v
  fi
}

ensure_supported_os() {
  if [[ -r /etc/os-release ]] && ! grep -qiE 'mint|ubuntu|debian' /etc/os-release; then
    warn "Este script fue pensado para Linux Mint, Ubuntu o Debian."
  fi
}

backup_file_once() {
  local target="$1"
  local backup="${target}.bak-pos24x7"

  if sudo test -e "$target" && ! sudo test -e "$backup"; then
    sudo cp -a "$target" "$backup"
    info "Respaldo creado: $backup"
  fi
}

write_root_file() {
  local target="$1"
  local mode="$2"
  local tmp_file
  tmp_file="$TEMP_DIR/$(basename "$target").tmp"

  cat > "$tmp_file"

  if sudo test -e "$target"; then
    backup_file_once "$target"
    if sudo cmp -s "$tmp_file" "$target"; then
      info "Sin cambios en $target"
      return
    fi
  fi

  sudo install -D -m "$mode" "$tmp_file" "$target"
  ok "Archivo actualizado: $target"
}

prompt_values() {
  if [[ "$SKIP_DB" == "1" ]]; then
    # Sin BD: solo necesitamos JWT_SECRET y leer el .env existente para DB_PASSWORD
    if [[ -z "$JWT_SECRET" ]]; then
      JWT_SECRET="$(openssl rand -hex 32 2>/dev/null || tr -dc 'a-f0-9' < /dev/urandom | head -c 64)"
    fi
    # Si ya existe un .env, extraer DB_PASSWORD para que el backend arranque
    if [[ -f "$BACKEND_ENV_FILE" ]]; then
      DB_PASSWORD="${DB_PASSWORD:-$(grep '^PG_PASSWORD=' "$BACKEND_ENV_FILE" 2>/dev/null | cut -d= -f2- || true)}"
      JWT_SECRET="${JWT_SECRET:-$(grep '^JWT_SECRET=' "$BACKEND_ENV_FILE" 2>/dev/null | cut -d= -f2- || true)}"
    fi
    [[ -n "$DB_PASSWORD" ]] || die "SKIP_DB=1 requiere que DB_PASSWORD esté definida o que ya exista apps/backend/.env con PG_PASSWORD."
    return
  fi

  if [[ -z "$DB_PASSWORD" ]]; then
    while true; do
      read -rsp "Contraseña para PostgreSQL (${DB_USER}): " DB_PASSWORD; echo ""
      read -rsp "Confirmar contraseña: " DB_PASSWORD_2; echo ""
      [[ "$DB_PASSWORD" == "$DB_PASSWORD_2" ]] && break
      warn "Las contraseñas no coinciden. Intenta de nuevo."
    done
  fi

  [[ -n "$DB_PASSWORD" ]] || die "La contraseña PostgreSQL no puede estar vacía."

  if [[ -z "$JWT_SECRET" ]]; then
    JWT_SECRET="$(openssl rand -hex 32 2>/dev/null || tr -dc 'a-f0-9' < /dev/urandom | head -c 64)"
  fi
}

print_summary() {
  local host_ip
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"

  echo ""
  echo -e "${BOLD}Resumen de instalación${NC}"
  echo "  Repositorio        : $REPO_DIR"
  echo "  Usuario servicio   : $APP_USER"
  echo "  Base de datos      : $DB_USER@localhost:$DB_PORT/$DB_NAME"
  echo "  Backend interno    : http://127.0.0.1:$BACKEND_PORT"
  echo "  Frontend tablet    : http://${host_ip:-IP_DEL_SERVIDOR}:$PUBLIC_PORT"
  echo "  Frontend mobile    : http://${host_ip:-IP_DEL_SERVIDOR}:$PUBLIC_PORT/mobile/"
  echo "  Web root tablet    : $WEB_ROOT_TABLET"
  echo "  Web root mobile    : $WEB_ROOT_MOBILE"
  echo "  Admin POS          : $ADMIN_EMAIL / $ADMIN_PASSWORD"
  echo "  Zona horaria       : $TZ_INPUT"
  echo ""
}

# Variables que evitan prompts interactivos durante apt:
#   DEBIAN_FRONTEND=noninteractive   → desactiva diálogos de debconf
#   NEEDRESTART_MODE=a               → autoresponde "reiniciar todo" a needrestart
#   NEEDRESTART_SUSPEND=1            → suprime el banner de needrestart
#   APT_LISTCHANGES_FRONTEND=none    → silencia apt-listchanges
# Estas variables resuelven el clásico "estancado en 1/13" en Ubuntu/Mint
# cuando libssl, libc6 o postgres piden confirmación de reinicio de servicios.
APT_NONINTERACTIVE_ENV=(
  DEBIAN_FRONTEND=noninteractive
  NEEDRESTART_MODE=a
  NEEDRESTART_SUSPEND=1
  APT_LISTCHANGES_FRONTEND=none
)
APT_GET_OPTS=(
  -y
  -o Dpkg::Options::=--force-confdef
  -o Dpkg::Options::=--force-confold
  -o APT::Get::Assume-Yes=true
)

apt_get() {
  sudo env "${APT_NONINTERACTIVE_ENV[@]}" apt-get "${APT_GET_OPTS[@]}" "$@"
}

install_system_packages() {
  step "1/13 Paquetes del sistema"
  info "Actualizando índice de paquetes (puede tardar en redes lentas)..."
  sudo env "${APT_NONINTERACTIVE_ENV[@]}" apt-get update
  info "Instalando paquetes base..."
  apt_get install \
    ca-certificates \
    curl \
    git \
    gnupg \
    build-essential \
    python3 \
    postgresql \
    postgresql-contrib \
    nginx \
    ufw
  ok "Paquetes base instalados."
}

install_node_lts_if_needed() {
  step "2/13 Node.js LTS"

  local node_ok=false
  if command_exists node; then
    local major
    major="$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")"
    if [[ "$major" -ge 20 ]]; then
      node_ok=true
      ok "Node.js $(node -v) ya está instalado."
    fi
  fi

  if [[ "$node_ok" == false ]]; then
    info "Instalando Node.js LTS desde NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E env "${APT_NONINTERACTIVE_ENV[@]}" bash -
    apt_get install nodejs
    ok "Node.js $(node -v) instalado."
  fi
}

enable_core_services() {
  step "3/13 Servicios base"
  sudo systemctl enable postgresql --quiet
  sudo systemctl enable nginx --quiet
  sudo systemctl restart postgresql
  sudo systemctl restart nginx
  ok "PostgreSQL y nginx activos."
}

configure_postgres() {
  step "4/13 PostgreSQL"

  local db_password_sql tz_sql
  db_password_sql="${DB_PASSWORD//\'/\'\'}"
  tz_sql="${TZ_INPUT//\'/\'\'}"

  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE USER "${DB_USER}" WITH PASSWORD '${db_password_sql}';
  ELSE
    ALTER USER "${DB_USER}" WITH PASSWORD '${db_password_sql}';
  END IF;
END
\$\$;
SQL

  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    sudo -u postgres createdb --owner="${DB_USER}" "${DB_NAME}"
  fi

  sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
GRANT ALL ON SCHEMA public TO "${DB_USER}";
ALTER DATABASE "${DB_NAME}" SET timezone = '${tz_sql}';
SQL

  ok "Usuario y base PostgreSQL listos."
}

fix_repo_permissions() {
  # Si una ejecución anterior usó sudo, los archivos del repo pueden quedar
  # en propiedad de root. Restablecer al usuario de la app para que npm/vite
  # puedan escribir y ejecutar.
  if [[ -d "$REPO_DIR" ]]; then
    sudo chown -R "$APP_USER:$APP_GROUP" "$REPO_DIR" 2>/dev/null || true
  fi
}

install_node_dependencies() {
  step "5/13 Dependencias npm"
  # Reportes cliente en pos-tablet (PDF/Excel con branding Caligua):
  #   jspdf            — PDF vectorial
  #   jspdf-autotable  — tablas con zebra/header/footer para jsPDF
  #   xlsx             — Excel (.xlsx) 3 hojas: Resumen, Detalle, Datos
  # Son JavaScript puro; se instalan automáticamente desde package.json
  # vía el workspace install y no requieren librerías de sistema.
  fix_repo_permissions
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

  # Reaseguro: si las nuevas deps de reportes no están presentes
  # (p. ej. package-lock desactualizado en una copia antigua), instalarlas
  # explícitamente en el workspace de pos-tablet. Es idempotente.
  if [[ -d "$REPO_DIR/apps/pos-tablet" ]]; then
    local pkg_json="$REPO_DIR/apps/pos-tablet/package.json"
    local missing=()
    for dep in jspdf jspdf-autotable xlsx; do
      if ! grep -q "\"$dep\"" "$pkg_json" 2>/dev/null; then
        missing+=("$dep")
      fi
    done
    if (( ${#missing[@]} > 0 )); then
      info "Añadiendo dependencias de reporte faltantes: ${missing[*]}"
      (
        cd "$REPO_DIR"
        npm install --workspace apps/pos-tablet --save \
          jspdf@^4.2.1 jspdf-autotable@^5.0.7 xlsx@^0.18.5
      )
    fi
  fi

  # Restaurar bit de ejecución en todos los binarios de node_modules.
  # Necesario cuando el repo se copió desde Windows/NTFS, donde los permisos
  # Unix no se preservan y tsc/vite/etc. quedan sin +x.
  find "$REPO_DIR" -path "*/node_modules/.bin/*" -not -type d \
    -exec chmod +x {} + 2>/dev/null || true
  ok "Dependencias npm instaladas."
}

write_environment_files() {
  step "6/13 Variables de entorno"

  if [[ "$SKIP_DB" == "1" && -f "$BACKEND_ENV_FILE" ]]; then
    # El .env ya tiene las credenciales correctas para la BD existente; no tocar.
    # Solo asegurar que JWT_SECRET esté presente.
    if ! grep -q '^JWT_SECRET=' "$BACKEND_ENV_FILE"; then
      echo "JWT_SECRET=${JWT_SECRET}" >> "$BACKEND_ENV_FILE"
      ok "JWT_SECRET añadido al .env existente."
    else
      ok ".env existente conservado sin cambios."
    fi
  else
    cat > "$BACKEND_ENV_FILE" <<EOF
PG_HOST=localhost
PG_PORT=${DB_PORT}
PG_USER=${DB_USER}
PG_PASSWORD=${DB_PASSWORD}
PG_DATABASE=${DB_NAME}

HOST=127.0.0.1
PORT=${BACKEND_PORT}
JWT_SECRET=${JWT_SECRET}
EOF
    ok ".env del backend escrito."
  fi

  cat > "$FRONTEND_ENV_FILE" <<'EOF'
VITE_API_URL=
EOF

  cat > "$FRONTEND_ENV_FILE_MOBILE" <<'EOF'
VITE_API_URL=
EOF

  ok "Archivos .env escritos."
}

initialize_database_schema() {
  step "7/13 Esquema y datos base"
  (
    cd "$REPO_DIR/apps/backend"
    node src/scripts/init-db.js
  )
  ok "Esquema base inicializado."
}

write_embedded_menu_data() {
  cat > "$TEMP_DIR/categories.tsv" <<'CATEGORY_DATA'
1	Postres		1	0
2	Tes		1	1
3	Desayunos		1	2
4	Entradas		1	3
5	Almuerzos		1	4
6	Mariscos		1	5
7	Caldos		1	6
8	Pastas		1	7
9	Tacos		1	8
10	Alitas		1	9
11	Hamburguesas Y Sandwich		1	10
12	Acompanamientos		1	11
13	Aguas Frescas		1	12
14	Picheles Naturales		1	13
15	Smoothie		1	14
16	Licuados		1	15
17	Bebidas Compuestas		1	16
18	Cafe		1	17
19	Frapes		1	18
20	Sodas		1	19
21	Bebidas Preparadas		1	20
22	Shots		1	21
23	Cervezas		1	22
24	Tequilas		1	23
25	Ron		1	24
26	Whisky		1	25
27	Vinos		1	26
28	Vodka		1	27
29	Otros		1	28
CATEGORY_DATA

  cat > "$TEMP_DIR/products.tsv" <<'PRODUCT_DATA'
1	Tiramisu	15	0.0	35.0	1	1	0
2	Tarta de Queso	15	0.0	30.0	1	1	0
3	Carlota de Limon	15	0.0	25.0	1	1	0
4	Mousse de platano y almendra	15	0.0	25.0	1	1	0
5	Mousse de Chocolate	15	0.0	30.0	1	1	0
6	Panacota de maracuya	15	0.0	35.0	1	1	0
7	Te de canela	15	0.0	10.0	2	1	0
8	Te de jamaica	15	0.0	10.0	2	1	0
9	Te de manzanilla	15	0.0	10.0	2	1	0
10	Te de manzanilla	15	0.0	10.0	2	1	0
11	Te de limon	15	0.0	10.0	2	1	0
105	Canela	15	0.0	10.0	2	1	1
106	Jamaica	15	0.0	10.0	2	1	2
107	Manzanilla	15	0.0	10.0	2	1	3
108	Limon	15	0.0	10.0	2	1	4
12	Americano	15	0.0	60.0	3	1	0
13	Omellete	15	0.0	50.0	3	1	0
14	Huevos a la mexicana	15	0.0	40.0	3	1	0
15	Pancakes	15	0.0	40.0	3	1	0
16	Wafles	15	0.0	45.0	3	1	0
17	Chilaquiles de pollo	15	0.0	50.0	3	1	0
18	Chilaquiles de res	15	0.0	60.0	3	1	0
19	Huevos Rancheros	15	0.0	40.0	3	1	0
20	Chapin Ganadero	15	0.0	70.0	3	1	0
21	Queso Fundido	15	0.0	55.0	4	1	0
22	Nachos	15	0.0	65.0	4	1	0
23	Chips y guacamole	15	0.0	35.0	4	1	0
24	Papas cali	15	0.0	65.0	4	1	0
25	Carne Asada 8 Oz.	15	0.0	90.0	5	1	0
26	Carne Asada 12 Oz.	15	0.0	120.0	5	1	0
27	Steak con camarones	15	0.0	130.0	5	1	0
28	Molcajete de res	15	0.0	160.0	5	1	0
29	Pollo ala parrilla	15	0.0	70.0	5	1	0
30	Burrito mojado	15	0.0	65.0	5	1	0
31	Costillas BBQ	15	0.0	85.0	5	1	0
32	Fajitas de pollo	15	0.0	70.0	5	1	0
33	Fajitas de Res	15	0.0	70.0	5	1	0
34	Fajitas de camaron	15	0.0	85.0	5	1	0
35	Fajitas Mixtas	15	0.0	90.0	5	1	0
36	Mojarra	15	0.0	100.0	6	1	0
37	Mejillones	15	0.0	130.0	6	1	0
38	Mejillones	15	0.0	130.0	6	1	0
39	Camarones al ajo	15	0.0	100.0	6	1	0
40	Camarones empanizados	15	0.0	100.0	6	1	0
41	Camarones a la diabla	15	0.0	100.0	6	1	0
42	Caldo de res	15	0.0	75.0	7	1	0
44	7 Mares	15	0.0	110.0	7	1	1
43	Caldo de gallina	15	0.0	75.0	7	1	2
45	Lasana	15	0.0	70.0	8	1	0
46	Pasta alfredo pollo	15	0.0	65.0	8	1	0
47	Pasta alfredo Camarones	15	0.0	90.0	8	1	0
48	Pasta alfredo Mixta	15	0.0	100.0	8	1	0
49	Tacos de asada	15	0.0	60.0	9	1	0
50	Tacos de pollo	15	0.0	60.0	9	1	0
51	Tacos de camaron	15	0.0	70.0	9	1	0
52	Tacos de birria	15	0.0	65.0	9	1	0
183	Alitas Bufalo 8U	15	0.0	60.0	10	1	1
184	Alitas Bufalo 14U	15	0.0	110.0	10	1	2
185	Alitas Bufalo 22U	15	0.0	160.0	10	1	3
186	Alitas Picante habanero 8U	15	0.0	60.0	10	1	4
187	Alitas Picante habanero 14U	15	0.0	110.0	10	1	5
188	Alitas Picante habanero 22U	15	0.0	160.0	10	1	6
189	Alitas Picante BBQ 8U	15	0.0	60.0	10	1	7
190	Alitas Picante BBQ 14U	15	0.0	110.0	10	1	8
191	Alitas Picante BBQ 22U	15	0.0	160.0	10	1	9
192	Alitas Mango 8U	15	0.0	60.0	10	1	10
193	Alitas Mango 14U	15	0.0	110.0	10	1	11
194	Alitas Mango 22U	15	0.0	160.0	10	1	12
195	Alitas Limon y pimienta 8U	15	0.0	60.0	10	1	13
196	Alitas Limon y pimienta 14U	15	0.0	110.0	10	1	14
197	Alitas Limon y pimienta 22U	15	0.0	160.0	10	1	15
198	Alitas Teriyaki 8U	15	0.0	60.0	10	1	16
199	Alitas Teriyaki 14U	15	0.0	110.0	10	1	17
200	Alitas Teriyaki 22U	15	0.0	160.0	10	1	18
64	Hamburguesa clasica	15	0.0	50.0	11	1	0
65	Hamburguesa americana doble	15	0.0	80.0	11	1	0
66	Hamburguesa hawaiana	15	0.0	65.0	11	1	0
67	Deditos de pollo	15	0.0	35.0	11	1	0
68	Papas fritas	15	0.0	35.0	11	1	0
69	Papas Fritas	15	0.0	25.0	12	1	0
70	Trotilla extra	15	0.0	5.0	12	1	0
71	Plato de fruta	15	0.0	20.0	12	1	0
72	Horchata	15	0.0	15.0	13	1	1
73	Jamaica	15	0.0	15.0	13	1	2
74	Limonada con chia	15	0.0	20.0	13	1	3
75	Limonada con pepino	15	0.0	25.0	13	1	4
76	Limonada	15	0.0	15.0	13	1	5
77	Limonada con soda	15	0.0	20.0	13	1	6
78	Limonada frozen fresa	15	0.0	25.0	13	1	7
79	Naranjada	15	0.0	15.0	13	1	8
80	Naranjada con soda	15	0.0	20.0	13	1	9
81	Maracuya	15	0.0	35.0	13	1	10
82	Puche de Jamaica	15	0.0	40.0	14	1	1
83	Puche de Horchata	15	0.0	40.0	14	1	2
84	Puche de Limonada	15	0.0	40.0	14	1	3
85	Puche de Limonada con soda	15	0.0	45.0	14	1	4
86	Puche de Naranjada	15	0.0	40.0	14	1	5
87	Puche de Naranjada con soda	15	0.0	45.0	14	1	6
88	Smoothie de Banano con fresa	15	0.0	25.0	15	1	1
89	Smoothie de Mango	15	0.0	30.0	15	1	2
90	Smoothie de Berrys	15	0.0	25.0	15	1	3
91	Smoothie de Piña colada	15	0.0	30.0	15	1	4
92	Smoothie de Fresa	15	0.0	25.0	15	1	5
93	Licuado de Banano	15	0.0	25.0	16	1	1
94	Licuado de Fresa	15	0.0	25.0	16	1	2
95	Licuado de Fresa con banano	15	0.0	30.0	16	1	3
96	Mineral compuesta	15	0.0	25.0	17	1	1
97	Cimarrona	15	0.0	25.0	17	1	2
98	Jugo V8	15	0.0	25.0	17	1	3
99	Late	15	0.0	30.0	18	1	1
100	Cafe con leche	15	0.0	25.0	18	1	2
101	Cafe	15	0.0	15.0	18	1	3
102	Capuchino	15	0.0	25.0	18	1	4
103	Capuchino vainilla	15	0.0	25.0	18	1	5
104	Capuchino caramelo	15	0.0	30.0	18	1	6
109	Frape de Frape	15	0.0	20.0	19	1	1
110	Frape de Vainilla	15	0.0	30.0	19	1	2
111	Frape de Caramelo	15	0.0	25.0	19	1	3
112	Frape de Mocca	15	0.0	30.0	19	1	4
113	Frape de Ice Coffee	15	0.0	25.0	19	1	5
114	Frape de Frappuccino	15	0.0	25.0	19	1	6
115	Coca Cola	15	0.0	10.0	20	1	1
116	Pepsi	15	0.0	10.0	20	1	2
117	Sprite	15	0.0	10.0	20	1	3
118	Grapete	15	0.0	10.0	20	1	4
119	Mirinda	15	0.0	10.0	20	1	5
120	Agua pura	15	0.0	10.0	20	1	6
121	Charro Negro	15	0.0	30.0	21	1	1
122	Limonada Electrica	15	0.0	35.0	21	1	2
123	Cuba Libre	15	0.0	30.0	21	1	3
124	Mojito	15	0.0	35.0	21	1	4
125	Mojito Frutos Rojos	15	0.0	40.0	21	1	5
126	Mojito Maracuya	15	0.0	40.0	21	1	6
127	Paloma	15	0.0	35.0	21	1	7
128	Daikiri	15	0.0	35.0	21	1	8
129	Gin Tonic	15	0.0	40.0	21	1	9
130	Martini	15	0.0	35.0	21	1	10
131	Mimosa	15	0.0	35.0	21	1	11
132	Tequila Sunrise	15	0.0	40.0	21	1	12
133	Beso Negro	15	0.0	40.0	21	1	13
134	Negroni	15	0.0	40.0	21	1	14
135	Margarita	15	0.0	35.0	21	1	15
136	Margarita Cherry	15	0.0	40.0	21	1	16
137	Laguna Azul	15	0.0	35.0	21	1	17
138	Piña Cali	15	0.0	45.0	21	1	18
139	Piña Colada	15	0.0	35.0	21	1	19
140	Orgasmo Cali	15	0.0	40.0	21	1	20
141	Ruse Blanco	15	0.0	40.0	21	1	21
142	Copa de Sangria	15	0.0	35.0	21	1	22
143	Pink Panter	15	0.0	40.0	21	1	23
144	Aperol Sprtiz	15	0.0	40.0	21	1	24
145	Jager Bomb	15	0.0	45.0	21	1	25
146	Michelada Gallo	15	0.0	35.0	21	1	26
147	Otras	15	0.0	40.0	21	1	27
148	Etiqueta Roja	15	0.0	35.0	22	1	1
149	Etiqueta Negra	15	0.0	35.0	22	1	2
150	Jose Cuervo	15	0.0	30.0	22	1	3
151	Jimador	15	0.0	25.0	22	1	4
152	Gallo Bot	15	0.0	20.0	23	1	1
153	Corona Bot	15	0.0	25.0	23	1	2
154	Cabro Reserva	15	0.0	25.0	23	1	3
155	Cabro Extra	15	0.0	25.0	23	1	4
156	Stella	15	0.0	25.0	23	1	5
157	Monte Carlo	15	0.0	25.0	23	1	6
158	Heineken	15	0.0	25.0	23	1	7
159	Modelo	15	0.0	25.0	23	1	8
160	Michelob	15	0.0	25.0	23	1	9
161	Karma	15	0.0	15.0	23	1	10
162	Vudu	15	0.0	20.0	23	1	11
163	Don Julio	15	0.0	1200.0	24	1	1
164	Jimador	15	0.0	350.0	24	1	2
165	Jose Cuervo	15	0.0	400.0	24	1	3
166	Gran Malo	15	0.0	300.0	24	1	4
167	Ron Botran 12 Años	15	0.0	250.0	25	1	1
168	Ron Botran 18 Años	15	0.0	600.0	25	1	2
169	Ron Zacapa	15	0.0	675.0	25	1	3
170	XL Original	15	0.0	275.0	25	1	4
171	XL Sabores	15	0.0	275.0	25	1	5
172	Venado Azul	15	0.0	275.0	25	1	6
173	Etiqueta Roja	15	0.0	350.0	26	1	1
174	Etiqueta Negra	15	0.0	650.0	26	1	2
175	Buchanans	15	0.0	700.0	26	1	3
176	Jack Daniels	15	0.0	500.0	26	1	4
177	Old Park	15	0.0	650.0	26	1	5
178	Casillero del Diablo	15	0.0	250.0	27	1	1
179	Viña Maipo	15	0.0	200.0	27	1	2
180	Carlo Rossi	15	0.0	250.0	27	1	3
181	Absolut	15	0.0	300.0	28	1	1
182	Jagermeister	15	0.0	750.0	29	1	1
PRODUCT_DATA
}

import_menu_data() {
  export PGPASSWORD="$DB_PASSWORD"

  info "Importando categorías y productos..."
  psql -X -q -v ON_ERROR_STOP=1 -h localhost -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<SQL
CREATE TEMP TABLE tmp_categories (
  id integer,
  name text,
  parent_id text,
  is_active smallint,
  display_order integer
);

CREATE TEMP TABLE tmp_products (
  id integer,
  name text,
  stock numeric,
  cost_price numeric,
  price numeric,
  category_id integer,
  is_active smallint,
  display_order integer
);
\copy tmp_categories FROM '$TEMP_DIR/categories.tsv' WITH (FORMAT text)
\copy tmp_products FROM '$TEMP_DIR/products.tsv' WITH (FORMAT text)

INSERT INTO categories (id, name, parent_id, is_active, display_order)
SELECT
  id,
  name,
  NULLIF(parent_id, '')::integer,
  is_active,
  display_order
FROM tmp_categories
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    is_active = EXCLUDED.is_active,
    display_order = EXCLUDED.display_order;

INSERT INTO products (id, name, stock, cost_price, price, category_id, is_active, display_order)
SELECT
  id,
  name,
  stock,
  cost_price,
  price,
  category_id,
  is_active,
  display_order
FROM tmp_products
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    stock = EXCLUDED.stock,
    cost_price = EXCLUDED.cost_price,
    price = EXCLUDED.price,
    category_id = EXCLUDED.category_id,
    is_active = EXCLUDED.is_active,
    display_order = EXCLUDED.display_order;

SELECT setval(pg_get_serial_sequence('categories','id'), COALESCE((SELECT MAX(id) FROM categories), 1), true);
SELECT setval(pg_get_serial_sequence('products','id'), COALESCE((SELECT MAX(id) FROM products), 1), true);
SQL

  ok "Categorías y productos importados."
}

configure_admin_user() {
  info "Configurando administrador del POS..."
  (
    cd "$REPO_DIR/apps/backend"
    ADMIN_NAME="$ADMIN_NAME" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" node --input-type=module <<'NODE'
import bcrypt from "bcrypt";
import db, { closeDatabase } from "./src/config/db.js";
import { initDB } from "./src/config/db.init.js";

const adminName = process.env.ADMIN_NAME || "Admin";
const adminEmail = process.env.ADMIN_EMAIL || "admin@pos.com";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

const run = async () => {
  await initDB();
  const hash = await bcrypt.hash(adminPassword, 10);
  const roleResult = await db.query(`SELECT id FROM roles WHERE name = ?`, ["admin"]);
  const roleId = roleResult.rows[0]?.id ?? 1;

  await db.query(
    `INSERT INTO users (name, email, password, role_id, is_active)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT (email) DO UPDATE
     SET name = EXCLUDED.name,
         password = EXCLUDED.password,
         role_id = EXCLUDED.role_id,
         is_active = 1`,
    [adminName, adminEmail, hash, roleId]
  );

  await closeDatabase();
};

try {
  await run();
  console.log(`✅ Administrador configurado: ${adminEmail}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
NODE
  )
  ok "Administrador listo."
}

build_frontend() {
  step "8/13 Frontend de producción"
  (
    cd "$REPO_DIR"
    if ! npm run build --workspace=apps/pos-tablet; then
      warn "Build de pos-tablet falló — reparando permisos e intentando de nuevo..."
      fix_repo_permissions
      find "$REPO_DIR" -path "*/node_modules/.bin/*" -not -type d \
        -exec chmod +x {} + 2>/dev/null || true
      npm run build --workspace=apps/pos-tablet
    fi

    # tsc -b puede fallar en modo strict; separamos type-check del bundle para
    # que vite siempre produzca el dist aunque haya advertencias de tipos.
    (cd "$REPO_DIR/apps/pos-mobile" && npx tsc -b --noEmit 2>&1 || true)
    if ! (cd "$REPO_DIR/apps/pos-mobile" && BASE_PATH=/mobile/ npx vite build); then
      warn "Build de pos-mobile falló — reparando permisos e intentando de nuevo..."
      fix_repo_permissions
      find "$REPO_DIR" -path "*/node_modules/.bin/*" -not -type d \
        -exec chmod +x {} + 2>/dev/null || true
      (cd "$REPO_DIR/apps/pos-mobile" && BASE_PATH=/mobile/ npx vite build)
    fi

    # Verificar que el dist generado use las rutas correctas de /mobile/
    local mobile_html="$REPO_DIR/apps/pos-mobile/dist/index.html"
    if [[ -f "$mobile_html" ]] && ! grep -q '"/mobile/' "$mobile_html"; then
      die "El build de pos-mobile no aplicó BASE_PATH=/mobile/ — revisa vite.config.ts"
    fi
  )
  ok "Frontends compilados."
}

deploy_frontend() {
  step "9/13 Despliegue del frontend"
  sudo rm -rf "$WEB_ROOT_TABLET" "$WEB_ROOT_MOBILE"
  sudo mkdir -p "$WEB_ROOT_TABLET" "$WEB_ROOT_MOBILE"
  sudo cp -a "$REPO_DIR/apps/pos-tablet/dist/." "$WEB_ROOT_TABLET/"
  sudo cp -a "$REPO_DIR/apps/pos-mobile/dist/."  "$WEB_ROOT_MOBILE/"
  sudo chown -R root:root "$WEB_ROOT"
  sudo find "$WEB_ROOT" -type d -exec chmod 755 {} \;
  sudo find "$WEB_ROOT" -type f -exec chmod 644 {} \;

  # Verificar que los assets quedaron en la ruta que nginx espera
  [[ -f "$WEB_ROOT_TABLET/index.html" ]] \
    || die "Despliegue de pos-tablet falló: no existe $WEB_ROOT_TABLET/index.html"
  [[ -f "$WEB_ROOT_MOBILE/index.html" ]] \
    || die "Despliegue de pos-mobile falló: no existe $WEB_ROOT_MOBILE/index.html"
  [[ -d "$WEB_ROOT_MOBILE/assets" ]] \
    || die "Despliegue de pos-mobile falló: no existe $WEB_ROOT_MOBILE/assets/"

  ok "Frontends publicados en $WEB_ROOT_TABLET y $WEB_ROOT_MOBILE."
  info "Archivos mobile: $(sudo ls "$WEB_ROOT_MOBILE/assets/" | wc -l) assets copiados."
}

configure_nginx() {
  step "10/13 nginx"

  write_root_file "$NGINX_SITE_FILE" 0644 <<EOF
server {
    listen ${PUBLIC_PORT};
    listen [::]:${PUBLIC_PORT};
    server_name _;

    client_max_body_size 10m;

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Assets de pos-mobile: regex explícito con root directo, sin fallback SPA.
    # Evita el bug conocido de nginx donde try_files ignora alias al verificar
    # existencia de archivo y termina sirviendo index.html como text/html.
    location ~ ^/mobile/assets/ {
        root ${WEB_ROOT};
        access_log off;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA de pos-mobile: rutas de React Router → siempre index.html
    location /mobile/ {
        root ${WEB_ROOT};
        index index.html;
        try_files \$uri \$uri/ /mobile/index.html;
    }

    # SPA de pos-tablet
    location / {
        root ${WEB_ROOT_TABLET};
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

  sudo ln -sfn "$NGINX_SITE_FILE" "$NGINX_SITE_LINK"
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl reload nginx
  ok "nginx configurado."
}

write_backend_service() {
  local node_bin
  node_bin="$(command -v node)"
  [[ -n "$node_bin" ]] || die "No se encontró node en PATH."

  write_root_file "$BACKEND_SERVICE_FILE" 0644 <<EOF
[Unit]
Description=Fenix POS Backend
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${REPO_DIR}/apps/backend
ExecStart=${node_bin} src/server.js
Restart=always
RestartSec=5
StartLimitIntervalSec=0
Environment=NODE_ENV=production
Environment=TZ=${TZ_INPUT}
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=false
ProtectSystem=full
ReadWritePaths=${REPO_DIR}
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
}

write_healthcheck_script() {
  write_root_file "$HEALTHCHECK_SCRIPT_PATH" 0755 <<EOF
#!/bin/bash
set -euo pipefail

BACKEND_HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/api/health"
FRONTEND_HEALTH_URL="http://127.0.0.1:${PUBLIC_PORT}/"
FRONTEND_MOBILE_HEALTH_URL="http://127.0.0.1:${PUBLIC_PORT}/mobile/"
POSTGRES_HOST="127.0.0.1"
POSTGRES_PORT="${DB_PORT}"
POSTGRES_DB="${DB_NAME}"
POSTGRES_USER="${DB_USER}"
BACKEND_SERVICE="${BACKEND_SERVICE_NAME}"
NGINX_SERVICE="nginx"
POSTGRES_SERVICE="postgresql"
LOG_TAG="pos-fenix-healthcheck"

log() {
  logger -t "\$LOG_TAG" "\$*"
}

restart_service() {
  systemctl restart "\$1"
}

if ! pg_isready --host="\$POSTGRES_HOST" --port="\$POSTGRES_PORT" --dbname="\$POSTGRES_DB" --username="\$POSTGRES_USER" --quiet; then
  log "PostgreSQL no responde. Reiniciando PostgreSQL y backend."
  restart_service "\$POSTGRES_SERVICE"
  sleep 5
  restart_service "\$BACKEND_SERVICE" || true
fi

if ! curl --silent --show-error --fail --max-time 10 "\$BACKEND_HEALTH_URL" >/dev/null; then
  log "Backend no responde. Reiniciando backend."
  restart_service "\$BACKEND_SERVICE"
  sleep 5
fi

if ! curl --silent --show-error --fail --max-time 10 "\$FRONTEND_HEALTH_URL" >/dev/null; then
  log "Frontend (tablet) o nginx no responde. Reiniciando nginx."
  restart_service "\$NGINX_SERVICE"
fi

if ! curl --silent --show-error --fail --max-time 10 "\$FRONTEND_MOBILE_HEALTH_URL" >/dev/null; then
  log "Frontend (mobile) o nginx no responde. Reiniciando nginx."
  restart_service "\$NGINX_SERVICE"
fi
EOF
}

write_healthcheck_units() {
  write_root_file "$HEALTHCHECK_SERVICE_FILE" 0644 <<EOF
[Unit]
Description=Healthcheck 24/7 para Fenix POS
After=network-online.target ${BACKEND_SERVICE_NAME}.service nginx.service postgresql.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${HEALTHCHECK_SCRIPT_PATH}
EOF

  write_root_file "$HEALTHCHECK_TIMER_FILE" 0644 <<EOF
[Unit]
Description=Ejecución periódica del healthcheck de Fenix POS

[Timer]
OnBootSec=45s
OnUnitActiveSec=30s
AccuracySec=5s
Unit=${HEALTHCHECK_SERVICE_NAME}.service
Persistent=true

[Install]
WantedBy=timers.target
EOF
}

write_stability_files() {
  step "11/13 Ajustes 24/7 del sistema"

  write_root_file "/etc/systemd/logind.conf.d/99-pos-fenix-24x7.conf" 0644 <<'EOF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
IdleActionSec=0
EOF

  write_root_file "/etc/systemd/sleep.conf.d/99-pos-fenix-24x7.conf" 0644 <<'EOF'
[Sleep]
AllowSuspend=no
AllowHibernation=no
AllowSuspendThenHibernate=no
AllowHybridSleep=no
EOF

  write_root_file "/etc/sysctl.d/99-pos-fenix-24x7.conf" 0644 <<'EOF'
vm.swappiness = 10
vm.vfs_cache_pressure = 50
vm.dirty_background_ratio = 5
vm.dirty_ratio = 15
fs.file-max = 2097152
fs.inotify.max_user_watches = 1048576
net.core.somaxconn = 1024
net.ipv4.tcp_keepalive_time = 600
EOF

  write_root_file "/etc/systemd/journald.conf.d/99-pos-fenix-24x7.conf" 0644 <<'EOF'
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=512M
RuntimeMaxUse=256M
SyncIntervalSec=5m
EOF

  write_root_file "/etc/udev/rules.d/99-pos-fenix-usb-power.rules" 0644 <<'EOF'
ACTION=="add", SUBSYSTEM=="usb", TEST=="power/control", ATTR{power/control}="on"
EOF

  write_root_file "/etc/apt/apt.conf.d/52-pos-fenix-no-auto-reboot" 0644 <<'EOF'
Unattended-Upgrade::Automatic-Reboot "false";
EOF

  write_root_file "$STABILITY_SCRIPT_PATH" 0755 <<'EOF'
#!/bin/bash
set -euo pipefail
shopt -s nullglob

for governor in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
  echo performance > "$governor" 2>/dev/null || true
done

for epp in /sys/devices/system/cpu/cpu*/cpufreq/energy_performance_preference; do
  echo performance > "$epp" 2>/dev/null || true
done

for bias in /sys/devices/system/cpu/cpu*/power/energy_perf_bias; do
  echo performance > "$bias" 2>/dev/null || true
done

for usb_power in /sys/bus/usb/devices/*/power/control; do
  echo on > "$usb_power" 2>/dev/null || true
done

for sata_pm in /sys/class/scsi_host/host*/link_power_management_policy; do
  echo max_performance > "$sata_pm" 2>/dev/null || true
done

if [[ -w /sys/module/pcie_aspm/parameters/policy ]]; then
  echo performance > /sys/module/pcie_aspm/parameters/policy 2>/dev/null || true
fi

if command -v powerprofilesctl >/dev/null 2>&1; then
  powerprofilesctl set performance >/dev/null 2>&1 || true
fi
EOF

  write_root_file "$STABILITY_SERVICE_FILE" 0644 <<EOF
[Unit]
Description=Ajustes de estabilidad 24/7 para Fenix POS
After=local-fs.target

[Service]
Type=oneshot
ExecStart=${STABILITY_SCRIPT_PATH}
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

  ok "Ajustes 24/7 escritos."
}

mask_sleep_targets() {
  local target
  for target in sleep.target suspend.target hibernate.target hybrid-sleep.target; do
    sudo systemctl mask "$target" >/dev/null
  done
}

ensure_grub_kernel_arg() {
  local grub_file="/etc/default/grub"
  local arg="usbcore.autosuspend=-1"
  local current_line current_value new_value grub_tmp

  if [[ ! -f "$grub_file" ]]; then
    warn "No existe $grub_file; se omite ajuste persistente de USB autosuspend."
    return
  fi

  current_line="$(sudo grep '^GRUB_CMDLINE_LINUX_DEFAULT=' "$grub_file" | head -n 1 || true)"
  [[ -n "$current_line" ]] || return

  current_value="${current_line#GRUB_CMDLINE_LINUX_DEFAULT=\"}"
  current_value="${current_value%\"}"

  if [[ " $current_value " == *" $arg "* ]]; then
    info "GRUB ya contiene $arg"
    return
  fi

  new_value="$(printf '%s %s' "$current_value" "$arg" | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')"
  grub_tmp="$TEMP_DIR/grub"

  sudo awk -v replacement="GRUB_CMDLINE_LINUX_DEFAULT=\"${new_value}\"" '
    BEGIN { done = 0 }
    /^GRUB_CMDLINE_LINUX_DEFAULT=/ && done == 0 {
      print replacement
      done = 1
      next
    }
    { print }
  ' "$grub_file" > "$grub_tmp"

  backup_file_once "$grub_file"
  sudo install -m 0644 "$grub_tmp" "$grub_file"
  GRUB_UPDATED=1
  ok "GRUB actualizado con $arg."
}

update_grub_if_needed() {
  ensure_grub_kernel_arg

  if [[ "$GRUB_UPDATED" -eq 1 ]]; then
    if command_exists update-grub; then
      sudo update-grub
    elif command_exists grub-mkconfig && [[ -d /boot/grub ]]; then
      sudo grub-mkconfig -o /boot/grub/grub.cfg
    else
      warn "No se pudo regenerar GRUB automáticamente."
    fi
  fi
}

enable_and_start_services() {
  step "12/13 systemd y arranque automático"

  write_backend_service
  write_healthcheck_script
  write_healthcheck_units

  sudo systemctl daemon-reload
  sudo systemctl enable postgresql --quiet
  sudo systemctl enable nginx --quiet
  sudo systemctl enable "$BACKEND_SERVICE_NAME" --quiet
  sudo systemctl enable "$STABILITY_SERVICE_NAME" --quiet
  sudo systemctl enable "${HEALTHCHECK_TIMER_NAME}.timer" --quiet

  sudo systemctl restart "$STABILITY_SERVICE_NAME"
  sudo sysctl --system >/dev/null
  sudo udevadm control --reload-rules
  sudo udevadm trigger --subsystem-match=usb --action=add || true
  mask_sleep_targets
  update_grub_if_needed

  sudo systemctl restart postgresql
  sudo systemctl restart "$BACKEND_SERVICE_NAME"
  sudo systemctl restart nginx
  sudo systemctl restart "${HEALTHCHECK_TIMER_NAME}.timer"
  sudo systemctl restart systemd-journald || true

  ok "Servicios habilitados para arranque automático."
}

open_firewall_if_needed() {
  step "13/13 Red y verificación"
  if command_exists ufw && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
    sudo ufw allow "${PUBLIC_PORT}/tcp" comment "Fenix POS Frontend" 2>/dev/null || true
    ok "Firewall actualizado."
  else
    warn "ufw no está activo; si usas firewall abre ${PUBLIC_PORT}/tcp."
  fi
}

verify_installation() {
  local public_url="http://127.0.0.1:${PUBLIC_PORT}/"
  local backend_url="http://127.0.0.1:${BACKEND_PORT}/api/health"

  info "Esperando a que el backend termine de iniciar..."
  sleep 6

  local mobile_url="http://127.0.0.1:${PUBLIC_PORT}/mobile/"

  curl --silent --show-error --fail --max-time 15 "$backend_url" >/dev/null || die "El backend no respondió en $backend_url"
  curl --silent --show-error --fail --max-time 15 "$public_url" >/dev/null || die "El frontend tablet no respondió en $public_url"
  curl --silent --show-error --fail --max-time 15 "$mobile_url" >/dev/null || die "El frontend mobile no respondió en $mobile_url"
  pg_isready -h 127.0.0.1 -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" >/dev/null || die "PostgreSQL no respondió."

  sudo systemctl --no-pager --full status "$BACKEND_SERVICE_NAME" >/dev/null
  sudo systemctl --no-pager --full status "${HEALTHCHECK_TIMER_NAME}.timer" >/dev/null

  ok "Backend, frontend y PostgreSQL responden correctamente."
}

print_final_notes() {
  local host_ip
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"

  echo ""
  echo -e "${BOLD}${GREEN}Instalación completada${NC}"
  echo ""
  echo "Frontend POS (tablet) : http://${host_ip:-IP_DEL_SERVIDOR}:${PUBLIC_PORT}"
  echo "Frontend POS (mobile) : http://${host_ip:-IP_DEL_SERVIDOR}:${PUBLIC_PORT}/mobile/"
  echo "Backend API           : proxied por nginx en /api"
  echo "PostgreSQL   : localhost:${DB_PORT}"
  echo "Admin inicial: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"
  echo ""
  echo "Servicios:"
  echo "  sudo systemctl status ${BACKEND_SERVICE_NAME}"
  echo "  sudo systemctl status nginx"
  echo "  sudo systemctl status postgresql"
  echo "  sudo systemctl status ${HEALTHCHECK_TIMER_NAME}.timer"
  echo ""
  echo "Logs útiles:"
  echo "  sudo journalctl -u ${BACKEND_SERVICE_NAME} -f"
  echo "  sudo journalctl -u ${HEALTHCHECK_SERVICE_NAME} -f"
  echo ""
  echo "Nota:"
  echo "  Reinicia el servidor una vez para aplicar por completo el cambio de GRUB si se actualizó."
  echo ""
}

main() {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║   Instalador todo-en-uno 24/7 · Fénix POS           ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"

  require_non_root_direct
  require_sudo
  ensure_supported_os
  prompt_values
  print_summary

  if [[ "$SKIP_DB" == "1" ]]; then
    warn "SKIP_DB=1: se omiten pasos de PostgreSQL, esquema, menú y admin."
  fi

  install_system_packages
  install_node_lts_if_needed
  enable_core_services

  if [[ "$SKIP_DB" != "1" ]]; then
    configure_postgres
  fi

  install_node_dependencies
  write_environment_files

  if [[ "$SKIP_DB" != "1" ]]; then
    initialize_database_schema
    write_embedded_menu_data
    import_menu_data
    configure_admin_user
  fi

  build_frontend
  deploy_frontend
  configure_nginx
  write_stability_files
  enable_and_start_services
  open_firewall_if_needed
  verify_installation
  print_final_notes
}

main "$@"

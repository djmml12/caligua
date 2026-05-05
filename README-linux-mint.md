# POS Fénix — Despliegue en Linux Mint

Servidor 24/7 con nginx + systemd + PostgreSQL. El código se edita en Windows y se despliega en Linux por USB.

## Flujo de despliegue (Windows → USB → Linux)

### 1. Empaquetar en Windows

Desde la carpeta del repo en Windows, abre PowerShell y ejecuta:

```powershell
./pack-for-linux.ps1
```

Esto crea `pos-fenix-YYYYMMDD-HHMM.tar.gz` en tu Escritorio. **Excluye automáticamente** lo que rompe en Linux:

- `node_modules/` (binarios nativos de Windows)
- `dist/` (builds viejos)
- `.git/`, `.claude/worktrees/`
- `Thumbs.db`, `desktop.ini`, archivos con rutas absolutas
- `.env` con secretos

Copia el `.tar.gz` al USB.

### 2. Desplegar en Linux Mint

En el servidor:

```bash
cd ~
tar -xzf /media/$USER/MI_USB/pos-fenix-*.tar.gz
cd caliguapostgreslinux
chmod +x install-linux-24x7-autostart.sh deploy.sh
```

A partir de aquí hay **dos rutas** según el caso:

#### 2A. Primera instalación (servidor recién formateado)

```bash
./install-linux-24x7-autostart.sh
```

Hace TODO: instala paquetes del sistema, PostgreSQL, Node, nginx, systemd, healthcheck, ajustes 24/7, build del frontend, despliegue, admin inicial. **30–40 minutos** la primera vez.

#### 2B. Actualización rápida (servidor ya instalado)

```bash
./deploy.sh
```

Hace solo lo mínimo necesario para reflejar cambios de código:

1. Detecta y borra `node_modules` con binarios Windows si los hay
2. Convierte CRLF→LF en archivos de código
3. `npm install` limpio
4. Compila pos-tablet y pos-mobile
5. Republica en `/var/www/pos-fenix/{tablet,mobile}`
6. Reinicia el backend systemd y recarga nginx
7. Smoke test contra `/api/health` y `/`

**1–3 minutos**. No toca PostgreSQL, `.env`, datos ni configuración del sistema.

### 3. Si los cambios siguen sin verse

| Síntoma | Causa probable | Solución |
|---|---|---|
| Los cambios del frontend (botones, paneles) no aparecen | nginx sirve el build viejo o el navegador cacheó | **Ctrl+Shift+R** en el navegador, o pestaña incógnito |
| `deploy.sh` falla en `npm install` | Mezcla de binarios Windows/Linux en `node_modules` | `rm -rf node_modules apps/*/node_modules packages/*/node_modules && ./deploy.sh` |
| `chmod +x` no funciona | USB en NTFS no preserva permisos | Copia primero a `~/`, luego `chmod +x` |
| Backend no reinicia | El service file apunta a otra ruta del repo | `sudo systemctl cat pos-fenix-backend \| grep WorkingDirectory` — si difiere, re-ejecuta el install script |
| Cambios solo de backend no se ven | El service no reinició | `sudo systemctl restart pos-fenix-backend && sudo journalctl -u pos-fenix-backend -f` |

## Variables opcionales (instalación)

```bash
export DB_NAME=pos
export DB_USER=pos_user
export DB_PASSWORD='tu_password'
export ADMIN_NAME='Admin'
export ADMIN_EMAIL='admin@pos.com'
export ADMIN_PASSWORD='admin123'
export PUBLIC_PORT=80
./install-linux-24x7-autostart.sh
```

## Resultado esperado

- Frontend tablet:  `http://IP_DEL_SERVIDOR`
- Frontend mobile:  `http://IP_DEL_SERVIDOR/mobile/`
- Backend API:      proxied por nginx en `/api`
- Reinicio automático del backend si falla
- Healthcheck periódico cada 30 s
- Suspensión deshabilitada (servidor 24/7)

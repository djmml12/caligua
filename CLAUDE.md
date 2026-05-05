# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Reglas

1. Pensar antes de actuar. Leer archivos existentes antes de escribir.
2. Salida concisa, razonamiento exhaustivo.
3. Editar antes que reescribir.
4. No releer archivos ya leídos salvo que hayan cambiado.
5. Probar antes de declarar listo.
6. Sin aperturas aduladoras ni cierres innecesarios.
7. Soluciones simples y directas.
8. Las instrucciones del usuario priman sobre este archivo.

## Visión general

**Fénix 2.0** — POS full-stack para **Linux Mint** (servidor 24/7 con nginx + systemd). Monorepo con npm workspaces (`apps/*`, `packages/*`).

En producción: backend Node como servicio `systemd`, nginx sirve el frontend pre-compilado y proxea `/api` al backend en `:3000`. Acceso vía navegador en la red local (`http://IP_DEL_SERVIDOR`).

## Comandos

### Raíz
```bash
npm run dev          # backend + pos-tablet + pos-mobile en paralelo
npm run dev:tablet   # backend + pos-tablet
npm run dev:mobile   # backend + pos-mobile
npm run build        # build pos-tablet y pos-mobile
npm run start:backend
```

### Backend (`apps/backend`)
```bash
npm run dev              # nodemon
npm start                # producción
npm run build            # node --check sobre cada .js (no transpila)
npm run init-db          # crea esquema (src/scripts/init-db.js)
npm run create-admin     # src/scripts/createAdmin.js
node src/scripts/seed-coffee-shop.js       # data demo
node src/scripts/import-menu-from-text.js  # carga de menú
```

### pos-tablet / pos-mobile (`apps/<app>`)
```bash
npm run dev      # Vite
npm run build
npm run preview
```

### Despliegue Windows → USB → Linux Mint

Empaquetar en Windows (PowerShell):
```powershell
./pack-for-linux.ps1   # genera pos-fenix-YYYYMMDD-HHMM.tar.gz limpio en el Escritorio
```

`pack-for-linux.ps1` excluye `node_modules`, `dist`, `.git`, `.env` y artefactos Windows que rompen el despliegue.

En Linux Mint, tras extraer el `.tar.gz`:
```bash
chmod +x install-linux-24x7-autostart.sh deploy.sh

# Primera instalación (30–40 min, hace TODO)
./install-linux-24x7-autostart.sh

# Actualizaciones posteriores (1–3 min)
./deploy.sh
```

`deploy.sh` detecta y limpia `node_modules` con binarios Windows, convierte CRLF→LF, hace `npm install`, recompila los frontends, los republica en `/var/www/pos-fenix/{tablet,mobile}` y reinicia el backend.

Variables opcionales del install script: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PUBLIC_PORT`.

### Portabilidad Windows ↔ Linux

- `.gitattributes` fuerza LF en todos los archivos de texto.
- `.editorconfig` mantiene LF + UTF-8 + 2-spaces en cualquier editor.
- Los `.sh` están marcados `+x` en git (`100755`).
- **Nunca** copies `node_modules` o `dist` entre sistemas — el `.gitignore` y `pack-for-linux.ps1` ya los excluyen.

## Layout

```
apps/backend     Express API (Node ESM, PostgreSQL via pg)
apps/pos-tablet  React/TypeScript (núcleo del sistema)
apps/pos-mobile  React/TypeScript (interfaz móvil)
packages/ui-kit  Componentes React compartidos
```

## Backend (Express, puerto 3000)

Patrón MVC en capas: `routes/ → controllers/ → services/ → models/ → PostgreSQL` (pool en `src/config/db.js`). Auth con JWT (`utils/jwt.js`, `middlewares/auth.middleware.js`); autorización por rol (`authorize.middleware.js`, `role.middleware.js`).

Rutas registradas en `src/routes/index.js`: `/api/auth`, `/api/products`, `/api/categories`, `/api/sales`, `/api/orders`, `/api/reports`, `/api/users`, `/api/roles`, `/api/settings`, `/api/print`.

Subsistemas notables:
- **Reportes**: `services/reports.service.js` + `utils/exportPdf.js`, `exportExcel.js`, `chartPng.js`, `reportTheme.js` (PDF/Excel con gráficas).
- **Impresión**: `utils/escpos-builder.js`, `escpos-logo.js` (tickets ESC/POS).
- **Email**: `services/email-alert.service.js`, `email-outbox.service.js` (nodemailer).

## Base de datos

PostgreSQL del sistema. Esquema completo en `apps/backend/src/config/db.init.js` (lo ejecuta `npm run init-db`). Conexión vía `apps/backend/.env`: `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DATABASE`. JWT/admin/email se configuran también en ese `.env`.

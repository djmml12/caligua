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

### Instalación 24/7 (Linux Mint)
```bash
chmod +x ./install-linux-24x7-autostart.sh
./install-linux-24x7-autostart.sh
```

Variables opcionales antes de ejecutar el script: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PUBLIC_PORT`. El script instala paquetes, configura PostgreSQL, crea admin, compila el frontend, configura nginx, registra el servicio systemd y un healthcheck.

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

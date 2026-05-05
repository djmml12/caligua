# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio.

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

**Fénix 2.0** — POS full-stack para **Linux Mint** (servidor 24/7 con nginx + systemd). Monorepo con npm workspaces.

El backend Node corre como servicio systemd, nginx sirve el frontend pre-compilado y proxea `/api` al backend. El frontend se accede por navegador en la red local.

## Comandos

### Raíz
```bash
npm run dev          # backend + pos-tablet en paralelo
npm run build        # build pos-tablet
npm run start:backend
```

### Backend (`apps/backend`)
```bash
npm run dev          # nodemon
npm start            # producción
npm run build        # syntax check
npm run init-db
npm run create-admin
```

### pos-tablet (`apps/pos-tablet`)
```bash
npm run dev
npm run build
npm run preview
```

### Instalación 24/7
```bash
chmod +x ./install-linux-24x7-autostart.sh
./install-linux-24x7-autostart.sh
```

## Layout

```
apps/backend     Express API (Node ESM, PostgreSQL via pg)
apps/pos-tablet  React/TypeScript (núcleo del sistema)
apps/pos-mobile  React/TypeScript (interfaz móvil)
packages/ui-kit  Componentes React compartidos
```

## Backend (Express, puerto 3000)

Patrón MVC: `routes/ → controllers/ → services/ → models/ → PostgreSQL`. Rutas: `/api/auth`, `/api/products`, `/api/categories`, `/api/sales`, `/api/orders`, `/api/reports`, `/api/users`, `/api/roles`, `/api/settings`, `/api/print`. Auth con JWT.

## Base de datos

PostgreSQL del sistema. Esquema en `apps/backend/src/config/db.init.js`. Conexión vía `apps/backend/.env` (`PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DATABASE`).

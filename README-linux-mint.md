# POS en Linux Mint

Este repositorio quedó simplificado para que toda la instalación Linux 24/7 se haga con un solo script.

## Instalación

```bash
chmod +x ./install-linux-24x7-autostart.sh
./install-linux-24x7-autostart.sh
```

Ese único script hace todo:

- instala paquetes del sistema;
- configura PostgreSQL;
- crea el usuario administrador;
- carga categorías y productos;
- compila y publica el frontend;
- configura nginx;
- crea el servicio `systemd` del backend;
- crea el healthcheck automático;
- aplica ajustes de estabilidad 24/7;
- habilita arranque automático tras reinicio.

## Resultado esperado

- Frontend público en `http://IP_DEL_SERVIDOR`
- Backend servido por nginx en `/api`
- Reinicio automático del backend si falla
- Verificación periódica automática del POS
- Ajustes persistentes para uso 24/7

## Variables opcionales

Puedes personalizar la instalación exportando variables antes de ejecutar el script:

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

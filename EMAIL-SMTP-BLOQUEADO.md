# Problema: Envío de emails bloqueado por ISP

## Diagnóstico

El servidor no puede enviar emails. Los logs muestran `ETIMEDOUT` en todos los intentos:

```
verify_fail  23/6/2026  10026ms  DNS: 1.1.1.1,1.0.0.1  ETIMEDOUT  Connection timeout
send_fail    22/6/2026  15111ms  DNS: 1.1.1.1,1.0.0.1  ETIMEDOUT  Connection timeout
```

Los tiempos coinciden exactamente con los límites configurados en el código:
- `verifyConnection` usa `connectionTimeout: 10_000` → falla a los ~10s
- Worker outbox usa `connectionTimeout: 15_000` → falla a los ~15s

## Causa raíz

El ISP bloquea todos los puertos SMTP salientes. Verificado en el servidor:

```
bloqueado: 25
bloqueado: 465
bloqueado: 587
bloqueado: 2525
```

Internet funciona con normalidad (ping a 8.8.8.8 OK, HTTPS a sitios web OK). El bloqueo es específico a puertos de correo — práctica estándar de los ISPs para prevenir spam.

La configuración SMTP en el POS es correcta. El problema es de red, no de código.

## Solución

Reemplazar el transporte SMTP (nodemailer) por una API REST de email que use HTTPS (puerto 443, siempre abierto).

### Archivos a modificar

- `apps/backend/src/services/email-outbox.service.js` — reemplazar `buildTransport` y `verifyConnection` por llamadas HTTP al servicio elegido
- `apps/backend/src/services/email-alert.service.js` — eliminar `getMailTransport` (ya no necesario; el transporte vive solo en outbox)
- `apps/backend/.env` — agregar la API key del servicio

El resto del sistema (outbox, logs, reintentos, worker) no necesita cambios.

### Servicios compatibles (tier gratuito)

| Servicio | Límite gratuito | SDK Node |
|----------|----------------|----------|
| **Resend** | 3.000/mes, 100/día | `npm install resend` |
| **Brevo** | 300/día | `npm install @getbrevo/brevo` |
| **SendGrid** | 100/día | `npm install @sendgrid/mail` |

### Pasos de implementación (cuando se decida)

1. Crear cuenta en el servicio elegido y generar API key
2. Agregar al `.env`: `EMAIL_API_KEY=...`
3. En `email-outbox.service.js`:
   - Eliminar el singleton `_transport` / `buildTransport` / `getTransport`
   - Reemplazar `t.sendMail(...)` por `fetch(API_URL, { method: 'POST', headers: { Authorization: 'Bearer KEY' }, body: JSON.stringify(payload) })`
   - Adaptar `verifyConnection` para hacer un ping al API en lugar de SMTP verify
4. Quitar `nodemailer` del `package.json` si ya no se usa en ningún otro lugar
5. Actualizar la UI de configuración: ocultar campos SMTP (host, puerto, SSL) y mostrar solo el campo API key

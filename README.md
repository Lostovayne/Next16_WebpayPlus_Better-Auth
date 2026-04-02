# Webpay Plus — Next.js Integration Reference

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-16.2.1-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Zod](https://img.shields.io/badge/Zod-4-3068B7?style=for-the-badge&logo=zod&logoColor=white)](https://zod.dev)
[![Bun](https://img.shields.io/badge/Bun-1.x-fbf0df?style=for-the-badge&logo=bun&logoColor=black)](https://bun.sh)
[![Biome](https://img.shields.io/badge/Biome-2.2-60A5FA?style=for-the-badge&logo=biome&logoColor=white)](https://biomejs.dev)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](./LICENSE)

**Implementación de referencia production-grade de Webpay Plus REST API sobre Next.js 16 App Router.**  
Sin el SDK oficial de Transbank. Sin magia negra. Solo `fetch`, tipos estrictos y arquitectura que sobrevive producción.

[Documentación Transbank](https://transbankdevelopers.cl/documentacion/webpay-plus) · [Referencia API](https://transbankdevelopers.cl/referencia/webpay#webpay-plus) · [Reportar un Bug](../../issues)

</div>

---

## ¿Por qué este repositorio?

La mayoría de las integraciones de Webpay que encuentras online tienen los mismos problemas:

- Llaman a `commit` sin manejar el **422** → marcan transacciones como `FAILED` cuando el usuario pagó
- No manejan el **timeout de 5 minutos** de Transbank (GET con `TBK_TOKEN`)
- No manejan la **cancelación del usuario** (POST con `TBK_TOKEN`) vs el flujo normal (POST con `token_ws`)
- No tienen **idempotencia** → doble clic = doble cargo o estado corrupto
- No tienen **worker de recuperación** → si el usuario paga y pierde conexión, el registro queda en `INITIALIZED` para siempre

Este repo resuelve todos esos casos. La implementación está auditada contra la referencia oficial de la API v1.2.

---

## Características

| Feature | Estado |
|---|---|
| Webpay Plus REST API v1.2 (sin SDK oficial) | ✅ |
| Manejo correcto de los 3 escenarios del return URL | ✅ |
| Idempotencia en confirmación (doble clic / recarga segura) | ✅ |
| Fallback inteligente en 422 (ya procesado → no marca FAILED) | ✅ |
| Worker de polling para transacciones abandonadas (Vercel Cron) | ✅ |
| Máquina de estados explícita en dominio (INITIALIZED → terminal) | ✅ |
| Anti-Corruption Layer (el dominio no conoce HTTP) | ✅ |
| Validación de env vars con Zod al startup (falla rápido) | ✅ |
| Página de éxito verifica estado real en BD (no confía en query params) | ✅ |
| Persistencia antes de llamada de red (trazabilidad garantizada) | ✅ |
| Refund API implementado (`requestRefund`) | ✅ |

---

## Stack Técnico

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.2.1 |
| Runtime | React Server Actions, RSC | 19.2.4 |
| Lenguaje | TypeScript strict mode | 5.x |
| ORM | Prisma | 7.6.0 |
| Base de datos | PostgreSQL | 17+ |
| Validación | Zod | 4.x |
| Linter/Formatter | Biome | 2.2.0 |
| Package manager | Bun | 1.x |
| Deploy | Vercel (Cron Jobs incluido) | — |

---

## Arquitectura

El proyecto usa **Hexagonal Architecture** (Ports & Adapters) organizada por feature scope:

```
src/
├── app/                          # Next.js App Router (capa de presentación)
│   ├── api/
│   │   └── webpay/
│   │       ├── return/           # POST y GET — callback de Transbank
│   │       │   └── route.ts
│   │       └── poll/             # GET — worker de polling (cron job)
│   │           └── route.ts
│   └── checkout/
│       ├── page.tsx              # UI del producto/checkout
│       ├── success/page.tsx      # Confirmación de pago (verifica BD)
│       └── error/page.tsx        # Pantalla de error
│
└── features/
    └── webpay/
        ├── domain/
        │   └── Transaction.ts    # Entidad + máquina de estados
        ├── application/
        │   └── transactionActions.ts  # Use Cases (Server Actions)
        └── infrastructure/
            ├── TransbankGateway.ts         # Adapter HTTP → Transbank API
            └── PrismaTransactionRepository.ts  # Adapter BD → Dominio
```

### Flujo de datos

```
UI (checkout/page.tsx)
  └── Server Action: initiateTransactionAction()
        ├── 1. Crea entidad WebpayTransaction en INITIALIZED
        ├── 2. Persiste en BD  ← ANTES de tocar la red
        ├── 3. TransbankGateway.createTransaction() → obtiene token + URL
        ├── 4. Persiste token en BD
        └── 5. redirect() → formulario de pago Transbank

Transbank (pasarela de pago)
  └── POST /api/webpay/return?token_ws=<token>
        └── confirmTransactionAction(token)
              ├── A) Normal: commitTransaction() → AUTHORIZED o REJECTED
              ├── B) 422: getTransactionStatus() → fallback sin marcar FAILED
              └── C) Ya terminal: idempotente, retorna estado actual

Vercel Cron (cada 5 min)
  └── GET /api/webpay/poll  [con Authorization: Bearer <CRON_SECRET>]
        └── pollStaleTransactionsAction()
              └── Encuentra INITIALIZED > 10 min → getTransactionStatus()
```

---

## Los 3 Escenarios del Return URL

Este es el punto donde falla el 90% de las integraciones. Transbank puede llamar al `return_url` de **tres formas distintas** y hay que manejarlas todas:

| Escenario | Método HTTP | Parámetros en body/query |
|---|---|---|
| Pago completado (aprobado o rechazado) | `POST` | `token_ws=<token>` |
| Usuario presionó "Anular" en la pasarela | `POST` | `TBK_TOKEN=<t>` + `TBK_ORDEN_COMPRA=<bo>` + `TBK_ID_SESION=<s>` |
| Timeout (5 min sin acción del usuario) | `GET` | `TBK_TOKEN=<t>` + `TBK_ORDEN_COMPRA=<bo>` + `TBK_ID_SESION=<s>` |

> [!IMPORTANT]
> Cuando el usuario *cancela* o hay *timeout*, **NO viene `token_ws`**. Si sólo manejas `token_ws` estás ignorando dos de los tres escenarios.

---

## Estados de la Transacción

```
INITIALIZED ──→ AUTHORIZED  (Transbank aprobó)
            └──→ REJECTED    (Transbank rechazó por fondos, límite, etc.)
            └──→ ABORTED     (usuario canceló o timeout)
            └──→ FAILED      (error técnico nuestro, nunca del banco)

AUTHORIZED  ──→ REVERSED    (refund/anulación exitosa)
```

> [!CAUTION]
> Una transacción `AUTHORIZED` **jamás puede retroceder a `FAILED`**. Si Transbank ya cobró y tu sistema falla después, debes llamar a `requestRefund()`. Un rollback de estado es un desastre contable y una violación de las políticas de Transbank.

---

## Instalación y configuración

### Prerrequisitos

- [Bun](https://bun.sh) 1.x  
- [Node.js](https://nodejs.org) 20+ (si no usas Bun)  
- PostgreSQL 14+ (local o en la nube — recomendamos [Neon](https://neon.tech))  
- Cuenta activa en [Portal Transbank Developers](https://www.transbankdevelopers.cl)

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/tu-usuario/webpay.git
cd webpay
bun install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus valores:

```env
# ─── Transbank ──────────────────────────────────────────────────────────────
# Credenciales de integración (para testing, úsalas tal cual)
WEBPAY_COMMERCE_CODE=597055555532
WEBPAY_API_SECRET=579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C
WEBPAY_ENVIRONMENT=integration   # "integration" | "production"

# ─── Base de datos ──────────────────────────────────────────────────────────
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE

# ─── App ────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ─── Cron Job (Vercel) ──────────────────────────────────────────────────────
# Genera con: openssl rand -hex 32
CRON_SECRET=tu_secret_de_minimo_32_caracteres_generado_con_openssl
```

> [!IMPORTANT]
> `NEXT_PUBLIC_APP_URL` es crítico. Transbank hace el callback POST al `return_url` que tú le indicas en `createTransaction`. Si este valor está mal, el pago funciona pero Transbank no puede devolver al usuario a tu app.

### 3. Configurar la base de datos

```bash
# Aplica las migraciones (crea la tabla webpay_transactions)
bunx prisma migrate dev --name init

# (Opcional) Genera el cliente Prisma si no se generó automáticamente
bunx prisma generate
```

### 4. Levantar el servidor de desarrollo

```bash
bun dev
```

Abre [http://localhost:3000/checkout](http://localhost:3000/checkout) y verás la pantalla de checkout.

---

## Credenciales de integración (Testing)

Usa estas credenciales en `WEBPAY_ENVIRONMENT=integration`. Son públicas y oficiales de Transbank:

| Variable | Valor |
|---|---|
| `WEBPAY_COMMERCE_CODE` | `597055555532` |
| `WEBPAY_API_SECRET` | `579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C` |

**Tarjetas de prueba en el formulario de Transbank:**

| Tipo | Número | Resultado |
|---|---|---|
| VISA aprobada | `4051 8856 0044 6623` | Aprobada |
| VISA rechazada | `4197 0230 0000 0185` | Rechazada |
| Mastercard aprobada | `5186 0595 5959 0568` | Aprobada |

CVV: cualquier número de 3 dígitos. Fecha: cualquier fecha futura. RUT: `11111111-1`. Contraseña: `123`.

---

## Variables de Entorno — Referencia completa

| Variable | Requerida | Descripción |
|---|---|---|
| `WEBPAY_COMMERCE_CODE` | ✅ | Código de comercio otorgado por Transbank |
| `WEBPAY_API_SECRET` | ✅ | Llave secreta de API |
| `WEBPAY_ENVIRONMENT` | ✅ | `integration` o `production` |
| `DATABASE_URL` | ✅ | URL PostgreSQL completa |
| `NEXT_PUBLIC_APP_URL` | ✅ | URL base de tu app (sin barra al final) |
| `CRON_SECRET` | ✅ | Secret ≥ 32 chars para el endpoint `/api/webpay/poll` |

> [!WARNING]
> Antes de pasar a producción, **cambia** `WEBPAY_COMMERCE_CODE`, `WEBPAY_API_SECRET` y `WEBPAY_ENVIRONMENT=production`. Las credenciales de integración no funcionan en producción.

---

## Esquema de Base de Datos

La tabla `webpay_transactions` almacena el ciclo de vida completo de cada intento de pago:

```sql
CREATE TABLE webpay_transactions (
  id                  VARCHAR(36)     PRIMARY KEY,  -- UUID v7
  buy_order           VARCHAR(26)     UNIQUE NOT NULL,  -- max 26 chars (Transbank)
  session_id          VARCHAR(61)     NOT NULL,
  amount              DECIMAL(17, 2)  NOT NULL,
  token               VARCHAR(64)     UNIQUE,       -- null hasta que Transbank lo devuelve
  status              VARCHAR(20)     DEFAULT 'INITIALIZED',

  -- Datos del callback de Transbank
  auth_code           VARCHAR(6),
  payment_type_code   VARCHAR(2),
  response_code       INTEGER,
  installments_amount DECIMAL(17, 2),
  installments_number INTEGER,
  aborted_reason      VARCHAR(50),
  polled_at           TIMESTAMP,      -- última vez que el worker auditó esta tx

  created_at          TIMESTAMP       DEFAULT NOW(),
  updated_at          TIMESTAMP       -- auto-updated por Prisma
);
```

---

## Worker de Polling

El endpoint `GET /api/webpay/poll` resuelve el **escenario del usuario fantasma**: pagó en el banco, pero perdió conexión (WiFi caído, celular sin batería, pestaña cerrada) antes de regresar al `return_url`. Sin este worker, la transacción quedaría en `INITIALIZED` indefinidamente aunque el dinero fue debitado.

**¿Cómo funciona?**

1. Vercel Cron lo llama cada 5 minutos (configurado en `vercel.json`)
2. Busca transacciones en `INITIALIZED` de más de 10 minutos
3. Para cada una, llama a `GET /transactions/{token}` en Transbank
4. Actualiza el estado según la respuesta (`AUTHORIZED`, `REJECTED`, o deja para el próximo ciclo)
5. Después de 7 días, si Transbank no responde, marca como `FAILED` (su API de estado ya no disponible)

**Para llamarlo manualmente en desarrollo:**

```bash
curl -X GET http://localhost:3000/api/webpay/poll \
  -H "Authorization: Bearer tu_cron_secret_aqui"
```

**Configuración en `vercel.json`:**

```json
{
  "crons": [
    {
      "path": "/api/webpay/poll",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

> [!NOTE]
> Vercel agrega el header `Authorization: Bearer <CRON_SECRET>` automáticamente en los Cron Jobs. Para invocación manual (development, CI), agrégalo manualmente como se muestra arriba.

---

## Deploy en Vercel

### 1. Configura las variables de entorno en Vercel

En el dashboard de tu proyecto → **Settings → Environment Variables**, agrega todas las variables de `.env.example` con sus valores de producción.

### 2. Asegúrate de que los Cron Jobs estén habilitados

El archivo `vercel.json` en la raíz del proyecto configura el cron automáticamente. Solo asegúrate de que tu plan de Vercel soporte Cron Jobs (Pro o superior).

### 3. Deploy

```bash
# Con Vercel CLI
vercel --prod

# O simplemente haz push a main si tienes CI/CD configurado
git push origin main
```

---

## Comandos disponibles

```bash
bun dev          # Servidor de desarrollo con Turbopack (http://localhost:3000)
bun build        # Build de producción
bun start        # Servidor de producción
bun lint         # Biome: linting + type checking
bun format       # Biome: formateo automático del código

# Prisma
bunx prisma migrate dev --name <nombre>   # Nueva migración
bunx prisma generate                       # Regenerar cliente
bunx prisma studio                         # GUI de la BD en browser
bunx prisma migrate status                 # Estado de migraciones
```

---

## Estructura del Anti-Corruption Layer

El `TransbankGateway` es el único archivo que sabe que Transbank existe. El dominio y la aplicación trabajan con interfaces limpias:

```typescript
// ✅ El dominio solo conoce esto:
interface WebpayInitResponse {
  token: string;
  url: string;
}

// ✅ Y el use case solo hace esto:
const { token, url } = await gateway.createTransaction(buyOrder, sessionId, amount, returnUrl);

// ❌ Nunca esto en el dominio o application:
fetch("https://webpay3g.transbank.cl/...", { headers: { "Tbk-Api-Key-Id": ... } });
```

Si mañana Transbank cambia su API, su URL o sus headers, **solo tocas `TransbankGateway.ts`** y el resto del sistema no sabe que pasó algo.

---

## Manejo del error 422

El 422 de Transbank merece atención especial. La documentación dice:

> *Si el comercio reintenta el commit de una transacción ya confirmada, recibirá un HTTP 422.*

Esto pasa más de lo que crees: doble clic del usuario, recarga de página, retry del worker, caída de red después del commit. La implementación correcta **no es marcar FAILED** — es consultar el estado real:

```typescript
try {
  const response = await gateway.commitTransaction(token);
  // Proceso normal...
} catch (error) {
  if (error instanceof TransbankAlreadyProcessedError) {
    // 422: ya fue procesado antes → recuperar el estado real sin marcar FAILED
    const status = await gateway.getTransactionStatus(token);
    // Ahora sí actualizamos el estado correctamente
  }
}
```

---

## Limitaciones de la API Transbank que debes conocer

| Restricción | Valor | Impacto |
|---|---|---|
| `buy_order` máximo | 26 caracteres | Validado en dominio |
| `session_id` máximo | 61 caracteres | UUID v4 = 36 chars ✅ |
| Monto máximo CLP | 999.999.999 | Validado en dominio |
| Monto mínimo | > 0 | Validado en dominio |
| Disponibilidad estado (`GET /transactions/{token}`) | 7 días desde creación | El worker lo respeta |
| Reversa (`POST /transactions/{token}/refunds`) | Solo mismo día contable para reversa; anulación tiene otras reglas | No ignorar esto en prod |

---

## Contribuir

1. Fork del repositorio
2. Crea una rama: `git checkout -b feat/mi-mejora`
3. Commitea tus cambios: `git commit -m "feat: descripción"`
4. Push: `git push origin feat/mi-mejora`
5. Abre un Pull Request

Antes de hacer PR, asegúrate de que el linter pase:

```bash
bun lint
```

---

## Licencia

MIT — úsalo, modifícalo, véndelo si quieres. Solo no vengas a llorar si no manejas el 422.

---

<div align="center">

Documentación oficial: [transbankdevelopers.cl](https://transbankdevelopers.cl) · API Referencia: [Webpay Plus](https://transbankdevelopers.cl/referencia/webpay#webpay-plus)

</div>

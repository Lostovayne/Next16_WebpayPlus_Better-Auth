# Plan: Fix ORDEN Desconocida + Better Auth Integration

## Diagnóstico del Bug "ORDEN: Desconocida"

El problema está en `success/page.tsx` línea 4: Next.js 16 hace que `searchParams` sea una **Promise** (async prop), no un objeto síncrono. El componente lo usa directamente como si fuera síncrono → `buyOrder` siempre `undefined` → "Desconocida".

```
// ❌ Así está ahora (rompe en Next.js 16)
export default function CheckoutSuccessPage({
  searchParams,
}: { searchParams: { buyOrder?: string } })

// ✅ Así debe ser
export default async function CheckoutSuccessPage({
  searchParams,
}: { searchParams: Promise<{ buyOrder?: string }> }) {
  const { buyOrder } = await searchParams;
```

El mismo problema existe en `error/page.tsx`.

---

## Fase 1: Fix inmediato — ORDEN Desconocida

### [MODIFY] success/page.tsx

- `async` en el componente
- `searchParams: Promise<{ buyOrder?: string }>`
- `const { buyOrder } = await searchParams`

### [MODIFY] error/page.tsx (probable mismo bug)

- Mismo patrón async para `reason`

---

## Fase 2: Better Auth Integration

### Qué añade Better Auth al proyecto

Con Better Auth podremos:

- Registrar/login de usuarios (email + password)
- Asociar cada `WebpayTransaction` a un `userId`
- Ver historial de compras por usuario
- Proteger rutas de checkout (solo usuarios logueados pagan)

### Cambios de Schema (Prisma)

```prisma
// Better Auth genera estas tablas automáticamente:
// user, session, account, verification

// Añadimos relación a WebpayTransaction:
model WebpayTransaction {
  // ... campos existentes ...
  userId  String? @map("user_id")        // nullable → permite pagos sin cuenta
  user    User?   @relation(fields: [userId], references: [id])
}
```

### Archivos nuevos / modificados

#### [NEW] src/shared/lib/auth.ts

- Configuración de Better Auth con Prisma adapter
- Email + password habilitado
- Tipado inferido `typeof auth.$Infer.Session`

#### [NEW] src/shared/lib/auth-client.ts

- `createAuthClient` para React (hook `useSession`)

#### [NEW] src/app/api/auth/[...all]/route.ts

- Route handler que delega todo a Better Auth

#### [MODIFY] prisma/schema.prisma

- Tablas de Better Auth (user, session, account, verification)
- Relación `userId` en `WebpayTransaction`

#### [MODIFY] src/features/webpay/application/transactionActions.ts

- `initiateTransactionAction` recibe `userId` opcional
- Se guarda en BD junto a la transacción

#### [NEW] src/app/(auth)/login/page.tsx

#### [NEW] src/app/(auth)/register/page.tsx

- UI limpia de login/registro

#### [MODIFY] src/app/checkout/page.tsx

- Si el usuario está logueado → pagar con userId asociado
- Si no → pago como invitado (userId null)

#### [NEW] src/app/dashboard/orders/page.tsx

- Historial de órdenes del usuario logueado

### Variables de entorno a añadir

```bash
BETTER_AUTH_SECRET=   # openssl rand -base64 32
BETTER_AUTH_URL=      # = NEXT_PUBLIC_APP_URL
```

---

## Orden de ejecución

1. Fix `success/page.tsx` y `error/page.tsx` → inmediato, sin migración
2. `bun add better-auth`
3. Configurar `auth.ts` + route handler
4. Modificar schema Prisma + generar migración
5. Ejecutar `bunx @better-auth/cli generate` → añade tablas al schema
6. `bun x prisma migrate dev --name add-better-auth`
7. Añadir envs al `.env` y `.env.example`
8. UI de login/registro
9. Asociar userId en checkout

## Open Questions

> [!IMPORTANT]
> ¿Quieres pagos como **invitado** (sin cuenta) o solo usuarios registrados pueden pagar?
>
> - **Opción A:** Solo usuarios registrados (checkout protegido con redirect a /login)
> - **Opción B:** Cualquiera puede pagar, pero si tienes cuenta se asocia automáticamente

> [!IMPORTANT]
> ¿Necesitas login social (Google, GitHub) además de email/password, o solo email/password por ahora?

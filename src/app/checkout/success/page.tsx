import { transactionRepository } from "@/features/webpay/infrastructure/PrismaTransactionRepository";
import { redirect } from "next/navigation";

/**
 * Página de confirmación de pago exitoso.
 *
 * SEGURIDAD: No confiamos en el buyOrder de la query string para mostrar
 * el resultado. Solo lo usamos como clave de búsqueda en nuestra BD.
 * Si la transacción no existe o no está AUTHORIZED → redirect a error.
 * Esto previene que alguien llegue directamente a esta URL con un buyOrder
 * inventado y vea una pantalla de "pago exitoso" sin haber pagado nada.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ buyOrder?: string }>;
}) {
  const { buyOrder } = await searchParams;

  if (!buyOrder) {
    redirect("/checkout/error?reason=no_buy_order");
  }

  const transaction = await transactionRepository.findByBuyOrder(buyOrder);

  // Doble verificación: existe en BD y está realmente AUTHORIZED.
  if (!transaction || transaction.props.status !== "AUTHORIZED") {
    redirect("/checkout/error?reason=not_authorized");
  }

  const { authCode, amount, installmentsNumber } = transaction.props;

  return (
    <main className="min-h-screen grid items-center justify-center p-8 bg-black text-white">
      <div className="max-w-md w-full border border-green-800 p-8 rounded-xl bg-gray-900 shadow-2xl text-center">
        <div className="w-16 h-16 bg-green-900 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold">
          ✓
        </div>
        <h1 className="text-2xl font-bold mb-2 text-green-400">Pago Exitoso</h1>
        <dl className="text-left space-y-2 mb-6 text-sm font-mono bg-black/50 p-4 rounded">
          <div className="flex justify-between">
            <dt className="text-gray-500">Orden</dt>
            <dd className="text-gray-200">{buyOrder}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Monto</dt>
            <dd className="text-gray-200">${amount.toLocaleString("es-CL")} CLP</dd>
          </div>
          {authCode && (
            <div className="flex justify-between">
              <dt className="text-gray-500">Código Auth</dt>
              <dd className="text-gray-200">{authCode}</dd>
            </div>
          )}
          {installmentsNumber && installmentsNumber > 1 && (
            <div className="flex justify-between">
              <dt className="text-gray-500">Cuotas</dt>
              <dd className="text-gray-200">{installmentsNumber}</dd>
            </div>
          )}
        </dl>
        <a
          href="/checkout"
          className="text-blue-400 hover:text-blue-300 underline underline-offset-4 text-sm uppercase tracking-wide transition-colors"
        >
          Volver a la tienda
        </a>
      </div>
    </main>
  );
}

import { initiateTransactionAction } from "@/features/webpay/application/transactionActions";

export default function CheckoutPage() {
  return (
    <main className="min-h-screen grid items-center justify-center p-8 bg-black text-white">
      <div className="max-w-md w-full border border-gray-800 p-8 rounded-xl bg-gray-900 shadow-2xl">
        <h1 className="text-2xl font-bold mb-4">Integración Webpay</h1>
        <p className="text-gray-400 mb-8 border-l-4 border-blue-600 pl-4 py-1 italic">
          "Arquitectura Limpia. Gateway Aisaldo. Sin Mierda de Terceros. Solo Código Puro que corre
          en 1ms en Prod." - L. Torvalds
        </p>
        <form
          action={async () => {
            "use server";
            // Aca inicias por el Action, nada de states y onClick de mierda
            await initiateTransactionAction(15000);
          }}
        >
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition-colors uppercase tracking-widest text-sm"
          >
            Pagar $15,000 CLP Seguro
          </button>
        </form>
      </div>
    </main>
  );
}

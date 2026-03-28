export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ buyOrder?: string }>;
}) {
  const { buyOrder } = await searchParams;
  return (
    <main className="min-h-screen grid items-center justify-center p-8 bg-black text-white">
      <div className="max-w-md w-full border border-green-800 p-8 rounded-xl bg-gray-900 shadow-2xl text-center">
        <div className="w-16 h-16 bg-green-900 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold">
          ✓
        </div>
        <h1 className="text-2xl font-bold mb-2 text-green-400">Pago Exitoso</h1>
        <p className="text-gray-400 mb-6 font-mono text-sm tracking-widest bg-black/50 p-2 rounded">
          ORDEN: {buyOrder ?? "Desconocida"}
        </p>
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

export default function InactiveCardPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-xl">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-4 font-bold text-xl">
          !
        </div>
        <h1 className="text-xl font-semibold mb-2">
          Tarjeta pendiente de activación
        </h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Esta tarjeta inteligente aún no tiene un enlace asignado o se
          encuentra temporalmente pausada. Si eres el propietario del negocio,
          contacta a soporte para activarla.
        </p>
      </div>
    </main>
  );
}

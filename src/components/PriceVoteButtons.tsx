'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useId, useState } from 'react';
import { formatMoney } from '@/lib/format';
import { GroupPrice, groupErrorMessage, unvotePrice, votePrice } from '@/lib/group';
import { myVote, Verdict } from '@/lib/price-validation';

/** "¿Cuánto viste?" escrito como número mayor que 0 y menor que mil millones; null si no */
function parseSeen(text: string): number | null {
  const amount = Number(text.replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(amount) && amount > 0 && amount < 1e9 ? amount : null;
}

/** Voto mostrado después de votar, hasta que llegan los precios del grupo con el voto nuevo */
interface Local {
  verdict: Verdict | null;
  /** El voto que traían las props al votar: si cambia, ya llegó la respuesta y el local no hace falta */
  base: Verdict | null;
}

const VERDICT_STYLE: Record<Verdict, string> = {
  ok: 'border-green-600 bg-green-50 text-green-800 hover:bg-green-100 active:bg-green-100',
  no: 'border-red-600 bg-red-50 text-red-800 hover:bg-red-100 active:bg-red-100',
};

/**
 * "Está bien" y "No coincide" sobre un precio de otro integrante (spec 23). Tocar uno vota (o cambia el voto); tocar
 * el marcado lo quita. Después de "No coincide", "¿Cuánto viste? (opcional)" con Guardar, que vuelve a votar con el
 * monto. Cada voto vacía la caché del grupo: las pantallas vuelven a pedir los precios con el estado nuevo
 */
export default function PriceVoteButtons({ price, myUserId }: { price: GroupPrice; myUserId: string }) {
  const seenId = useId();
  const errorId = useId();
  const mine = myVote(price.validation, myUserId);
  const propVerdict = mine?.verdict ?? null;
  const [local, setLocal] = useState<Local | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [askSeen, setAskSeen] = useState(false);
  const [seen, setSeen] = useState('');

  // Llegó el voto desde la base (o cambió en otro lado): manda lo que dicen las props
  if (local && local.base !== propVerdict) setLocal(null);
  const verdict = local ? local.verdict : propVerdict;
  const where = `$${formatMoney(price.amount)} en ${price.store.name}`;

  async function run(action: () => Promise<void>, next: Verdict | null): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      await action();
      setLocal({ verdict: next, base: propVerdict });
      return true;
    } catch (e) {
      setError(groupErrorMessage(e instanceof Error ? e.message : undefined));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggle(choice: Verdict) {
    if (verdict === choice) {
      setAskSeen(false);
      await run(() => unvotePrice(price.memberId, price.priceId), null);
      return;
    }
    const ok = await run(() => votePrice(price.memberId, price.priceId, choice), choice);
    if (ok && choice === 'no') {
      setSeen('');
      setAskSeen(true);
    } else if (ok) {
      setAskSeen(false);
    }
  }

  async function saveSeen() {
    const amount = parseSeen(seen);
    if (amount === null) return;
    if (await run(() => votePrice(price.memberId, price.priceId, 'no', amount), 'no')) setAskSeen(false);
  }

  const button = (choice: Verdict) => {
    const pressed = verdict === choice;
    const Icon = choice === 'ok' ? ThumbsUp : ThumbsDown;
    const label = choice === 'ok' ? 'Está bien' : 'No coincide';
    return (
      <button
        type="button"
        onClick={() => toggle(choice)}
        disabled={busy}
        aria-pressed={pressed}
        aria-busy={busy || undefined}
        aria-label={`${label}: ${where}`}
        aria-describedby={error ? errorId : undefined}
        className={`btn-secondary inline-flex flex-1 items-center justify-center gap-2 border px-3 text-sm sm:flex-none ${
          pressed ? VERDICT_STYLE[choice] : 'border-transparent'}`}>
        <Icon aria-hidden="true" className={`size-4 ${pressed ? 'fill-current' : ''}`} />
        {label}
      </button>
    );
  };

  const seenAmount = parseSeen(seen);
  return (
    <div className="mt-2">
      <div className="flex gap-2">
        {button('ok')}
        {button('no')}
      </div>

      {askSeen && verdict === 'no' && (
        <form
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2"
          onSubmit={e => { e.preventDefault(); void saveSeen(); }}>
          <label htmlFor={seenId} className="text-sm font-semibold text-gray-900">¿Cuánto viste? (opcional)</label>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-36">
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-semibold text-gray-500">
                $
              </span>
              <input
                id={seenId}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={seen}
                onChange={e => setSeen(e.target.value)}
                className="input-field w-full appearance-none pl-7 text-right tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
              />
            </div>
            <button
              type="submit"
              disabled={busy || seenAmount === null}
              aria-busy={busy || undefined}
              className="btn-primary shrink-0 px-4 text-sm">
              Guardar
            </button>
          </div>
        </form>
      )}

      {error && <p id={errorId} role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}

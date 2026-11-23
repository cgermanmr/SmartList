'use client';

import { Mail } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useId, useState, useSyncExternalStore } from 'react';
import { isIosStandalone, sendEmailCode, signInWithGoogle, validCode, validEmail } from '@/lib/auth';

const RESEND_SECONDS = 60;
const noSubscribe = () => () => {};

function iosStandalone(): boolean {
  const standalone = (navigator as { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  return isIosStandalone(navigator.userAgent, standalone);
}

/** Logo de Google (multicolor, como lo pide su guía de marca para el botón) */
function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5 shrink-0">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/**
 * Entrar con Google o con un mail: se pide el mail, llega un mail con un código de 6 dígitos y un link; en la app
 * instalada del iPhone (que no comparte datos con Safari) solo sirve el código
 */
interface Props {
  onCodeEntered: (email: string, code: string) => Promise<void>;
  /** Ruta a la que vuelve el login con Google o el link del mail (por defecto /cuenta) */
  redirectTo?: string;
  /** Título y bajada de la tarjeta, si no son los de /cuenta */
  title?: string;
  intro?: string;
}

export default function SignInForm({ onCodeEntered, redirectTo, title, intro }: Props) {
  const ios = useSyncExternalStore(noSubscribe, iosStandalone, () => false);
  const emailId = useId();
  const codeId = useId();

  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  // Cuenta regresiva para "Reenviar el mail"
  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function google() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle(redirectTo); // navega a Google
    } catch {
      setBusy(false);
      setError('No se pudo abrir el login de Google. Probá de nuevo.');
    }
  }

  async function send(address: string) {
    setBusy(true);
    setError(null);
    try {
      await sendEmailCode(address, redirectTo);
      setSentTo(address.trim());
      setCode('');
      setWait(RESEND_SECONDS);
    } catch {
      setError('No se pudo mandar el mail. Esperá un momento y probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  function submitEmail(e: FormEvent) {
    e.preventDefault();
    if (!validEmail(email)) {
      setError('Revisá el mail');
      return;
    }
    void send(email);
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!sentTo) return;
    if (!validCode(code)) {
      setError('El código tiene 6 números');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCodeEntered(sentTo, code);
    } catch {
      setError('El código no es válido o venció. Pedí uno nuevo.');
      setBusy(false);
    }
  }

  // ── Código enviado ───────────────────────────────────────
  if (sentTo) {
    return (
      <div className="card p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Mail aria-hidden="true" className="size-5 text-primary-700" />
          Te mandamos un mail a {sentTo}
        </h2>
        <p className="mt-1 text-gray-600">
          Escribí el código de 6 números que llegó en el mail{ios ? '.' : ', o tocá el link desde este teléfono.'}
        </p>
        <form onSubmit={submitCode} noValidate className="mt-4">
          <label htmlFor={codeId} className="mb-1 block text-sm font-semibold text-gray-700">Código</label>
          <input
            id={codeId}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={e => setCode(e.target.value.replace(/[^\d ]/g, ''))}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${codeId}-error` : undefined}
            className="input-field max-w-48 text-center font-display text-2xl tracking-[0.3em] tabular-nums"
          />
          {error && <p id={`${codeId}-error`} role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary mt-4 w-full sm:w-auto sm:px-8">
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
          <button
            type="button"
            disabled={wait > 0 || busy}
            onClick={() => void send(sentTo)}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 underline underline-offset-2 disabled:text-gray-500 disabled:no-underline">
            {wait > 0 ? `Reenviar el mail en ${wait} s` : 'Reenviar el mail'}
          </button>
          <button
            type="button"
            onClick={() => { setSentTo(null); setError(null); }}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 underline underline-offset-2">
            Usar otro mail
          </button>
        </div>
      </div>
    );
  }

  // ── Elegir cómo entrar ───────────────────────────────────
  return (
    <div className="card p-5">
      <h2 className="text-lg font-semibold">{title ?? 'Guardá tus datos y usalos en cualquier teléfono'}</h2>
      <p className="mt-1 text-gray-600">{intro ?? 'Tus productos, precios, carrito y compras quedan en tu cuenta.'}</p>

      <button
        type="button"
        onClick={() => void google()}
        disabled={busy}
        className="mt-5 flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 font-semibold text-gray-900 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-wait">
        <GoogleLogo />
        Continuar con Google
      </button>
      {ios && <p className="mt-2 text-sm text-gray-600">Si no vuelve a la app, entrá con tu mail.</p>}

      <div className="my-5 flex items-center gap-3 text-sm text-gray-500" aria-hidden="true">
        <span className="h-px flex-1 bg-gray-200" />o<span className="h-px flex-1 bg-gray-200" />
      </div>

      <form onSubmit={submitEmail} noValidate>
        <label htmlFor={emailId} className="mb-1 block text-sm font-semibold text-gray-700">Tu mail</label>
        <input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="nombre@mail.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${emailId}-error` : undefined}
          className="input-field"
        />
        {error && <p id={`${emailId}-error`} role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="btn-secondary mt-3 w-full">
          {busy ? 'Enviando…' : 'Enviarme el código'}
        </button>
      </form>

      <p className="mt-5 text-sm text-gray-600">
        Sin cuenta, tus datos quedan solo en este teléfono.{' '}
        <Link href="/privacidad" className="font-semibold text-primary-700 underline underline-offset-2">Privacidad</Link>
      </p>
    </div>
  );
}

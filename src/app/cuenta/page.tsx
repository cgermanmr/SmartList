'use client';

import { BadgeCheck, ChevronRight, CloudOff, LoaderCircle, RefreshCw, TriangleAlert, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuth } from '@/components/useAuth';
import { useMyGroup } from '@/components/useMyGroup';
import { useNow } from '@/components/useNow';
import { usePendingValidations } from '@/components/usePendingValidations';
import { AccountUser, deleteAccountData, verifyEmailCode } from '@/lib/auth';
import { formatTimeAgo } from '@/lib/format';
import { pendingCount, signOutEverywhere, SyncStatus, syncNow, useSyncStatus } from '@/lib/sync-engine';
import SignInForm from './SignInForm';

const LINK = 'font-semibold text-primary-700 underline underline-offset-2';

/** Cuenta (spec 21): entrar con Google o con un código por mail; con sesión, el estado de la sincronización */
export default function AccountPage() {
  const auth = useAuth();
  const status = useSyncStatus(s => s.status);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-bold">Cuenta</h1>

      {auth.status === 'off' && (
        <p className="card p-5 text-gray-600">La cuenta no está disponible en este momento. Tus datos quedan en este teléfono.</p>
      )}
      {auth.status === 'loading' && <p role="status" className="py-12 text-center text-gray-500">Cargando…</p>}
      {auth.status === 'out' && (
        <>
          {status.state === 'expired' && (
            <p role="status" className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-amber-900">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              Tu sesión venció. Entrá de nuevo para sincronizar
            </p>
          )}
          <SignInForm onCodeEntered={verifyEmailCode} />
        </>
      )}
      {auth.status === 'in' && <SignedIn user={auth.user} status={status} />}
    </div>
  );
}

// ── Con sesión ───────────────────────────────────────────────

type Confirming = { kind: 'signout'; pending: number } | { kind: 'delete' } | null;

function SignedIn({ user, status }: { user: AccountUser; status: SyncStatus }) {
  const pending = useSyncStatus(s => s.pending);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setError(null);
    await syncNow(); // lo que se pueda subir, se sube antes de salir
    const left = pendingCount();
    setBusy(false);
    if (left > 0) setConfirming({ kind: 'signout', pending: left });
    else await finishSignOut();
  }

  async function finishSignOut() {
    setBusy(true);
    try {
      await signOutEverywhere();
    } catch {
      setError('No se pudo cerrar la sesión. Probá de nuevo.');
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      await deleteAccountData();
      await signOutEverywhere().catch(() => undefined); // la cuenta ya no existe: alcanza con limpiar el teléfono
      setConfirming(null);
    } catch {
      setError('No se pudo borrar la cuenta. Revisá la conexión y probá de nuevo.');
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card p-5">
        <p className="break-words font-display text-lg font-semibold">{user.name}</p>
        <p className="break-words text-gray-600">{user.email}</p>

        <SyncLine status={status} pending={pending} />

        <button type="button" onClick={() => void signOut()} disabled={busy} className="btn-secondary mt-5 w-full">
          {busy && confirming === null ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </div>

      <GroupSection userId={user.id} />

      <div className="mt-8 border-t border-gray-200 pt-5">
        <p className="text-sm text-gray-600">Borra tu cuenta y todos tus datos guardados, en todos tus dispositivos.</p>
        <button
          type="button"
          onClick={() => setConfirming({ kind: 'delete' })}
          disabled={busy}
          className="mt-2 inline-flex min-h-11 items-center rounded-xl px-1 font-semibold text-red-700 underline underline-offset-2 hover:text-red-800">
          Borrar mi cuenta
        </button>
        <p className="mt-4 text-sm"><Link href="/privacidad" className={LINK}>Privacidad</Link></p>
      </div>

      <ConfirmDialog
        open={confirming?.kind === 'signout'}
        title="¿Cerrar sesión?"
        message={confirming?.kind === 'signout'
          ? `Hay ${confirming.pending === 1 ? '1 cambio' : `${confirming.pending} cambios`} sin subir. Si cerrás sesión, se pierden.`
          : ''}
        confirmLabel="Cerrar sesión igual"
        danger
        busy={busy}
        onConfirm={() => void finishSignOut()}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming?.kind === 'delete'}
        title="¿Borrar tu cuenta?"
        message="Se borran tu cuenta y todos tus datos, en todos tus dispositivos. No se puede deshacer."
        confirmLabel={busy ? 'Borrando…' : 'Borrar mi cuenta'}
        danger
        busy={busy}
        onConfirm={() => void deleteAccount()}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

// ── Grupo (spec 22) ──────────────────────────────────────────

/**
 * El grupo con la cantidad de integrantes, o la invitación a crear uno; los dos llevan a /grupo. Con precios por
 * validar (spec 23), debajo el link "Por validar (N)"
 */
function GroupSection({ userId }: { userId: string }) {
  const { status, group } = useMyGroup(userId);
  const members = group?.members.length ?? 0;
  const validations = usePendingValidations(status === 'ready' && group ? userId : null);
  const toValidate = validations.status === 'ready' ? validations.pending.length : 0;

  return (
    <section aria-labelledby="account-group" className="mt-4">
      <h2 id="account-group" className="mb-2 px-1 text-lg font-semibold">Grupo</h2>
      <Link href="/grupo" className="card list-row rounded-2xl p-4">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <Users className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          {status === 'loading' && <span className="text-gray-500">Cargando…</span>}
          {status === 'error' && <span className="font-semibold">Ver el grupo</span>}
          {status === 'ready' && group && (
            <>
              <span className="block truncate font-semibold">{group.name}</span>
              <span className="block text-sm text-gray-600">{members === 1 ? '1 integrante' : `${members} integrantes`}</span>
            </>
          )}
          {status === 'ready' && !group && (
            <>
              <span className="block text-gray-700">Compartí precios con tu familia o tus amigos</span>
              <span className="block font-semibold text-primary-700">Crear o unirte a un grupo</span>
            </>
          )}
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-gray-500" />
      </Link>
      {group && toValidate > 0 && (
        <Link href="/grupo/validar" className="card list-row mt-2 rounded-2xl p-4">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
            <BadgeCheck className="size-5" />
          </span>
          <span className="min-w-0 flex-1 font-semibold">Por validar ({toValidate})</span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-gray-500" />
        </Link>
      )}
    </section>
  );
}

/** Estado de la sincronización: "Sincronizado hace 1 min", "Sincronizando…", sin conexión o con error */
function SyncLine({ status, pending }: { status: SyncStatus; pending: number }) {
  const now = useNow();
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const changes = pending === 1 ? '1 cambio sin subir' : `${pending} cambios sin subir`;

  let content: React.ReactNode = null;
  if (status.state === 'syncing') {
    content = (
      <span className="flex items-center gap-2 text-gray-600">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
        Sincronizando…
      </span>
    );
  } else if (offline && pending > 0) {
    content = (
      <span className="flex items-center gap-2 text-amber-800">
        <CloudOff aria-hidden="true" className="size-4" />
        {changes} · Sin conexión
      </span>
    );
  } else if (status.state === 'error') {
    content = (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 text-amber-800">
          <TriangleAlert aria-hidden="true" className="size-4" />
          No se pudo sincronizar
        </span>
        <button type="button" onClick={() => void syncNow()} className={`inline-flex min-h-11 items-center gap-1.5 ${LINK}`}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Reintentar
        </button>
      </span>
    );
  } else if (status.state === 'idle' && status.lastSync) {
    content = <span className="text-gray-600">Sincronizado {formatTimeAgo(status.lastSync, now)}</span>;
  }

  return <p role="status" className="mt-3 min-h-6 text-sm">{content}</p>;
}

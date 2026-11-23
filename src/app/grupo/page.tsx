'use client';

import { ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/components/useAuth';
import { useMyGroup } from '@/components/useMyGroup';
import { AccountUser } from '@/lib/auth';
import CreateGroup from './CreateGroup';
import GroupView from './GroupView';

/** Grupo (spec 22): crear uno o, con grupo, invitar, ver los integrantes, el apodo, compartir y salir */
export default function GroupPage() {
  const auth = useAuth();

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href="/cuenta"
        className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 font-semibold text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
        <ArrowLeft aria-hidden="true" className="size-5" /> Cuenta
      </Link>

      {auth.status === 'off' && (
        <>
          <h1 className="mb-4 text-3xl font-bold">Grupo</h1>
          <p className="card p-5 text-gray-600">Los grupos no están disponibles</p>
        </>
      )}
      {auth.status === 'loading' && <p role="status" className="py-12 text-center text-gray-500">Cargando…</p>}
      {auth.status === 'out' && (
        <>
          <h1 className="mb-4 text-3xl font-bold">Grupo</h1>
          <div className="card p-5">
            <p className="text-gray-700">Entrá con tu cuenta para crear un grupo o unirte a uno</p>
            <Link href="/cuenta" className="btn-primary mt-4 w-full">Entrar</Link>
          </div>
        </>
      )}
      {auth.status === 'in' && <SignedIn user={auth.user} />}
    </div>
  );
}

function SignedIn({ user }: { user: AccountUser }) {
  const { status, group, retry, refresh } = useMyGroup(user.id);

  if (status === 'loading') return <p role="status" className="py-12 text-center text-gray-500">Cargando…</p>;
  if (status === 'error') {
    return (
      <>
        <h1 className="mb-4 text-3xl font-bold">Grupo</h1>
        <div role="alert" className="card p-5">
          <p className="text-gray-700">No se pudo cargar el grupo</p>
          <button type="button" onClick={retry} className="btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2">
            <RefreshCw aria-hidden="true" className="size-4" /> Reintentar
          </button>
        </div>
      </>
    );
  }
  if (!group) return <CreateGroup user={user} onCreated={refresh} />;
  return <GroupView group={group} userId={user.id} onChange={refresh} />;
}

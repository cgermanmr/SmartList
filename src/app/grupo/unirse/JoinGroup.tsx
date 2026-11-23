'use client';

import { RefreshCw, TriangleAlert, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useId, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuth } from '@/components/useAuth';
import { useMyGroup } from '@/components/useMyGroup';
import { AccountUser, verifyEmailCode } from '@/lib/auth';
import {
  defaultNickname, Group, GROUP_MAX_MEMBERS, groupErrorMessage, joinGroup, previewGroup, validNickname,
} from '@/lib/group';
import { supabase } from '@/lib/supabase';
import SignInForm from '../../cuenta/SignInForm';

interface Invitation {
  name: string;
  members: number;
}

type Preview =
  | { key: string; state: 'ok'; invitation: Invitation }
  | { key: string; state: 'invalid' }
  | { key: string; state: 'error' };

const MESSAGE = 'card flex items-start gap-3 p-5 text-gray-700';

/** /grupo/unirse?c=<código>: a qué grupo invitan y, con sesión, el apodo y Unirme (o salir del actual y unirse) */
export default function JoinGroup() {
  const code = useSearchParams().get('c')?.trim() ?? '';
  const auth = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const key = code ? `${code}|${attempt}` : '';

  useEffect(() => {
    if (!key || !supabase) return undefined;
    let stale = false;
    previewGroup(code).then(
      invitation => { if (!stale) setPreview(invitation ? { key, state: 'ok', invitation } : { key, state: 'invalid' }); },
      () => { if (!stale) setPreview({ key, state: 'error' }); },
    );
    return () => { stale = true; };
  }, [key, code]);

  const current = preview?.key === key ? preview : null;

  let content: React.ReactNode;
  if (!supabase) {
    content = <p className="card p-5 text-gray-600">Los grupos no están disponibles</p>;
  } else if (!code || current?.state === 'invalid') {
    content = <InvalidLink />;
  } else if (!current) {
    content = <p role="status" className="py-12 text-center text-gray-500">Cargando…</p>;
  } else if (current.state === 'error') {
    content = (
      <div role="alert" className="card p-5">
        <p className="text-gray-700">No se pudo consultar la invitación. Revisá la conexión.</p>
        <button type="button" onClick={() => setAttempt(a => a + 1)}
          className="btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2">
          <RefreshCw aria-hidden="true" className="size-4" /> Reintentar
        </button>
      </div>
    );
  } else {
    const { invitation } = current;
    const full = invitation.members >= GROUP_MAX_MEMBERS;
    content = (
      <>
        <InvitationHeader invitation={invitation} />
        {auth.status === 'loading' && <p role="status" className="py-8 text-center text-gray-500">Cargando…</p>}
        {auth.status === 'out' && (
          full ? <GroupFull /> : (
            <SignInForm
              onCodeEntered={verifyEmailCode}
              redirectTo={`/grupo/unirse?c=${encodeURIComponent(code)}`}
              title="Entrá con tu cuenta para unirte"
              intro="El grupo ve tus precios y vos los suyos. Tu mail no se muestra."
            />
          )
        )}
        {auth.status === 'in' && <SignedIn user={auth.user} code={code} invitation={invitation} full={full} />}
      </>
    );
  }

  return <div className="mx-auto max-w-lg">{content}</div>;
}

function InvitationHeader({ invitation }: { invitation: Invitation }) {
  return (
    <header className="mb-5 flex items-start gap-3">
      <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
        <Users className="size-6" />
      </span>
      <h1 className="min-w-0 break-words text-2xl font-bold">
        Te invitaron a {invitation.name}{' '}
        <span className="font-sans text-lg font-semibold text-gray-600">
          ({invitation.members === 1 ? '1 integrante' : `${invitation.members} integrantes`})
        </span>
      </h1>
    </header>
  );
}

function InvalidLink() {
  return (
    <>
      <h1 className="mb-4 text-3xl font-bold">Unirse a un grupo</h1>
      <p role="alert" className={MESSAGE}>
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-700" />
        El link de invitación no es válido o cambió. Pedile uno nuevo a alguien del grupo.
      </p>
    </>
  );
}

function GroupFull() {
  return (
    <p role="alert" className={MESSAGE}>
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-700" />
      {groupErrorMessage('group_full')}
    </p>
  );
}

// ── Con sesión ───────────────────────────────────────────────

interface SignedInProps {
  user: AccountUser;
  code: string;
  invitation: Invitation;
  full: boolean;
}

function SignedIn({ user, code, invitation, full }: SignedInProps) {
  const { status, group, retry, refresh } = useMyGroup(user.id);

  if (status === 'loading') return <p role="status" className="py-8 text-center text-gray-500">Cargando…</p>;
  if (status === 'error') {
    return (
      <div role="alert" className="card p-5">
        <p className="text-gray-700">No se pudo cargar tu grupo. Revisá la conexión.</p>
        <button type="button" onClick={retry} className="btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2">
          <RefreshCw aria-hidden="true" className="size-4" /> Reintentar
        </button>
      </div>
    );
  }
  if (group?.inviteCode === code) {
    return (
      <div className="card p-5">
        <p className="text-gray-700">Ya estás en este grupo</p>
        <Link href="/grupo" className="btn-primary mt-4 w-full">Ver el grupo</Link>
      </div>
    );
  }
  if (full) return <GroupFull />;
  return <JoinForm user={user} code={code} invitation={invitation} current={group} onStale={refresh} />;
}

interface JoinFormProps {
  user: AccountUser;
  code: string;
  invitation: Invitation;
  /** El grupo en el que ya está, si está en uno */
  current: Group | null;
  /** Ya estaba en un grupo y no se sabía (otro teléfono): volver a pedirlo */
  onStale: () => Promise<void>;
}

function JoinForm({ user, code, invitation, current, onStale }: JoinFormProps) {
  const router = useRouter();
  const nicknameId = useId();
  const [nickname, setNickname] = useState(() =>
    current?.nickname ?? defaultNickname({ email: user.email, user_metadata: { full_name: user.name } }));
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!validNickname(nickname)) { setInvalid(true); return; }
    if (current) setConfirming(true);
    else void join(false);
  }

  async function join(leave: boolean) {
    setBusy(true);
    setError(null);
    try {
      await joinGroup(code, nickname, leave);
      router.push('/grupo');
    } catch (e) {
      const reason = (e as Error).message;
      setError(groupErrorMessage(reason));
      if (reason === 'already_in_group') await onStale();
      setBusy(false);
    } finally {
      setConfirming(false);
    }
  }

  const alone = (current?.members.length ?? 0) <= 1;

  return (
    <div className="card p-5">
      {current && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-amber-900">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>Ya estás en {current.name}. Para unirte a {invitation.name} tenés que salir de ese.</span>
        </p>
      )}
      <form onSubmit={submit} noValidate>
        <label htmlFor={nicknameId} className="mb-1 block font-semibold">Tu nombre en el grupo</label>
        <input
          id={nicknameId}
          value={nickname}
          onChange={e => { setNickname(e.target.value); setInvalid(false); }}
          maxLength={30}
          autoComplete="nickname"
          aria-invalid={invalid || undefined}
          aria-describedby={`${nicknameId}-hint`}
          className="input-field"
        />
        <p id={`${nicknameId}-hint`} className="mt-1 text-sm text-gray-600">
          {invalid ? <span className="text-red-700">Completá tu nombre en el grupo</span> : 'Así te ven los demás. Tu mail no se muestra.'}
        </p>
        <p className="mt-4 text-sm text-gray-600">
          El grupo va a ver tus precios de productos con código de barras de los últimos 60 días: el monto, la fecha y
          el comercio con su dirección y su ubicación. Podés pausarlo cuando quieras.
        </p>
        <button type="submit" disabled={busy} aria-busy={busy || undefined} className="btn-primary mt-4 w-full">
          {busy ? 'Uniéndote…' : current ? 'Salir y unirme' : 'Unirme al grupo'}
        </button>
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      </form>

      <ConfirmDialog
        open={confirming}
        title={`¿Salir de ${current?.name ?? ''} y unirte a ${invitation.name}?`}
        message={alone
          ? `Sos el único integrante de ${current?.name ?? ''}: al salir se borra el grupo.`
          : `Dejás de ver los precios de ${current?.name ?? ''} y ese grupo deja de ver los tuyos.`}
        confirmLabel={busy ? 'Uniéndote…' : 'Salir y unirme'}
        danger
        busy={busy}
        onConfirm={() => void join(true)}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

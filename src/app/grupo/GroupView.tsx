'use client';

import { BadgeCheck, Check, ChevronRight, Copy, LogOut, Pencil, RefreshCw, Share2, UserMinus } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { usePendingValidations } from '@/components/usePendingValidations';
import { initialOf } from '@/lib/format';
import {
  Group, GROUP_MAX_MEMBERS, GroupMember, groupErrorMessage, inviteUrl, leaveGroup, regenerateInvite, removeMember,
  renameGroup, setNickname, setSharePrices, validGroupName, validNickname,
} from '@/lib/group';

const TEXT_BUTTON =
  'inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-semibold text-primary-700 hover:bg-primary-50 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50';

type Section = 'name' | 'invite' | 'members' | 'me' | 'leave';
type Confirming = { kind: 'remove'; member: GroupMember } | { kind: 'regenerate' } | { kind: 'leave' } | null;

interface Props {
  group: Group;
  /** auth.uid() del que consulta: su fila dice "Vos" */
  userId: string;
  /** Vuelve a pedir el grupo después de una acción */
  onChange: () => Promise<void>;
}

/** Con grupo: nombre, Por validar, invitar, integrantes, apodo, Compartir mis precios y salir */
export default function GroupView({ group, userId, onChange }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ section: Section; text: string } | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  const admin = group.role === 'admin';

  function showNotice(text: string) {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  }

  /** Corre una acción de la base: el error queda junto a su sección y el grupo se vuelve a pedir */
  async function run(section: Section, id: string, action: () => Promise<unknown>): Promise<boolean> {
    setBusy(id);
    setError(null);
    try {
      await action();
      await onChange();
      return true;
    } catch (e) {
      const code = (e as Error).message;
      setError({ section, text: groupErrorMessage(code) });
      // Lo sacaron, perdió el rol o el integrante ya no está: mostrar el grupo como quedó
      if (code === 'not_in_group' || code === 'not_admin') await onChange();
      return false;
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  const errorOf = (section: Section) => error?.section === section
    ? <p role="alert" className="mt-2 text-sm text-red-700">{error.text}</p>
    : null;

  return (
    <>
      <GroupName group={group} admin={admin} busy={busy === 'name'} error={errorOf('name')}
        onSave={name => run('name', 'name', () => renameGroup(name))} />

      <PendingRow userId={userId} />

      <InviteCard
        group={group}
        admin={admin}
        busy={busy === 'regenerate'}
        error={errorOf('invite')}
        onCopied={() => showNotice('Link copiado')}
        onCopyFailed={() => setError({ section: 'invite', text: 'No se pudo copiar el link. Copialo desde el campo.' })}
        onRegenerate={() => setConfirming({ kind: 'regenerate' })}
      />

      <section aria-labelledby="group-members" className="card mt-4 p-5">
        <h2 id="group-members" className="text-lg font-semibold">
          Integrantes ({group.members.length} de {GROUP_MAX_MEMBERS})
        </h2>
        <ul className="mt-2 divide-y divide-gray-200">
          {group.members.map(member => (
            <MemberRow
              key={member.userId}
              member={member}
              me={member.userId === userId}
              canRemove={admin && member.userId !== userId}
              busy={busy === `remove-${member.userId}`}
              onRemove={() => setConfirming({ kind: 'remove', member })}
            />
          ))}
        </ul>
        {errorOf('members')}
      </section>

      <MeCard group={group} busy={busy} error={errorOf('me')}
        onNickname={nickname => run('me', 'nickname', () => setNickname(nickname))}
        onShare={share => run('me', 'share', () => setSharePrices(share))} />

      <div className="mt-8 border-t border-gray-200 pt-5">
        <p className="text-sm text-gray-600">Dejás de ver los precios del grupo y el grupo deja de ver los tuyos.</p>
        <button
          type="button"
          onClick={() => setConfirming({ kind: 'leave' })}
          disabled={busy !== null}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-1 font-semibold text-red-700 hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50">
          <LogOut aria-hidden="true" className="size-4" /> Salir del grupo
        </button>
        {errorOf('leave')}
      </div>

      <ConfirmDialog
        open={confirming?.kind === 'remove'}
        title={confirming?.kind === 'remove' ? `¿Sacar a ${confirming.member.nickname} del grupo?` : ''}
        message="Deja de ver los precios del grupo y el grupo deja de ver los suyos."
        confirmLabel={busy?.startsWith('remove-') ? 'Sacando…' : 'Sacar'}
        danger
        busy={busy !== null}
        onConfirm={() => {
          if (confirming?.kind !== 'remove') return;
          const { userId } = confirming.member;
          void run('members', `remove-${userId}`, () => removeMember(userId));
        }}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming?.kind === 'regenerate'}
        title="¿Generar un link nuevo?"
        message="El link anterior deja de servir."
        confirmLabel={busy === 'regenerate' ? 'Generando…' : 'Generar link nuevo'}
        busy={busy !== null}
        onConfirm={() => void run('invite', 'regenerate', regenerateInvite)}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming?.kind === 'leave'}
        title={`¿Salir de ${group.name}?`}
        message={group.members.length <= 1
          ? 'Sos el único integrante: al salir se borra el grupo.'
          : 'Dejás de ver los precios del grupo y el grupo deja de ver los tuyos.'}
        confirmLabel={busy === 'leave' ? 'Saliendo…' : 'Salir del grupo'}
        danger
        busy={busy !== null}
        onConfirm={() => void run('leave', 'leave', leaveGroup)}
        onCancel={() => setConfirming(null)}
      />

      {/* Aviso fijo abajo, como el de Buscar. La región queda montada */}
      <div role="status" className="pointer-events-none fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex justify-center md:bottom-14">
        {notice && (
          <p className="flex max-w-sm items-start gap-2 rounded-xl bg-primary-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-400" />
            <span className="min-w-0 break-words">{notice}</span>
          </p>
        )}
      </div>
    </>
  );
}

// ── Nombre del grupo ─────────────────────────────────────────

interface GroupNameProps {
  group: Group;
  admin: boolean;
  busy: boolean;
  error: React.ReactNode;
  onSave: (name: string) => Promise<boolean>;
}

function GroupName({ group, admin, busy, error, onSave }: GroupNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const others = group.members.length - 1;

  function start() {
    setDraft(group.name);
    setInvalid(false);
    setEditing(true);
  }

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function cancel() {
    setEditing(false);
    requestAnimationFrame(() => editRef.current?.focus());
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!validGroupName(draft)) { setInvalid(true); inputRef.current?.focus(); return; }
    if (draft.trim() === group.name) { cancel(); return; }
    if (await onSave(draft)) cancel();
  }

  if (editing) {
    return (
      <form onSubmit={e => void save(e)} noValidate className="mb-2">
        <label htmlFor={inputId} className="mb-1 block font-semibold">Nombre del grupo</label>
        <input
          ref={inputRef}
          id={inputId}
          value={draft}
          onChange={e => { setDraft(e.target.value); setInvalid(false); }}
          onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } }}
          maxLength={40}
          autoComplete="off"
          aria-invalid={invalid || undefined}
          className="input-field font-display text-xl font-semibold"
        />
        {invalid && <p className="mt-1 text-sm text-red-700">Completá el nombre del grupo</p>}
        <div className="mt-2 flex gap-2">
          <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" onClick={cancel} disabled={busy} className="btn-secondary">Cancelar</button>
        </div>
        {error}
      </form>
    );
  }

  return (
    <header className="mb-2">
      <div className="flex items-start gap-2">
        <h1 className="min-w-0 flex-1 break-words text-3xl font-bold">{group.name}</h1>
        {admin && (
          <button ref={editRef} type="button" onClick={start} className={`${TEXT_BUTTON} shrink-0`}>
            <Pencil aria-hidden="true" className="size-4" />
            <span className="sr-only sm:not-sr-only">Cambiar nombre</span>
            <span className="sr-only"> del grupo</span>
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <MemberStack members={group.members} />
        <p className="text-gray-600">
          {others === 0 ? 'Por ahora estás solo vos' : others === 1 ? 'Vos y 1 integrante más' : `Vos y ${others} integrantes más`}
        </p>
      </div>
      {error}
    </header>
  );
}

/** Las iniciales de los primeros integrantes, superpuestas; decorativo (la lista está abajo) */
function MemberStack({ members }: { members: GroupMember[] }) {
  const shown = members.slice(0, 5);
  const rest = members.length - shown.length;
  return (
    <div aria-hidden="true" className="flex shrink-0 -space-x-2">
      {shown.map(member => (
        <span key={member.userId}
          className="flex size-8 items-center justify-center rounded-full bg-primary-100 font-display text-sm font-semibold text-primary-800 ring-2 ring-gray-50">
          {initialOf(member.nickname)}
        </span>
      ))}
      {rest > 0 && (
        <span className="flex size-8 items-center justify-center rounded-full bg-primary-700 text-xs font-semibold text-white ring-2 ring-gray-50">
          +{rest}
        </span>
      )}
    </div>
  );
}

// ── Por validar (spec 23) ────────────────────────────────────

/** Link a /grupo/validar con la cantidad (la misma llamada y el mismo filtro que la página); con 0, sin número */
function PendingRow({ userId }: { userId: string }) {
  const { status, pending } = usePendingValidations(userId);
  const count = status === 'ready' ? pending.length : 0;
  return (
    <Link href="/grupo/validar" className="card list-row mt-4 rounded-2xl p-4">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
        <BadgeCheck className="size-5" />
      </span>
      <span className="min-w-0 flex-1 font-semibold">Por validar</span>
      {count > 0 && (
        <span className="min-w-7 shrink-0 rounded-full bg-primary-700 px-2 py-0.5 text-center text-sm font-semibold tabular-nums text-white">
          {count}
        </span>
      )}
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-gray-500" />
    </Link>
  );
}

// ── Invitar ──────────────────────────────────────────────────

interface InviteCardProps {
  group: Group;
  admin: boolean;
  busy: boolean;
  error: React.ReactNode;
  onCopied: () => void;
  onCopyFailed: () => void;
  onRegenerate: () => void;
}

function InviteCard({ group, admin, busy, error, onCopied, onCopyFailed, onRegenerate }: InviteCardProps) {
  const url = inviteUrl(window.location.origin, group.inviteCode);
  const canShare = typeof navigator.share === 'function';
  const inputId = useId();
  const full = group.members.length >= GROUP_MAX_MEMBERS;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      onCopied();
    } catch {
      onCopyFailed();
    }
  }

  async function share() {
    try {
      await navigator.share({ title: group.name, text: `Sumate a ${group.name} en El Changuito`, url });
    } catch { /* lo cerró sin compartir */ }
  }

  return (
    <section aria-labelledby="group-invite" className="card mt-4 p-5">
      <h2 id="group-invite" className="text-lg font-semibold">Invitar</h2>
      <p className="mt-1 text-sm text-gray-600">
        {full
          ? `El grupo está completo (${GROUP_MAX_MEMBERS} integrantes).`
          : 'Mandale este link a quien quieras sumar. Con él puede entrar cualquiera que lo tenga.'}
      </p>
      <label htmlFor={inputId} className="sr-only">Link de invitación</label>
      <input
        id={inputId}
        readOnly
        value={url}
        onFocus={e => e.currentTarget.select()}
        className="input-field mt-3 truncate text-gray-700"
      />
      <div className={`mt-3 grid gap-2 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button type="button" onClick={() => void copy()} className="btn-primary inline-flex items-center justify-center gap-2">
          <Copy aria-hidden="true" className="size-4" /> Copiar link
        </button>
        {canShare && (
          <button type="button" onClick={() => void share()} className="btn-secondary inline-flex items-center justify-center gap-2">
            <Share2 aria-hidden="true" className="size-4" /> Compartir
          </button>
        )}
      </div>
      {admin && (
        <button type="button" onClick={onRegenerate} disabled={busy} className={`${TEXT_BUTTON} -ml-2 mt-2`}>
          <RefreshCw aria-hidden="true" className="size-4" /> Generar link nuevo
        </button>
      )}
      {error}
    </section>
  );
}

// ── Integrantes ──────────────────────────────────────────────

interface MemberRowProps {
  member: GroupMember;
  me: boolean;
  canRemove: boolean;
  busy: boolean;
  onRemove: () => void;
}

function MemberRow({ member, me, canRemove, busy, onRemove }: MemberRowProps) {
  return (
    <li className="flex min-h-14 items-center gap-3 py-2">
      <span aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-100 font-display font-semibold text-primary-800">
        {initialOf(member.nickname)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{member.nickname}</p>
        {(me || member.role === 'admin') && (
          <p className="text-sm text-gray-600">
            {[me && 'Vos', member.role === 'admin' && 'Administra'].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      {canRemove && (
        <button type="button" onClick={onRemove} disabled={busy} aria-label={`Sacar a ${member.nickname} del grupo`}
          className={`${TEXT_BUTTON} shrink-0 text-red-700 hover:bg-red-50`}>
          <UserMinus aria-hidden="true" className="size-4" /> Sacar
        </button>
      )}
    </li>
  );
}

// ── Vos en el grupo: apodo y Compartir mis precios ───────────

interface MeCardProps {
  group: Group;
  busy: string | null;
  error: React.ReactNode;
  onNickname: (nickname: string) => Promise<boolean>;
  onShare: (share: boolean) => Promise<boolean>;
}

function MeCard({ group, busy, error, onNickname, onShare }: MeCardProps) {
  const [draft, setDraft] = useState(group.nickname);
  const [invalid, setInvalid] = useState(false);
  const inputId = useId();
  const shareHintId = useId();
  const changed = draft.trim() !== group.nickname;

  // El apodo guardado cambió (otro teléfono, o recién guardado): el campo lo toma si no se estaba editando
  const [saved, setSaved] = useState(group.nickname);
  if (saved !== group.nickname) {
    setSaved(group.nickname);
    if (draft.trim() === saved) setDraft(group.nickname);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!validNickname(draft)) { setInvalid(true); return; }
    if (changed) await onNickname(draft);
  }

  return (
    <section aria-labelledby="group-me" className="card mt-4 p-5">
      <h2 id="group-me" className="sr-only">Vos en el grupo</h2>
      <form onSubmit={e => void save(e)} noValidate>
        <label htmlFor={inputId} className="mb-1 block font-semibold">Tu nombre en el grupo</label>
        <div className="flex gap-2">
          <input
            id={inputId}
            value={draft}
            onChange={e => { setDraft(e.target.value); setInvalid(false); }}
            maxLength={30}
            autoComplete="nickname"
            aria-invalid={invalid || undefined}
            className="input-field min-w-0 flex-1"
          />
          {changed && (
            <button type="submit" disabled={busy !== null} className="btn-primary shrink-0">
              {busy === 'nickname' ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>
        {invalid && <p className="mt-1 text-sm text-red-700">Completá tu nombre en el grupo</p>}
      </form>

      <div className="mt-5 border-t border-gray-200 pt-4">
        <button
          type="button"
          role="switch"
          aria-checked={group.sharePrices}
          aria-describedby={shareHintId}
          disabled={busy !== null}
          onClick={() => void onShare(!group.sharePrices)}
          className="flex min-h-11 w-full items-center justify-between gap-4 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-60">
          <span className="font-semibold">Compartir mis precios</span>
          <span aria-hidden="true"
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${group.sharePrices ? 'bg-primary-700' : 'bg-gray-300'}`}>
            <span className={`absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${group.sharePrices ? 'translate-x-5' : ''}`} />
          </span>
        </button>
        <p id={shareHintId} className="mt-1 text-sm text-gray-600">
          El grupo ve tus precios de productos con código de barras de los últimos 60 días: el monto, la fecha y el
          comercio con su dirección y su ubicación.
        </p>
      </div>
      {error}
    </section>
  );
}

'use client';

import { Users } from 'lucide-react';
import { FormEvent, useId, useRef, useState } from 'react';
import { AccountUser } from '@/lib/auth';
import { createGroup, defaultNickname, groupErrorMessage, validGroupName, validNickname } from '@/lib/group';

interface Props {
  user: AccountUser;
  onCreated: () => Promise<void>;
}

/** Sin grupo: qué es un grupo, el formulario para crear uno y cómo unirse a otro */
export default function CreateGroup({ user, onCreated }: Props) {
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState(() => defaultNickname({ email: user.email, user_metadata: { full_name: user.name } }));
  const [errors, setErrors] = useState<{ name?: string; nickname?: string; submit?: string }>({});
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const nicknameRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const nicknameId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = {
      name: validGroupName(name) ? undefined : 'Completá el nombre del grupo',
      nickname: validNickname(nickname) ? undefined : 'Completá tu nombre en el grupo',
    };
    setErrors(next);
    if (next.name) { nameRef.current?.focus(); return; }
    if (next.nickname) { nicknameRef.current?.focus(); return; }

    setBusy(true);
    try {
      await createGroup(name, nickname);
      await onCreated();
    } catch (error) {
      setErrors({ submit: groupErrorMessage((error as Error).message) });
      // Ya estaba en un grupo (otro teléfono): mostrarlo
      if ((error as Error).message === 'already_in_group') await onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mb-4 text-3xl font-bold">Grupo</h1>
      <div className="card p-5">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <Users className="size-6" />
        </span>
        <h2 className="mt-3 text-xl font-semibold">Compartí precios con tu familia o tus amigos</h2>
        <p className="mt-1 text-gray-600">
          En un grupo, cada uno ve los precios que cargan los demás: en Buscar, en el lector y en el detalle de cada
          producto.
        </p>

        <form onSubmit={e => void submit(e)} noValidate className="mt-5 space-y-4">
          <div>
            <label htmlFor={nameId} className="mb-1 block font-semibold">Nombre del grupo</label>
            <input
              ref={nameRef}
              id={nameId}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={40}
              autoComplete="off"
              placeholder="Por ejemplo, Familia"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${nameId}-error` : undefined}
              className="input-field"
            />
            {errors.name && <p id={`${nameId}-error`} className="mt-1 text-sm text-red-700">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor={nicknameId} className="mb-1 block font-semibold">Tu nombre en el grupo</label>
            <input
              ref={nicknameRef}
              id={nicknameId}
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              maxLength={30}
              autoComplete="nickname"
              aria-invalid={errors.nickname ? true : undefined}
              aria-describedby={`${nicknameId}-hint${errors.nickname ? ` ${nicknameId}-error` : ''}`}
              className="input-field"
            />
            <p id={`${nicknameId}-hint`} className="mt-1 text-sm text-gray-600">Así te ven los demás. Tu mail no se muestra.</p>
            {errors.nickname && <p id={`${nicknameId}-error`} className="mt-1 text-sm text-red-700">{errors.nickname}</p>}
          </div>
          <button type="submit" disabled={busy} aria-busy={busy || undefined} className="btn-primary w-full">
            {busy ? 'Creando…' : 'Crear grupo'}
          </button>
          {errors.submit && <p role="alert" className="text-sm text-red-700">{errors.submit}</p>}
        </form>
      </div>
      <p className="mt-4 px-1 text-sm text-gray-600">Para unirte a un grupo, pedile el link a alguien que ya esté.</p>
    </>
  );
}

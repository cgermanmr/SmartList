'use client';

import { InputHTMLAttributes, useState } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: number;
  onValueChange: (value: number) => void;
};

/**
 * Input numérico sobre un valor del store. Mientras se edita conserva lo que se tipea (aunque esté vacío)
 * y solo informa valores numéricos; al salir del campo vuelve a mostrar el valor guardado.
 */
export default function NumberInput({ value, onValueChange, onBlur, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      {...rest}
      type="number"
      value={draft ?? String(value)}
      onChange={e => {
        setDraft(e.target.value);
        const n = e.target.valueAsNumber;
        if (Number.isFinite(n)) onValueChange(n);
      }}
      onBlur={e => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}

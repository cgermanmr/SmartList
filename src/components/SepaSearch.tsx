'use client';

import { useId, useState } from 'react';
import SepaResults from '@/components/SepaResults';
import { useSepaSearch } from '@/components/useSepaSearch';
import { SepaProduct, sepaEnabled } from '@/lib/sepa';

interface Props {
  onSelect: (product: SepaProduct) => void;
}

/** Buscador del catálogo SEPA para elegir un producto. Sin variables de Supabase no muestra nada */
export default function SepaSearch({ onSelect }: Props) {
  const inputId = useId();
  const [text, setText] = useState('');
  const search = useSepaSearch(text);

  if (!sepaEnabled) return null;

  function select(product: SepaProduct) {
    setText('');
    onSelect(product);
  }

  return (
    <div>
      <label htmlFor={inputId} className="block font-semibold mb-2">Buscar en Precios Claros</label>
      <input
        id={inputId}
        value={text}
        onChange={e => setText(e.target.value)}
        type="search"
        placeholder="Ej: yerba playadito"
        autoComplete="off"
        enterKeyHint="search"
        className="input-field"
      />
      <SepaResults
        search={search}
        renderItem={(product, info) => (
          <button type="button" onClick={() => select(product)} className="list-row">{info}</button>
        )}
      />
    </div>
  );
}

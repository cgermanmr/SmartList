import { Ref, useId } from 'react';
import { categorySuggestions } from '@/lib/product-form';
import { useStore } from '@/lib/store';

interface Props {
  id: string;
  value: string;
  onChange: (category: string) => void;
  ref?: Ref<HTMLInputElement>;
}

/** Categoría de un producto: texto libre con las sugerencias de los productos propios y las fijas (spec 34) */
export default function CategoryInput({ id, value, onChange, ref }: Props) {
  const products = useStore(s => s.products);
  // Las dos pestañas de Cargar pueden estar montadas a la vez: cada campo tiene su propia lista
  const listId = useId();

  return (
    <>
      <input
        id={id}
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        type="text"
        placeholder="Ej: Almacen"
        className="input-field"
        list={listId}
      />
      <datalist id={listId}>
        {categorySuggestions(products).map(category => <option key={category} value={category} />)}
      </datalist>
    </>
  );
}

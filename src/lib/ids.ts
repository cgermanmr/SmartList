// IDs basados en la hora (sin UUID), como en el resto de los datos guardados

export function newId(): string {
  return Date.now().toString();
}

/** Con sufijo aleatorio, para cuando se crean varios en el mismo milisegundo */
export function uniqueId(): string {
  return newId() + Math.random().toString(36).slice(2);
}

# Pruebas pendientes

Pruebas a mano de lo que ya está implementado y tiene criterios de aceptación sin marcar. Al 24/11/2026.

Al terminar cada parte: marcar los criterios en la spec, anotar acá lo que falló y, cuando no quede nada, borrar este
archivo.

## Ya verificado (no hace falta repetirlo)

- `npm run lint`, `npm test` (697 tests) y `npm run build`, sin errores.
- **Base (specs 22, 23 y 27):** 62 comprobaciones con las migraciones en un Postgres local y descartable, con 40
  usuarios simulados. Grupo completo con 20, roles, link regenerado, salir y unirme, nuevo administrador, grupo vacío
  borrado, 14 y 60 días, productos sin EAN, Compartir apagado, quien está fuera del grupo, quién puede votar, monto
  tomado de la base, votos que caen al cambiar monto, comercio, fecha o vínculo, `price_changed`, `size` de `1e400`,
  votos borrados al salir, ser sacado o borrar la cuenta, fotos ajenas y ningún mail en las respuestas.
- **Producción (solo lectura):** permisos de las funciones, RLS de las tablas, bucket `fotos-propias` privado con sus
  políticas y claves foráneas en cascada.
- **`/privacidad`:** el texto cubre lo que piden las specs 22, 23 y 27.

No se probó la interfaz, ni Storage real, ni el login.

## Preparación

- **Usar la preview de `dev`**, que tiene el mismo código que producción:
  <https://elchanguito-git-dev-cgermanmrs-projects.vercel.app>
- **No probar la cuenta en el navegador o el teléfono donde están los datos reales en
  <https://elchanguito.vercel.app>:** al entrar se suben a esa cuenta y **cerrar sesión los borra del teléfono**. La
  preview guarda sus datos aparte.
- La preview usa **la misma base de Supabase que producción**. Usar cuentas de Google de prueba y borrarlas al final.
- **Ana:** ventana normal. **Beto:** otro perfil de Chrome o incógnito. **Celular:** segundo dispositivo de Ana.
- Los precios del grupo se guardan 5 minutos: **recargar** antes de mirar un cambio del otro.

## Parte 1 — Fotos, grupos y validación (specs 22, 23 y 27; ~40 min)

### Fotos sin cuenta (spec 27)

- [ ] **1.** Cargar precio → "No tiene código de barras", elegir foto: dice "Solo la ves vos.". Guardar: se ve en Buscar
      y en el detalle, también después de recargar.
- [ ] **2.** Agregar producto: elegir uno del catálogo con imagen y sumarle una foto: se ve la propia. En el detalle,
      **Cambiar foto** la cambia y **Quitar foto** pide confirmación y vuelve la del catálogo. "Solo la ves vos" también
      está en el detalle.
- [ ] **3.** Elegir como foto un archivo que no sea imagen: "No se pudo leer la imagen. Probá con otra." y nada cambia.
- [ ] **4.** En Cargar precio, elegir foto y tocar **Cambiar** producto: la foto desaparece y en DevTools → Application →
      IndexedDB → `el-changuito` → `photos` no hay una nueva.
- [ ] **5.** Con una foto sacada con el celular: en IndexedDB es `image/jpeg` y pesa 200 KB o menos (300 KB como mucho).

### Grupo (spec 22)

- [ ] **6.** Ana entra y crea un grupo con nombre y apodo: figura como "Administra".
- [ ] **7.** Beto abre el link **sin sesión**: "Te invitaron a <grupo> (1 integrante)". Entra con Google, **vuelve a esa
      página**, elige un apodo y se une: va a `/grupo`. Ana lo ve al recargar.
- [ ] **8.** Beto no ve "Sacar", "Cambiar nombre" ni "Generar link nuevo".
- [ ] **9.** Ana cambia el nombre del grupo y genera un link nuevo: el link anterior dice "El link de invitación no es
      válido o cambió…".
- [ ] **10.** Ana carga un precio bajo de un producto con código: **Usar mi ubicación** → **Otro comercio acá**.
- [ ] **11.** Beto, con ubicación cerca, busca ese producto: "Cargado por Ana · dd/mm", distancia, Mapa, Agregar y "Más
      barato" (si es el menor). En el detalle está **Precios del grupo**, también sin ubicación.
- [ ] **12.** Beto lee el código y escribe un monto mayor en "¿Cuánto sale acá?": "En <comercio> — <distancia> sale $X
      menos (Ana · dd/mm)".
- [ ] **13.** Ana apaga **Compartir mis precios**: Beto, al recargar, deja de verlo. Volver a prenderlo.
- [ ] **14.** Sin sesión o sin conexión, Buscar, el lector y el detalle se ven como antes, sin mensajes del grupo.

### Validación (spec 23)

- [ ] **15.** "Por validar (1)" aparece en Cuenta y en Grupo de Beto con la misma cantidad que la lista.
- [ ] **16.** En el detalle, Beto toca **Está bien**: queda marcado; otra vez lo quita; **No coincide** lo cambia y
      "¿Cuánto viste?" guarda: "No coincide para vos ($3.400,00)".
- [ ] **17.** Al volver a Por validar, ese precio ya no está y el contador baja (en Cuenta no aparece con 0).
- [ ] **18.** Ana ve el voto y el apodo de Beto en el historial del producto.
- [ ] **19.** Con Beto mirando el precio, Ana cambia el monto y espera a "Sincronizado". Beto vota **sin recargar**: "El
      precio cambió mientras lo mirabas. Revisalo y votá de nuevo.", aparece el precio nuevo y no queda el voto.
- [ ] **20.** *(Opcional, con una tercera cuenta.)* Dos "Está bien" → **Validado** en Comercios cercanos, Precios del
      grupo y el historial de Ana, y ", validado" en "¿Cuánto sale acá?". Dos "No coincide" → **Dudoso**, sin "Más
      barato". El cálculo ya está cubierto por tests: acá se miran las insignias.

### Dos dispositivos y cierre (specs 21, 22 y 27)

- [ ] **21.** Ana agrega una foto en la computadora. En el celular, con la misma cuenta, aparece y sigue viéndose **sin
      conexión** (sin recargar).
- [ ] **22.** Ana cambia esa foto. Revisar en el bucket `fotos-propias` que el archivo anterior ya no esté.
- [ ] **23.** Ana cierra sesión en el celular: no quedan fotos ni datos. Al volver a entrar, todo reaparece.
- [ ] **24.** Beto agrega una foto y usa **Borrar mi cuenta**: Ana ya no lo ve en el grupo. Revisar en la base que no
      queden filas suyas ni archivos en el bucket.
- [ ] **25.** En el celular (375 px), ninguna pantalla se desplaza hacia los costados.

## Parte 2 — Resto de lo implementado

### Cuenta y sincronización (spec 21)

- [ ] **26.** Entrar con el código por mail. **Bloqueada** hasta configurar el SMTP propio (hoy Supabase manda solo el
      link, en inglés y a miembros de la organización).
- [ ] **27.** Un precio cargado en un dispositivo aparece en el otro al abrir la app o volver a ella.
- [ ] **28.** Sin señal en los dos, cada uno carga un precio distinto: al conectarse, los dos tienen los dos.
- [ ] **29.** El mismo producto (mismo código) agregado en los dos sin señal: queda uno solo, con los precios de los dos.
- [ ] **30.** Cambiar la cantidad de un ítem del carrito en uno y después en el otro: queda la última en los dos. Quitar
      un ítem en uno lo quita en el otro.

### Lector (spec 24)

- [ ] **31.** Con ubicación, leer un código del catálogo: "Desde $X · …", los 3 más baratos, "Ver N más", Mapa, y
      **Agregar** lo deja en ese comercio y a ese precio.
- [ ] **32.** Leer un producto propio no sale de Buscar: "Ya tenés <nombre>.", último precio, **Agregar al carrito** y
      **Ver detalle**.
- [ ] **33.** Sin ubicación: resumen por cadena, "Ver precios por cadena" y "Activá tu ubicación arriba para ver comercios
      cercanos".
- [ ] **34.** "¿Cuánto sale acá?": mayor que el más barato cercano (rojo), menor (verde), contra la referencia sin
      cercanos, y "La última vez pagaste…" en uno propio. Con monto, **Agregar al carrito** usa ese precio en "Sin
      comercio". Leer otro código lo vacía.
- [ ] **35.** Un código fuera del catálogo ofrece "Agregar producto".

### ¿Dónde conviene el carrito? (spec 25)

- [ ] **36.** Con 2 o más productos con código aparece la tarjeta; con 0 o 1, no. "Tiene N de M", total y ahorro coinciden
      con los precios (los de $0 no cuentan); los sin código se aclaran.
- [ ] **37.** Modal: 10 opciones y "Ver N más", faltantes al desplegar, el radio recalcula, Mapa encima del modal, y las
      sucursales sin ningún producto se cuentan en el pie.
- [ ] **38.** **Pasar todo a este comercio**: pasan solo los que tiene, a su precio y con su cantidad; aviso "N productos
      pasaron a…"; después, "Tu carrito ya está en este comercio". Un ítem en $0 deja de pedir precio.
- [ ] **39.** Sin ubicación compara por cadena y no ofrece "Pasar todo". Cambiar de pestaña con el modal abierto no
      bloquea la página.

### Cargar precio en el comercio (spec 26)

- [ ] **40.** Sin comercio: "Elegí el comercio" y no guarda. "Otro comercio" con solo el nombre guarda con barrio "Sin
      especificar".
- [ ] **41.** A menos de 200 m de una sucursal, "¿Estás en…?" con la distancia. No cambia la ubicación de Buscar. Sin
      permiso: "Sin permiso para usar tu ubicación. Elegí el comercio a mano."
- [ ] **42.** "Comercios que usaste" (hasta 5). Después de guardar queda el comercio y se limpian producto y precio.
- [ ] **43.** Producto del catálogo, código desconocido (pide Nombre) y sin código: cada uno se crea **al guardar**; elegir
      y tocar "Cambiar" no crea nada.
- [ ] **44.** "Cargar precio acá" desde el lector lleva el producto y el monto.
- [ ] **45.** Un precio propio con coordenadas dentro del radio aparece en Comercios cercanos con distancia, "Cargado por
      vos · dd/mm" y Mapa.

### Buscador fijo (spec 29)

- [ ] **46.** En el celular, tocar el campo lo sube arriba de todo y se ven los primeros resultados con el teclado abierto,
      también con pocos resultados. En la computadora no se mueve.
- [ ] **47.** El buscador queda fijo al desplazar; el lector, el mapa y el aviso "… en el carrito" quedan por encima.

### Sueltos (specs 11 y 15 a 19)

- [ ] **48.** iPhone: el lector lee un código sin abrir el video a pantalla completa, y enfocar un campo no hace zoom.
- [ ] **49.** La cámara se apaga al detectar, al cerrar y al cambiar de página.
- [ ] **50.** Con el permiso de ubicación denegado se ve el mensaje y se puede elegir localidad; las distancias dicen
      "aprox.".
- [ ] **51.** Las filas de "Cerca tuyo" en "Cambiar comercio" no tienen botón Mapa.
- [ ] **52.** Imágenes (o la inicial) en "Buscar en Precios Claros" de Agregar producto, el modal de vincular, la oferta
      del lector y una compra expandida del historial.
- [ ] **53.** El favicon y el ícono instalado muestran el changuito; el aviso "… en el carrito" se ve entero sobre la
      barra inferior.

### Compartir el carrito (spec 31)

Antes de la producción, cambiar a mano el dominio del link por el de la preview (el link es siempre el de producción).

- [ ] **54.** Android e iPhone, con y sin la app instalada, y WhatsApp Web: **Compartir por WhatsApp** abre WhatsApp con
      la lista y el link completo; al tocarlo se ve la vista previa.
- [ ] **55.** En los tres, listas de 40 y de 100 productos con nombre (sin código): WhatsApp no corta el mensaje y el link
      abre. Si falla, bajar `MAX_MESSAGE_ITEMS` o `MAX_SHARED_ITEMS` y anotarlo en las decisiones de la spec.
- [ ] **56.** iPhone: en Safari aparece **Copiar link**; pegarlo en la app instalada (Carrito → Cargar un carrito
      compartido) muestra la vista previa. En la app instalada y en Android no aparece el aviso.
- [ ] **57.** Con sesión, el carrito cargado y los productos nuevos aparecen en el otro dispositivo.

## Resultados

| Prueba | Fecha | Resultado |
|---|---|---|
| | | |

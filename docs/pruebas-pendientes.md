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

- [x] **1.** Cargar precio → buscar algo que no exista → "Cargar … a mano", elegir foto: dice "Solo la ves vos.". Guardar: se ve en Buscar
      y en el detalle, también después de recargar.
- [x] **2.** Agregar producto: elegir uno del catálogo con imagen y sumarle una foto: se ve la propia. En el detalle,
      **Cambiar foto** la cambia y **Quitar foto** pide confirmación y vuelve la del catálogo. "Solo la ves vos" también
      está en el detalle.
- [x] **3.** Elegir como foto un archivo que no sea imagen: "No se pudo leer la imagen. Probá con otra." y nada cambia.
- [x] **4.** En Cargar precio, elegir foto y tocar **Cambiar** producto: la foto desaparece y en DevTools → Application →
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

- [x] **31.** Con ubicación, leer un código del catálogo: "Desde $X · …", los 3 más baratos, "Ver N más", Mapa, y
      **Agregar** lo deja en ese comercio y a ese precio.
- [x] **32.** Leer un producto propio no sale de Buscar: "Ya tenés <nombre>.", último precio, **Agregar al carrito** y
      **Ver detalle**.
- [x] **33.** Sin ubicación: resumen por cadena, "Ver precios por cadena" y "Activá tu ubicación arriba para ver comercios
      cercanos".
- [x] **34.** "¿Cuánto sale acá?": mayor que el más barato cercano (rojo), menor (verde), contra la referencia sin
      cercanos, y "La última vez pagaste…" en uno propio. Con monto, **Agregar al carrito** usa ese precio en "Sin
      comercio". Leer otro código lo vacía.
- [x] **35.** Un código fuera del catálogo ofrece "Agregar producto".

### ¿Dónde conviene el carrito? (spec 25)

- [x] **36.** Con 2 o más productos con código aparece la tarjeta; con 0 o 1, no. "Tiene N de M", total y ahorro coinciden
      con los precios (los de $0 no cuentan); los sin código se aclaran.
- [x] **37.** Modal: 10 opciones y "Ver N más", faltantes al desplegar, el radio recalcula, Mapa encima del modal, y las
      sucursales sin ningún producto se cuentan en el pie.
- [x] **38.** **Pasar todo a este comercio**: pasan solo los que tiene, a su precio y con su cantidad; aviso "N productos
      pasaron a…"; después, "Tu carrito ya está en este comercio". Un ítem en $0 deja de pedir precio.
- [x] **39.** Sin ubicación compara por cadena y no ofrece "Pasar todo". Cambiar de pestaña con el modal abierto no
      bloquea la página.

### Cargar precio en el comercio (spec 26)

- [x] **40.** Sin comercio: "Elegí el comercio" y no guarda. "Otro comercio" con solo el nombre guarda con barrio "Sin
      especificar".
- [x] **41.** A menos de 200 m de una sucursal, "¿Estás en…?" con la distancia. No cambia la ubicación de Buscar. Sin
      permiso: "Sin permiso para usar tu ubicación. Elegí el comercio a mano."
- [x] **42.** "Comercios que usaste" (hasta 5). Después de guardar queda el comercio y se limpian producto y precio.
- [x] **43.** Producto del catálogo, código desconocido (pide Nombre) y sin código: cada uno se crea **al guardar**; elegir
      y tocar "Cambiar" no crea nada.
- [x] **44.** "Cargar precio acá" desde el lector lleva el producto y el monto.
- [x] **45.** Un precio propio con coordenadas dentro del radio aparece en Comercios cercanos con distancia, "Cargado por
      vos · dd/mm" y Mapa.

### Buscador fijo (spec 29)

- [ ] **46.** En el celular, tocar el campo lo sube arriba de todo y se ven los primeros resultados con el teclado abierto,
      también con pocos resultados. En la computadora no se mueve.
- [x] **47.** El buscador queda fijo al desplazar; el lector, el mapa y el aviso "… en el carrito" quedan por encima.

### Sueltos (specs 11 y 15 a 19)

- [ ] **48.** iPhone: el lector lee un código sin abrir el video a pantalla completa, y enfocar un campo no hace zoom.
- [x] **49.** La cámara se apaga al detectar, al cerrar y al cambiar de página.
- [x] **50.** Con el permiso de ubicación denegado se ve el mensaje y se puede elegir localidad; las distancias dicen
      "aprox.".
- [x] **51.** Las filas de "Cerca tuyo" en "Cambiar comercio" no tienen botón Mapa.
- [x] **52.** Imágenes (o la inicial) en "Buscar en Precios Claros" de Agregar producto, el modal de vincular, la oferta
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

### Versión de dev (spec 32)

En Vercel, antes de publicar: *Automatically expose System Environment Variables* encendida. **Desinstalar la app de
dev borra sus datos si no tiene cuenta** (en el iPhone, siempre): son datos de prueba, pero revisar antes que sea la de
dev. Producción no hace falta reinstalarla, salvo para ver el ícono nuevo en el iPhone.

- [x] **58.** Preview de `dev`, en la computadora: etiqueta DEV, pestaña "DEV · El Changuito", favicon amarillo con la
      cinta y `/manifest.json` con "DEV Changuito".
- [ ] **59.** Android: desinstalar la de dev, instalarla de nuevo desde la preview y tener también la de producción. Se
      distinguen por el nombre y el ícono; el recorte no corta el changuito ni el texto.
- [ ] **60.** iPhone: lo mismo. El ícono de las dos es el PNG (changuito, no una captura de la página) y se lee DEV.
- [ ] **61.** Producción, apenas se publica: sin etiqueta, pestaña "El Changuito" y `/manifest.json` con "El Changuito".
      La app ya instalada en Android sigue siendo la misma.

### Eliminar un producto (spec 33)

Con una cuenta de prueba en dos dispositivos (A y B) y un producto sin código de barras, con 2 precios y una foto.

- [ ] **62.** Eliminarlo en A: la confirmación dice "Se elimina en todos tus dispositivos."; desaparece de B, y la foto ya
      no está en el bucket `fotos-propias`.
- [ ] **63.** B sin señal: cargarle un precio. Eliminarlo en A y sincronizar. Conectar B: el producto vuelve en los dos,
      sin la foto y solo con el precio de B, y `/cuenta` queda en "Sincronizado" (no se repite). Lo mismo si B, sin señal,
      le cambió la cantidad en el carrito o lo compró.
- [ ] **64.** Lo mismo que la 63 con el reloj de B atrasado 10 minutos.
- [ ] **65.** Con TalkBack o VoiceOver, en un producto que está en una compra: el botón se anuncia deshabilitado y se lee
      el motivo.

### Dirección y punto del comercio (spec 35)

En la calle, con el celular, en **Cargar precio**.

- [ ] **66.** **Usar mi ubicación** → **Otro comercio acá** → **Completar la dirección**: la calle es la correcta y la
      altura, cercana.
- [ ] **67.** **Ver o ajustar**: mover el mapa y hacer zoom con los dedos. El pin no se corre al acercar; **Usar este
      punto** cambia la dirección.
- [ ] **68.** Escribir una dirección con el teclado abierto: se ven las sugerencias y se puede elegir una con el dedo. Al
      elegir una calle, el teclado sigue abierto para escribir la altura.
- [ ] **69.** Lo mismo en el carrito, en **Cambiar comercio**.
- [ ] **70.** Con TalkBack o VoiceOver: se anuncia la cantidad de direcciones y se puede elegir una; en el mapa se lee el
      nombre del mapa y cuándo falta acercarlo.

### Origen del producto (spec 36)

Con una cuenta de prueba que ya tenga productos creados antes de la spec 36, en dos dispositivos (A y B).

- [ ] **71.** Abrir la versión nueva en A: en `user_records`, las filas de `products` suben con `origin` (`'sepa'` los que
      tienen código y no tienen categoría, `'manual'` los demás), y `/cuenta` queda en "Sincronizado".
- [ ] **72.** Abrir B: los productos bajan con el mismo origen y no se vuelven a subir (la segunda vuelta no encola nada).
- [ ] **73.** En A, el detalle de un producto agregado desde Buscar no muestra **Cambiar vínculo** ni **Quitar vínculo**;
      uno cargado a mano y vinculado después, sí.

## Resultados

Pruebas del 25/11/2026 en la computadora (Chrome, build local de `dev` con la base real de Precios Claros, sin
cuenta). La cámara, el GPS, la falta de permisos y las fallas de red se simularon desde la página.

| Prueba | Fecha | Resultado |
|---|---|---|
| 1–4 | 25/11 | Bien. |
| 5 | 25/11 | Parcial: con una imagen de 3000 × 2000 generada, queda en JPEG de 137 KB. Falta con una foto del celular. |
| 14 | 25/11 | Parcial: sin sesión, Buscar, el lector y el detalle no hablan del grupo. Falta sin conexión. |
| 25 | 25/11 | Parcial: 14 pantallas a 320 y 375 px, sin desplazamiento horizontal, en su estado inicial (sin modales abiertos). Falta en el celular. |
| 31–45 | 25/11 | Bien. En la 31 la oferta muestra los 3 más baratos y "Ver 35 más"; en la 34 se vieron las tres líneas, la de la última compra y la de la referencia. |
| 46 | — | No se puede en la computadora (necesita puntero táctil). |
| 47 | 25/11 | Bien: a 375 px el buscador queda fijo debajo del header; el aviso va después en el DOM con el mismo z-index y el lector y el mapa son `<dialog>` modales. |
| 49 | 25/11 | Bien al cerrar y al cambiar de página (con una cámara simulada). Falta al detectar un código real. |
| 50–52 | 25/11 | Bien. |
| 53 | 25/11 | Parcial: el aviso queda entero sobre la barra inferior a 375 px y el favicon es el changuito. Falta el ícono instalado. |
| 54 | 25/11 | Parcial: el link de una compra arma el mensaje y la vista previa abre; Combinar suma bien. Falta WhatsApp. |
| 55 | 25/11 | Parcial: con 40 productos el link a wa.me tiene 8.564 caracteres; con 100, 13.347 (el mensaje lista 40 y el link lleva los 100; la vista previa los muestra). Con 101, "Se pueden compartir hasta 100 productos". Falta ver si WhatsApp lo corta. |
| 56 | 25/11 | Parcial: pegar el mensaje con un link de otro dominio abre la vista previa; un texto sin link dice "No hay un carrito compartido en ese texto". Falta el iPhone. |
| 58 | 25/11 | Bien. |
| 61 | 25/11 | Parcial: producción sin etiqueta, título "El Changuito" y manifest "El Changuito". Falta la app instalada en Android. |
| 65 | 25/11 | Parcial: el botón tiene `aria-disabled`, se puede enfocar y `aria-describedby` lee "No se puede eliminar: está en 1 compra de tu historial.". Falta con TalkBack o VoiceOver. |
| 70 | 25/11 | Parcial: la cantidad de direcciones se anuncia en un `role="status"` y el mapa tiene nombre y el aviso del zoom. Falta con TalkBack o VoiceOver. |

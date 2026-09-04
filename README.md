# mesas-shared

El **contrato** entre la API y la web: los tipos y la máquina de estados de un
pedido. No tiene dependencias ni build — es el vocabulario común.

Vive aparte a propósito. Un cambio de dominio (un estado nuevo, un campo nuevo
en el pedido) empieza acá y obliga a mover los otros dos repos; tenerlo en uno
de ellos haría que el otro copie y peguen la definición, que es como empiezan a
divergir.

## Qué hay

- `src/tipos.js` — Mesa, Mozo, Pedido, ItemPedido
- `src/estados.js` — los estados de un pedido, qué transiciones son válidas y
  qué se puede deshacer (las inversas viven aparte de `TRANSICIONES`: ver el
  comentario de `puedeDeshacer`)

## Consumo

Hoy se copia o se referencia por path. Publicarlo como paquete es una de las
tareas pendientes (ver `PENDIENTES.md`).

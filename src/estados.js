/**
 * Los estados de un pedido y las transiciones válidas.
 *
 * La máquina vive acá y no en la API porque la web también necesita saber qué
 * puede pasar: el panel del mozo tiene que mostrar sólo los botones de las
 * transiciones legales, y si esa lógica se duplica, un estado nuevo se agrega
 * en un lado y se olvida en el otro.
 */
export const ESTADOS = ["pedido", "en_preparacion", "listo_para_servir", "servido", "pagado", "cancelado"];

/** De cada estado, a cuáles se puede pasar. Un estado sin salida es final. */
const TRANSICIONES = {
  pedido: ["en_preparacion", "cancelado"],
  en_preparacion: ["listo_para_servir", "cancelado"],
  listo_para_servir: ["servido", "cancelado"],
  servido: ["pagado"],
  pagado: [],
  cancelado: [],
};

export function transicionesDesde(estado) {
  return TRANSICIONES[estado] ?? [];
}

export function puedePasar(desde, hasta) {
  return transicionesDesde(desde).includes(hasta);
}

/**
 * Un pedido se puede cancelar mientras siga en cocina: `pedido`,
 * `en_preparacion` y `listo_para_servir` —el plato ya emplatado, todavía sin
 * llevar—. Desde `servido` ya llegó a la mesa, y darlo de baja ahí no es una
 * cancelación sino una devolución, que es otra cosa y no está modelada.
 *
 * Se deriva de las transiciones en vez de listar los estados a mano: así un
 * estado nuevo que pueda pasar a "cancelado" queda cancelable sin tocar esta
 * función, y uno que no pueda no se vuelve cancelable por olvido.
 */
export function esCancelable(estado) {
  return puedePasar(estado, "cancelado");
}

/**
 * Deshacer el último cambio de estado.
 *
 * Las inversas NO entran en TRANSICIONES a propósito. Esa tabla dice qué puede
 * elegir el mozo —el panel arma un botón por cada salida— y es la que valida
 * `POST /pedidos/:id/estado`. Meter ahí las vueltas atrás pondría un botón de
 * "volver" entre las acciones normales y, peor, dejaría retroceder por /estado
 * salteándose la ventana de tiempo y el chequeo de autoría, que son toda la
 * gracia del undo: sin eso no es deshacer, es reescribir.
 */
export const VENTANA_UNDO_MS = 30_000;

/** Estados sin vuelta: el pedido ya se cobró o se dio de baja. */
export const ESTADOS_TERMINALES = ["pagado", "cancelado"];

export function esTerminal(estado) {
  return ESTADOS_TERMINALES.includes(estado);
}

/**
 * Se puede volver a `estadoAnterior` si desde ahí se llegó hasta el estado
 * actual: la inversa se deriva de la transición de ida en vez de listarse
 * aparte, así un estado nuevo queda deshacible sin tocar esta función y las dos
 * tablas no se desincronizan.
 *
 * Los terminales se excluyen a mano y no por derivación: `servido → pagado` es
 * una transición legal como cualquier otra, así que sin esa línea un pedido ya
 * cobrado se podría devolver a `servido`.
 */
export function puedeDeshacer(estadoActual, estadoAnterior) {
  if (esTerminal(estadoActual)) return false;
  return puedePasar(estadoAnterior, estadoActual);
}

/**
 * La ventana es corta a propósito: alcanza para el mozo que se dio cuenta de
 * que tocó la mesa equivocada, y no para revisar la historia de un turno.
 */
export function dentroDeVentanaUndo(cambiadoEn, ahora = Date.now()) {
  return typeof cambiadoEn === "number" && ahora - cambiadoEn <= VENTANA_UNDO_MS;
}

/** Etiqueta para mostrarle a una persona. La API no la usa; la web sí. */
export const ETIQUETAS = {
  pedido: "Pedido",
  en_preparacion: "En preparación",
  listo_para_servir: "Listo para servir",
  servido: "Servido",
  pagado: "Pagado",
  cancelado: "Cancelado",
};

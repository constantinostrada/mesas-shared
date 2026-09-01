/**
 * Los estados de un pedido y las transiciones válidas.
 *
 * La máquina vive acá y no en la API porque la web también necesita saber qué
 * puede pasar: el panel del mozo tiene que mostrar sólo los botones de las
 * transiciones legales, y si esa lógica se duplica, un estado nuevo se agrega
 * en un lado y se olvida en el otro.
 */
export const ESTADOS = ["pedido", "en_preparacion", "servido", "pagado", "cancelado"];

/** De cada estado, a cuáles se puede pasar. Un estado sin salida es final. */
const TRANSICIONES = {
  pedido: ["en_preparacion", "cancelado"],
  en_preparacion: ["servido", "cancelado"],
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

/** Etiqueta para mostrarle a una persona. La API no la usa; la web sí. */
export const ETIQUETAS = {
  pedido: "Pedido",
  en_preparacion: "En preparación",
  servido: "Servido",
  pagado: "Pagado",
  cancelado: "Cancelado",
};

/**
 * Si un pedido todavía se puede cancelar.
 *
 * La regla del salón es "mientras siga en cocina": una vez que el plato salió
 * hacia la mesa ya está hecho y cancelarlo no le devuelve nada a nadie. En esta
 * máquina eso es `servido` en adelante.
 *
 * Se deriva de TRANSICIONES en vez de ser una segunda lista de estados: dos
 * listas que dicen lo mismo se separan en cuanto alguien toca una sola.
 */
export function puedeCancelarse(estado) {
  return puedePasar(estado, "cancelado");
}

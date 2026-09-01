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

/** Etiqueta para mostrarle a una persona. La API no la usa; la web sí. */
export const ETIQUETAS = {
  pedido: "Pedido",
  en_preparacion: "En preparación",
  listo_para_servir: "Listo para servir",
  servido: "Servido",
  pagado: "Pagado",
  cancelado: "Cancelado",
};

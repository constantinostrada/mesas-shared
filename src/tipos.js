/**
 * Las formas del dominio. En JSDoc y no en TypeScript para que los tres repos
 * puedan consumirlas sin toolchain — la web es HTML plano y la API es node sin
 * dependencias.
 *
 * @typedef {Object} Mesa
 * @property {string} id
 * @property {number} numero
 * @property {number} capacidad
 * @property {string|null} mozo_id  Mozo a cargo de la mesa, si hay alguno.
 *
 * @typedef {Object} Mozo
 * @property {string} id
 * @property {string} nombre
 * @property {boolean} activo  Un mozo inactivo no recibe pedidos nuevos.
 *
 * @typedef {Object} ItemPedido
 * @property {string} plato_id
 * @property {string} nombre
 * @property {number} cantidad
 * @property {number} precio_unitario
 *
 * @typedef {Object} Pedido
 * @property {string} id
 * @property {string} mesa_id
 * @property {string|null} mozo_id   Se asigna al crearse; null si no había mozo.
 * @property {ItemPedido[]} items
 * @property {string} estado         Ver estados.js
 * @property {number} creado_en      epoch ms
 *
 * Los tres campos que siguen describen EL ÚLTIMO cambio de estado, no su
 * historia: cada cambio los pisa. Alcanza para responder "¿quién lo tocó y
 * hace cuánto?", que es lo que hace falta para poder deshacerlo; un historial
 * completo sería otra estructura y otra decisión.
 * En un pedido recién creado los tres son null: nacer en "pedido" no es un
 * cambio de estado, es el punto de partida.
 * @property {string|null} estado_anterior      Estado desde el que se pasó.
 * @property {number|null} estado_cambiado_en   epoch ms del cambio.
 * @property {string|null} estado_cambiado_por  Mozo que hizo el cambio.
 */

export const CARTA = [
  { id: "milanesa", nombre: "Milanesa con papas", precio: 8500 },
  { id: "ravioles", nombre: "Ravioles de ricota", precio: 7800 },
  { id: "ensalada", nombre: "Ensalada César", precio: 6200 },
  { id: "empanada", nombre: "Empanada de carne", precio: 1500 },
  { id: "flan", nombre: "Flan con dulce de leche", precio: 3900 },
  { id: "agua", nombre: "Agua sin gas", precio: 1800 },
];

export function totalPedido(pedido) {
  return pedido.items.reduce((t, i) => t + i.precio_unitario * i.cantidad, 0);
}

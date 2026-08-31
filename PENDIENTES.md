# Pendientes — mesas-shared

Cada una está pensada para que se vea desde dónde arranca el trabajo. Las que
dicen "toca también" son las que cruzan repos: el cambio empieza en el contrato
y los otros dos tienen que seguirlo.

## Estado "listo para servir"
Hoy un pedido salta de `en_preparacion` a `servido`, así que la cocina no tiene
forma de avisar que un plato está listo y el mozo se entera pasando por la
cocina. Falta un estado intermedio entre los dos.
**Toca también:** `mesas-api` (aceptar la transición) y `mesas-web` (el botón en
el panel del mozo y el color de la tarjeta).

## Notas por plato
Un cliente que quiere la milanesa sin queso hoy no tiene dónde escribirlo.
`ItemPedido` necesita una nota opcional, corta.
**Toca también:** `mesas-api` (persistirla) y `mesas-web` (el input al agregar
el plato y mostrarla en el panel).

## Que la carta no viva en el código
`CARTA` está hardcodeada acá. Para cambiar un precio hay que tocar el repo y
redeployar los tres.
**Toca también:** `mesas-api` (servirla) y `mesas-web` (pedirla en vez de
importarla).

## Publicarlo como paquete
Hoy los otros dos repos copian o referencian por path. Debería instalarse como
dependencia para que una versión vieja del contrato sea visible en vez de
silenciosa.

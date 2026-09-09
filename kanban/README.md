# Kanban colaborativo — Fase 2

Kanban multiusuario con boards, columnas y cards, login por magic link,
permisos por board, drag & drop optimista y sincronización en vivo: lo que
hace cualquier miembro del board aparece en las vistas de los demás sin
recargar.

Stack: React + TypeScript + Vite, Tailwind CSS v4, TanStack Query,
@supabase/supabase-js, @dnd-kit y posiciones con índice fraccional
(`fractional-indexing`).

## Puesta en marcha (desarrollo local)

Requiere Docker corriendo (para el stack local de Supabase) y Node 20+.

```bash
npm install
supabase start                 # levanta Postgres, Auth, PostgREST y Mailpit
supabase status -o env         # de acá salen API_URL y ANON_KEY
cp .env.example .env           # y completá las dos variables
npm run dev                    # http://localhost:5273
```

El puerto 5273 es fijo a propósito: las URLs de redirección del magic link
están declaradas por origen en `supabase/config.toml`.

Los mails de login no salen a internet: se leen en Mailpit,
http://127.0.0.1:54324.

## Contra un proyecto hospedado

```bash
supabase login                 # abre el navegador, es interactivo
supabase projects create kanban --org-id <org> --region <region>
supabase link --project-ref <ref>
supabase db push               # aplica supabase/migrations/
```

Después cargá en `.env` la URL y la anon key del proyecto (Project settings →
API) y agregá tu origen de producción a las URLs de redirección de Auth.

## Miembros de un board

En esta fase no hay flujo de invitación en la app. El que crea un board queda
como `owner` (lo hace un trigger). Para sumar a alguien más, insertá la fila a
mano:

```sql
insert into public.board_members (board_id, user_id, role)
values ('<board>', '<user>', 'editor');   -- o 'viewer'
```

El usuario tiene que haber entrado al menos una vez para existir en
`auth.users`.

## Permisos

| Rol    | Lee | Columnas y cards | Borra el board |
|--------|-----|------------------|----------------|
| owner  | sí  | sí               | sí             |
| editor | sí  | sí               | no             |
| viewer | sí  | no               | no             |

Están implementados con RLS en Postgres, no en la UI: la UI solo esconde los
botones que el rol no puede usar.

## Sincronización en vivo

Cada escritura en `columns` y `cards` se emite por **broadcast de Realtime** al
topic privado `board:<board_id>`, desde un trigger en la base
(`supabase/migrations/20260909000000_realtime_broadcast.sql`). El board abierto
se suscribe a ese topic y los eventos **parchean la caché de TanStack Query**
(`applyRemoteChange`), sin refetch del board.

Por qué broadcast y no Postgres Changes: Realtime no aplica RLS a los eventos
`DELETE` — no queda fila contra la que evaluar la política —, así que cualquiera
podría escuchar los borrados de un board del que no es miembro. Con un topic
privado la autorización se resuelve **una vez, al entrar al canal**, contra una
política en `realtime.messages` que exige ser miembro, y vale igual para las
tres operaciones.

Detalles que importan:

- **Conflictos: last-write-wins.** Los eventos llegan en el orden en que
  Postgres los escribió, así que el último gana. Si dos personas mueven la
  misma card, ambas terminan viendo la posición que quedó guardada.
- **Sin parpadeo en lo propio.** Si el evento no dice nada nuevo respecto de la
  caché, el reducer devuelve el mismo objeto y TanStack no notifica. Y mientras
  un move propio está en vuelo, un evento sobre esa card no la mueve: manda el
  estado optimista hasta que la mutación termina.
- **Entrar y salir.** Se suscribe al abrir el board y se cierra el canal al
  salir. El board se refetchea solo al (re)entrar al canal, que es lo único que
  un parche no puede recuperar: lo que pasó mientras el socket estaba caído.

## Verificación

```bash
npm test           # posiciones, resolución del drop, rollback optimista, eventos remotos
npm run test:realtime   # sincronización real contra el stack local (ver abajo)
npm run build      # typecheck + build
psql "$DB_URL" -f supabase/tests/rls_check.sql   # 19 chequeos de RLS por rol
```

`npm run test:realtime` levanta dos clientes autenticados en el mismo board y
uno que no es miembro, con websockets, triggers y RLS de verdad: verifica que
crear, mover, editar y borrar una card (y las columnas) lleguen al otro en
menos de un segundo, que dos moves simultáneos converjan en la posición que
guardó el servidor, y que al no-miembro le rechacen el canal y no le llegue
nada. Se saltea solo si el stack local no está levantado. (Necesita un
`WebSocket` global: el script agrega `--experimental-websocket`, que en Node 22+
ya no hace falta.)

A mano, con dos navegadores: entrá con dos usuarios distintos al mismo board
(al segundo sumalo con el `insert` de "Miembros de un board") y mové una card
en uno; en el otro se mueve sola.

`supabase/tests/rls_check.sql` corre dentro de una transacción que termina en
`rollback`: crea cuatro usuarios de prueba, un board con columnas y cards, y
verifica qué puede hacer cada rol. No deja nada en la base.

## Posiciones

`columns.position` y `cards.position` son strings de índice fraccional
("a0", "a1", "a0V"). Mover una card entre otras dos genera una clave
intermedia y escribe **una sola fila**, sin renumerar la columna.

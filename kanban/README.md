# Kanban colaborativo — Fase 1

Kanban multiusuario con boards, columnas y cards, login por magic link,
permisos por board y drag & drop optimista. Sin realtime todavía: esa es la
fase siguiente.

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

## Verificación

```bash
npm test        # posiciones fraccionales, resolución del drop, rollback optimista
npm run build   # typecheck + build
psql "$DB_URL" -f supabase/tests/rls_check.sql   # 19 chequeos de RLS por rol
```

`supabase/tests/rls_check.sql` corre dentro de una transacción que termina en
`rollback`: crea cuatro usuarios de prueba, un board con columnas y cards, y
verifica qué puede hacer cada rol. No deja nada en la base.

## Posiciones

`columns.position` y `cards.position` son strings de índice fraccional
("a0", "a1", "a0V"). Mover una card entre otras dos genera una clave
intermedia y escribe **una sola fila**, sin renumerar la columna.

# config

Configuration knowledge: env vars, dependencies, build/deploy, where data lives.

## The Kanban dev server is pinned to port 5273

What: Vite runs on 5273 with `strictPort`, and that origin is what `supabase/config.toml` allows as magic-link redirect · Why: port 5173 is taken by another local app on this machine, and Vite silently falling back to 5174 breaks the login redirect, which is allow-listed per origin · Where: kanban/vite.config.ts

## Supabase for the Kanban runs locally; no hosted project exists yet

What: The schema, auth and API used in phase 1 are the local `supabase start` stack; creating the hosted project needs `supabase login`, which is interactive and was never run · Why: so a later session does not assume a remote project ref exists, and knows `supabase db push` is still pending for the cloud · Where: kanban/README.md

## The realtime end-to-end check runs outside `npm test`

What: `npm run test:realtime` runs `src/**/*.integration.ts` with `vitest.integration.config.ts`, which resolves the local stack with `supabase status -o env` and injects it as `__SUPABASE_STACK__`; `npm test` never touches the network because the default include only matches `*.test.ts` · Why: the check needs Docker, real websockets and real RLS, and it skips itself (stack down) instead of failing the suite — while the config, not the test, holds the Node-only lookup so the test still typechecks under the app's tsconfig · Where: kanban/vitest.integration.config.ts · Learned: `@supabase/realtime-js` needs a global `WebSocket`, which Node 20 only has behind `--experimental-websocket` (the npm script passes it; Node 22+ does not need it)

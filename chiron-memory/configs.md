# config

Configuration knowledge: env vars, dependencies, build/deploy, where data lives.

## The Kanban dev server is pinned to port 5273

What: Vite runs on 5273 with `strictPort`, and that origin is what `supabase/config.toml` allows as magic-link redirect · Why: port 5173 is taken by another local app on this machine, and Vite silently falling back to 5174 breaks the login redirect, which is allow-listed per origin · Where: kanban/vite.config.ts

## Supabase for the Kanban runs locally; no hosted project exists yet

What: The schema, auth and API used in phase 1 are the local `supabase start` stack; creating the hosted project needs `supabase login`, which is interactive and was never run · Why: so a later session does not assume a remote project ref exists, and knows `supabase db push` is still pending for the cloud · Where: kanban/README.md

## The realtime end-to-end check runs outside `npm test`

What: `npm run test:realtime` runs `src/**/*.integration.ts` with `vitest.integration.config.ts`, which resolves the local stack with `supabase status -o env` and injects it as `__SUPABASE_STACK__`; `npm test` never touches the network because the default include only matches `*.test.ts` · Why: the check needs Docker, real websockets and real RLS, and it skips itself (stack down) instead of failing the suite — while the config, not the test, holds the Node-only lookup so the test still typechecks under the app's tsconfig · Where: kanban/vitest.integration.config.ts · Learned: `@supabase/realtime-js` needs a global `WebSocket`, which Node 20 only has behind `--experimental-websocket` (the npm script passes it; Node 22+ does not need it)

## The presence end-to-end check runs with the phase 2 realtime one

What: `src/features/board/__tests__/presence.integration.ts` runs under `npm run test:realtime`, alongside the change-stream check, and covers the roster, cursors, the editing flag, the leave, an outsider being refused the presence topic, and a member being unable to forge a change on `board:<id>` · Why: presence behaviour lives in the server's authorization and in `@supabase/realtime-js`, neither of which a unit test reaches — and the forgery case is the only executable proof of why the two topics are separate · Where: kanban/src/features/board/__tests__/presence.integration.ts · Learned: while the presence check was timing out, the phase 2 check failed too in the same run and passed on its own — judge a failure in this suite by running the file alone before believing it is a regression elsewhere

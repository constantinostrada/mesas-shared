# config

Configuration knowledge: env vars, dependencies, build/deploy, where data lives.

## The Kanban dev server is pinned to port 5273

What: Vite runs on 5273 with `strictPort`, and that origin is what `supabase/config.toml` allows as magic-link redirect · Why: port 5173 is taken by another local app on this machine, and Vite silently falling back to 5174 breaks the login redirect, which is allow-listed per origin · Where: kanban/vite.config.ts

## Supabase for the Kanban runs locally; no hosted project exists yet

What: The schema, auth and API used in phase 1 are the local `supabase start` stack; creating the hosted project needs `supabase login`, which is interactive and was never run · Why: so a later session does not assume a remote project ref exists, and knows `supabase db push` is still pending for the cloud · Where: kanban/README.md

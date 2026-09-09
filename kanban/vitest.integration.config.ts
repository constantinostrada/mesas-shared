import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'

type Stack = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string }

/**
 * Where the local stack is, straight from `supabase status`, or null when it
 * is not running — the check skips itself instead of failing. The lookup
 * happens here so the test itself stays free of Node APIs and typechecks
 * under the app's tsconfig.
 */
function localStack(): Stack | null {
  const fromEnv = process.env
  if (fromEnv.API_URL && fromEnv.ANON_KEY && fromEnv.SERVICE_ROLE_KEY) {
    return {
      API_URL: fromEnv.API_URL,
      ANON_KEY: fromEnv.ANON_KEY,
      SERVICE_ROLE_KEY: fromEnv.SERVICE_ROLE_KEY,
    }
  }
  try {
    const out = execFileSync('supabase', ['status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const env: Record<string, string> = {}
    for (const line of out.split('\n')) {
      const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim())
      if (match) env[match[1]] = match[2]
    }
    const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = env
    return API_URL && ANON_KEY && SERVICE_ROLE_KEY
      ? { API_URL, ANON_KEY, SERVICE_ROLE_KEY }
      : null
  } catch {
    return null
  }
}

// The realtime check talks to the local Supabase stack, so it lives outside
// `npm test` (whose files end in .test.ts and need nothing running).
export default defineConfig({
  test: {
    include: ['src/**/*.integration.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  define: { __SUPABASE_STACK__: JSON.stringify(localStack()) },
})

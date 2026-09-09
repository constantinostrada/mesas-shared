/** Normalise anything thrown by supabase-js / fetch into a readable message. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Error desconocido'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message
  }
  return 'Error desconocido'
}

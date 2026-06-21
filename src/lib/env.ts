/**
 * Reads a required environment variable, throwing a clear, actionable error if
 * it's missing. Use this instead of `process.env.X!` so a misconfigured deploy
 * fails with a readable message instead of a cryptic downstream crash.
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Set it in .env.local (local) or your Vercel project settings (production).`,
    )
  }
  return value
}

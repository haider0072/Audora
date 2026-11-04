/**
 * Server-side configuration for the cloud library.
 *
 * Server only — it reads secrets from `process.env` and is imported by route
 * handlers alone. Nothing here may be pulled into a client component.
 *
 * The cloud library is entirely optional. When any variable is missing the
 * routes answer 503 and the client simply never shows cloud songs, so a
 * deployment without R2 behaves exactly as the local-only player always has.
 */

export interface CloudConfig {
  /** Cloudflare account id; forms the S3 endpoint host. */
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  /** The single user's password. */
  password: string
  /** Key material for signing session cookies. */
  sessionSecret: string
}

/**
 * A secret shorter than this is not worth calling a key: HMAC-SHA256 wants
 * at least as many bytes of entropy as its output to be meaningfully strong.
 */
const MIN_SESSION_SECRET_LENGTH = 32

export function getCloudConfig(): CloudConfig | null {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  const password = process.env.AUDORA_CLOUD_PASSWORD
  const sessionSecret = process.env.AUDORA_SESSION_SECRET

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !password || !sessionSecret) {
    return null
  }

  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    console.error(
      `AUDORA_SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters; cloud library disabled.`,
    )
    return null
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, password, sessionSecret }
}

export function isCloudConfigured(): boolean {
  return getCloudConfig() !== null
}

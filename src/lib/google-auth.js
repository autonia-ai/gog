import { google } from 'googleapis'
import { readConfig, readCredentials } from './config.js'
import { getToken } from './keyring.js'

/**
 * Get the active Google account email.
 * Priority: --account flag > GOG_ACCOUNT env > config default_account > first keyring entry
 */
export async function resolveAccount(options = {}) {
  if (options.account) return options.account
  if (process.env.GOG_ACCOUNT) return process.env.GOG_ACCOUNT
  const config = await readConfig()
  if (config.default_account) return config.default_account
  return null
}

/**
 * Create an authenticated OAuth2 client for the given account.
 * Loads credentials and refresh token, auto-refreshes access tokens.
 */
export async function getAuthClient(options = {}) {
  const account = await resolveAccount(options)
  if (!account) {
    throw new Error('No account specified. Use --account, GOG_ACCOUNT env var, or set default_account in config.')
  }

  const creds = await readCredentials()
  if (!creds) {
    throw new Error('No credentials.json found. Run: gog auth credentials <path>')
  }

  const oauth2 = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uris?.[0]
  )

  const token = await getToken(account)
  if (!token) {
    throw new Error(`No token found for account ${account}. Run: gog auth add ${account}`)
  }

  oauth2.setCredentials({
    refresh_token: token.refresh_token,
    access_token: token.access_token,
    token_type: 'Bearer',
  })

  return { auth: oauth2, account }
}

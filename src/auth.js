import { readFile, copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { google } from 'googleapis'
import { getConfigDir, readConfig, writeConfig, readCredentials, getCredentialsPath } from './lib/config.js'
import { storeToken, getToken, listAccounts } from './lib/keyring.js'
import { printJson, printTable, printError } from './lib/output.js'
import { mkdir } from 'node:fs/promises'

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/tasks',
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

export function registerAuth(program) {
  const auth = program.command('auth').description('Manage authentication')

  // ── auth credentials ──────────────────────────────────────────────────
  auth
    .command('credentials')
    .argument('<path>', 'Path to OAuth credentials.json')
    .option('--no-input', 'Suppress prompts')
    .description('Copy OAuth credentials.json to config directory')
    .action(async (path) => {
      try {
        const dir = getConfigDir()
        await mkdir(dir, { recursive: true })
        await copyFile(path, getCredentialsPath())
        console.log(`Credentials copied to ${getCredentialsPath()}`)
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── auth add ──────────────────────────────────────────────────────────
  auth
    .command('add')
    .argument('<email>', 'Google account email')
    .option('--services <services>', 'Comma-separated services', 'gmail,calendar,drive,docs,sheets,contacts,tasks')
    .option('--no-input', 'Suppress prompts')
    .description('Add a Google account via OAuth flow')
    .action(async (email, opts) => {
      try {
        const creds = await readCredentials()
        if (!creds) {
          printError('No credentials.json found. Run: gog auth credentials <path>')
          process.exit(1)
        }

        const oauth2 = new google.auth.OAuth2(
          creds.client_id,
          creds.client_secret,
          creds.redirect_uris?.[0] || 'urn:ietf:wg:oauth:2.0:oob'
        )

        const url = oauth2.generateAuthUrl({
          access_type: 'offline',
          scope: DEFAULT_SCOPES,
          login_hint: email,
          prompt: 'consent',
        })

        console.log('\nOpen this URL in your browser to authorize:\n')
        console.log(url)
        console.log('\nThen paste the authorization code below.\n')

        if (opts.input === false) {
          console.log('--no-input mode: paste the code as: gog auth tokens import <file>')
          return
        }

        // Read code from stdin
        const { createInterface } = await import('node:readline')
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        const code = await new Promise(resolve => rl.question('Code: ', resolve))
        rl.close()

        const { tokens } = await oauth2.getToken(code)
        const services = opts.services.split(',').map(s => s.trim())

        const tokenObj = {
          email,
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          services,
          scopes: DEFAULT_SCOPES,
          created_at: new Date().toISOString(),
        }

        await storeToken(email, tokenObj)

        // Set as default account
        const config = await readConfig()
        config.default_account = email
        config.keyring_backend = 'file'
        await writeConfig(config)

        console.log(`\nAccount ${email} added successfully.`)
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── auth list ─────────────────────────────────────────────────────────
  auth
    .command('list')
    .option('--check', 'Verify tokens are valid')
    .option('--json', 'Output as JSON')
    .description('List authenticated accounts')
    .action(async (opts) => {
      try {
        const accounts = await listAccounts()
        const config = await readConfig()

        if (!accounts.length) {
          console.log('No accounts configured.')
          return
        }

        if (opts.check) {
          const results = []
          for (const email of accounts) {
            const token = await getToken(email)
            let status = 'ok'
            if (!token?.refresh_token) {
              status = 'no refresh token'
            } else {
              try {
                const creds = await readCredentials()
                if (creds) {
                  const oauth2 = new google.auth.OAuth2(
                    creds.client_id, creds.client_secret
                  )
                  oauth2.setCredentials({ refresh_token: token.refresh_token })
                  await oauth2.getAccessToken()
                }
              } catch {
                status = 'token expired or invalid'
              }
            }
            results.push({
              email,
              default: email === config.default_account ? '*' : '',
              status,
              services: (token?.services || []).join(','),
            })
          }
          printTable(results, { json: opts.json })
        } else {
          const rows = accounts.map(email => ({
            email,
            default: email === config.default_account ? '*' : '',
          }))
          printTable(rows, { json: opts.json })
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── auth tokens import ────────────────────────────────────────────────
  const tokens = auth.command('tokens').description('Manage tokens')

  tokens
    .command('import')
    .argument('<file>', 'Path to token JSON file')
    .option('--no-input', 'Suppress prompts')
    .description('Import a token from a JSON file into the keyring')
    .action(async (file, _opts) => {
      try {
        const raw = await readFile(file, 'utf8')
        const tokenObj = JSON.parse(raw)

        if (!tokenObj.email) {
          printError('Token JSON must contain an "email" field')
          process.exit(1)
        }
        if (!tokenObj.refresh_token) {
          printError('Token JSON must contain a "refresh_token" field')
          process.exit(1)
        }

        await storeToken(tokenObj.email, tokenObj)
        console.log(`Token imported for ${tokenObj.email}`)

        // Set as default if no default exists
        const config = await readConfig()
        if (!config.default_account) {
          config.default_account = tokenObj.email
          config.keyring_backend = 'file'
          await writeConfig(config)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── auth tokens export ────────────────────────────────────────────────
  tokens
    .command('export')
    .argument('<email>', 'Account email')
    .description('Export a token from the keyring')
    .action(async (email) => {
      try {
        const token = await getToken(email)
        if (!token) {
          printError(`No token found for ${email}`)
          process.exit(1)
        }
        printJson(token)
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })
}

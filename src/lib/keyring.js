import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import * as jose from 'jose'

const KEYRING_DIR = join(homedir(), '.local', 'share', 'keyrings')
const KEYRING_FILE = join(KEYRING_DIR, 'gogcli.keyring')

function getPassword() {
  const pw = process.env.GOG_KEYRING_PASSWORD
  if (!pw) throw new Error('GOG_KEYRING_PASSWORD environment variable is required for file keyring')
  return new TextEncoder().encode(pw)
}

async function readKeyring() {
  try {
    const raw = await readFile(KEYRING_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeKeyring(data) {
  await mkdir(dirname(KEYRING_FILE), { recursive: true })
  await writeFile(KEYRING_FILE, JSON.stringify(data, null, 2) + '\n')
}

/**
 * Encrypt a token object into JWE using PBES2-HS256+A128KW + A256GCM.
 * Compatible with the 99designs/keyring Go library used by gogcli.
 */
export async function encrypt(tokenObj) {
  const password = getPassword()
  const plaintext = new TextEncoder().encode(JSON.stringify(tokenObj))
  const jwe = await new jose.CompactEncrypt(plaintext)
    .setProtectedHeader({ alg: 'PBES2-HS256+A128KW', enc: 'A256GCM' })
    .encrypt(password)
  return jwe
}

/**
 * Decrypt a JWE string back to a token object.
 */
export async function decrypt(jweString) {
  const password = getPassword()
  const { plaintext } = await jose.compactDecrypt(jweString, password, {
    keyManagementAlgorithms: ['PBES2-HS256+A128KW'],
    contentEncryptionAlgorithms: ['A256GCM'],
  })
  return JSON.parse(new TextDecoder().decode(plaintext))
}

/**
 * Store a token for an account in the keyring.
 */
export async function storeToken(email, tokenObj) {
  const keyring = await readKeyring()
  keyring[email] = await encrypt(tokenObj)
  await writeKeyring(keyring)
}

/**
 * Retrieve a token for an account from the keyring.
 */
export async function getToken(email) {
  const keyring = await readKeyring()
  const jwe = keyring[email]
  if (!jwe) return null
  return decrypt(jwe)
}

/**
 * List all account emails in the keyring.
 */
export async function listAccounts() {
  const keyring = await readKeyring()
  return Object.keys(keyring)
}

/**
 * Remove an account from the keyring.
 */
export async function removeAccount(email) {
  const keyring = await readKeyring()
  delete keyring[email]
  await writeKeyring(keyring)
}

/**
 * Export the raw keyring data (for tokens export).
 */
export async function exportKeyring() {
  return readKeyring()
}

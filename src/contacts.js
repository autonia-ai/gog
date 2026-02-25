import { google } from 'googleapis'
import { getAuthClient } from './lib/google-auth.js'
import { printJson, printTable, printError } from './lib/output.js'

export function registerContacts(program) {
  const contacts = program.command('contacts').description('Google Contacts operations')

  // ── contacts list ─────────────────────────────────────────────────────
  contacts
    .command('list')
    .option('--max <n>', 'Max results', '50')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('List contacts')
    .action(async (opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const people = google.people({ version: 'v1', auth })

        const res = await people.people.connections.list({
          resourceName: 'people/me',
          pageSize: parseInt(opts.max),
          personFields: 'names,emailAddresses,phoneNumbers,organizations',
          sortOrder: 'FIRST_NAME_ASCENDING',
        })

        const connections = res.data.connections || []
        if (!connections.length) {
          console.log('No contacts found.')
          return
        }

        const rows = connections.map(c => ({
          name: c.names?.[0]?.displayName || '',
          email: c.emailAddresses?.[0]?.value || '',
          phone: c.phoneNumbers?.[0]?.value || '',
          organization: c.organizations?.[0]?.name || '',
        }))

        printTable(rows, { json: opts.json })
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── contacts search ───────────────────────────────────────────────────
  contacts
    .command('search')
    .argument('<query>', 'Search query')
    .option('--max <n>', 'Max results', '20')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Search contacts')
    .action(async (query, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const people = google.people({ version: 'v1', auth })

        const res = await people.people.searchContacts({
          query,
          readMask: 'names,emailAddresses,phoneNumbers,organizations',
          pageSize: parseInt(opts.max),
        })

        const results = res.data.results || []
        if (!results.length) {
          console.log('No contacts found.')
          return
        }

        const rows = results.map(r => {
          const c = r.person
          return {
            name: c.names?.[0]?.displayName || '',
            email: c.emailAddresses?.[0]?.value || '',
            phone: c.phoneNumbers?.[0]?.value || '',
            organization: c.organizations?.[0]?.name || '',
          }
        })

        printTable(rows, { json: opts.json })
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })
}

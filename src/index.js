import { Command } from 'commander'
import { registerAuth } from './auth.js'
import { registerGmail } from './gmail.js'
import { registerCalendar } from './calendar.js'
import { registerDrive } from './drive.js'
import { registerContacts } from './contacts.js'
import { registerSheets } from './sheets.js'
import { registerDocs } from './docs.js'
import { registerTasks } from './tasks.js'

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))

export const program = new Command()

program
  .name('gog')
  .description('Google Workspace CLI')
  .version(pkg.version)

// "gog version" as a subcommand (in addition to --version)
program
  .command('version')
  .description('Print version')
  .action(() => console.log(pkg.version))

registerAuth(program)
registerGmail(program)
registerCalendar(program)
registerDrive(program)
registerContacts(program)
registerSheets(program)
registerDocs(program)
registerTasks(program)

import { google } from 'googleapis'
import { getAuthClient } from './lib/google-auth.js'
import { printJson, printTable, printDetail, printError } from './lib/output.js'

export function registerSheets(program) {
  const sheets = program.command('sheets').description('Google Sheets operations')

  // ── sheets get ────────────────────────────────────────────────────────
  sheets
    .command('get')
    .argument('<spreadsheetId>', 'Spreadsheet ID')
    .argument('<range>', 'Cell range (e.g. Sheet1!A1:C10)')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Get cell values from a spreadsheet')
    .action(async (spreadsheetId, range, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const sh = google.sheets({ version: 'v4', auth })

        const res = await sh.spreadsheets.values.get({
          spreadsheetId,
          range,
        })

        const values = res.data.values || []

        if (opts.json) {
          printJson({ range: res.data.range, values })
          return
        }

        if (!values.length) {
          console.log('No data found.')
          return
        }

        // Print as tab-separated
        for (const row of values) {
          console.log(row.join('\t'))
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── sheets update ─────────────────────────────────────────────────────
  sheets
    .command('update')
    .argument('<spreadsheetId>', 'Spreadsheet ID')
    .argument('<range>', 'Cell range')
    .requiredOption('--values-json <json>', 'Values as JSON 2D array')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Update cells in a spreadsheet')
    .action(async (spreadsheetId, range, opts) => {
      try {
        const values = JSON.parse(opts.valuesJson)
        const { auth } = await getAuthClient(opts)
        const sh = google.sheets({ version: 'v4', auth })

        const res = await sh.spreadsheets.values.update({
          spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        })

        if (opts.json) {
          printJson(res.data)
        } else {
          console.log(`Updated ${res.data.updatedCells} cells in ${res.data.updatedRange}`)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── sheets append ─────────────────────────────────────────────────────
  sheets
    .command('append')
    .argument('<spreadsheetId>', 'Spreadsheet ID')
    .argument('<range>', 'Cell range')
    .requiredOption('--values-json <json>', 'Values as JSON 2D array')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Append rows to a spreadsheet')
    .action(async (spreadsheetId, range, opts) => {
      try {
        const values = JSON.parse(opts.valuesJson)
        const { auth } = await getAuthClient(opts)
        const sh = google.sheets({ version: 'v4', auth })

        const res = await sh.spreadsheets.values.append({
          spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        })

        if (opts.json) {
          printJson(res.data)
        } else {
          console.log(`Appended ${res.data.updates?.updatedCells || 0} cells`)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── sheets clear ──────────────────────────────────────────────────────
  sheets
    .command('clear')
    .argument('<spreadsheetId>', 'Spreadsheet ID')
    .argument('<range>', 'Cell range')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Clear cells in a spreadsheet')
    .action(async (spreadsheetId, range, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const sh = google.sheets({ version: 'v4', auth })

        const res = await sh.spreadsheets.values.clear({
          spreadsheetId,
          range,
          requestBody: {},
        })

        if (opts.json) {
          printJson(res.data)
        } else {
          console.log(`Cleared ${res.data.clearedRange}`)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── sheets metadata ───────────────────────────────────────────────────
  sheets
    .command('metadata')
    .argument('<spreadsheetId>', 'Spreadsheet ID')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Get spreadsheet metadata')
    .action(async (spreadsheetId, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const sh = google.sheets({ version: 'v4', auth })

        const res = await sh.spreadsheets.get({
          spreadsheetId,
          fields: 'spreadsheetId,properties,sheets.properties',
        })

        if (opts.json) {
          printJson(res.data)
          return
        }

        console.log(`Title: ${res.data.properties?.title}`)
        console.log(`ID: ${res.data.spreadsheetId}`)
        console.log(`Locale: ${res.data.properties?.locale}`)
        console.log()
        console.log('Sheets:')
        for (const sheet of res.data.sheets || []) {
          const p = sheet.properties
          console.log(`  ${p.title} (id: ${p.sheetId}, rows: ${p.gridProperties?.rowCount}, cols: ${p.gridProperties?.columnCount})`)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })
}

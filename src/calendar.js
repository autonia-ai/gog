import { google } from 'googleapis'
import { getAuthClient } from './lib/google-auth.js'
import { printJson, printTable, printDetail, printError } from './lib/output.js'

export function registerCalendar(program) {
  const cal = program.command('calendar').description('Google Calendar operations')

  // ── calendar list ─────────────────────────────────────────────────────
  cal
    .command('list')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('List calendars')
    .action(async (opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const calendar = google.calendar({ version: 'v3', auth })

        const res = await calendar.calendarList.list()
        const items = res.data.items || []

        const rows = items.map(c => ({
          id: c.id,
          summary: c.summary || '',
          primary: c.primary ? '*' : '',
          accessRole: c.accessRole || '',
        }))

        printTable(rows, { json: opts.json })
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── calendar events ───────────────────────────────────────────────────
  cal
    .command('events')
    .argument('[calendarId]', 'Calendar ID', 'primary')
    .option('--from <iso>', 'Start time (ISO 8601)')
    .option('--to <iso>', 'End time (ISO 8601)')
    .option('--max <n>', 'Max results', '25')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('List calendar events')
    .action(async (calendarId, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const calendar = google.calendar({ version: 'v3', auth })

        const params = {
          calendarId,
          maxResults: parseInt(opts.max),
          singleEvents: true,
          orderBy: 'startTime',
        }
        if (opts.from) params.timeMin = new Date(opts.from).toISOString()
        if (opts.to) params.timeMax = new Date(opts.to).toISOString()

        // Default to showing upcoming events
        if (!opts.from && !opts.to) {
          params.timeMin = new Date().toISOString()
        }

        const res = await calendar.events.list(params)
        const events = res.data.items || []

        if (!events.length) {
          console.log('No events found.')
          return
        }

        const rows = events.map(e => ({
          id: e.id,
          start: e.start?.dateTime || e.start?.date || '',
          end: e.end?.dateTime || e.end?.date || '',
          summary: e.summary || '(no title)',
          status: e.status || '',
        }))

        printTable(rows, { json: opts.json, columns: ['id', 'start', 'end', 'summary', 'status'] })
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── calendar create ───────────────────────────────────────────────────
  cal
    .command('create')
    .argument('[calendarId]', 'Calendar ID', 'primary')
    .requiredOption('--summary <title>', 'Event title')
    .requiredOption('--from <iso>', 'Start time (ISO 8601)')
    .requiredOption('--to <iso>', 'End time (ISO 8601)')
    .option('--description <text>', 'Event description')
    .option('--location <location>', 'Event location')
    .option('--event-color <n>', 'Event color ID (1-11)')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Create a calendar event')
    .action(async (calendarId, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const calendar = google.calendar({ version: 'v3', auth })

        const event = {
          summary: opts.summary,
          start: { dateTime: new Date(opts.from).toISOString() },
          end: { dateTime: new Date(opts.to).toISOString() },
        }
        if (opts.description) event.description = opts.description
        if (opts.location) event.location = opts.location
        if (opts.eventColor) event.colorId = opts.eventColor

        const res = await calendar.events.insert({
          calendarId,
          requestBody: event,
        })

        if (opts.json) {
          printJson(res.data)
        } else {
          console.log(`Event created: ${res.data.id}`)
          console.log(`Link: ${res.data.htmlLink}`)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── calendar update ───────────────────────────────────────────────────
  cal
    .command('update')
    .argument('<calendarId>', 'Calendar ID')
    .argument('<eventId>', 'Event ID')
    .option('--summary <title>', 'Event title')
    .option('--from <iso>', 'Start time (ISO 8601)')
    .option('--to <iso>', 'End time (ISO 8601)')
    .option('--description <text>', 'Event description')
    .option('--location <location>', 'Event location')
    .option('--event-color <n>', 'Event color ID (1-11)')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Update a calendar event')
    .action(async (calendarId, eventId, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const calendar = google.calendar({ version: 'v3', auth })

        const patch = {}
        if (opts.summary) patch.summary = opts.summary
        if (opts.from) patch.start = { dateTime: new Date(opts.from).toISOString() }
        if (opts.to) patch.end = { dateTime: new Date(opts.to).toISOString() }
        if (opts.description) patch.description = opts.description
        if (opts.location) patch.location = opts.location
        if (opts.eventColor) patch.colorId = opts.eventColor

        const res = await calendar.events.patch({
          calendarId,
          eventId,
          requestBody: patch,
        })

        if (opts.json) {
          printJson(res.data)
        } else {
          console.log(`Event updated: ${res.data.id}`)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── calendar colors ───────────────────────────────────────────────────
  cal
    .command('colors')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Show available event colors')
    .action(async (opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const calendar = google.calendar({ version: 'v3', auth })

        const res = await calendar.colors.get()

        if (opts.json) {
          printJson(res.data)
          return
        }

        console.log('Event colors:')
        const eventColors = res.data.event || {}
        for (const [id, color] of Object.entries(eventColors)) {
          console.log(`  ${id}: bg=${color.background} fg=${color.foreground}`)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })
}

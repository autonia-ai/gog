import { google } from 'googleapis'
import { getAuthClient } from './lib/google-auth.js'
import { printJson, printTable, printError } from './lib/output.js'

export function registerTasks(program) {
  const tasks = program.command('tasks').description('Google Tasks operations')

  // ── tasks list ────────────────────────────────────────────────────────
  tasks
    .command('list')
    .option('--list <listId>', 'Task list ID', '@default')
    .option('--show-completed', 'Show completed tasks')
    .option('--max <n>', 'Max results', '50')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('List tasks')
    .action(async (opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const tasksApi = google.tasks({ version: 'v1', auth })

        const params = {
          tasklist: opts.list,
          maxResults: parseInt(opts.max),
        }
        if (!opts.showCompleted) {
          params.showCompleted = false
          params.showHidden = false
        }

        const res = await tasksApi.tasks.list(params)
        const items = res.data.items || []

        if (!items.length) {
          console.log('No tasks found.')
          return
        }

        const rows = items.map(t => ({
          id: t.id,
          title: t.title || '(untitled)',
          status: t.status || '',
          due: t.due ? new Date(t.due).toLocaleDateString() : '',
        }))

        printTable(rows, { json: opts.json })
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── tasks lists ───────────────────────────────────────────────────────
  tasks
    .command('lists')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('List task lists')
    .action(async (opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const tasksApi = google.tasks({ version: 'v1', auth })

        const res = await tasksApi.tasklists.list()
        const items = res.data.items || []

        const rows = items.map(l => ({
          id: l.id,
          title: l.title || '(untitled)',
          updated: l.updated ? new Date(l.updated).toLocaleDateString() : '',
        }))

        printTable(rows, { json: opts.json })
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── tasks create ──────────────────────────────────────────────────────
  tasks
    .command('create')
    .requiredOption('--title <title>', 'Task title')
    .option('--list <listId>', 'Task list ID', '@default')
    .option('--notes <notes>', 'Task notes')
    .option('--due <iso>', 'Due date (ISO 8601)')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Create a task')
    .action(async (opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const tasksApi = google.tasks({ version: 'v1', auth })

        const task = { title: opts.title }
        if (opts.notes) task.notes = opts.notes
        if (opts.due) task.due = new Date(opts.due).toISOString()

        const res = await tasksApi.tasks.insert({
          tasklist: opts.list,
          requestBody: task,
        })

        if (opts.json) {
          printJson(res.data)
        } else {
          console.log(`Task created: ${res.data.id}`)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── tasks complete ────────────────────────────────────────────────────
  tasks
    .command('complete')
    .argument('<taskId>', 'Task ID')
    .option('--list <listId>', 'Task list ID', '@default')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Mark a task as completed')
    .action(async (taskId, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const tasksApi = google.tasks({ version: 'v1', auth })

        const res = await tasksApi.tasks.patch({
          tasklist: opts.list,
          task: taskId,
          requestBody: { status: 'completed' },
        })

        if (opts.json) {
          printJson(res.data)
        } else {
          console.log(`Task ${taskId} marked as completed`)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })
}

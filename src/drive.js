import { google } from 'googleapis'
import { createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { getAuthClient } from './lib/google-auth.js'
import { printJson, printTable, printError } from './lib/output.js'

export function registerDrive(program) {
  const drive = program.command('drive').description('Google Drive operations')

  // ── drive search ──────────────────────────────────────────────────────
  drive
    .command('search')
    .argument('<query>', 'Drive search query')
    .option('--max <n>', 'Max results', '20')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Search Google Drive files')
    .action(async (query, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const drv = google.drive({ version: 'v3', auth })

        const res = await drv.files.list({
          q: query,
          pageSize: parseInt(opts.max),
          fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink)',
          orderBy: 'modifiedTime desc',
        })

        const files = res.data.files || []
        if (!files.length) {
          console.log('No files found.')
          return
        }

        const rows = files.map(f => ({
          id: f.id,
          name: f.name,
          type: simplifyMimeType(f.mimeType),
          modified: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : '',
          size: f.size ? formatSize(parseInt(f.size)) : '',
        }))

        printTable(rows, { json: opts.json })
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── drive list ────────────────────────────────────────────────────────
  drive
    .command('list')
    .option('--max <n>', 'Max results', '20')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('List recent Drive files')
    .action(async (opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const drv = google.drive({ version: 'v3', auth })

        const res = await drv.files.list({
          pageSize: parseInt(opts.max),
          fields: 'files(id, name, mimeType, modifiedTime, size)',
          orderBy: 'modifiedTime desc',
        })

        const files = res.data.files || []
        if (!files.length) {
          console.log('No files found.')
          return
        }

        const rows = files.map(f => ({
          id: f.id,
          name: f.name,
          type: simplifyMimeType(f.mimeType),
          modified: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : '',
          size: f.size ? formatSize(parseInt(f.size)) : '',
        }))

        printTable(rows, { json: opts.json })
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── drive download ────────────────────────────────────────────────────
  drive
    .command('download')
    .argument('<fileId>', 'File ID')
    .requiredOption('--out <path>', 'Output file path')
    .option('--account <email>', 'Google account')
    .description('Download a file from Drive')
    .action(async (fileId, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const drv = google.drive({ version: 'v3', auth })

        // Get file metadata first to check if it's a Google doc type
        const meta = await drv.files.get({ fileId, fields: 'mimeType, name' })
        const mimeType = meta.data.mimeType

        let response
        if (mimeType?.startsWith('application/vnd.google-apps.')) {
          // Export Google Workspace files
          const exportMime = getExportMimeType(mimeType)
          response = await drv.files.export(
            { fileId, mimeType: exportMime },
            { responseType: 'stream' }
          )
        } else {
          response = await drv.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
          )
        }

        const dest = createWriteStream(opts.out)
        await pipeline(response.data, dest)
        console.log(`Downloaded to ${opts.out}`)
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── drive upload ──────────────────────────────────────────────────────
  drive
    .command('upload')
    .argument('<path>', 'Local file path')
    .option('--name <name>', 'File name on Drive')
    .option('--folder <folderId>', 'Parent folder ID')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Upload a file to Drive')
    .action(async (path, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const drv = google.drive({ version: 'v3', auth })

        const { createReadStream } = await import('node:fs')
        const name = opts.name || basename(path)
        const parents = opts.folder ? [opts.folder] : undefined

        const res = await drv.files.create({
          requestBody: { name, parents },
          media: { body: createReadStream(path) },
          fields: 'id, name, webViewLink',
        })

        if (opts.json) {
          printJson(res.data)
        } else {
          console.log(`Uploaded: ${res.data.name} (${res.data.id})`)
          if (res.data.webViewLink) console.log(`Link: ${res.data.webViewLink}`)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })
}

function simplifyMimeType(mime) {
  if (!mime) return ''
  const map = {
    'application/vnd.google-apps.document': 'doc',
    'application/vnd.google-apps.spreadsheet': 'sheet',
    'application/vnd.google-apps.presentation': 'slides',
    'application/vnd.google-apps.folder': 'folder',
    'application/vnd.google-apps.form': 'form',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'image/jpeg': 'jpg',
    'image/png': 'png',
  }
  return map[mime] || mime.split('/').pop()
}

function getExportMimeType(googleMime) {
  const map = {
    'application/vnd.google-apps.document': 'text/plain',
    'application/vnd.google-apps.spreadsheet': 'text/csv',
    'application/vnd.google-apps.presentation': 'application/pdf',
    'application/vnd.google-apps.drawing': 'image/png',
  }
  return map[googleMime] || 'application/pdf'
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`
}

import { google } from 'googleapis'
import { writeFile } from 'node:fs/promises'
import { getAuthClient } from './lib/google-auth.js'
import { printJson, printError } from './lib/output.js'

export function registerDocs(program) {
  const docs = program.command('docs').description('Google Docs operations')

  // ── docs cat ──────────────────────────────────────────────────────────
  docs
    .command('cat')
    .argument('<docId>', 'Document ID')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Print document as plain text')
    .action(async (docId, opts) => {
      try {
        const { auth } = await getAuthClient(opts)

        if (opts.json) {
          const docsApi = google.docs({ version: 'v1', auth })
          const res = await docsApi.documents.get({ documentId: docId })
          printJson(res.data)
          return
        }

        // Use Drive export for plain text
        const drv = google.drive({ version: 'v3', auth })
        const res = await drv.files.export({
          fileId: docId,
          mimeType: 'text/plain',
        })

        console.log(res.data)
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── docs export ───────────────────────────────────────────────────────
  docs
    .command('export')
    .argument('<docId>', 'Document ID')
    .option('--format <format>', 'Export format: txt, html, pdf, docx', 'txt')
    .requiredOption('--out <path>', 'Output file path')
    .option('--account <email>', 'Google account')
    .description('Export a document to a file')
    .action(async (docId, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const drv = google.drive({ version: 'v3', auth })

        const mimeTypes = {
          txt: 'text/plain',
          html: 'text/html',
          pdf: 'application/pdf',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }

        const mimeType = mimeTypes[opts.format]
        if (!mimeType) {
          printError(`Unknown format: ${opts.format}. Use: txt, html, pdf, docx`)
          process.exit(1)
        }

        const res = await drv.files.export(
          { fileId: docId, mimeType },
          { responseType: opts.format === 'txt' || opts.format === 'html' ? 'text' : 'arraybuffer' }
        )

        if (opts.format === 'txt' || opts.format === 'html') {
          await writeFile(opts.out, res.data)
        } else {
          await writeFile(opts.out, Buffer.from(res.data))
        }

        console.log(`Exported to ${opts.out}`)
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })
}

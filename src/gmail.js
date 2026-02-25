import { google } from 'googleapis'
import { readFile } from 'node:fs/promises'
import { getAuthClient } from './lib/google-auth.js'
import { printJson, printTable, printDetail, printError } from './lib/output.js'

export function registerGmail(program) {
  const gmail = program.command('gmail').description('Gmail operations')

  // ── gmail search ──────────────────────────────────────────────────────
  gmail
    .command('search')
    .argument('<query>', 'Gmail search query')
    .option('--max <n>', 'Max results', '10')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Search Gmail threads')
    .action(async (query, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const gm = google.gmail({ version: 'v1', auth })

        const res = await gm.users.threads.list({
          userId: 'me',
          q: query,
          maxResults: parseInt(opts.max),
        })

        const threads = res.data.threads || []
        if (!threads.length) {
          console.log('No threads found.')
          return
        }

        // Fetch thread details for display
        const rows = []
        for (const t of threads) {
          const detail = await gm.users.threads.get({
            userId: 'me',
            id: t.id,
            format: 'METADATA',
            metadataHeaders: ['Subject', 'From', 'Date'],
          })
          const headers = detail.data.messages?.[0]?.payload?.headers || []
          const get = (name) => headers.find(h => h.name === name)?.value || ''
          rows.push({
            id: t.id,
            subject: get('Subject'),
            from: get('From'),
            date: get('Date'),
            messages: detail.data.messages?.length || 0,
          })
        }

        printTable(rows, { json: opts.json, columns: ['id', 'date', 'from', 'subject', 'messages'] })
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── gmail messages search ─────────────────────────────────────────────
  const messages = gmail.command('messages').description('Gmail message operations')

  messages
    .command('search')
    .argument('<query>', 'Gmail search query')
    .option('--max <n>', 'Max results', '10')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Search Gmail messages')
    .action(async (query, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const gm = google.gmail({ version: 'v1', auth })

        const res = await gm.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: parseInt(opts.max),
        })

        const msgs = res.data.messages || []
        if (!msgs.length) {
          console.log('No messages found.')
          return
        }

        const rows = []
        for (const m of msgs) {
          const detail = await gm.users.messages.get({
            userId: 'me',
            id: m.id,
            format: 'METADATA',
            metadataHeaders: ['Subject', 'From', 'Date'],
          })
          const headers = detail.data.payload?.headers || []
          const get = (name) => headers.find(h => h.name === name)?.value || ''
          rows.push({
            id: m.id,
            subject: get('Subject'),
            from: get('From'),
            date: get('Date'),
            snippet: detail.data.snippet || '',
          })
        }

        printTable(rows, { json: opts.json, columns: ['id', 'date', 'from', 'subject'] })
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── gmail get ─────────────────────────────────────────────────────────
  gmail
    .command('get')
    .argument('<messageId>', 'Message ID')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Get a specific message')
    .action(async (messageId, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const gm = google.gmail({ version: 'v1', auth })

        const res = await gm.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'FULL',
        })

        if (opts.json) {
          printJson(res.data)
          return
        }

        const headers = res.data.payload?.headers || []
        const get = (name) => headers.find(h => h.name === name)?.value || ''

        console.log(`From:    ${get('From')}`)
        console.log(`To:      ${get('To')}`)
        console.log(`Date:    ${get('Date')}`)
        console.log(`Subject: ${get('Subject')}`)
        console.log(`---`)

        // Extract body text
        const body = extractBody(res.data.payload)
        console.log(body)
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── gmail send ────────────────────────────────────────────────────────
  gmail
    .command('send')
    .requiredOption('--to <address>', 'Recipient email')
    .requiredOption('--subject <subject>', 'Email subject')
    .option('--body <text>', 'Plain text body')
    .option('--body-file <path>', 'Read body from file (- for stdin)')
    .option('--body-html <html>', 'HTML body')
    .option('--cc <addresses>', 'CC recipients (comma-separated)')
    .option('--bcc <addresses>', 'BCC recipients (comma-separated)')
    .option('--reply-to-message-id <id>', 'Reply to this message ID')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Send an email')
    .action(async (opts) => {
      try {
        let body = opts.body || ''

        if (opts.bodyFile) {
          if (opts.bodyFile === '-') {
            const chunks = []
            for await (const chunk of process.stdin) chunks.push(chunk)
            body = Buffer.concat(chunks).toString()
          } else {
            body = await readFile(opts.bodyFile, 'utf8')
          }
        }

        const { auth } = await getAuthClient(opts)
        const gm = google.gmail({ version: 'v1', auth })

        // Build MIME message
        const contentType = opts.bodyHtml ? 'text/html' : 'text/plain'
        const content = opts.bodyHtml || body

        let headers = [
          `To: ${opts.to}`,
          `Subject: ${opts.subject}`,
          `Content-Type: ${contentType}; charset=utf-8`,
        ]
        if (opts.cc) headers.push(`Cc: ${opts.cc}`)
        if (opts.bcc) headers.push(`Bcc: ${opts.bcc}`)

        let threadId
        if (opts.replyToMessageId) {
          // Fetch original message to get threadId and Message-ID header
          const orig = await gm.users.messages.get({
            userId: 'me',
            id: opts.replyToMessageId,
            format: 'METADATA',
            metadataHeaders: ['Message-ID', 'References'],
          })
          threadId = orig.data.threadId
          const origHeaders = orig.data.payload?.headers || []
          const messageIdHeader = origHeaders.find(h => h.name === 'Message-ID')?.value
          const refsHeader = origHeaders.find(h => h.name === 'References')?.value
          if (messageIdHeader) {
            headers.push(`In-Reply-To: ${messageIdHeader}`)
            headers.push(`References: ${refsHeader ? refsHeader + ' ' : ''}${messageIdHeader}`)
          }
        }

        const raw = Buffer.from(headers.join('\r\n') + '\r\n\r\n' + content)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')

        const sendOpts = { userId: 'me', requestBody: { raw } }
        if (threadId) sendOpts.requestBody.threadId = threadId

        const res = await gm.users.messages.send(sendOpts)

        if (opts.json) {
          printJson(res.data)
        } else {
          console.log(`Message sent: ${res.data.id}`)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  // ── gmail drafts ──────────────────────────────────────────────────────
  const drafts = gmail.command('drafts').description('Gmail draft operations')

  drafts
    .command('create')
    .requiredOption('--to <address>', 'Recipient email')
    .requiredOption('--subject <subject>', 'Email subject')
    .option('--body <text>', 'Plain text body')
    .option('--body-file <path>', 'Read body from file (- for stdin)')
    .option('--body-html <html>', 'HTML body')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Create a draft email')
    .action(async (opts) => {
      try {
        let body = opts.body || ''

        if (opts.bodyFile) {
          if (opts.bodyFile === '-') {
            const chunks = []
            for await (const chunk of process.stdin) chunks.push(chunk)
            body = Buffer.concat(chunks).toString()
          } else {
            body = await readFile(opts.bodyFile, 'utf8')
          }
        }

        const { auth } = await getAuthClient(opts)
        const gm = google.gmail({ version: 'v1', auth })

        const contentType = opts.bodyHtml ? 'text/html' : 'text/plain'
        const content = opts.bodyHtml || body

        const raw = Buffer.from(
          `To: ${opts.to}\r\nSubject: ${opts.subject}\r\nContent-Type: ${contentType}; charset=utf-8\r\n\r\n${content}`
        )
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')

        const res = await gm.users.drafts.create({
          userId: 'me',
          requestBody: { message: { raw } },
        })

        if (opts.json) {
          printJson(res.data)
        } else {
          console.log(`Draft created: ${res.data.id}`)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })

  drafts
    .command('send')
    .argument('<draftId>', 'Draft ID to send')
    .option('--account <email>', 'Google account')
    .option('--json', 'Output as JSON')
    .description('Send a draft')
    .action(async (draftId, opts) => {
      try {
        const { auth } = await getAuthClient(opts)
        const gm = google.gmail({ version: 'v1', auth })

        const res = await gm.users.drafts.send({
          userId: 'me',
          requestBody: { id: draftId },
        })

        if (opts.json) {
          printJson(res.data)
        } else {
          console.log(`Draft sent: ${res.data.id}`)
        }
      } catch (err) {
        printError(err.message)
        process.exit(1)
      }
    })
}

/**
 * Extract plain text body from a Gmail message payload.
 */
function extractBody(payload) {
  if (!payload) return ''

  // Direct body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8')
  }

  // Multipart — prefer text/plain
  if (payload.parts) {
    const textPart = payload.parts.find(p => p.mimeType === 'text/plain')
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, 'base64').toString('utf8')
    }
    // Fallback to text/html
    const htmlPart = payload.parts.find(p => p.mimeType === 'text/html')
    if (htmlPart?.body?.data) {
      return Buffer.from(htmlPart.body.data, 'base64').toString('utf8')
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const body = extractBody(part)
      if (body) return body
    }
  }

  return ''
}

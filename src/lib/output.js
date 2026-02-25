/**
 * Output formatting utilities.
 * Supports --json flag for machine-readable output.
 */

export function printJson(data) {
  console.log(JSON.stringify(data, null, 2))
}

export function printError(message) {
  console.error(`Error: ${message}`)
}

/**
 * Print data either as JSON or human-readable table.
 * @param {object[]} rows - Array of objects
 * @param {object} opts - { json?: boolean, columns?: string[] }
 */
export function printTable(rows, opts = {}) {
  if (opts.json) {
    printJson(rows)
    return
  }

  if (!rows.length) {
    console.log('(no results)')
    return
  }

  const columns = opts.columns || Object.keys(rows[0])

  // Calculate column widths
  const widths = columns.map(col =>
    Math.max(col.length, ...rows.map(r => String(r[col] ?? '').length))
  )

  // Cap each column at 60 chars
  const maxWidth = 60
  const cappedWidths = widths.map(w => Math.min(w, maxWidth))

  // Header
  const header = columns.map((col, i) => col.padEnd(cappedWidths[i])).join('  ')
  console.log(header)
  console.log(cappedWidths.map(w => '─'.repeat(w)).join('  '))

  // Rows
  for (const row of rows) {
    const line = columns.map((col, i) => {
      const val = String(row[col] ?? '')
      return val.length > cappedWidths[i]
        ? val.slice(0, cappedWidths[i] - 1) + '…'
        : val.padEnd(cappedWidths[i])
    }).join('  ')
    console.log(line)
  }
}

/**
 * Print a single item's key-value pairs.
 */
export function printDetail(obj, opts = {}) {
  if (opts.json) {
    printJson(obj)
    return
  }

  const maxKeyLen = Math.max(...Object.keys(obj).map(k => k.length))
  for (const [key, value] of Object.entries(obj)) {
    const val = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
    console.log(`${key.padEnd(maxKeyLen)}  ${val}`)
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }

  return typeof error === 'string' ? error : 'Unknown error'
}

export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

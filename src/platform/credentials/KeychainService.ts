import { safeStorage } from 'electron'
import Database from 'better-sqlite3'

const TABLE_NAME = 'keychain_entries'

/**
 * KeychainService uses Electron safeStorage API (OS keychain) to encrypt secrets,
 * and stores the encrypted blobs in a local SQLite table.
 *
 * Key format: `opencove-ssh/{targetId}`
 */
export class KeychainService {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        key TEXT PRIMARY KEY,
        encrypted BLOB NOT NULL
      )
    `)
  }

  private toKey(targetId: string): string {
    return `opencove-ssh/${targetId}`
  }

  store(targetId: string, secret: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available on this platform')
    }

    const key = this.toKey(targetId)
    const encrypted = safeStorage.encryptString(secret)

    this.db
      .prepare(
        `INSERT INTO ${TABLE_NAME} (key, encrypted) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET encrypted = excluded.encrypted`,
      )
      .run(key, encrypted)
  }

  retrieve(targetId: string): string | null {
    if (!safeStorage.isEncryptionAvailable()) {
      return null
    }

    const key = this.toKey(targetId)
    const row = this.db.prepare(`SELECT encrypted FROM ${TABLE_NAME} WHERE key = ?`).get(key) as
      | { encrypted: Buffer }
      | undefined

    if (!row) {return null}

    return safeStorage.decryptString(Buffer.from(row.encrypted))
  }

  remove(targetId: string): void {
    const key = this.toKey(targetId)
    this.db.prepare(`DELETE FROM ${TABLE_NAME} WHERE key = ?`).run(key)
  }

  removeAllForTarget(targetId: string): void {
    this.remove(targetId)
  }
}

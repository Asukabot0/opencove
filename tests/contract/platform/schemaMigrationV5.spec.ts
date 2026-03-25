import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrate } from '../../../src/platform/persistence/sqlite/migrate'

describe('Schema migration v4 → v5', () => {
  let tempDir = ''
  let db: InstanceType<typeof Database> | null = null

  afterEach(async () => {
    db?.close()
    db = null
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = ''
    }
  })

  function openDb(): InstanceType<typeof Database> {
    db = new Database(join(tempDir, 'test.db'))
    return db
  }

  it('fresh install (v0 → v5) creates remote_targets table and workspace_spaces.target_id', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cove-migrate-'))
    const sqlite = openDb()

    migrate(sqlite)

    const version = sqlite.pragma('user_version', { simple: true })
    expect(version).toBe(5)

    // remote_targets table exists
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='remote_targets'")
      .all() as { name: string }[]
    expect(tables).toHaveLength(1)

    // workspace_spaces has target_id column
    const columns = sqlite.prepare('PRAGMA table_info(workspace_spaces)').all() as {
      name: string
    }[]
    const columnNames = columns.map(c => c.name)
    expect(columnNames).toContain('target_id')

    // No remote_path column (invariant I2)
    const rtColumns = sqlite.prepare('PRAGMA table_info(remote_targets)').all() as {
      name: string
    }[]
    const rtColumnNames = rtColumns.map(c => c.name)
    expect(rtColumnNames).not.toContain('remote_path')
  })

  it('v4 → v5 adds remote_targets table and target_id column via ALTER', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cove-migrate-'))
    const sqlite = openDb()

    // Simulate a v4 database with existing workspace_spaces (no target_id)
    sqlite.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        worktrees_root TEXT NOT NULL,
        pull_request_base_branch_options_json TEXT NOT NULL DEFAULT '[]',
        viewport_x REAL NOT NULL,
        viewport_y REAL NOT NULL,
        viewport_zoom REAL NOT NULL,
        is_minimap_visible INTEGER NOT NULL,
        active_space_id TEXT
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        title_pinned_by_user INTEGER NOT NULL,
        position_x REAL NOT NULL,
        position_y REAL NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        kind TEXT NOT NULL,
        label_color_override TEXT,
        status TEXT,
        started_at TEXT,
        ended_at TEXT,
        exit_code INTEGER,
        last_error TEXT,
        execution_directory TEXT,
        expected_directory TEXT,
        agent_json TEXT,
        task_json TEXT
      );

      CREATE TABLE IF NOT EXISTS workspace_spaces (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        directory_path TEXT NOT NULL,
        label_color TEXT,
        rect_x REAL,
        rect_y REAL,
        rect_width REAL,
        rect_height REAL
      );

      CREATE TABLE IF NOT EXISTS workspace_space_nodes (
        space_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        PRIMARY KEY (space_id, node_id)
      );

      CREATE TABLE IF NOT EXISTS node_scrollback (
        node_id TEXT PRIMARY KEY,
        scrollback TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
    sqlite.pragma('user_version = 4')

    // Insert a test space to verify data survives migration
    sqlite.exec(`
      INSERT INTO workspace_spaces (id, workspace_id, name, directory_path)
      VALUES ('space-1', 'ws-1', 'Test Space', '/tmp/test')
    `)

    migrate(sqlite)

    const version = sqlite.pragma('user_version', { simple: true })
    expect(version).toBe(5)

    // remote_targets table was created
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='remote_targets'")
      .all() as { name: string }[]
    expect(tables).toHaveLength(1)

    // target_id column was added to workspace_spaces
    const columns = sqlite.prepare('PRAGMA table_info(workspace_spaces)').all() as {
      name: string
    }[]
    const columnNames = columns.map(c => c.name)
    expect(columnNames).toContain('target_id')

    // Existing data survives
    const space = sqlite.prepare('SELECT * FROM workspace_spaces WHERE id = ?').get('space-1') as {
      id: string
      target_id: string | null
    }
    expect(space.id).toBe('space-1')
    expect(space.target_id).toBeNull()
  })

  it('v1 → v5 creates all tables including remote_targets', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cove-migrate-'))
    const sqlite = openDb()

    // Simulate a v1 database with legacy kv table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
    sqlite.pragma('user_version = 1')

    migrate(sqlite)

    const version = sqlite.pragma('user_version', { simple: true })
    expect(version).toBe(5)

    // remote_targets table exists
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='remote_targets'")
      .all() as { name: string }[]
    expect(tables).toHaveLength(1)

    // workspace_spaces has target_id
    const columns = sqlite.prepare('PRAGMA table_info(workspace_spaces)').all() as {
      name: string
    }[]
    expect(columns.map(c => c.name)).toContain('target_id')

    // kv table was dropped
    const kvTables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kv'")
      .all() as { name: string }[]
    expect(kvTables).toHaveLength(0)
  })
})

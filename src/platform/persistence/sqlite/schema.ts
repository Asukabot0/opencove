import { integer, real, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core'

export type DbAppMetaKey = 'format_version' | 'active_workspace_id'

export const appMeta = sqliteTable('app_meta', {
  key: text('key').$type<DbAppMetaKey>().primaryKey(),
  value: text('value').notNull(),
})

export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey(),
  value: text('value').notNull(),
})

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  worktreesRoot: text('worktrees_root').notNull(),
  pullRequestBaseBranchOptionsJson: text('pull_request_base_branch_options_json').notNull(),
  viewportX: real('viewport_x').notNull(),
  viewportY: real('viewport_y').notNull(),
  viewportZoom: real('viewport_zoom').notNull(),
  isMinimapVisible: integer('is_minimap_visible', { mode: 'boolean' }).notNull(),
  activeSpaceId: text('active_space_id'),
})

export const nodes = sqliteTable('nodes', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  title: text('title').notNull(),
  titlePinnedByUser: integer('title_pinned_by_user', { mode: 'number' }).notNull(),
  positionX: real('position_x').notNull(),
  positionY: real('position_y').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  kind: text('kind').notNull(),
  labelColorOverride: text('label_color_override'),
  status: text('status'),
  startedAt: text('started_at'),
  endedAt: text('ended_at'),
  exitCode: integer('exit_code'),
  lastError: text('last_error'),
  executionDirectory: text('execution_directory'),
  expectedDirectory: text('expected_directory'),
  agentJson: text('agent_json'),
  taskJson: text('task_json'),
})

export const spaces = sqliteTable('workspace_spaces', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  directoryPath: text('directory_path').notNull(),
  labelColor: text('label_color'),
  rectX: real('rect_x'),
  rectY: real('rect_y'),
  rectWidth: real('rect_width'),
  rectHeight: real('rect_height'),
  targetId: text('target_id'),
})

export const spaceNodes = sqliteTable(
  'workspace_space_nodes',
  {
    spaceId: text('space_id').notNull(),
    nodeId: text('node_id').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.spaceId, table.nodeId] }),
  }),
)

export const remoteTargets = sqliteTable('remote_targets', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull().default(22),
  username: text('username').notNull(),
  authMethod: text('auth_method').notNull().default('key'),
  keyPath: text('key_path'),
  forwardAgent: integer('forward_agent').notNull().default(0),
  source: text('source').notNull().default('manual'),
  importedFrom: text('imported_from'),
  secretRef: text('secret_ref'),
  connectTimeout: integer('connect_timeout').notNull().default(10000),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const nodeScrollback = sqliteTable('node_scrollback', {
  nodeId: text('node_id').primaryKey(),
  scrollback: text('scrollback').notNull(),
  updatedAt: text('updated_at').notNull(),
})

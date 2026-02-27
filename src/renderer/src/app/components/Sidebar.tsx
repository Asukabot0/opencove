import React from 'react'
import { AGENT_PROVIDER_LABEL } from '../../features/settings/agentConfig'
import type { PersistNotice, ProjectContextMenuState } from '../types'
import { toRelativeTime } from '../utils/format'
import type {
  TaskRuntimeStatus,
  TerminalNodeData,
  WorkspaceState,
} from '../../features/workspace/types'

type SidebarAgentStatus = 'working' | 'standby'

type SidebarTaskStatus = TaskRuntimeStatus | 'none'

type SidebarStatusTone = 'working' | 'standby' | 'todo' | 'done' | 'done-strong'

const SIDEBAR_AGENT_STATUS_LABEL: Record<SidebarAgentStatus, string> = {
  working: 'Working',
  standby: 'Standby',
}

const SIDEBAR_TASK_STATUS_LABEL: Record<SidebarTaskStatus, string> = {
  todo: 'TODO',
  doing: 'DOING',
  ai_done: 'AI_DONE',
  done: 'DONE',
  none: 'N/A',
}

function resolveSidebarAgentStatus(runtimeStatus: TerminalNodeData['status']): SidebarAgentStatus {
  if (runtimeStatus === 'running' || runtimeStatus === 'restoring') {
    return 'working'
  }

  return 'standby'
}

function resolveSidebarTaskStatusTone(taskStatus: SidebarTaskStatus): SidebarStatusTone {
  switch (taskStatus) {
    case 'doing':
      return 'working'
    case 'ai_done':
      return 'done'
    case 'done':
      return 'done-strong'
    case 'todo':
    case 'none':
    default:
      return 'todo'
  }
}

export function Sidebar({
  workspaces,
  activeWorkspaceId,
  activeProviderLabel,
  activeProviderModel,
  persistNotice,
  onAddWorkspace,
  onSelectWorkspace,
  onOpenProjectContextMenu,
  onSelectAgentNode,
  onOpenSettings,
}: {
  workspaces: WorkspaceState[]
  activeWorkspaceId: string | null
  activeProviderLabel: string
  activeProviderModel: string
  persistNotice: PersistNotice | null
  onAddWorkspace: () => void
  onSelectWorkspace: (workspaceId: string) => void
  onOpenProjectContextMenu: (state: ProjectContextMenuState) => void
  onSelectAgentNode: (workspaceId: string, nodeId: string) => void
  onOpenSettings: () => void
}): React.JSX.Element {
  return (
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar__header">
        <div className="workspace-sidebar__header-main">
          <h1>Projects</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            onAddWorkspace()
          }}
        >
          Add
        </button>
      </div>

      <div className="workspace-sidebar__agent">
        <span className="workspace-sidebar__agent-label">Default Agent</span>
        <strong className="workspace-sidebar__agent-provider">{activeProviderLabel}</strong>
        <span className="workspace-sidebar__agent-model">{activeProviderModel}</span>
      </div>

      {persistNotice ? (
        <div
          className={`workspace-sidebar__persist-alert workspace-sidebar__persist-alert--${persistNotice.tone}`}
        >
          <strong>Persistence</strong>
          <span>{persistNotice.message}</span>
        </div>
      ) : null}

      <div className="workspace-sidebar__list">
        {workspaces.length === 0 ? (
          <p className="workspace-sidebar__empty">No project yet.</p>
        ) : null}

        {workspaces.map(workspace => {
          const isActive = workspace.id === activeWorkspaceId
          const workspaceAgents = workspace.nodes
            .filter(node => node.data.kind === 'agent')
            .sort((left, right) => {
              const leftTime = left.data.startedAt ? Date.parse(left.data.startedAt) : 0
              const rightTime = right.data.startedAt ? Date.parse(right.data.startedAt) : 0
              return rightTime - leftTime
            })
          const terminalCount = workspace.nodes.filter(node => node.data.kind === 'terminal').length
          const agentCount = workspace.nodes.filter(node => node.data.kind === 'agent').length
          const taskCount = workspace.nodes.filter(node => node.data.kind === 'task').length
          const metaText = `${terminalCount} terminals · ${agentCount} agents · ${taskCount} tasks`

          return (
            <div className="workspace-item-group" key={workspace.id}>
              <button
                type="button"
                className={`workspace-item ${isActive ? 'workspace-item--active' : ''}`}
                onClick={() => {
                  onSelectWorkspace(workspace.id)
                }}
                onContextMenu={event => {
                  event.preventDefault()
                  onOpenProjectContextMenu({
                    workspaceId: workspace.id,
                    x: event.clientX,
                    y: event.clientY,
                  })
                }}
                title={workspace.path}
              >
                <span className="workspace-item__name">{workspace.name}</span>
                <span className="workspace-item__path">{workspace.path}</span>
                <span className="workspace-item__meta">{metaText}</span>
              </button>

              {workspaceAgents.length > 0 ? (
                <div className="workspace-item__agents">
                  {workspaceAgents.map(node => {
                    const provider = node.data.agent?.provider
                    const providerText = provider ? AGENT_PROVIDER_LABEL[provider] : 'Agent'
                    const linkedTaskNode =
                      (node.data.agent?.taskId
                        ? (workspace.nodes.find(
                            candidate =>
                              candidate.id === node.data.agent?.taskId &&
                              candidate.data.kind === 'task' &&
                              candidate.data.task,
                          ) ?? null)
                        : null) ??
                      workspace.nodes.find(
                        candidate =>
                          candidate.data.kind === 'task' &&
                          candidate.data.task?.linkedAgentNodeId === node.id,
                      ) ??
                      null
                    const linkedTaskStatus =
                      linkedTaskNode && linkedTaskNode.data.kind === 'task'
                        ? (linkedTaskNode.data.task?.status ?? null)
                        : null
                    const sidebarAgentStatus = resolveSidebarAgentStatus(node.data.status)
                    const sidebarAgentStatusText = SIDEBAR_AGENT_STATUS_LABEL[sidebarAgentStatus]
                    const sidebarAgentStatusTone: SidebarStatusTone =
                      sidebarAgentStatus === 'working' ? 'working' : 'standby'
                    const sidebarTaskStatus: SidebarTaskStatus = linkedTaskStatus ?? 'none'
                    const sidebarTaskStatusText = SIDEBAR_TASK_STATUS_LABEL[sidebarTaskStatus]
                    const sidebarTaskStatusTone = resolveSidebarTaskStatusTone(sidebarTaskStatus)
                    const startedText = toRelativeTime(node.data.startedAt)
                    const fallbackTaskTitle =
                      node.data.agent?.prompt.trim().replace(/\s+/g, ' ') ?? ''
                    const taskTitle =
                      linkedTaskNode && linkedTaskNode.data.kind === 'task'
                        ? linkedTaskNode.data.title
                        : fallbackTaskTitle.length > 0
                          ? fallbackTaskTitle
                          : 'No linked task'

                    return (
                      <button
                        type="button"
                        key={`${workspace.id}:${node.id}`}
                        className="workspace-agent-item workspace-agent-item--nested"
                        data-testid={`workspace-agent-item-${workspace.id}-${node.id}`}
                        onClick={() => {
                          onSelectAgentNode(workspace.id, node.id)
                        }}
                      >
                        <span className="workspace-agent-item__headline">
                          <span className="workspace-agent-item__title">{node.data.title}</span>
                        </span>
                        <span className="workspace-agent-item__meta">
                          <span className="workspace-agent-item__meta-text">
                            {providerText} · {startedText}
                          </span>
                          <span
                            className={`workspace-agent-item__status workspace-agent-item__status--agent workspace-agent-item__status--${sidebarAgentStatusTone}`}
                          >
                            {sidebarAgentStatusText}
                          </span>
                        </span>
                        <span className="workspace-agent-item__task" title={taskTitle}>
                          <span className="workspace-agent-item__task-text">{taskTitle}</span>
                          <span
                            className={`workspace-agent-item__status workspace-agent-item__status--task workspace-agent-item__status--${sidebarTaskStatusTone}`}
                          >
                            {sidebarTaskStatusText}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="workspace-sidebar__footer">
        <button
          type="button"
          className="workspace-sidebar__settings"
          onClick={() => {
            onOpenSettings()
          }}
        >
          Settings
        </button>
      </div>
    </aside>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import { TerminalNode } from './TerminalNode'
import type { Point, Size, TerminalNodeData } from '../types'
import {
  clampSizeToNonOverlapping,
  findNearestFreePosition,
  isPositionAvailable,
} from '../utils/collision'

interface WorkspaceCanvasProps {
  workspacePath: string
  nodes: Node<TerminalNodeData>[]
  onNodesChange: (nodes: Node<TerminalNodeData>[]) => void
}

const DEFAULT_SIZE: Size = {
  width: 460,
  height: 300,
}

const MIN_SIZE: Size = {
  width: 320,
  height: 220,
}

function WorkspaceCanvasInner({
  workspacePath,
  nodes,
  onNodesChange,
}: WorkspaceCanvasProps): JSX.Element {
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    flowX: number
    flowY: number
  } | null>(null)

  const reactFlow = useReactFlow<TerminalNodeData>()

  const closeNodeRef = useRef<(nodeId: string) => Promise<void>>(async () => undefined)
  const resizeNodeRef = useRef<(nodeId: string, desiredSize: Size) => void>(() => undefined)

  const upsertNode = useCallback(
    (nextNode: Node<TerminalNodeData>) => {
      onNodesChange(nodes.map(node => (node.id === nextNode.id ? nextNode : node)))
    },
    [nodes, onNodesChange],
  )

  const closeNode = useCallback(
    async (nodeId: string) => {
      const target = nodes.find(node => node.id === nodeId)
      if (target) {
        await window.coveApi.pty.kill({ sessionId: target.data.sessionId })
      }

      const next = nodes.filter(node => node.id !== nodeId)
      onNodesChange(next)
    },
    [nodes, onNodesChange],
  )

  const normalizePosition = useCallback(
    (nodeId: string, desired: Point, size: Size): Point => {
      return findNearestFreePosition(desired, size, nodes, nodeId)
    },
    [nodes],
  )

  const resizeNode = useCallback(
    (nodeId: string, desiredSize: Size) => {
      const node = nodes.find(item => item.id === nodeId)
      if (!node) {
        return
      }

      const boundedSize = clampSizeToNonOverlapping(
        node.position,
        desiredSize,
        MIN_SIZE,
        nodes,
        nodeId,
      )

      upsertNode({
        ...node,
        data: {
          ...node.data,
          width: boundedSize.width,
          height: boundedSize.height,
        },
      })
    },
    [nodes, upsertNode],
  )

  useEffect(() => {
    closeNodeRef.current = closeNode
  }, [closeNode])

  useEffect(() => {
    resizeNodeRef.current = resizeNode
  }, [resizeNode])

  const nodeTypes = useMemo(
    () => ({
      terminalNode: ({ data, id }: { data: TerminalNodeData; id: string }) => (
        <TerminalNode
          sessionId={data.sessionId}
          title={data.title}
          width={data.width}
          height={data.height}
          onClose={() => {
            void closeNodeRef.current(id)
          }}
          onResize={size => resizeNodeRef.current(id, size)}
        />
      ),
    }),
    [],
  )

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      const flowPosition = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        flowX: flowPosition.x,
        flowY: flowPosition.y,
      })
    },
    [reactFlow],
  )

  const createTerminalNode = useCallback(async () => {
    if (!contextMenu) {
      return
    }

    const spawned = await window.coveApi.pty.spawn({
      cwd: workspacePath,
      cols: 80,
      rows: 24,
    })

    const newNodeId = crypto.randomUUID()
    const desiredPosition = {
      x: contextMenu.flowX,
      y: contextMenu.flowY,
    }

    const nonOverlappingPosition = findNearestFreePosition(desiredPosition, DEFAULT_SIZE, nodes)
    const canPlace = isPositionAvailable(nonOverlappingPosition, DEFAULT_SIZE, nodes)

    if (!canPlace) {
      await window.coveApi.pty.kill({ sessionId: spawned.sessionId })
      setContextMenu(null)
      window.alert('当前视图附近没有可用空位，请先移动或关闭部分终端窗口。')
      return
    }

    const nextNode: Node<TerminalNodeData> = {
      id: newNodeId,
      type: 'terminalNode',
      position: nonOverlappingPosition,
      data: {
        sessionId: spawned.sessionId,
        title: `terminal-${nodes.length + 1}`,
        width: DEFAULT_SIZE.width,
        height: DEFAULT_SIZE.height,
      },
      dragHandle: '[data-node-drag-handle="true"]',
    }

    const nextNodes = [...nodes, nextNode]
    onNodesChange(nextNodes)
    setContextMenu(null)
  }, [contextMenu, nodes, onNodesChange, workspacePath])

  const applyChanges = useCallback(
    (changes: NodeChange<TerminalNodeData>[]) => {
      if (!changes.length) {
        return
      }

      const nextNodes = nodes.map(node => {
        const positionChange = changes.find(
          change => change.type === 'position' && change.id === node.id,
        )
        if (!positionChange || !positionChange.position) {
          return node
        }

        if (!positionChange.dragging) {
          const resolved = normalizePosition(node.id, positionChange.position, {
            width: node.data.width,
            height: node.data.height,
          })

          return {
            ...node,
            position: resolved,
          }
        }

        return {
          ...node,
          position: positionChange.position,
        }
      })

      const removedNodes = nodes.filter(node =>
        changes.some(change => change.type === 'remove' && change.id === node.id),
      )

      if (removedNodes.length) {
        removedNodes.forEach(node => {
          void window.coveApi.pty.kill({ sessionId: node.data.sessionId })
        })
      }

      const removeIds = new Set(removedNodes.map(node => node.id))

      const finalNodes = nextNodes.filter(node => !removeIds.has(node.id))
      onNodesChange(finalNodes)
    },
    [nodes, normalizePosition, onNodesChange],
  )

  return (
    <div className="workspace-canvas" onClick={() => setContextMenu(null)}>
      <ReactFlow<TerminalNodeData>
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={applyChanges}
        onPaneContextMenu={handlePaneContextMenu}
        zoomOnScroll
        panOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} size={1} gap={24} color="#20324f" />
        <MiniMap
          pannable
          zoomable
          style={{
            background: 'rgba(7, 12, 24, 0.8)',
            border: '1px solid rgba(83, 124, 255, 0.35)',
          }}
        />
        <Controls />
      </ReactFlow>

      {contextMenu ? (
        <div className="workspace-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button
            type="button"
            onClick={() => {
              void createTerminalNode()
            }}
          >
            New Terminal
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function WorkspaceCanvas(props: WorkspaceCanvasProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <WorkspaceCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

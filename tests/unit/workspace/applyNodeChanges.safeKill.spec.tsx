import React, { useRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Node } from '@xyflow/react'
import type { TerminalNodeData } from '../../../src/renderer/src/features/workspace/types'

vi.mock('@xyflow/react', () => {
  return {
    applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  }
})

describe('useWorkspaceCanvasApplyNodeChanges', () => {
  it('does not leak kill rejection on remove', async () => {
    const kill = vi.fn(async () => {
      throw new Error('boom')
    })

    Object.defineProperty(window, 'coveApi', {
      configurable: true,
      writable: true,
      value: {
        pty: {
          kill,
        },
      },
    })

    const { useWorkspaceCanvasApplyNodeChanges } =
      await import('../../../src/renderer/src/features/workspace/components/workspaceCanvas/hooks/useApplyNodeChanges')

    const initialNodes: Node<TerminalNodeData>[] = [
      {
        id: 'node-1',
        type: 'terminalNode',
        position: { x: 0, y: 0 },
        data: {
          sessionId: 'session-1',
          title: 't',
          width: 520,
          height: 360,
          kind: 'terminal',
          status: null,
          startedAt: null,
          endedAt: null,
          exitCode: null,
          lastError: null,
          scrollback: null,
          agent: null,
          task: null,
          note: null,
        },
        draggable: true,
        selectable: true,
      },
    ]

    function Harness() {
      const [nodes, setNodes] = useState(initialNodes)
      const nodesRef = useRef(nodes)
      nodesRef.current = nodes

      const apply = useWorkspaceCanvasApplyNodeChanges({
        nodesRef,
        onNodesChange: next => {
          setNodes(next)
        },
        clearAgentLaunchToken: () => undefined,
        normalizePosition: (_nodeId, desired) => desired,
        applyPendingScrollbacks: next => next,
        isNodeDraggingRef: useRef(false),
      })

      return (
        <div>
          <div data-testid="count">{nodes.length}</div>
          <button type="button" onClick={() => apply([{ type: 'remove', id: 'node-1' } as never])}>
            Remove
          </button>
        </div>
      )
    }

    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(kill).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(screen.getByTestId('count')).toHaveTextContent('0')

    await Promise.resolve()
  })
})

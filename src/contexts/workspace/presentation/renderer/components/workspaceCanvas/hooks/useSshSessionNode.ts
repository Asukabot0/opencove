import { useEffect, useRef } from 'react'
import { useAppStore } from '@app/renderer/shell/store/useAppStore'
import type { Node } from '@xyflow/react'
import type { TerminalNodeData } from '../../../types'

type CreateNodeForSession = (input: {
  sessionId: string
  title: string
  anchor: { x: number; y: number }
  kind: 'terminal'
}) => Promise<Node<TerminalNodeData> | null>

/**
 * Watches for pending SSH sessions in the Zustand store and creates
 * terminal nodes on the canvas when one is detected.
 */
export function useSshSessionNode(createNodeForSession: CreateNodeForSession): void {
  const pendingSshSession = useAppStore(s => s.pendingSshSession)
  const setPendingSshSession = useAppStore(s => s.setPendingSshSession)
  const processingRef = useRef(false)

  useEffect(() => {
    if (!pendingSshSession || processingRef.current) {
      return
    }

    processingRef.current = true
    const { sessionId, targetName, anchor } = pendingSshSession

    void createNodeForSession({
      sessionId,
      title: targetName,
      anchor: anchor ?? { x: 100, y: 100 },
      kind: 'terminal',
    }).finally(() => {
      setPendingSshSession(null)
      processingRef.current = false
    })
  }, [pendingSshSession, setPendingSshSession, createNodeForSession])
}

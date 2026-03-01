import { useCallback } from 'react'
import type { Node } from '@xyflow/react'
import type { TerminalNodeData } from '../../../types'

type SetNodes = (
  updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
  options?: { syncLayout?: boolean },
) => void

export function useWorkspaceCanvasSelectNode({
  setNodes,
  setSelectedNodeIds,
}: {
  setNodes: SetNodes
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>
}): (nodeId: string) => void {
  return useCallback(
    (nodeId: string) => {
      setNodes(
        prevNodes => {
          const isAlreadySelected = prevNodes.some(node => node.id === nodeId && node.selected)
          if (isAlreadySelected) {
            return prevNodes
          }

          let hasChanged = false
          const nextNodes = prevNodes.map(node => {
            const shouldSelect = node.id === nodeId
            if (node.selected === shouldSelect) {
              return node
            }

            hasChanged = true
            return {
              ...node,
              selected: shouldSelect,
            }
          })

          return hasChanged ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )

      setSelectedNodeIds(previous => {
        if (previous.includes(nodeId)) {
          return previous
        }

        return [nodeId]
      })
    },
    [setNodes, setSelectedNodeIds],
  )
}

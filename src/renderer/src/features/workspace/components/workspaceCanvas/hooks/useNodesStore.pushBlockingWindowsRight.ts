import type { Node } from '@xyflow/react'
import type { Point, Size, TerminalNodeData } from '../../../types'
import { pushAwayLayout, type LayoutItem } from '../../../utils/spaceLayout'

const WINDOW_PLACEMENT_GAP_PX = 24

export function computePushBlockingWindowsRight({
  desired,
  size,
  nodes,
}: {
  desired: Point
  size: Size
  nodes: Node<TerminalNodeData>[]
}): Map<string, Point> {
  if (nodes.length === 0) {
    return new Map()
  }

  const placementId = '__placement__'

  const items: LayoutItem[] = [
    {
      id: placementId,
      kind: 'node',
      groupId: placementId,
      rect: {
        x: desired.x - WINDOW_PLACEMENT_GAP_PX,
        y: desired.y - WINDOW_PLACEMENT_GAP_PX,
        width: size.width + WINDOW_PLACEMENT_GAP_PX * 2,
        height: size.height + WINDOW_PLACEMENT_GAP_PX * 2,
      },
    },
    ...nodes.map(node => ({
      id: node.id,
      kind: 'node' as const,
      groupId: node.id,
      rect: {
        x: node.position.x - WINDOW_PLACEMENT_GAP_PX,
        y: node.position.y - WINDOW_PLACEMENT_GAP_PX,
        width: node.data.width + WINDOW_PLACEMENT_GAP_PX * 2,
        height: node.data.height + WINDOW_PLACEMENT_GAP_PX * 2,
      },
    })),
  ]

  const pushed = pushAwayLayout({
    items,
    pinnedGroupIds: [placementId],
    sourceGroupIds: [placementId],
    directions: ['x+'],
    gap: 0,
  })

  return new Map(
    pushed
      .filter(item => item.id !== placementId)
      .map(item => [
        item.id,
        {
          x: item.rect.x + WINDOW_PLACEMENT_GAP_PX,
          y: item.rect.y + WINDOW_PLACEMENT_GAP_PX,
        },
      ]),
  )
}

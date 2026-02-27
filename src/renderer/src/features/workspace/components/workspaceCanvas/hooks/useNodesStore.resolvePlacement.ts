import type { Node } from '@xyflow/react'
import type { Point, Size, TerminalNodeData } from '../../../types'
import { findNearestFreePosition, isPositionAvailable } from '../../../utils/collision'

export function resolveNodesPlacement({
  anchor,
  size,
  getNodes,
  pushBlockingWindowsRight,
}: {
  anchor: Point
  size: Size
  getNodes: () => Node<TerminalNodeData>[]
  pushBlockingWindowsRight: (desired: Point, size: Size) => void
}): { placement: Point; canPlace: boolean } {
  let currentNodes = getNodes()

  if (isPositionAvailable(anchor, size, currentNodes)) {
    return { placement: anchor, canPlace: true }
  }

  pushBlockingWindowsRight(anchor, size)
  currentNodes = getNodes()

  if (isPositionAvailable(anchor, size, currentNodes)) {
    return { placement: anchor, canPlace: true }
  }

  const fallback = findNearestFreePosition(anchor, size, currentNodes)
  return {
    placement: fallback,
    canPlace: isPositionAvailable(fallback, size, currentNodes),
  }
}

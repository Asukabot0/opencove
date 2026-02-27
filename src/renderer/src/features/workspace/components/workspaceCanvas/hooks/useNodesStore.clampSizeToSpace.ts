import type { Point, Size, WorkspaceSpaceState } from '../../../types'

export function clampSizeToContainingSpace({
  nodeId,
  position,
  size,
  minSize,
  spaces,
}: {
  nodeId: string
  position: Point
  size: Size
  minSize: Size
  spaces: WorkspaceSpaceState[]
}): Size {
  const containingSpace = spaces.find(space => space.nodeIds.includes(nodeId))
  if (!containingSpace?.rect) {
    return size
  }

  const maxWidth = containingSpace.rect.x + containingSpace.rect.width - position.x
  const maxHeight = containingSpace.rect.y + containingSpace.rect.height - position.y

  return {
    width: Math.max(minSize.width, Math.min(size.width, maxWidth)),
    height: Math.max(minSize.height, Math.min(size.height, maxHeight)),
  }
}

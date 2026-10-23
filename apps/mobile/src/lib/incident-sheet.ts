export const COLLAPSED_INCIDENT_SHEET_HEIGHT = 94;

export function clampIncidentSheetHeight(
  startHeight: number,
  dragDistanceY: number,
  collapsedHeight: number,
  expandedHeight: number,
) {
  return Math.max(collapsedHeight, Math.min(expandedHeight, startHeight - dragDistanceY));
}

export function shouldCollapseIncidentSheet(
  currentHeight: number,
  expandedHeight: number,
  collapsed: boolean,
  dragDistanceY: number,
  velocityY: number,
) {
  if (collapsed) {
    return !(currentHeight > (expandedHeight + COLLAPSED_INCIDENT_SHEET_HEIGHT) / 2 || dragDistanceY < -40 || velocityY < -0.65);
  }

  return (
    currentHeight < (expandedHeight + COLLAPSED_INCIDENT_SHEET_HEIGHT) / 2 ||
    dragDistanceY > 40 ||
    velocityY > 0.65
  );
}

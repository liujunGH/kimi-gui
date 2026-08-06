export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}

/** Keep a fixed-position menu inside the viewport with a small breathing room. */
export function clampContextMenuPosition(
  requested: ContextMenuPosition,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
): ContextMenuPosition {
  return {
    x: Math.max(margin, Math.min(requested.x, viewport.width - menu.width - margin)),
    y: Math.max(margin, Math.min(requested.y, viewport.height - menu.height - margin)),
  };
}

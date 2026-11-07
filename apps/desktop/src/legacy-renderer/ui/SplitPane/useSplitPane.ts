import { useState, useRef, useCallback } from 'react';

/**
 * Draggable split-pane hook.
 *
 * Usage:
 * ```tsx
 * const { splitPercent, containerRef, handleMouseDown } = useSplitPane(50);
 * return (
 *   <div ref={containerRef} style={{ display: 'flex' }}>
 *     <div style={{ width: `${splitPercent}%` }}>Left</div>
 *     <div onMouseDown={handleMouseDown} />
 *     <div style={{ width: `${100 - splitPercent}%` }}>Right</div>
 *   </div>
 * );
 * ```
 */
export function useSplitPane(initial = 50, min = 20, max = 80) {
  const [splitPercent, setSplitPercent] = useState(initial);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(max, Math.max(min, percent)));
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [min, max]);

  return { splitPercent, containerRef, handleMouseDown };
}

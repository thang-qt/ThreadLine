import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

export function useSplitPane(initial = 60, min = 20, max = 80) {
  const [splitWidth, setSplitWidth] = useState(initial);
  const resizing = useRef(false);
  const readerRoot = useRef<HTMLElement | null>(null);

  const cleanupResizeState = () => {
    if (!resizing.current) return;
    resizing.current = false;
    document.body.style.cursor = '';
    document.body.classList.remove('resizing');
    readerRoot.current?.querySelectorAll('iframe').forEach(iframe => { iframe.style.pointerEvents = ''; });
  };

  const startResizing = (event: ReactMouseEvent, root?: HTMLElement | null) => {
    event.preventDefault();
    resizing.current = true;
    readerRoot.current = root ?? null;
    document.body.style.cursor = 'col-resize';
    document.body.classList.add('resizing');
    readerRoot.current?.querySelectorAll('iframe').forEach(iframe => { iframe.style.pointerEvents = 'none'; });
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!resizing.current) return;
      const percentage = (event.clientX / window.innerWidth) * 100;
      setSplitWidth(Math.max(min, Math.min(max, percentage)));
    };
    const handleMouseUp = () => cleanupResizeState();
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      cleanupResizeState();
    };
  }, [min, max]);

  const nudgeSplit = (delta: number) => setSplitWidth(value => Math.max(min, Math.min(max, value + delta)));

  return { splitWidth, startResizing, nudgeSplit };
}

import { useRef, type ReactNode } from 'react';
import { useSplitPane } from '../../hooks/useSplitPane';

interface SplitReaderProps {
  articleUrl: string;
  title: string;
  children: ReactNode;
}

export function SplitReader({ articleUrl, title, children }: SplitReaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { splitWidth, startResizing, nudgeSplit } = useSplitPane(60);
  return <div className="reading-layout" ref={rootRef}>
    <section className="article-pane" aria-label="Original article" style={{ width: `${splitWidth}%` }}>
      <div className="iframe-note"><span>Some publishers block embedded viewing.</span><a href={articleUrl} target="_blank" rel="noreferrer" className="open-tab-link"><span>Open in a new tab</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="external-icon" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a></div>
      <iframe src={articleUrl} title={title} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
    </section>
    <div className="resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize article and discussion panes" aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(splitWidth)} tabIndex={0} onMouseDown={event => startResizing(event, rootRef.current)} onKeyDown={event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); nudgeSplit(-5); }
      if (event.key === 'ArrowRight') { event.preventDefault(); nudgeSplit(5); }
    }} />
    {children}
  </div>;
}

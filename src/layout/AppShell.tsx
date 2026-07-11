import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ReaderSettings } from '../types';
import { fontFamily } from '../lib/format';

export function AppShell({ settings, children }: { settings: ReaderSettings; children: ReactNode }) {
  const style = { '--reader-font': fontFamily(settings.font), '--type-scale': settings.typeScale, '--column-count': settings.columns } as React.CSSProperties;

  useEffect(() => {
    const root = document.documentElement;
    root.className = `theme-${settings.theme} density-${settings.density} ${settings.highlightThreads ? 'thread-highlight-enabled' : 'thread-highlight-disabled'}`;
    root.style.setProperty('--reader-font', fontFamily(settings.font));
    root.style.setProperty('--type-scale', settings.typeScale.toString());
    root.style.setProperty('--column-count', settings.columns.toString());
  }, [settings.theme, settings.density, settings.font, settings.typeScale, settings.columns, settings.highlightThreads]);

  return <div className={`app theme-${settings.theme} density-${settings.density}`} style={style}>
    <header className="masthead">
      <Link className="wordmark" to="/">Threadline</Link>
      <nav aria-label="Main navigation"><Link to="/">Latest</Link><Link to="/settings">Options</Link></nav>
    </header>
    {children}
  </div>;
}

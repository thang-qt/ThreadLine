import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { useSettings } from './hooks/useSettings';
import './styles.css';

const FeedPage = lazy(() => import('./pages/FeedPage').then(module => ({ default: module.FeedPage })));
const DiscussionPage = lazy(() => import('./pages/DiscussionPage').then(module => ({ default: module.DiscussionPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(module => ({ default: module.SettingsPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(module => ({ default: module.NotFoundPage })));


function App() {
  const { settings, setSettings, reset } = useSettings();
  return <AppShell settings={settings}>
    <Suspense fallback={<main className="front-page"><p className="loader">Loading…</p></main>}>
      <Routes>
        <Route path="/" element={<FeedPage settings={settings} onChange={setSettings}/>} />
        <Route path="/story/:source/:id" element={<DiscussionPage settings={settings} onChange={setSettings}/>} />
        <Route path="/settings" element={<SettingsPage settings={settings} onChange={setSettings} onReset={reset}/>} />
        <Route path="*" element={<NotFoundPage/>} />
      </Routes>
    </Suspense>
  </AppShell>;
}
export default App;

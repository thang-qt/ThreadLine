import { Route, Routes } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { FeedPage } from './pages/FeedPage';
import { DiscussionPage } from './pages/DiscussionPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { useSettings } from './hooks/useSettings';
import './styles.css';

function App() {
  const { settings, setSettings, reset } = useSettings();
  return <AppShell settings={settings}>
    <Routes>
      <Route path="/" element={<FeedPage settings={settings} onChange={setSettings}/>} />
      <Route path="/story/:source/:id" element={<DiscussionPage settings={settings} onChange={setSettings}/>} />
      <Route path="/settings" element={<SettingsPage settings={settings} onChange={setSettings} onReset={reset}/>} />
      <Route path="*" element={<NotFoundPage/>} />
    </Routes>
  </AppShell>;
}
export default App;

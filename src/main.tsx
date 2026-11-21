import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './styles/index.css';
import { apiMode, createApi } from './api/client';
import { App } from './app/App';
import { initTheme } from './lib/theme';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
initTheme();

createRoot(root).render(
  <StrictMode>
    <App api={createApi()} />
  </StrictMode>,
);

// Offline phrasebook (production, real backend only; dev servers and the demo build skip it).
if (import.meta.env.PROD && apiMode === 'http' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

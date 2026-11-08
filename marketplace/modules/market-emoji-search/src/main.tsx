import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function applyTheme(v: unknown) {
  if (v === 'dark' || v === 'light') document.documentElement.dataset.theme = v;
}

function applyLocale(v: unknown) {
  if (v === 'en' || v === 'zh-CN') {
    document.documentElement.dataset.locale = v;
    document.documentElement.lang = v === 'zh-CN' ? 'zh-CN' : 'en';
  }
}

applyTheme(new URLSearchParams(window.location.search).get('theme'));
applyLocale(new URLSearchParams(window.location.search).get('locale'));
window.addEventListener('message', (e) => {
  if (!isRecord(e.data)) return;
  if (e.data.type === 'devdeck:theme') applyTheme(e.data.theme);
  if (e.data.type === 'devdeck:locale') applyLocale(e.data.locale);
});

createRoot(document.getElementById('root')!).render(<App />);

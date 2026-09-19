import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Registered only in production builds; the dev server has no service worker file.
if ('serviceWorker' in navigator && import.meta.env.PROD)
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js').catch(() => undefined);
  });

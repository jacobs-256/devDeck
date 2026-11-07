import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme/variables.css';
import './theme/global.css';
import './legacy-renderer/compat/electron';
import './theme/toolkit.css';
import './styles/tool-compat.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('missing #root');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

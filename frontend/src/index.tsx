import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/sora';
import App from './App';
import './index.css';
import { installPreloadRecovery } from './utils/preloadRecovery';

installPreloadRecovery();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

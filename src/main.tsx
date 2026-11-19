import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@xyflow/react/dist/style.css';
import App from './App.tsx';
import './index.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);

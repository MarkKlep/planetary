import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HeatmapPage } from './HeatmapPage';
import './styles.scss';

const rootElement = document.getElementById('heatmap-root');
if (!rootElement) throw new Error('Failed to find the heatmap root element');

createRoot(rootElement).render(
  <StrictMode>
    <HeatmapPage />
  </StrictMode>
);

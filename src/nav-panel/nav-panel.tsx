import { useState } from 'react';
import './nav-panel.scss';

export function NavPanel() {
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [rotationEnabled, setRotationEnabled] = useState(true);

  const handleObjectClick = (target: string) => {
    setActiveTarget(target);
    // Navigation logic will be handled by the existing script.ts event listeners
  };

  const handleResetCamera = () => {
    setActiveTarget(null);
    // Reset logic will be handled by the existing script.ts event listeners
  };

  const handleToggleRotation = () => {
    setRotationEnabled(!rotationEnabled);
    // Toggle logic will be handled by the existing script.ts event listeners
  };

  return (
    <nav className="navigation-panel">
        <h1 className="nav-title">Planetary</h1>
        <div className="nav-section">
            <h2 className="nav-section-title">Objects</h2>
            <button 
              className={`nav-btn ${activeTarget === 'earth' ? 'active' : ''}`}
              data-target="earth"
              onClick={() => handleObjectClick('earth')}
            >
              Earth
            </button>
            <button 
              className={`nav-btn ${activeTarget === 'moon' ? 'active' : ''}`}
              data-target="moon"
              onClick={() => handleObjectClick('moon')}
            >
              Moon
            </button>
            <button 
              className={`nav-btn ${activeTarget === 'iss' ? 'active' : ''}`}
              data-target="iss"
              onClick={() => handleObjectClick('iss')}
            >
              ISS
            </button>
        </div>
        <div className="nav-section">
            <h2 className="nav-section-title">Controls</h2>
            <button 
              className="nav-btn" 
              id="reset-camera"
              onClick={handleResetCamera}
            >
              Reset Camera
            </button>
            <button 
              className="nav-btn" 
              id="toggle-rotation"
              onClick={handleToggleRotation}
            >
              {rotationEnabled ? 'Pause Rotation' : 'Resume Rotation'}
            </button>
        </div>
        <div className="nav-section">
            <h2 className="nav-section-title">Surface data</h2>
            <a
              className="nav-btn"
              href="/heatmap.html"
            >
              Heat map
            </a>
        </div>
    </nav>
  );
}

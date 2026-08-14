import { useEffect } from 'react';
import { NavPanel } from './nav-panel/nav-panel';
import { FlightHud } from './flight-hud/flight-hud';
import { initScene } from './script';
import { Analytics } from "@vercel/analytics/react";

const SPLASH_FADE_MS = 400;

export function App() {
  useEffect(() => {
    // Deferred one task so the browser can paint this commit before initScene
    // takes the thread for ~1s building geometry and compiling shaders. The
    // splash covering that freeze is static markup in index.html, not a React
    // component — see the comment there for why it cannot be one.
    const timer = window.setTimeout(() => {
      initScene();

      const splash = document.getElementById('splash');
      if (splash) {
        splash.classList.add('splash--done');
        window.setTimeout(() => splash.remove(), SPLASH_FADE_MS);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <div id="app"></div>
      <NavPanel />
      <FlightHud />
      <Analytics />
    </>
  );
}

import { useEffect } from 'react';
import { NavPanel } from './nav-panel/nav-panel';
import { FlightHud } from './flight-hud/flight-hud';
import { SurfaceHud } from './surface-hud/surface-hud';
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
      // Dismissed from `onFirstFrame`, not from `initScene()` returning — that
      // return happens the instant the synchronous setup finishes, before the
      // renderer has drawn a single frame. It used to be close enough that the
      // splash's own fade covered the gap; it stopped being close enough once the
      // scene picked up more `ShaderMaterial`s (the rings among them), whose
      // compilation is paid on the real first `render()` call, not before. See
      // the comment on `initScene` in script.ts.
      initScene(() => {
        const splash = document.getElementById('splash');
        if (splash) {
          splash.classList.add('splash--done');
          window.setTimeout(() => splash.remove(), SPLASH_FADE_MS);
        }
      });
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <div id="app"></div>
      <NavPanel />
      <FlightHud />
      <SurfaceHud />
      <Analytics />
    </>
  );
}

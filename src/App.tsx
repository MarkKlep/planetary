import { useEffect, useState } from 'react';
import { NavPanel } from './nav-panel/nav-panel';
import { FlightHud } from './flight-hud/flight-hud';
import { SurfaceHud } from './surface-hud/surface-hud';
import { RoverHint } from './rover-hint/rover-hint';
import { IssHud } from './iss-hud/iss-hud';
import { BetelgeuseHud } from './betelgeuse-hud/betelgeuse-hud';
import { ChatWidget } from './chat-widget/chat-widget';
import { MoonHint } from './moon-hint/moon-hint';
import { Modal } from './shared/modal/modal';
import { initScene } from './script';
import { Analytics } from "@vercel/analytics/react";

const SPLASH_FADE_MS = 400;

export function App() {
  // Gates the landing hint, which must not be on screen while the splash still is:
  // it announces something to go and click, and the panel it points at is behind a
  // full-screen cover until this flips. Same signal the splash's own fade uses, for
  // the same reason — see the comment on `onFirstFrame` below.
  const [sceneReady, setSceneReady] = useState(false);

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
        setSceneReady(true);
      });
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <div id="app"></div>
      <div className="viewport-zoom" aria-label="Camera zoom controls">
        <button type="button" className="viewport-zoom__button" id="zoom-out" aria-label="Zoom out">−</button>
        <button type="button" className="viewport-zoom__button" id="zoom-in" aria-label="Zoom in">+</button>
      </div>
      <NavPanel />
      <FlightHud />
      <SurfaceHud />
      {/* The centre-screen half of the same read-out: the HUD above names `R` in a
          corner legend, this says it where the eye actually is. Always mounted and
          driven by classes from `script.ts`, which owns the mode, the rover's distance
          and whether anyone is already driving. See rover-hint.tsx. */}
      <RoverHint />
      {/* Shares the bottom-right corner with the two HUDs above, which is safe because
          all three are mutually exclusive: entering free flight or landing on the Moon
          both give up the camera's focus target, and this panel is shown only while
          that target is the station. */}
      <IssHud />
      {/* The fourth panel in that same corner, and exclusive with the other three for
          the same structural reason plus one of its own: flying to any other body
          stands the approach down. See betelgeuse-hud.tsx — the row that earns it is
          the one saying the range is modelled. */}
      <BetelgeuseHud />
      <ChatWidget />
      {/* Mounted only once the scene has actually drawn, and it decides for itself
          whether it has anything to say — a visitor who has already been told renders
          nothing at all. See moon-hint.tsx. */}
      {sceneReady && <MoonHint />}
      {/* Mounted once and driven from `script.ts` through `bindModal`, which looks it
          up by this id. Standing on the Moon is the one mode that is easy to leave by
          accident — Escape, L, and every nav target all lift off — and impossible to
          undo, since re-entering rebuilds the terrain at the landing site rather than
          where you had walked to. So each of those paths asks first. */}
      <Modal
        id="leave-surface-modal"
        title="Leave the surface"
        message="You are standing on the Moon. Lifting off ends the walk — coming back sets you down at the landing site again, not where you are now."
        confirmLabel="Lift off"
        cancelLabel="Stay"
      />
      <Analytics />
    </>
  );
}

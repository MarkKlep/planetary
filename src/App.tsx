import { useEffect } from 'react';
import { NavPanel } from './nav-panel/nav-panel';
import { initScene } from './script';

export function App() {
  useEffect(() => {
    const timer = setTimeout(() => {
      initScene();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <div id="app"></div>
      <NavPanel />
    </>
  );
}

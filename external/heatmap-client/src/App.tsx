import React, { useEffect, useMemo, useRef, useState } from "react";
import { API_URL } from "./api/api-client";
import "./App.css";

type Point = { x: number; y: number };

type Palette = "viridis" | "turbo" | "spectral";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function App() {
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [palette, setPalette] = useState<Palette>("viridis");

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const dragState = useRef<{
    isDragging: boolean;
    startPan: Point;
    startMouse: Point;
  } | null>(null);

  const zoomIn = () =>
    setScale((s) => clamp(Number((s * 1.2).toFixed(4)), 1, 8));
  const zoomOut = () =>
    setScale((s) => clamp(Number((s / 1.2).toFixed(4)), 1, 8));
  const resetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const hintText = useMemo(
    () => "Wheel: zoom • Drag: pan • Double-click: reset",
    [],
  );

  const buildApiUrl = (options?: { refresh?: boolean }) => {
    const url = new URL(API_URL);
    url.searchParams.set("palette", palette);
    if (options?.refresh) url.searchParams.set("refresh", "1");
    return url.toString();
  };

  const fetchData = async (options?: { refresh?: boolean }) => {
    try {
      setLoading(true);
      setErrorMessage("");

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20000);

      const response = await fetch(buildApiUrl(options), {
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.blob();

      const url = URL.createObjectURL(data);

      setImageUrl(url);
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unknown error while loading heatmap",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!imageUrl) return;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  useEffect(() => {
    fetchData();
  }, [palette]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      // Prevent the page/iframe from scrolling while zooming.
      event.preventDefault();

      const rect = viewport.getBoundingClientRect();
      const vx = event.clientX - rect.left;
      const vy = event.clientY - rect.top;

      const direction = event.deltaY < 0 ? 1 : -1;
      const zoomFactor = direction > 0 ? 1.15 : 1 / 1.15;

      setScale((prevScale) => {
        const nextScale = clamp(prevScale * zoomFactor, 1, 8);
        if (nextScale === prevScale) return prevScale;

        // Keep the point under the cursor stable while zooming.
        setPan((prevPan) => {
          const worldX = (vx - prevPan.x) / prevScale;
          const worldY = (vy - prevPan.y) / prevScale;
          const nextPanX = vx - worldX * nextScale;
          const nextPanY = vy - worldY * nextScale;
          return { x: nextPanX, y: nextPanY };
        });

        return nextScale;
      });
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  if (loading) return <h1 className='App'>Loading...</h1>;

  if (errorMessage) {
    return (
      <div className='App'>
        <h2>Failed to load heatmap</h2>
        <p>{errorMessage}</p>
        <p>
          Check that the API is running at <code>{API_URL}</code>.
        </p>
      </div>
    );
  }

  return (
    <div className='App'>
      <div className='heatmap-toolbar' aria-label='Heatmap controls'>
        <div className='heatmap-toolbar__left'>{hintText}</div>
        <div className='heatmap-toolbar__right'>
          <label className='heatmap-field' title='Color palette'>
            <span className='heatmap-field__label'>Palette</span>
            <select
              className='heatmap-select'
              value={palette}
              onChange={(e) => setPalette(e.target.value as Palette)}
            >
              <option value='viridis'>Viridis</option>
              <option value='turbo'>Turbo</option>
              <option value='spectral'>Spectral</option>
            </select>
          </label>

          <button
            type='button'
            className='heatmap-btn'
            onClick={() => fetchData({ refresh: true })}
          >
            Refresh
          </button>
          <button type='button' className='heatmap-btn' onClick={zoomOut}>
            −
          </button>
          <button type='button' className='heatmap-btn' onClick={zoomIn}>
            +
          </button>
          <button type='button' className='heatmap-btn' onClick={resetView}>
            Reset
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`heatmap-viewport ${scale > 1 ? "heatmap-viewport--zoomed" : ""}`}
        onDoubleClick={resetView}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          dragState.current = {
            isDragging: true,
            startPan: pan,
            startMouse: { x: e.clientX, y: e.clientY },
          };
        }}
        onMouseMove={(e) => {
          const state = dragState.current;
          if (!state?.isDragging) return;
          const dx = e.clientX - state.startMouse.x;
          const dy = e.clientY - state.startMouse.y;
          setPan({ x: state.startPan.x + dx, y: state.startPan.y + dy });
        }}
        onMouseUp={() => {
          if (dragState.current) dragState.current.isDragging = false;
        }}
        onMouseLeave={() => {
          if (dragState.current) dragState.current.isDragging = false;
        }}
      >
        <img
          src={imageUrl}
          alt='earth-map'
          className='heatmap-image'
          draggable={false}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        />
      </div>
    </div>
  );
}

export default App;


import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as LibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createMapStyle, crossesDateline, updateMapStyle } from '../lib/map-style';
import { browserTextSize, getPosterLayout, measurePosterText } from '../lib/poster-layout';
import type { MapView, PosterPreviewProps } from '../lib/types';

setWorkerUrl(workerUrl);

export default function PosterPreview({ track, settings, fitRequest, onViewChange, onStatusChange }: PosterPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const settingsRef = useRef(settings);
  const callbacksRef = useRef({ onViewChange, onStatusChange });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const scaleRef = useRef(1);
  const measureRef = useRef<CanvasRenderingContext2D | null>(null);
  const layout = useMemo(() => getPosterLayout(settings, measurePosterText(fontsReady ? measureRef.current : null)), [settings, fontsReady]);
  const layoutRef = useRef(layout);
  const layoutKey = `${layout.width}:${layout.height}:${layout.map.x}:${layout.map.y}:${layout.map.width}:${layout.map.height}`;
  const layoutKeyRef = useRef(layoutKey);

  settingsRef.current = settings;
  callbacksRef.current = { onViewChange, onStatusChange };
  layoutRef.current = layout;

  useEffect(() => {
    let cancelled = false;
    measureRef.current = document.createElement('canvas').getContext('2d');
    void Promise.all([document.fonts.load('400 20px Outfit'), document.fonts.load('600 20px Outfit')]).then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => { cancelled = true; measureRef.current = null; };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: LibreMap | undefined;
    let failed = false;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    const report = (next: 'loading' | 'ready' | 'error') => {
      if (disposed) return;
      setStatus(next);
      callbacksRef.current.onStatusChange?.(next);
    };
    const fail = (message: string) => {
      failed = true;
      if (timeout) clearTimeout(timeout);
      if (!disposed) {
        setErrorMessage(message);
        report('error');
      }
    };
    const startTimeout = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => fail('The map is taking too long to load. Check your connection and try again.'), 25000);
    };
    report('loading');
    setErrorMessage('');
    startTimeout();
    scaleRef.current = Math.max(container.clientWidth / layoutRef.current.map.width, 0.1);

    const publishView = () => {
      if (!map || disposed) return;
      const center = map.getCenter();
      const view: MapView = {
        center: [center.lng, center.lat],
        zoom: map.getZoom() - Math.log2(scaleRef.current),
        bearing: map.getBearing(),
      };
      callbacksRef.current.onViewChange(view);
    };
    try {
      map = new LibreMap({
        container,
        style: createMapStyle(track, settingsRef.current, scaleRef.current),
        bounds: track.bounds,
        fitBoundsOptions: { padding: 48 * scaleRef.current, maxZoom: 19 + Math.log2(scaleRef.current) },
        maxZoom: 22 + Math.log2(scaleRef.current),
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: crossesDateline(track),
        fadeDuration: 0,
        canvasContextAttributes: { antialias: true },
      });
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.on('error', () => fail('The map could not load completely. Check your connection and try again.'));
      map.on('dataloading', () => {
        if (!failed) { report('loading'); startTimeout(); }
      });
      map.on('load', () => {
        if (!map || disposed) return;
        updateMapStyle(map, settingsRef.current, scaleRef.current);
        publishView();
      });
      map.on('movestart', () => { if (!failed) report('loading'); });
      map.on('moveend', publishView);
      map.on('idle', () => {
        if (timeout) clearTimeout(timeout);
        if (!failed && map?.loaded() && map.areTilesLoaded()) {
          publishView();
          report('ready');
        }
      });
    } catch {
      fail('Your browser could not start the map. Enable WebGL or try another browser.');
    }

    const observer = new ResizeObserver(() => {
      if (!map || disposed) return;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!map || disposed || !container.clientWidth) return;
        const normalizedZoom = map.getZoom() - Math.log2(scaleRef.current);
        scaleRef.current = container.clientWidth / layoutRef.current.map.width;
        map.setMaxZoom(22 + Math.log2(scaleRef.current));
        map.resize();
        map.jumpTo({ zoom: normalizedZoom + Math.log2(scaleRef.current) });
        updateMapStyle(map, settingsRef.current, scaleRef.current);
        publishView();
      });
    });
    observer.observe(container);
    return () => {
      disposed = true;
      if (timeout) clearTimeout(timeout);
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      if (mapRef.current === map) mapRef.current = null;
      map?.remove();
    };
  }, [track, reload]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) updateMapStyle(map, settings, scaleRef.current);
  }, [settings.colors.background, settings.colors.land, settings.colors.water, settings.colors.roads, settings.colors.text, settings.colors.route, settings.routeWidth, settings.showMarkers, settings.showMapLabels]);

  useEffect(() => {
    const map = mapRef.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (map) map.fitBounds(track.bounds, { padding: 48 * scaleRef.current, maxZoom: 19 + Math.log2(scaleRef.current), duration: reducedMotion ? 0 : 500 });
  }, [fitRequest, track]);

  useEffect(() => {
    if (layoutKeyRef.current === layoutKey) return;
    layoutKeyRef.current = layoutKey;
    // A new print layout can have a much shorter map. Refit after its DOM
    // dimensions have changed so the route stays inside the chosen print.
    const frame = requestAnimationFrame(() => {
      const map = mapRef.current;
      const container = containerRef.current;
      if (!map || !container?.clientWidth) return;
      scaleRef.current = container.clientWidth / layoutRef.current.map.width;
      map.setMaxZoom(22 + Math.log2(scaleRef.current));
      map.resize();
      updateMapStyle(map, settingsRef.current, scaleRef.current);
      map.fitBounds(track.bounds, { padding: 48 * scaleRef.current, maxZoom: 19 + Math.log2(scaleRef.current), duration: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [layoutKey, track]);

  const rectStyle = {
    left: `${layout.map.x / layout.width * 100}%`,
    top: `${layout.map.y / layout.height * 100}%`,
    width: `${layout.map.width / layout.width * 100}%`,
    height: `${layout.map.height / layout.height * 100}%`,
    background: settings.colors.land,
  };

  return (
    <div
      className="poster-preview relative w-full overflow-hidden shadow-[0_18px_55px_rgba(35,57,61,0.14)]"
      style={{ aspectRatio: `${layout.width} / ${layout.height}`, background: settings.colors.background, containerType: 'inline-size' }}
      data-map-status={status}
      aria-label={`Live poster preview: ${settings.title || 'Your route'}`}
    >
      <div ref={containerRef} className="absolute overflow-hidden" style={rectStyle} aria-label="Route map. Drag to move and scroll to zoom." />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        aria-hidden="true"
      >
        {layout.frame && <rect {...layout.frame} fill="none" stroke={settings.colors.text} strokeOpacity="0.22" strokeWidth="1.1" />}
        {layout.rules?.map((rule, index) => <line key={`rule-${index}`} x1={rule.x1} y1={rule.y1} x2={rule.x2} y2={rule.y2} stroke={settings.colors.text} strokeOpacity={rule.opacity ?? 0.18} strokeWidth="1" />)}
        {layout.texts.map((text, index) => (
          <text
            key={index}
            x={text.x}
            y={text.y}
            textAnchor={text.align === 'left' ? 'start' : 'middle'}
            fill={settings.colors.text}
            opacity={text.opacity}
            fontFamily="Outfit, sans-serif"
            fontWeight={text.weight}
            fontSize={browserTextSize(text, fontsReady ? measureRef.current : null)}
          >{text.text}</text>
        ))}
      </svg>
      {status === 'loading' && <div className="pointer-events-none absolute left-1/2 top-[12%] -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-xs font-medium text-slate-600 shadow-sm" role="status">Loading map…</div>}
      {status === 'error' && (
        <div className="absolute inset-x-[10%] top-[22%] rounded-xl bg-white/95 p-5 text-center text-sm text-slate-600 shadow-lg" role="alert">
          <p>{errorMessage}</p>
          <button type="button" onClick={() => setReload((current) => current + 1)} className="mt-3 rounded-lg bg-ink px-4 py-2 font-medium text-white hover:bg-[#34554b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Retry map</button>
        </div>
      )}
    </div>
  );
}

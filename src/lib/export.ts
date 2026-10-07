import { Map as LibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { createMapStyle, crossesDateline } from './map-style';
import { browserTextSize, fittedTextSize, getPosterLayout, measurePosterText, type PosterLayout } from './poster-layout';
import { exportPixelDimensions, paperDimensions } from './presets';
import { withPngDpi } from './png';
import type { GpxTrack, MapView, PosterSettings } from './types';

setWorkerUrl(workerUrl);

interface ExportOptions {
  track: GpxTrack;
  settings: PosterSettings;
  view?: MapView;
  format: 'png' | 'pdf';
  dpi: 150 | 300;
  onProgress?: (message: string) => void;
}

function resolutionError(detail: string, dpi: number, share = false) {
  return new Error(`${detail} ${share ? 'Try another browser or export on a desktop.' : dpi === 300 ? 'Choose 150 DPI or a smaller paper size, or export on a desktop browser.' : 'Choose a smaller paper size or export on a desktop browser.'}`);
}

function graphicsLimit() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('Your browser cannot render this map. Enable WebGL or try another browser.');
  const texture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const renderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const limit = Math.min(texture, renderbuffer, viewport[0], viewport[1]);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  canvas.width = 1;
  canvas.height = 1;
  return limit;
}

function completeMap(map: LibreMap): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      map.off('idle', ready);
      map.off('error', failed);
    };
    const ready = () => {
      if (map.loaded() && map.areTilesLoaded()) { cleanup(); resolve(); }
    };
    const failed = () => {
      cleanup();
      reject(new Error('The map could not load completely. Check your connection and try exporting again.'));
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Loading the map timed out. Check your connection and try exporting again.'));
    }, 45000);
    map.on('error', failed);
    map.on('idle', ready);
    ready();
  });
}

function hexRgb(color: string) {
  return rgb(parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255, parseInt(color.slice(5, 7), 16) / 255);
}

function canvasBlob(canvas: HTMLCanvasElement, share = false): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(share ? 'Your browser could not create this image. Try another browser.' : 'Your browser could not create this large image. Try 150 DPI or a smaller paper size.')), 'image/png');
  });
}

async function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  try {
    link.click();
    // Give browsers time to start reading the Blob before releasing its URL.
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

async function fetchFonts() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await Promise.all(['Outfit-Regular.ttf', 'Outfit-SemiBold.ttf'].map(async (name) => {
      const response = await fetch(`${import.meta.env.BASE_URL}fonts/${name}`, { signal: controller.signal });
      if (!response.ok) throw new Error('The print fonts could not load. Refresh the page and try again.');
      return response.arrayBuffer();
    }));
  } finally { clearTimeout(timer); }
}

async function createPdf(mapCanvas: HTMLCanvasElement, layout: PosterLayout, settings: PosterSettings, dpi: number) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await fetchFonts();
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const regularCharacters = new Set(regular.getCharacterSet());
  const boldCharacters = new Set(bold.getCharacterSet());
  const measureCanvas = document.createElement('canvas');
  const measureContext = measureCanvas.getContext('2d');
  await Promise.all([document.fonts.load('400 20px Outfit'), document.fonts.load('600 20px Outfit')]);
  const dimensions = paperDimensions(settings);
  const pageWidth = dimensions.widthMm / 25.4 * 72;
  const pageHeight = dimensions.heightMm / 25.4 * 72;
  const unit = pageWidth / layout.width;
  const page = doc.addPage([pageWidth, pageHeight]);
  page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: hexRgb(settings.colors.background) });
  const mapBlob = await canvasBlob(mapCanvas);
  const image = await doc.embedPng(await mapBlob.arrayBuffer());
  page.drawImage(image, {
    x: layout.map.x * unit,
    y: pageHeight - (layout.map.y + layout.map.height) * unit,
    width: layout.map.width * unit,
    height: layout.map.height * unit,
  });
  if (layout.frame) {
    page.drawRectangle({
      x: layout.frame.x * unit,
      y: pageHeight - (layout.frame.y + layout.frame.height) * unit,
      width: layout.frame.width * unit,
      height: layout.frame.height * unit,
      borderWidth: 1.1 * unit,
      borderColor: hexRgb(settings.colors.text),
      borderOpacity: 0.22,
      opacity: 0,
    });
  }
  for (const rule of layout.rules ?? []) {
    page.drawLine({
      start: { x: rule.x1 * unit, y: pageHeight - rule.y1 * unit },
      end: { x: rule.x2 * unit, y: pageHeight - rule.y2 * unit },
      thickness: unit, color: hexRgb(settings.colors.text), opacity: rule.opacity ?? 0.18,
    });
  }
  for (const text of layout.texts) {
    const font: PDFFont = text.weight === 600 ? bold : regular;
    const characters = text.weight === 600 ? boldCharacters : regularCharacters;
    const supported = [...text.text].every((character) => characters.has(character.codePointAt(0)!));
    if (!supported) {
      // Keep browser fallback glyphs (such as emoji and CJK) visible in print.
      // Supported captions stay native PDF text; only this line is an image.
      const fittedSize = browserTextSize(text, measureContext);
      const pixelsPerUnit = unit * dpi / 72;
      const caption = document.createElement('canvas');
      caption.width = Math.ceil(text.maxWidth * pixelsPerUnit);
      caption.height = Math.ceil(fittedSize * 2.4 * pixelsPerUnit);
      const context = caption.getContext('2d');
      if (!context) throw new Error('Your browser could not render the print caption. Try exporting again.');
      const baseline = fittedSize * 1.5 * pixelsPerUnit;
      context.font = `${text.weight} ${fittedSize * pixelsPerUnit}px Outfit, sans-serif`;
      context.textAlign = text.align === 'left' ? 'left' : 'center';
      context.fillStyle = settings.colors.text;
      context.fillText(text.text, text.align === 'left' ? 0 : caption.width / 2, baseline);
      try {
        const captionImage = await doc.embedPng(await (await canvasBlob(caption)).arrayBuffer());
        const captionWidth = caption.width / pixelsPerUnit * unit;
        const captionHeight = caption.height / pixelsPerUnit * unit;
        page.drawImage(captionImage, {
          x: text.x * unit - (text.align === 'left' ? 0 : captionWidth / 2),
          y: pageHeight - text.y * unit - (caption.height - baseline) / pixelsPerUnit * unit,
          width: captionWidth, height: captionHeight, opacity: text.opacity,
        });
      } finally { caption.width = 1; caption.height = 1; }
      continue;
    }
    const size = fittedTextSize(text, (value, fontSize) => font.widthOfTextAtSize(value, fontSize)) * unit;
    page.drawText(text.text, {
      x: text.x * unit - (text.align === 'left' ? 0 : font.widthOfTextAtSize(text.text, size) / 2),
      y: pageHeight - text.y * unit,
      size, font, color: hexRgb(settings.colors.text), opacity: text.opacity,
    });
  }
  doc.setTitle(settings.title || 'My route');
  doc.setSubject(`${settings.location || 'GPX route'} · ${dimensions.widthMm} × ${dimensions.heightMm} mm · ${dpi} DPI map`);
  doc.setCreator('Waymark');
  const bytes = await doc.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

/** Render from the poster model, rather than taking a screenshot of the editor. */
export async function exportPoster({ track, settings, view, format: requestedFormat, dpi, onProgress }: ExportOptions): Promise<void> {
  const share = settings.outputMode === 'share';
  const format = share ? 'png' : requestedFormat;
  await Promise.all([document.fonts.load('400 20px Outfit'), document.fonts.load('600 20px Outfit')]);
  const measureContext = document.createElement('canvas').getContext('2d');
  const layout = getPosterLayout(settings, measurePosterText(measureContext));
  const { width, height } = exportPixelDimensions(settings, dpi);
  const pixelScale = width / layout.width;
  const mapWidth = Math.round(layout.map.width * pixelScale);
  // MapLibre uses integer CSS viewport dimensions. Round upward so a fraction
  // of a design unit cannot silently lower the requested print resolution.
  const mapHeight = Math.round(Math.ceil(layout.map.height) * pixelScale);
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (width * height > 24000000 && ((deviceMemory !== undefined && deviceMemory <= 4) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent))) {
    throw resolutionError('This print resolution requires more memory than your device can safely provide.', dpi);
  }
  if (width * height > 60000000) throw resolutionError('This print exceeds the supported image size.', dpi);
  const limit = graphicsLimit();
  if (mapWidth > limit || mapHeight > limit) {
    throw resolutionError(`Your browser supports map images up to ${limit} pixels per side.`, dpi, share);
  }
  const container = document.createElement('div');
  Object.assign(container.style, {
    position: 'fixed', left: '-20000px', top: '0', width: `${layout.map.width}px`, height: `${Math.ceil(layout.map.height)}px`, pointerEvents: 'none',
  });
  container.setAttribute('aria-hidden', 'true');
  document.body.append(container);
  let map: LibreMap | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    onProgress?.('Rendering your route map…');
    map = new LibreMap({
      container,
      style: createMapStyle(track, settings),
      ...(view ? { center: view.center, zoom: view.zoom, bearing: view.bearing } : { bounds: track.bounds, fitBoundsOptions: { padding: 48, maxZoom: 19 } }),
      interactive: false,
      attributionControl: false,
      renderWorldCopies: crossesDateline(track),
      fadeDuration: 0,
      pixelRatio: pixelScale,
      maxCanvasSize: [limit, limit],
      canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
    });
    await completeMap(map);
    const mapCanvas = map.getCanvas();
    if (mapCanvas.width < mapWidth - 1 || mapCanvas.height < mapHeight - 1) {
      throw resolutionError('The browser reduced the map resolution to fit its graphics limits.', dpi, share);
    }
    onProgress?.(format === 'pdf' ? 'Preparing your print PDF…' : share ? 'Preparing your sharing image…' : 'Preparing your high-resolution image…');
    let blob: Blob;
    if (format === 'pdf') {
      blob = await createPdf(mapCanvas, layout, settings, dpi);
    } else {
      await Promise.all([document.fonts.load('400 20px Outfit'), document.fonts.load('600 20px Outfit')]);
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw resolutionError('Your browser could not allocate the image.', dpi, share);
      context.fillStyle = settings.colors.background;
      context.fillRect(0, 0, width, height);
      // A corner read detects browsers that reject oversized 2D canvases.
      try { context.getImageData(width - 1, height - 1, 1, 1); }
      catch { throw resolutionError('This image exceeds your browser’s canvas limits.', dpi, share); }
      context.save();
      context.scale(pixelScale, pixelScale);
      context.drawImage(mapCanvas, layout.map.x, layout.map.y, layout.map.width, layout.map.height);
      if (layout.frame) {
        context.strokeStyle = settings.colors.text;
        context.globalAlpha = 0.22;
        context.lineWidth = 1.1;
        context.strokeRect(layout.frame.x, layout.frame.y, layout.frame.width, layout.frame.height);
      }
      for (const rule of layout.rules ?? []) {
        context.globalAlpha = rule.opacity ?? 0.18;
        context.strokeStyle = settings.colors.text;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(rule.x1, rule.y1);
        context.lineTo(rule.x2, rule.y2);
        context.stroke();
      }
      context.fillStyle = settings.colors.text;
      for (const text of layout.texts) {
        const size = browserTextSize(text, context);
        context.font = `${text.weight} ${size}px Outfit, sans-serif`;
        context.textAlign = text.align === 'left' ? 'left' : 'center';
        context.globalAlpha = text.opacity;
        context.fillText(text.text, text.x, text.y);
      }
      context.restore();
      const imageBlob = await canvasBlob(canvas, share);
      blob = share ? imageBlob : await withPngDpi(imageBlob, dpi);
    }
    const name = (settings.title || track.name || 'My route').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'my-route';
    const suffix = share ? `${settings.shareSize}-${width}x${height}` : `${settings.paperSize}-${dpi}dpi`;
    await download(blob, `${name}-${suffix}.${format}`);
    onProgress?.(share ? 'Your image is ready.' : 'Your print is ready.');
  } finally {
    map?.remove();
    container.remove();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}

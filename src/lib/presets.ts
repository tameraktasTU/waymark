import type { PaletteId, PosterColors, PosterSettings, PaperSizeId, ShareSizeId } from './types';

export const PALETTES: { id: PaletteId; name: string; colors: PosterColors }[] = [
  { id: 'alpine', name: 'Alpine', colors: { background: '#ffffff', land: '#e0e8dc', water: '#c1d8df', roads: '#ffffff', text: '#213c35', route: '#e3694b' } },
  { id: 'coastal', name: 'Coastal', colors: { background: '#f9fcfd', land: '#e3edef', water: '#adcdd9', roads: '#ffffff', text: '#254b60', route: '#d87251' } },
  { id: 'midnight', name: 'Midnight', colors: { background: '#182d3c', land: '#263e4b', water: '#142733', roads: '#456071', text: '#f0f5f4', route: '#e9b76e' } },
  { id: 'mono', name: 'Monochrome', colors: { background: '#ffffff', land: '#eaeaea', water: '#d2d9dc', roads: '#ffffff', text: '#263138', route: '#263138' } },
];

export const PAPER_SIZES: { id: PaperSizeId; name: string; widthMm: number; heightMm: number; description: string }[] = [
  { id: 'a4', name: 'A4', widthMm: 210, heightMm: 297, description: '21 × 29.7 cm' },
  { id: 'a3', name: 'A3', widthMm: 297, heightMm: 420, description: '29.7 × 42 cm' },
  { id: '30x40', name: '30 × 40', widthMm: 300, heightMm: 400, description: '30 × 40 cm' },
  { id: '50x70', name: '50 × 70', widthMm: 500, heightMm: 700, description: '50 × 70 cm' },
];

export const SHARE_SIZES: { id: ShareSizeId; name: string; width: number; height: number; ratio: string }[] = [
  { id: 'instagram-post', name: 'Instagram post', width: 1080, height: 1440, ratio: '3:4' },
  { id: 'square', name: 'Square', width: 1080, height: 1080, ratio: '1:1' },
  { id: 'story', name: 'Story', width: 1080, height: 1920, ratio: '9:16' },
  { id: 'wide', name: 'Wide', width: 1920, height: 1080, ratio: '16:9' },
];

export function shareDimensions(settings: Pick<PosterSettings, 'shareSize'>) {
  return SHARE_SIZES.find((size) => size.id === settings.shareSize) ?? SHARE_SIZES[0];
}

export function paperDimensions(settings: Pick<PosterSettings, 'paperSize' | 'orientation'>) {
  const paper = PAPER_SIZES.find((size) => size.id === settings.paperSize) ?? PAPER_SIZES[2];
  return settings.orientation === 'landscape'
    ? { widthMm: paper.heightMm, heightMm: paper.widthMm }
    : { widthMm: paper.widthMm, heightMm: paper.heightMm };
}

/** Aspect ratio source: millimetres for print, fixed pixels for sharing. */
export function posterDimensions(settings: PosterSettings) {
  if (settings.outputMode === 'share') return shareDimensions(settings);
  const { widthMm, heightMm } = paperDimensions(settings);
  return { width: widthMm, height: heightMm };
}

export function exportPixelDimensions(settings: PosterSettings, dpi: 150 | 300) {
  const { width, height } = posterDimensions(settings);
  return settings.outputMode === 'share'
    ? { width, height }
    : { width: Math.round(width / 25.4 * dpi), height: Math.round(height / 25.4 * dpi) };
}

export const DEFAULT_SETTINGS: PosterSettings = {
  template: 'classic', palette: 'alpine', colors: { ...PALETTES[0].colors },
  paperSize: '30x40', orientation: 'portrait',
  outputMode: 'print', shareSize: 'instagram-post',
  title: 'A lap around Lietzensee', location: 'Lietzensee, Berlin', date: 'October 7, 2026',
  distance: '', duration: '', pace: '', paceLabel: 'Pace', units: 'metric', timeBasis: 'moving',
  showStats: true, showDate: true, showMarkers: true, showMapLabels: true, routeWidth: 3,
};

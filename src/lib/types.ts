export interface TrackPoint {
  lat: number;
  lon: number;
  elevation?: number;
  time?: string;
}

export interface GpxTrack {
  name: string;
  segments: TrackPoint[][];
  pointCount: number;
  distanceKm: number;
  startTime?: string;
  endTime?: string;
  elapsedSeconds?: number;
  movingSeconds?: number;
  elevationGainM?: number;
  bounds: [[number, number], [number, number]];
}

export type TemplateId = 'classic' | 'gallery' | 'minimal';
export type PaletteId = 'alpine' | 'coastal' | 'midnight' | 'mono';
export type PaperSizeId = 'a4' | 'a3' | '30x40' | '50x70';
export type OutputMode = 'print' | 'share';
export type ShareSizeId = 'instagram-post' | 'square' | 'story' | 'wide';
export type Orientation = 'portrait' | 'landscape';
export type Units = 'metric' | 'imperial';
export type TimeBasis = 'moving' | 'elapsed';

export interface PosterColors {
  background: string;
  land: string;
  water: string;
  roads: string;
  text: string;
  route: string;
}

export interface PosterSettings {
  template: TemplateId;
  palette: PaletteId;
  colors: PosterColors;
  paperSize: PaperSizeId;
  orientation: Orientation;
  outputMode: OutputMode;
  shareSize: ShareSizeId;
  title: string;
  location: string;
  date: string;
  distance: string;
  duration: string;
  pace: string;
  paceLabel: 'Pace' | 'Avg. speed';
  units: Units;
  timeBasis: TimeBasis;
  showStats: boolean;
  showDate: boolean;
  showMarkers: boolean;
  showMapLabels: boolean;
  routeWidth: number;
}

export interface MapView {
  center: [number, number];
  zoom: number;
  bearing: number;
}

export interface PosterPreviewProps {
  track: GpxTrack;
  settings: PosterSettings;
  fitRequest: number;
  onViewChange: (view: MapView) => void;
  onStatusChange?: (status: 'loading' | 'ready' | 'error') => void;
}

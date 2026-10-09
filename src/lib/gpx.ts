import type { GpxTrack, PosterSettings, TimeBasis, TrackPoint, Units } from './types';
import { LIETZENSEE_LOOP } from './demo-route';

const EARTH_RADIUS_KM = 6371.0088;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MOVING_SPEED_KMH = 1;
const MOVING_WINDOW_SECONDS = 10;
const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function children(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((child) => child.localName === name);
}

function childText(element: Element, name: string): string | undefined {
  return children(element, name)[0]?.textContent?.trim() || undefined;
}

function numberValue(value: string | null | undefined): number | undefined {
  const text = value?.trim();
  if (!text || !DECIMAL_NUMBER.test(text)) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

function timestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // A timezone is essential: interpreting a timezone-less date on different
  // devices would give different elapsed times and poster dates.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/i.exec(value);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, zone, zoneHour, zoneMinute] = match;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (
    Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > daysInMonth ||
    Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
    (zone !== 'Z' && zone !== 'z' && (Number(zoneHour) > 14 || Number(zoneMinute) > 59 || (Number(zoneHour) === 14 && Number(zoneMinute) !== 0)))
  ) return undefined;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : undefined;
}

function readPoint(element: Element): TrackPoint {
  const lat = numberValue(element.getAttribute('lat'));
  const lon = numberValue(element.getAttribute('lon'));
  if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('A route point has invalid coordinates. Latitude must be between −90 and 90, and longitude between −180 and 180.');
  }
  const elevation = numberValue(childText(element, 'ele'));
  const time = timestamp(childText(element, 'time'));
  return { lat, lon, ...(elevation === undefined ? {} : { elevation }), ...(time ? { time } : {}) };
}

function distanceBetween(a: TrackPoint, b: TrackPoint): number {
  const radians = Math.PI / 180;
  const latitudeDifference = (b.lat - a.lat) * radians;
  const longitudeDifference = (b.lon - a.lon) * radians;
  const haversine = Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(longitudeDifference / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
}

/** Estimate movement only after all timestamps have been validated. */
function estimateMovingSeconds(segments: TrackPoint[][]): number {
  let movingSeconds = 0;
  for (const segment of segments) {
    let windowStart = 0;
    for (let index = 1; index < segment.length; index++) {
      const start = segment[windowStart];
      const end = segment[index];
      const seconds = (Date.parse(end.time!) - Date.parse(start.time!)) / 1000;
      // Compare displacement over a short window instead of adding every GPS
      // wobble. Sparse recordings and the final partial window use their actual
      // sample interval. Never bridge the gap between separate segments.
      if (seconds < MOVING_WINDOW_SECONDS && index !== segment.length - 1) continue;
      const speedKmh = distanceBetween(start, end) / seconds * 3600;
      if (speedKmh >= MOVING_SPEED_KMH) movingSeconds += seconds;
      windowStart = index;
    }
  }
  return movingSeconds;
}

function trackBounds(points: TrackPoint[]): GpxTrack['bounds'] {
  let south = 90;
  let north = -90;
  const longitudes: number[] = [];
  for (const point of points) {
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
    longitudes.push(point.lon === 180 ? -180 : point.lon);
  }
  longitudes.sort((a, b) => a - b);
  // The smallest longitude interval is the complement of the largest gap on
  // the globe. An east bound above 180 is intentional for dateline crossings.
  let largestGap = -1;
  let gapIndex = 0;
  for (let index = 0; index < longitudes.length; index++) {
    const next = index + 1 < longitudes.length ? longitudes[index + 1] : longitudes[0] + 360;
    const gap = next - longitudes[index];
    if (gap > largestGap) { largestGap = gap; gapIndex = index; }
  }
  const west = longitudes[(gapIndex + 1) % longitudes.length];
  let east = longitudes[gapIndex];
  if (east < west) east += 360;
  return [[west, south], [east, north]];
}

function buildTrack(name: string, segments: TrackPoint[][]): GpxTrack {
  const points = segments.flat();
  if (points.length < 2) {
    throw new Error('This GPX file needs at least two route points. Choose a recorded track or route.');
  }
  let distanceKm = 0;
  let elevationGainM = 0;
  for (const segment of segments) {
    for (let index = 1; index < segment.length; index++) {
      distanceKm += distanceBetween(segment[index - 1], segment[index]);
      if (segment[index - 1].elevation !== undefined && segment[index].elevation !== undefined) {
        elevationGainM += Math.max(0, segment[index].elevation! - segment[index - 1].elevation!);
      }
    }
  }
  if (distanceKm === 0) {
    throw new Error('This GPX file has no usable route: its recorded points do not form a path.');
  }

  const times = points.map((point) => point.time ? Date.parse(point.time) : undefined);
  const reliableTimes = times.every((time, index) => time !== undefined && (index === 0 || time > times[index - 1]!));
  const elapsedSeconds = reliableTimes ? (times[times.length - 1]! - times[0]!) / 1000 : undefined;
  return {
    name,
    segments,
    pointCount: points.length,
    distanceKm,
    bounds: trackBounds(points),
    ...(reliableTimes ? {
      startTime: points[0].time, endTime: points[points.length - 1].time,
      elapsedSeconds, movingSeconds: estimateMovingSeconds(segments),
    } : {}),
    ...(points.every((point) => point.elevation !== undefined) ? { elevationGainM } : {}),
  };
}

/** Parse locally, preserving track segments and never joining recording gaps. */
export function parseGpx(xml: string): GpxTrack {
  if (!xml.trim()) throw new Error('This file is empty. Choose a GPX file containing a route.');
  if (/<!DOCTYPE/i.test(xml)) throw new Error('This GPX file contains an unsupported XML document type. Export it again as standard GPX.');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagNameNS('*', 'parsererror').length || document.documentElement.localName !== 'gpx') {
    throw new Error('This file is not valid GPX XML. Export your activity as a .gpx file and try again.');
  }
  const root = document.documentElement;
  const tracks = children(root, 'trk');
  let name = tracks.map((track) => childText(track, 'name')).find(Boolean);
  let segments = tracks.flatMap((track) => children(track, 'trkseg').map((segment) => children(segment, 'trkpt').map(readPoint))).filter((segment) => segment.length);

  if (!segments.length) {
    const routes = children(root, 'rte');
    name = routes.map((route) => childText(route, 'name')).find(Boolean);
    segments = routes.map((route) => children(route, 'rtept').map(readPoint)).filter((segment) => segment.length);
  }
  name ||= childText(children(root, 'metadata')[0] ?? root, 'name') || 'Untitled route';
  return buildTrack(name, segments);
}

/** File contents stay on the device; this function makes no network requests. */
export async function readGpxFile(file: File): Promise<GpxTrack> {
  if (file.size > MAX_FILE_BYTES) throw new Error('This file is too large. Choose a GPX file smaller than 20 MB.');
  if (!file.size) throw new Error('This file is empty. Choose a GPX file containing a route.');
  let xml: string;
  try { xml = await file.text(); }
  catch { throw new Error('Your browser could not read this file. Select it again or export a fresh GPX file.'); }
  const track = parseGpx(xml);
  if (track.name === 'Untitled route') track.name = file.name.replace(/\.[^.]+$/, '') || track.name;
  return track;
}

function clockTime(seconds: number): string {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}` : `${minutes}:${String(remaining).padStart(2, '0')}`;
}

export function formatTrackStats(
  track: GpxTrack,
  units: Units,
  timeBasis: TimeBasis = 'elapsed',
  paceLabel: PosterSettings['paceLabel'] = 'Pace',
): { distance: string; duration: string; pace: string; date: string } {
  const distance = units === 'imperial' ? track.distanceKm / 1.609344 : track.distanceKm;
  const suffix = units === 'imperial' ? 'mi' : 'km';
  const seconds = timeBasis === 'moving' ? track.movingSeconds : track.elapsedSeconds;
  const timed = seconds !== undefined && Number.isFinite(seconds) && seconds >= 0;
  const hasPace = timed && seconds > 0 && distance > 0;
  const start = track.startTime ? new Date(track.startTime) : undefined;
  return {
    distance: `${distance.toFixed(2)} ${suffix}`,
    duration: timed ? clockTime(seconds) : '—',
    pace: hasPace
      ? paceLabel === 'Avg. speed'
        ? `${(distance / (seconds / 3600)).toFixed(1)} ${units === 'imperial' ? 'mph' : 'km/h'}`
        : `${clockTime(seconds / distance)} /${suffix}`
      : '—',
    date: start && Number.isFinite(start.getTime()) ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(start) : '—',
  };
}

/** A mapped Lietzensee loop with illustrative running times and elevations. */
export function createDemoTrack(): GpxTrack {
  const anchors = LIETZENSEE_LOOP;
  const points: TrackPoint[] = [];
  let distanceKm = 0;
  const start = Date.parse('2026-10-07T06:00:00Z');
  for (let index = 0; index < anchors.length - 1; index++) {
    const a = { lat: anchors[index][0], lon: anchors[index][1] };
    const b = { lat: anchors[index + 1][0], lon: anchors[index + 1][1] };
    const count = Math.max(1, Math.ceil(distanceBetween(a, b) / 0.01));
    for (let step = 0; step < count; step++) {
      const fraction = step / count;
      const point: TrackPoint = { lat: a.lat + (b.lat - a.lat) * fraction, lon: a.lon + (b.lon - a.lon) * fraction };
      if (points.length) distanceKm += distanceBetween(points[points.length - 1], point);
      point.time = new Date(start + Math.round(distanceKm * 360 * 1000)).toISOString();
      point.elevation = 34 + Math.sin(distanceKm * 2) * 3;
      points.push(point);
    }
  }
  const final = { lat: anchors[anchors.length - 1][0], lon: anchors[anchors.length - 1][1] };
  distanceKm += distanceBetween(points[points.length - 1], final);
  points.push({ ...final, time: new Date(start + Math.round(distanceKm * 360 * 1000)).toISOString(), elevation: 34 + Math.sin(distanceKm * 2) * 3 });
  return buildTrack('Lietzensee example run', [points]);
}

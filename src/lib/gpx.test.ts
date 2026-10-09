// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createDemoTrack, formatTrackStats, parseGpx, readGpxFile } from './gpx';

const point = (lat: string | number, lon: string | number, time?: string) => `<trkpt lat="${lat}" lon="${lon}">${time ? `<time>${time}</time>` : ''}</trkpt>`;
const gpx = (content: string) => `<gpx version="1.1" creator="tests" xmlns="http://www.topografix.com/GPX/1/1">${content}</gpx>`;
const track = (points: string) => gpx(`<trk><name>Morning loop</name><trkseg>${points}</trkseg></trk>`);

describe('parseGpx', () => {
  it('reads namespaced GPX and measures geodesic distance', () => {
    const result = parseGpx(track(point(0, 0) + point(0, 1)));
    expect(result.name).toBe('Morning loop');
    expect(result.pointCount).toBe(2);
    expect(result.distanceKm).toBeCloseTo(111.195, 2);
    expect(result.bounds).toEqual([[0, 0], [1, 0]]);
  });

  it('keeps segment gaps out of distance and geometry', () => {
    const result = parseGpx(gpx(`<trk><trkseg>${point(0, 0)}${point(0, 0.01)}</trkseg><trkseg>${point(50, 50)}${point(50, 50.01)}</trkseg></trk>`));
    expect(result.segments.map((segment) => segment.length)).toEqual([2, 2]);
    expect(result.pointCount).toBe(4);
    expect(result.distanceKm).toBeCloseTo(1.8267, 3);
  });

  it('supports routes without recorded tracks and preserves separate routes', () => {
    const result = parseGpx(gpx('<rte><name>Weekend hike</name><rtept lat="0" lon="0"/><rtept lat="0" lon="0.01"/></rte><rte><rtept lat="50" lon="50"/><rtept lat="50" lon="50.01"/></rte>'));
    expect(result.name).toBe('Weekend hike');
    expect(result.segments).toHaveLength(2);
    expect(result.distanceKm).toBeLessThan(2);
  });

  it.each(['', '<gpx><trk></gpx>', '<html/>', '<!DOCTYPE gpx SYSTEM "https://example.com/test"><gpx/>'])('rejects empty, malformed, and unsupported documents: %s', (xml) => {
    expect(() => parseGpx(xml)).toThrow();
  });

  it('rejects waypoint-only files, single points, and paths with no movement', () => {
    expect(() => parseGpx(gpx('<wpt lat="52" lon="13"/>'))).toThrow(/at least two/);
    expect(() => parseGpx(track(point(52, 13)))).toThrow(/at least two/);
    expect(() => parseGpx(track(point(52, 13) + point(52, 13)))).toThrow(/no usable route/);
  });

  it.each([['', '13'], ['NaN', '13'], ['52', 'Infinity'], ['91', '13'], ['52', '-181'], ['0x10', '13'], ['52', '']])('rejects invalid coordinates lat=%s lon=%s', (lat, lon) => {
    expect(() => parseGpx(track(point(lat, lon) + point(52, 13)))).toThrow(/invalid coordinates/);
  });

  it('uses a short longitude interval across the dateline', () => {
    const result = parseGpx(track(point(0, 179.9) + point(0, -179.9)));
    expect(result.distanceKm).toBeCloseTo(22.239, 2);
    expect(result.bounds[0][0]).toBeCloseTo(179.9);
    expect(result.bounds[1][0]).toBeCloseTo(180.1);
  });

  it('calculates elapsed time from complete increasing timestamps', () => {
    const result = parseGpx(track(point(0, 0, '2026-10-07T08:00:00+02:00') + point(0, 0.01, '2026-10-07T08:06:00+02:00')));
    expect(result.elapsedSeconds).toBe(360);
    expect(result.startTime).toBe('2026-10-07T06:00:00.000Z');
    expect(result.movingSeconds).toBe(360);
  });

  it('excludes stationary pauses from moving time', () => {
    const result = parseGpx(track(
      point(0, 0, '2026-10-07T08:00:00Z') +
      point(0, 0.001, '2026-10-07T08:01:00Z') +
      point(0, 0.001, '2026-10-07T08:02:00Z') +
      point(0, 0.002, '2026-10-07T08:03:00Z'),
    ));
    expect(result.elapsedSeconds).toBe(180);
    expect(result.movingSeconds).toBe(120);
  });

  it('does not mistake small, frequent GPS drift while stopped for movement', () => {
    const pausedAt = Date.parse('2026-10-07T08:01:00Z');
    const drift = Array.from({ length: 30 }, (_, index) => point(
      0, 0.001 + (index % 2 === 0 ? 0.000008 : 0),
      new Date(pausedAt + (index + 1) * 1000).toISOString(),
    )).join('');
    const result = parseGpx(track(
      point(0, 0, '2026-10-07T08:00:00Z') +
      point(0, 0.001, '2026-10-07T08:01:00Z') + drift +
      point(0, 0.002, '2026-10-07T08:02:30Z'),
    ));
    expect(result.elapsedSeconds).toBe(150);
    expect(result.movingSeconds).toBe(120);
  });

  it('keeps sparse, steadily moving recordings usable', () => {
    const result = parseGpx(track(
      point(0, 0, '2026-10-07T08:00:00Z') +
      point(0, 0.01, '2026-10-07T08:05:00Z') +
      point(0, 0.02, '2026-10-07T08:10:00Z'),
    ));
    expect(result.movingSeconds).toBe(600);
  });

  it('excludes time between segments, including isolated points', () => {
    const result = parseGpx(gpx(`<trk>
      <trkseg>${point(0, 0, '2026-10-07T08:00:00Z')}${point(0, 0.001, '2026-10-07T08:01:00Z')}</trkseg>
      <trkseg>${point(0, 0.002, '2026-10-07T08:10:00Z')}</trkseg>
      <trkseg>${point(0, 0.003, '2026-10-07T08:21:00Z')}${point(0, 0.004, '2026-10-07T08:22:00Z')}</trkseg>
    </trk>`));
    expect(result.elapsedSeconds).toBe(1320);
    expect(result.movingSeconds).toBe(120);
  });

  it('includes a final partial movement window without losing its seconds', () => {
    const result = parseGpx(track(Array.from({ length: 14 }, (_, index) => point(
      0, index * 0.00001,
      new Date(Date.parse('2026-10-07T08:00:00Z') + index * 1000).toISOString(),
    )).join('')));
    expect(result.movingSeconds).toBe(13);
    expect(result.movingSeconds).toBeLessThanOrEqual(result.elapsedSeconds!);
  });

  it('can report zero detected movement without substituting elapsed time', () => {
    const result = parseGpx(track(
      point(0, 0, '2026-10-07T08:00:00Z') +
      point(0, 0.00001, '2026-10-07T08:02:00Z'),
    ));
    expect(result.movingSeconds).toBe(0);
    expect(formatTrackStats(result, 'metric', 'moving')).toMatchObject({ duration: '0:00', pace: '—', date: '7 Oct 2026' });
    expect(formatTrackStats(result, 'metric', 'moving', 'Avg. speed').pace).toBe('—');
  });

  it('estimates movement across the dateline using the short geographic distance', () => {
    const result = parseGpx(track(
      point(0, 179.9999, '2026-10-07T08:00:00Z') +
      point(0, -179.9999, '2026-10-07T08:01:00Z'),
    ));
    expect(result.distanceKm).toBeLessThan(0.025);
    expect(result.movingSeconds).toBe(60);
  });

  it.each([
    [undefined, undefined],
    ['2026-10-07T08:00:00Z', undefined],
    ['2026-10-07T08:00:00Z', '2026-10-07T07:59:00Z'],
    ['2026-10-07T08:00:00Z', '2026-10-07T08:00:00Z'],
    ['2026-10-07T08:00:00Z', 'not-a-date'],
    ['2026-10-07T08:00:00', '2026-10-07T08:06:00'],
    ['2026-02-30T08:00:00Z', '2026-03-01T08:00:00Z'],
  ])('does not infer timing or date from incomplete or unreliable timestamps', (first, second) => {
    const result = parseGpx(track(point(0, 0, first) + point(0, 0.01, second)));
    expect(result.elapsedSeconds).toBeUndefined();
    expect(result.movingSeconds).toBeUndefined();
    expect(result.startTime).toBeUndefined();
    expect(formatTrackStats(result, 'metric')).toMatchObject({ duration: '—', pace: '—', date: '—' });
    expect(formatTrackStats(result, 'metric', 'moving')).toMatchObject({ duration: '—', pace: '—', date: '—' });
  });

  it('does not count elevation changes across recording gaps', () => {
    const result = parseGpx(gpx('<trk><trkseg><trkpt lat="0" lon="0"><ele>10</ele></trkpt><trkpt lat="0" lon="0.01"><ele>20</ele></trkpt></trkseg><trkseg><trkpt lat="0" lon="1"><ele>100</ele></trkpt><trkpt lat="0" lon="1.01"><ele>105</ele></trkpt></trkseg></trk>'));
    expect(result.elevationGainM).toBe(15);
  });
});

describe('formatTrackStats', () => {
  it('formats metric and imperial units consistently', () => {
    const result = { ...createDemoTrack(), distanceKm: 10, elapsedSeconds: 3600 };
    expect(formatTrackStats(result, 'metric')).toEqual({ distance: '10.00 km', duration: '1:00:00', pace: '6:00 /km', date: '7 Oct 2026' });
    expect(formatTrackStats(result, 'imperial')).toEqual({ distance: '6.21 mi', duration: '1:00:00', pace: '9:39 /mi', date: '7 Oct 2026' });
  });

  it('uses the selected time for both pace and average speed in either unit system', () => {
    const result = { ...createDemoTrack(), distanceKm: 10, elapsedSeconds: 3600, movingSeconds: 1800 };
    expect(formatTrackStats(result, 'metric', 'moving')).toMatchObject({ duration: '30:00', pace: '3:00 /km' });
    expect(formatTrackStats(result, 'imperial', 'moving')).toMatchObject({ duration: '30:00', pace: '4:50 /mi' });
    expect(formatTrackStats(result, 'metric', 'moving', 'Avg. speed')).toMatchObject({ duration: '30:00', pace: '20.0 km/h' });
    expect(formatTrackStats(result, 'imperial', 'moving', 'Avg. speed').pace).toBe('12.4 mph');
    expect(formatTrackStats(result, 'metric', 'elapsed', 'Avg. speed')).toMatchObject({ duration: '1:00:00', pace: '10.0 km/h' });
    expect(formatTrackStats(result, 'imperial', 'elapsed', 'Avg. speed').pace).toBe('6.2 mph');
  });

  it('does not silently fall back to elapsed time when moving time is unavailable', () => {
    const result = { ...createDemoTrack(), movingSeconds: undefined };
    expect(formatTrackStats(result, 'metric', 'moving')).toMatchObject({ duration: '—', pace: '—', date: '7 Oct 2026' });
    expect(formatTrackStats(result, 'metric', 'elapsed').duration).not.toBe('—');
  });
});

describe('readGpxFile', () => {
  it('rejects oversized and empty files before reading', async () => {
    const text = () => Promise.reject(new Error('should not read'));
    await expect(readGpxFile({ name: 'huge.gpx', size: 20 * 1024 * 1024 + 1, text } as unknown as File)).rejects.toThrow(/20 MB/);
    await expect(readGpxFile({ name: 'empty.gpx', size: 0, text } as unknown as File)).rejects.toThrow(/empty/);
  });

  it('uses the filename for an unnamed valid GPX', async () => {
    const xml = gpx(`<trk><trkseg>${point(0, 0)}${point(0, 0.01)}</trkseg></trk>`);
    const result = await readGpxFile({ name: 'My hike.gpx', size: xml.length, text: async () => xml } as File);
    expect(result.name).toBe('My hike');
  });
});

describe('createDemoTrack', () => {
  it('creates a labelled, timed Lietzensee lap covering both halves of the lake', () => {
    const result = createDemoTrack();
    expect(result.name).toBe('Lietzensee example run');
    expect(result.distanceKm).toBeGreaterThan(2);
    expect(result.distanceKm).toBeLessThan(2.5);
    expect(result.bounds[0][0]).toBeGreaterThan(13.285);
    expect(result.bounds[1][0]).toBeLessThan(13.294);
    expect(result.bounds[0][1]).toBeLessThan(52.504);
    expect(result.bounds[1][1]).toBeGreaterThan(52.509);
    expect(result.pointCount).toBeGreaterThan(100);
    expect(result.elapsedSeconds).toBeGreaterThan(600);
    expect(result.elapsedSeconds).toBeLessThan(1000);
    expect(result.movingSeconds).toBe(result.elapsedSeconds);
    expect(result.startTime).toMatch(/^2026-10-07/);
    expect(result.segments[0][0].lat).toBe(result.segments[0].at(-1)!.lat);
    expect(result.segments[0][0].lon).toBe(result.segments[0].at(-1)!.lon);
  });
});

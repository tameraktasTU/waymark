import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { createMapStyle, crossesDateline, markerFeatures, routeFeatures } from './map-style';
import { getPosterLayout, wrapShareText } from './poster-layout';
import { DEFAULT_SETTINGS, exportPixelDimensions, PALETTES, PAPER_SIZES, SHARE_SIZES } from './presets';
import type { GpxTrack, Orientation, TemplateId } from './types';

const datelineTrack: GpxTrack = {
  name: 'Pacific route', pointCount: 4, distanceKm: 12,
  bounds: [[179.8, 10], [180.2, 10.3]],
  segments: [
    [{ lon: 179.8, lat: 10 }, { lon: -179.9, lat: 10.1 }],
    [{ lon: -179.85, lat: 10.2 }, { lon: -179.8, lat: 10.3 }],
  ],
};

describe('poster geometry', () => {
  it('unwraps dateline routes and endpoints without joining separate segments', () => {
    const route = routeFeatures(datelineTrack);
    expect(route.geometry.coordinates).toHaveLength(2);
    expect(route.geometry.coordinates[0][1][0]).toBeCloseTo(180.1);
    expect(route.geometry.coordinates[1][0][0]).toBeCloseTo(180.15);
    expect(markerFeatures(datelineTrack).features[1].geometry.coordinates[0]).toBeCloseTo(180.2);
    expect(crossesDateline(datelineTrack)).toBe(true);
  });

  it('produces valid MapLibre styles for every palette and responsive scale', () => {
    for (const palette of PALETTES) {
      for (const scale of [0.1, 0.4, 1, 2]) {
        const style = createMapStyle(datelineTrack, { ...DEFAULT_SETTINGS, colors: palette.colors, showMapLabels: true }, scale);
        expect(validateStyleMin(style).map((error) => error.message)).toEqual([]);
      }
    }
  });

  it('keeps map and captions inside all paper orientations and templates without a copyright line', () => {
    for (const paper of PAPER_SIZES) {
      for (const orientation of ['portrait', 'landscape'] as Orientation[]) {
        for (const template of ['classic', 'gallery', 'minimal'] as TemplateId[]) {
          const layout = getPosterLayout({ ...DEFAULT_SETTINGS, paperSize: paper.id, orientation, template });
          const mapBottom = layout.frame ? layout.frame.y + layout.frame.height : layout.map.y + layout.map.height;
          expect(layout.map.x).toBeGreaterThan(0);
          expect(layout.map.x + layout.map.width).toBeLessThan(layout.width);
          expect(layout.map.height).toBeGreaterThan(0);
          for (const text of layout.texts) {
            expect(text.y - text.size).toBeGreaterThan(mapBottom);
            expect(text.y).toBeLessThan(layout.height);
            expect(text.x - text.maxWidth / 2).toBeGreaterThanOrEqual(0);
            expect(text.x + text.maxWidth / 2).toBeLessThanOrEqual(layout.width);
          }
          expect(layout.texts.some((text) => /©|OpenStreetMap|OpenMapTiles|OpenFreeMap/.test(text.text))).toBe(false);
        }
      }
    }
  });

  it('normalizes multiline uploaded names and respects hidden date and statistics', () => {
    const layout = getPosterLayout({ ...DEFAULT_SETTINGS, title: '  My\n  first\tmarathon  ', showStats: false, showDate: false });
    expect(layout.texts[0].text).toBe('My first marathon');
    expect(layout.texts.some((text) => text.text === 'DISTANCE')).toBe(false);
    expect(layout.texts.some((text) => text.text === DEFAULT_SETTINGS.date)).toBe(false);
  });

  it('uses readable print captions at every paper size and orientation', () => {
    for (const paper of PAPER_SIZES) {
      for (const orientation of ['portrait', 'landscape'] as Orientation[]) {
        for (const template of ['classic', 'gallery', 'minimal'] as TemplateId[]) {
          const settings = { ...DEFAULT_SETTINGS, paperSize: paper.id, orientation, template, distance: '7.20 km', duration: '43:10', pace: '6:00 /km' };
          const full = getPosterLayout(settings);
          expect(full.texts[0].size).toBeGreaterThanOrEqual(36);
          expect(full.texts.find((text) => text.text.includes(settings.location))?.size).toBeGreaterThanOrEqual(24);
          expect(full.texts.find((text) => text.text === '7.20 km')?.size).toBeGreaterThanOrEqual(36);
          expect(full.texts.find((text) => text.text === 'DISTANCE')?.size).toBeGreaterThanOrEqual(18);
          const sparse = getPosterLayout({ ...settings, location: '', showDate: false, showStats: false });
          expect(sparse.texts.map((text) => text.text)).toEqual([settings.title]);
          expect(sparse.map).toEqual(full.map);
          expect(sparse.frame).toEqual(full.frame);
        }
      }
    }
  });

  it('exports sharing formats at exact pixel sizes regardless of DPI, paper size or print orientation', () => {
    for (const size of SHARE_SIZES) {
      for (const dpi of [150, 300] as const) {
        const settings = { ...DEFAULT_SETTINGS, outputMode: 'share' as const, shareSize: size.id, paperSize: '50x70' as const, orientation: 'landscape' as const };
        expect(exportPixelDimensions(settings, dpi)).toEqual({ width: size.width, height: size.height });
        const layout = getPosterLayout(settings);
        expect(layout.width / layout.height).toBeCloseTo(size.width / size.height);
      }
    }
    expect(exportPixelDimensions(DEFAULT_SETTINGS, 300)).toEqual({ width: 3543, height: 4724 });
    expect(exportPixelDimensions({ ...DEFAULT_SETTINGS, paperSize: 'a4', orientation: 'landscape' }, 150)).toEqual({ width: 1754, height: 1240 });
  });

  it('keeps sharing captions and frames inside every template, with space for Story controls and no copyright line', () => {
    for (const size of SHARE_SIZES) {
      for (const template of ['classic', 'gallery', 'minimal'] as TemplateId[]) {
        for (const showStats of [true, false]) {
          for (const showDate of [true, false]) {
            const settings = { ...DEFAULT_SETTINGS, outputMode: 'share' as const, shareSize: size.id, template, showStats, showDate };
            const layout = getPosterLayout(settings);
            const mapBottom = layout.map.y + layout.map.height;
            expect(layout.map.height).toBeGreaterThan(0);
            expect(mapBottom).toBeLessThan(layout.height);
            for (const text of layout.texts) {
              const left = text.align === 'left' ? text.x : text.x - text.maxWidth / 2;
              const besideMap = left >= layout.map.x + layout.map.width;
              expect(besideMap || text.y < layout.map.y || text.y - text.size > mapBottom).toBe(true);
              expect(text.y).toBeLessThan(layout.height);
              expect(left).toBeGreaterThanOrEqual(0);
              expect(left + text.maxWidth).toBeLessThanOrEqual(layout.width);
            }
            if (layout.frame) {
              expect(layout.frame.y).toBeGreaterThan(0);
              const title = layout.texts[0];
              const left = title.align === 'left' ? title.x : title.x - title.maxWidth / 2;
              const besideFrame = left > layout.frame.x + layout.frame.width;
              expect(besideFrame || title.y < layout.frame.y || title.y - title.size > layout.frame.y + layout.frame.height).toBe(true);
            }
            expect(layout.texts.some((text) => text.text === 'DISTANCE')).toBe(showStats);
            const captions = layout.texts.map((text) => text.text).join(' ');
            expect(captions.includes(DEFAULT_SETTINGS.date)).toBe(showDate);
            expect(/©|OpenStreetMap|OpenMapTiles|OpenFreeMap/.test(captions)).toBe(false);
            expect(captions.includes(DEFAULT_SETTINGS.location)).toBe(true);
            if (size.id === 'story') {
              expect(layout.map.y).toBeGreaterThanOrEqual(200);
              expect(layout.frame?.y ?? layout.map.y).toBeGreaterThanOrEqual(190);
              expect(Math.max(...layout.texts.map((text) => text.y))).toBeLessThan(layout.height - 180);
            }
          }
        }
      }
    }
  });

  it('gives Wide a substantial map and a separate caption column with or without optional details', () => {
    for (const template of ['classic', 'gallery', 'minimal'] as TemplateId[]) {
      for (const showStats of [true, false]) {
        for (const showDate of [true, false]) {
          for (const location of [DEFAULT_SETTINGS.location, '']) {
            const layout = getPosterLayout({ ...DEFAULT_SETTINGS, outputMode: 'share', shareSize: 'wide', template, showStats, showDate, location });
            expect(layout.map.width).toBeGreaterThan(layout.width * 0.5);
            expect(layout.map.height).toBeGreaterThan(layout.height * 0.7);
            for (const text of layout.texts) {
              expect(text.x).toBeGreaterThan(layout.map.x + layout.map.width);
              expect(text.y - text.size).toBeGreaterThan(0);
              expect(text.y).toBeLessThan(layout.height - 40);
            }
          }
        }
      }
    }
  });

  it('returns the room from hidden or empty Share details to the map', () => {
    for (const size of SHARE_SIZES) {
      const settings = { ...DEFAULT_SETTINGS, outputMode: 'share' as const, shareSize: size.id };
      const full = getPosterLayout(settings);
      const empty = getPosterLayout({ ...settings, title: '', location: '', showDate: false, showStats: false });
      expect(empty.texts).toEqual([]);
      expect(empty.rules ?? []).toHaveLength(0);
      expect(empty.map.width * empty.map.height).toBeGreaterThan(full.map.width * full.map.height);
      expect(empty.map.width).toBeGreaterThan(empty.width * 0.9);
    }
  });

  it('wraps long Share captions without losing words, Unicode, or introducing blank lines', () => {
    for (const value of ['Forty minutes beside the Thames', 'A long title to remember a very special achievement along the way', '夕暮れの冒険 🏃 along the river', '  A\n morning\t in Berlin  ']) {
      for (const limit of [21, 34, 64]) {
        const lines = wrapShareText(value, limit, 3);
        expect(lines.join(' ')).toBe(value.replace(/\s+/g, ' ').trim());
        expect(lines.length).toBeLessThanOrEqual(3);
        expect(lines.every((line) => line.trim().length > 0)).toBe(true);
      }
    }
    expect(wrapShareText(' \n\t ', 34)).toEqual([]);
  });
});

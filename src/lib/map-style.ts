import type { Map, StyleSpecification } from 'maplibre-gl';
import type { AllPaintProperties } from '@maplibre/maplibre-gl-style-spec';
import type { GpxTrack, PosterSettings } from './types';

export function crossesDateline(track: GpxTrack) {
  return track.bounds[1][0] > 180;
}

function unwrappedLongitude(longitude: number, track: GpxTrack) {
  const west = track.bounds[0][0];
  while (longitude < west) longitude += 360;
  while (longitude >= west + 360) longitude -= 360;
  return longitude;
}

function blend(color: string, other: string, amount: number) {
  const first = color.replace('#', '');
  const second = other.replace('#', '');
  const channels = [0, 2, 4].map((index) => Math.round(
    parseInt(first.slice(index, index + 2), 16) * (1 - amount)
    + parseInt(second.slice(index, index + 2), 16) * amount,
  ));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function routeFeatures(track: GpxTrack) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'MultiLineString' as const,
      coordinates: track.segments.filter((segment) => segment.length > 1)
        .map((segment) => segment.map((point) => [unwrappedLongitude(point.lon, track), point.lat])),
    },
  };
}

export function markerFeatures(track: GpxTrack) {
  const first = track.segments.find((segment) => segment.length)?.[0];
  const lastSegment = [...track.segments].reverse().find((segment) => segment.length);
  const last = lastSegment?.[lastSegment.length - 1];
  return {
    type: 'FeatureCollection' as const,
    features: [first, last].filter((point) => !!point).map((point, index) => ({
      type: 'Feature' as const,
      properties: { role: index === 0 ? 'start' : 'finish' },
      geometry: { type: 'Point' as const, coordinates: [unwrappedLongitude(point!.lon, track), point!.lat] },
    })),
  };
}

/** An intentionally quiet basemap; all colors belong to the poster palette. */
export function createMapStyle(track: GpxTrack, settings: PosterSettings, scale = 1): StyleSpecification {
  const { colors } = settings;
  const zoomOffset = Math.log2(scale);
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      basemap: {
        type: 'vector', url: 'https://tiles.openfreemap.org/planet',
        attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> · © <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      },
      route: { type: 'geojson', data: routeFeatures(track), tolerance: 0, maxzoom: 24 },
      endpoints: { type: 'geojson', data: markerFeatures(track) },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': colors.land } },
      { id: 'landcover', type: 'fill', source: 'basemap', 'source-layer': 'landcover', paint: { 'fill-color': blend(colors.land, colors.text, 0.09), 'fill-opacity': 0.65 } },
      { id: 'parks', type: 'fill', source: 'basemap', 'source-layer': 'park', paint: { 'fill-color': blend(colors.land, colors.text, 0.12), 'fill-opacity': 0.7 } },
      { id: 'landuse', type: 'fill', source: 'basemap', 'source-layer': 'landuse', filter: ['match', ['get', 'class'], ['cemetery', 'grass', 'wood'], true, false], paint: { 'fill-color': blend(colors.land, colors.text, 0.11), 'fill-opacity': 0.6 } },
      { id: 'water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': colors.water } },
      { id: 'waterways', type: 'line', source: 'basemap', 'source-layer': 'waterway', paint: { 'line-color': colors.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 10 + zoomOffset, scale * 0.5, 16 + zoomOffset, scale * 4] } },
      { id: 'buildings', type: 'fill', source: 'basemap', 'source-layer': 'building', minzoom: 13 + zoomOffset, paint: { 'fill-color': blend(colors.land, colors.text, 0.13), 'fill-opacity': 0.5 } },
      { id: 'roads', type: 'line', source: 'basemap', 'source-layer': 'transportation', filter: ['!=', ['get', 'class'], 'rail'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colors.roads, 'line-width': ['interpolate', ['linear'], ['zoom'], 10 + zoomOffset, scale * 0.6, 13 + zoomOffset, scale * 1.4, 17 + zoomOffset, scale * 8] } },
      { id: 'rail', type: 'line', source: 'basemap', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': colors.roads, 'line-opacity': 0.55, 'line-dasharray': [2, 2], 'line-width': scale } },
      { id: 'place-labels', type: 'symbol', source: 'basemap', 'source-layer': 'place', layout: { visibility: settings.showMapLabels ? 'visible' : 'none', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 20 * scale, 'text-max-width': 8 }, paint: { 'text-color': colors.text, 'text-halo-color': colors.land, 'text-halo-width': 2 * scale, 'text-opacity': 0.78 } },
      { id: 'road-labels', type: 'symbol', source: 'basemap', 'source-layer': 'transportation_name', minzoom: 14 + zoomOffset, layout: { visibility: settings.showMapLabels ? 'visible' : 'none', 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 15 * scale }, paint: { 'text-color': colors.text, 'text-halo-color': colors.land, 'text-halo-width': 2 * scale, 'text-opacity': 0.6 } },
      { id: 'route-halo', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colors.background, 'line-opacity': 0.82, 'line-width': (settings.routeWidth * 2 + 3) * scale } },
      { id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colors.route, 'line-width': settings.routeWidth * 2 * scale } },
      { id: 'route-markers', type: 'circle', source: 'endpoints', layout: { visibility: settings.showMarkers ? 'visible' : 'none' }, paint: { 'circle-radius': (settings.routeWidth + 3) * scale, 'circle-color': ['match', ['get', 'role'], 'start', colors.background, colors.route], 'circle-stroke-color': colors.route, 'circle-stroke-width': 2 * scale } },
    ],
  };
}

export function updateMapStyle(map: Map, settings: PosterSettings, scale = 1) {
  if (!map.getLayer('route-line')) return;
  const { colors } = settings;
  const zoomOffset = Math.log2(scale);
  const paint = <K extends keyof AllPaintProperties>(id: string, property: K, value: AllPaintProperties[K]) => {
    if (map.getLayer(id)) map.setPaintProperty(id, property, value);
  };
  paint('land', 'background-color', colors.land);
  paint('landcover', 'fill-color', blend(colors.land, colors.text, 0.09));
  paint('parks', 'fill-color', blend(colors.land, colors.text, 0.12));
  paint('landuse', 'fill-color', blend(colors.land, colors.text, 0.11));
  paint('buildings', 'fill-color', blend(colors.land, colors.text, 0.13));
  paint('water', 'fill-color', colors.water);
  paint('waterways', 'line-color', colors.water);
  paint('waterways', 'line-width', ['interpolate', ['linear'], ['zoom'], 10 + zoomOffset, scale * 0.5, 16 + zoomOffset, scale * 4]);
  paint('roads', 'line-color', colors.roads);
  paint('roads', 'line-width', ['interpolate', ['linear'], ['zoom'], 10 + zoomOffset, scale * 0.6, 13 + zoomOffset, scale * 1.4, 17 + zoomOffset, scale * 8]);
  map.setLayerZoomRange('buildings', Math.max(0, 13 + zoomOffset), 24);
  map.setLayerZoomRange('road-labels', Math.max(0, 14 + zoomOffset), 24);
  paint('rail', 'line-color', colors.roads);
  paint('rail', 'line-width', scale);
  for (const id of ['place-labels', 'road-labels']) {
    map.setLayoutProperty(id, 'visibility', settings.showMapLabels ? 'visible' : 'none');
    map.setLayoutProperty(id, 'text-size', (id === 'place-labels' ? 20 : 15) * scale);
    paint(id, 'text-color', colors.text);
    paint(id, 'text-halo-color', colors.land);
    paint(id, 'text-halo-width', 2 * scale);
  }
  paint('route-halo', 'line-color', colors.background);
  paint('route-halo', 'line-width', (settings.routeWidth * 2 + 3) * scale);
  paint('route-line', 'line-color', colors.route);
  paint('route-line', 'line-width', settings.routeWidth * 2 * scale);
  map.setLayoutProperty('route-markers', 'visibility', settings.showMarkers ? 'visible' : 'none');
  paint('route-markers', 'circle-radius', (settings.routeWidth + 3) * scale);
  paint('route-markers', 'circle-color', ['match', ['get', 'role'], 'start', colors.background, colors.route]);
  paint('route-markers', 'circle-stroke-color', colors.route);
  paint('route-markers', 'circle-stroke-width', 2 * scale);
}

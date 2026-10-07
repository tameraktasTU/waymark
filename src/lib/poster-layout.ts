import { posterDimensions } from './presets';
import type { PosterSettings } from './types';

export interface PosterText {
  text: string;
  x: number;
  y: number;
  size: number;
  weight: 400 | 600;
  maxWidth: number;
  opacity: number;
  align?: 'left' | 'center';
}

export interface PosterRule {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity?: number;
}

export interface PosterLayout {
  width: number;
  height: number;
  map: { x: number; y: number; width: number; height: number };
  frame?: { x: number; y: number; width: number; height: number };
  texts: PosterText[];
  rules?: PosterRule[];
}

type TextMeasure = (value: string, size: number, weight: number) => number;

function estimatedTextWidth(value: string, size: number) {
  return [...value].length * size * 0.52;
}

export function measurePosterText(context: CanvasRenderingContext2D | null): TextMeasure {
  return (value, size, weight) => {
    if (!context) return estimatedTextWidth(value, size);
    context.font = `${weight} ${size}px Outfit, sans-serif`;
    return context.measureText(value).width;
  };
}

function sharedLineSize(lines: string[], size: number, maxWidth: number, weight: number, measure: TextMeasure) {
  return Math.min(size, ...lines.map((line) => size * maxWidth / Math.max(measure(line, size, weight), 1)));
}

export function getPosterLayout(settings: PosterSettings, measure: TextMeasure = estimatedTextWidth): PosterLayout {
  if (settings.outputMode === 'share') return getShareLayout(settings, measure);
  const dimensions = posterDimensions(settings);
  const width = 1000;
  const height = width * dimensions.height / dimensions.width;
  const landscape = settings.orientation === 'landscape';
  const inset = settings.template === 'gallery' ? 85 : 46;
  const mapHeight = height * (settings.template === 'gallery'
    ? (landscape ? 0.57 : 0.65)
    : settings.template === 'minimal' ? (landscape ? 0.68 : 0.79) : (landscape ? 0.62 : 0.74));
  const map = { x: inset, y: inset, width: width - inset * 2, height: mapHeight - inset };
  const frame = settings.template === 'gallery'
    ? { x: 58, y: 58, width: width - 116, height: map.height + 54 }
    : undefined;
  const captionTop = frame ? frame.y + frame.height : map.y + map.height;
  const captionInset = 24;
  const availableHeight = height - captionTop - captionInset - 32;
  const textWidth = width - inset * 2;
  const texts: PosterText[] = [];
  const add = (text: string, x: number, y: number, size: number, weight: 400 | 600 = 400, maxWidth = textWidth, opacity = 1) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean) texts.push({ text: clean, x, y, size, weight, maxWidth, opacity });
  };
  const titleLines = wrapShareText(settings.title, 32);
  const metadataLines = getMetadataLines(settings, 58);
  const headingSize = settings.template === 'gallery' ? 60 : settings.template === 'minimal' ? 50 : 56;
  const titleSize = sharedLineSize(titleLines, landscape ? headingSize * 0.78 : headingSize, textWidth, 600, measure);
  const metadataSize = sharedLineSize(metadataLines, landscape ? 25 : 28, textWidth, 400, measure);
  const valueSize = landscape ? 36 : 40;
  const labelSize = landscape ? 18 : 20;
  const titleHeight = titleLines.length ? titleSize * (1 + (titleLines.length - 1) * 1.12) : 0;
  const metadataHeight = metadataLines.length ? metadataSize * (1 + (metadataLines.length - 1) * 1.2) : 0;
  const metadataGap = titleHeight && metadataHeight ? 10 : 0;
  const statsGap = settings.showStats && (titleHeight || metadataHeight) ? (landscape ? 24 : 28) : 0;
  const statsHeight = settings.showStats ? valueSize + 8 + labelSize : 0;
  const contentHeight = titleHeight + metadataGap + metadataHeight + statsGap + statsHeight;
  // Scale the whole caption together only when long copy must fit a short
  // landscape print. Ordinary captions keep the larger, readable type sizes.
  const scale = Math.min(1, availableHeight / (contentHeight + 8));
  const leadingSpace = Math.min(24, (availableHeight - (contentHeight + 8) * scale) / 2);
  let cursor = captionTop + captionInset + leadingSpace;
  titleLines.forEach((line, index) => add(line, width / 2, cursor + titleSize * (1 + index * 1.12) * scale, titleSize * scale, 600));
  cursor += (titleHeight + metadataGap) * scale;
  metadataLines.forEach((line, index) => add(line, width / 2, cursor + metadataSize * (1 + index * 1.2) * scale, metadataSize * scale, 400, textWidth, 0.8));
  cursor += (metadataHeight + statsGap) * scale;
  if (settings.showStats) {
    const stats = [
      { value: settings.distance || '—', label: 'DISTANCE' },
      { value: settings.duration || '—', label: 'DURATION' },
      { value: settings.pace || '—', label: settings.paceLabel.toUpperCase() },
    ];
    stats.forEach((stat, index) => {
      const columnWidth = textWidth / 3;
      const x = inset + columnWidth * (index + 0.5);
      add(stat.value, x, cursor + valueSize * scale, valueSize * scale, 600, columnWidth - 24);
      add(stat.label, x, cursor + (valueSize + 8 + labelSize) * scale, labelSize * scale, 400, columnWidth - 24, 0.74);
    });
  }
  return {
    width, height, map, texts, frame,
  };
}

function cleanText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

/** Balance long headings across a few lines instead of shrinking one long line. */
export function wrapShareText(text: string, charactersPerLine: number, maxLines = 2): string[] {
  const clean = cleanText(text);
  if (!clean) return [];
  const words = clean.split(' ');
  const lineCount = Math.min(maxLines, Math.ceil(clean.length / charactersPerLine), words.length);
  if (lineCount <= 1) return [clean];
  const lines: string[] = [];
  let remaining = words;
  while (lines.length < lineCount - 1) {
    const target = remaining.join(' ').length / (lineCount - lines.length);
    let length = 0;
    let count = 0;
    const maxWords = remaining.length - (lineCount - lines.length - 1);
    while (count < maxWords) {
      const nextLength = length + (count ? 1 : 0) + remaining[count].length;
      if (count > 0 && Math.abs(length - target) <= Math.abs(nextLength - target)) break;
      length = nextLength;
      count++;
    }
    lines.push(remaining.slice(0, count).join(' '));
    remaining = remaining.slice(count);
  }
  lines.push(remaining.join(' '));
  return lines;
}

function getMetadataLines(settings: PosterSettings, charactersPerLine: number, maxLines = 2) {
  const location = cleanText(settings.location);
  const date = settings.showDate ? cleanText(settings.date) : '';
  if (location && date) {
    const combined = `${location} · ${date}`;
    return combined.length <= charactersPerLine
      ? [combined]
      : [...wrapShareText(location, charactersPerLine, maxLines - 1), ...wrapShareText(date, charactersPerLine)];
  }
  return wrapShareText(location || date, charactersPerLine, maxLines);
}

function shareStats(settings: PosterSettings) {
  return [
    { value: settings.distance || '—', label: 'DISTANCE' },
    { value: settings.duration || '—', label: 'DURATION' },
    { value: settings.pace || '—', label: settings.paceLabel.toUpperCase() },
  ];
}

function getShareLayout(settings: PosterSettings, measure: TextMeasure): PosterLayout {
  const dimensions = posterDimensions(settings);
  if (dimensions.width > dimensions.height) return getWideShareLayout(settings, measure);
  const width = 1000;
  const height = width * dimensions.height / dimensions.width;
  const story = settings.shareSize === 'story';
  const gallery = settings.template === 'gallery';
  const inset = gallery ? 60 : 40;
  const frameInset = gallery ? 16 : 0;
  // Headings and statistics remain clear of Story controls; the map takes the
  // remaining space, including space released by hidden or empty details.
  const top = story ? 176 : inset;
  const bottom = height - (story ? 188 : inset);
  const textWidth = width - inset * 2;
  const texts: PosterText[] = [];
  const rules: PosterRule[] = [];
  const add = (text: string, x: number, y: number, size: number, weight: 400 | 600 = 400, maxWidth = textWidth, opacity = 1, align: PosterText['align'] = 'left') => {
    const clean = cleanText(text);
    if (clean) texts.push({ text: clean, x, y, size, weight, maxWidth, opacity, align });
  };

  const titleLines = wrapShareText(settings.title, 34);
  const metadataLines = getMetadataLines(settings, 64);
  const titleSize = sharedLineSize(titleLines, settings.template === 'minimal' ? 48 : 52, textWidth, 600, measure);
  const metadataSize = sharedLineSize(metadataLines, 26, textWidth, 400, measure);
  let headerBottom = top;
  titleLines.forEach((line, index) => {
    const y = top + titleSize + index * titleSize * 1.14;
    add(line, inset, y, titleSize, 600);
    headerBottom = y + 8;
  });
  if (metadataLines.length) {
    const metadataTop = headerBottom + (titleLines.length ? 4 : 0);
    metadataLines.forEach((line, index) => {
      const y = metadataTop + metadataSize + index * metadataSize * 1.2;
      add(line, inset, y, metadataSize, 400, textWidth, 0.72);
      headerBottom = y + 6;
    });
  }

  const mapBottom = settings.showStats ? bottom - 138 - frameInset : bottom - 36 - frameInset;
  const mapTop = headerBottom + (titleLines.length || metadataLines.length ? 26 + frameInset : frameInset);
  const map = { x: inset, y: mapTop, width: textWidth, height: mapBottom - mapTop };
  if (settings.showStats) {
    const ruleY = bottom - 110;
    rules.push({ x1: inset, y1: ruleY, x2: width - inset, y2: ruleY });
    const columnWidth = textWidth / 3;
    shareStats(settings).forEach((stat, index) => {
      const x = inset + columnWidth * (index + 0.5);
      add(stat.value, x, bottom - 58, 42, 600, columnWidth - 28, 1, 'center');
      add(stat.label, x, bottom - 28, 22, 400, columnWidth - 28, 0.6, 'center');
      if (index < 2) {
        const dividerX = inset + columnWidth * (index + 1);
        rules.push({ x1: dividerX, y1: bottom - 82, x2: dividerX, y2: bottom - 24, opacity: 0.13 });
      }
    });
  }
  return {
    width, height, map, texts, rules,
    frame: gallery ? { x: inset - frameInset, y: mapTop - frameInset, width: map.width + frameInset * 2, height: map.height + frameInset * 2 } : undefined,
  };
}

function getWideShareLayout(settings: PosterSettings, measure: TextMeasure): PosterLayout {
  const dimensions = posterDimensions(settings);
  const width = 1000;
  const height = width * dimensions.height / dimensions.width;
  const gallery = settings.template === 'gallery';
  const inset = gallery ? 48 : 32;
  const captionX = 640;
  const captionWidth = width - captionX - 32;
  const titleLines = wrapShareText(settings.title, 21, 3);
  const metadataLines = getMetadataLines(settings, 30, 3);
  const titleSize = sharedLineSize(titleLines, settings.template === 'minimal' ? 36 : 40, captionWidth, 600, measure);
  const metadataSize = sharedLineSize(metadataLines, 22, captionWidth, 400, measure);
  const hasCaptions = titleLines.length > 0 || metadataLines.length > 0 || settings.showStats;
  const map = { x: inset, y: inset, width: hasCaptions ? 604 - inset : width - inset * 2, height: height - inset * 2 - 24 };
  const titleLeading = titleSize * 1.15;
  const metadataLeading = metadataSize * 1.22;
  const titleHeight = titleLines.length ? titleSize + (titleLines.length - 1) * titleLeading : 0;
  const metadataHeight = metadataLines.length ? metadataSize + (metadataLines.length - 1) * metadataLeading : 0;
  const metadataGap = titleLines.length && metadataLines.length ? 12 : 0;
  const statsHeight = settings.showStats ? 190 : 0;
  const statsGap = statsHeight && (titleHeight || metadataHeight) ? 26 : 0;
  const contentHeight = titleHeight + metadataGap + metadataHeight + statsGap + statsHeight;
  let cursor = Math.max(inset, (map.height - contentHeight) / 2 + map.y);
  const texts: PosterText[] = [];
  const rules: PosterRule[] = [];
  const add = (text: string, x: number, y: number, size: number, weight: 400 | 600 = 400, maxWidth = captionWidth, opacity = 1, align: PosterText['align'] = 'left') => {
    const clean = cleanText(text);
    if (clean) texts.push({ text: clean, x, y, size, weight, maxWidth, opacity, align });
  };
  titleLines.forEach((line, index) => add(line, captionX, cursor + titleSize + index * titleLeading, titleSize, 600));
  cursor += titleHeight + metadataGap;
  metadataLines.forEach((line, index) => add(line, captionX, cursor + metadataSize + index * metadataLeading, metadataSize, 400, captionWidth, 0.72));
  cursor += metadataHeight + statsGap;
  if (settings.showStats) {
    if (titleHeight || metadataHeight) rules.push({ x1: captionX, y1: cursor - 12, x2: captionX + captionWidth, y2: cursor - 12 });
    shareStats(settings).forEach((stat, index) => {
      add(stat.value, captionX, cursor + 34 + index * 64, 34, 600);
      add(stat.label, captionX, cursor + 60 + index * 64, 19, 400, captionWidth, 0.6);
    });
  }
  return {
    width, height, map, texts, rules,
    frame: gallery ? { x: inset - 16, y: inset - 16, width: map.width + 32, height: map.height + 32 } : undefined,
  };
}

export function fittedTextSize(text: PosterText, measure: (value: string, size: number, weight: number) => number) {
  const actualWidth = measure(text.text, text.size, text.weight);
  return actualWidth > text.maxWidth ? text.size * text.maxWidth / actualWidth : text.size;
}

export function browserTextSize(text: PosterText, context: CanvasRenderingContext2D | null) {
  if (!context) return text.size;
  return fittedTextSize(text, (value, size, weight) => {
    context.font = `${weight} ${size}px Outfit, sans-serif`;
    return context.measureText(value).width;
  });
}

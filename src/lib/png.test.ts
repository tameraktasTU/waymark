import { describe, expect, it } from 'vitest';
import { withPngDpi } from './png';

// A one-pixel PNG fixture. The metadata operation must preserve its IDAT bytes.
const PIXEL_PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0O8AAAAASUVORK5CYII=', 'base64'));

function chunks(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: { type: string; bytes: Uint8Array }[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const end = offset + 12 + view.getUint32(offset);
    result.push({ type: String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)), bytes: bytes.slice(offset, end) });
    offset = end;
  }
  return result;
}

describe('withPngDpi', () => {
  it('writes 300 DPI in a valid pHYs chunk immediately after IHDR', async () => {
    const png = await withPngDpi(new Blob([PIXEL_PNG]), 300);
    const result = new Uint8Array(await png.arrayBuffer());
    const parsed = chunks(result);
    expect(png.type).toBe('image/png');
    expect(Array.from(result.subarray(0, 8))).toEqual(Array.from(PIXEL_PNG.subarray(0, 8)));
    expect(parsed.map((chunk) => chunk.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    // Known CRC32 from the PNG specification's polynomial; both axes are
    // 11811 pixels/metre, unit=metre, CRC=0x78a53f76.
    expect(Array.from(parsed[1].bytes)).toEqual([0, 0, 0, 9, 112, 72, 89, 115, 0, 0, 46, 35, 0, 0, 46, 35, 1, 120, 165, 63, 118]);
    const original = chunks(PIXEL_PNG);
    expect(parsed.filter((chunk) => chunk.type !== 'pHYs')).toEqual(original);
  });

  it('replaces existing resolution without duplicates or changing pixel data', async () => {
    const original = await withPngDpi(new Blob([PIXEL_PNG]), 72);
    const result = chunks(new Uint8Array(await (await withPngDpi(original, 150)).arrayBuffer()));
    const physical = result.filter((chunk) => chunk.type === 'pHYs');
    expect(physical).toHaveLength(1);
    const view = new DataView(physical[0].bytes.buffer);
    expect(view.getUint32(8)).toBe(5906);
    expect(view.getUint32(12)).toBe(5906);
    expect(view.getUint8(16)).toBe(1);
    expect(view.getUint32(8) * 0.0254).toBeCloseTo(150, 1);
    expect(result.filter((chunk) => chunk.type !== 'pHYs')).toEqual(chunks(PIXEL_PNG));
  });

  it.each([0, -150, Number.NaN, Number.POSITIVE_INFINITY, 1e12])('rejects an invalid DPI: %s', async (dpi) => {
    await expect(withPngDpi(new Blob([PIXEL_PNG]), dpi)).rejects.toThrow(/positive DPI/);
  });

  it('rejects non-PNG, truncated chunks, and files without a complete end marker', async () => {
    await expect(withPngDpi(new Blob(['not a png']), 300)).rejects.toThrow(/valid PNG/);
    await expect(withPngDpi(new Blob([PIXEL_PNG.slice(0, 36)]), 300)).rejects.toThrow(/valid PNG/);
    await expect(withPngDpi(new Blob([PIXEL_PNG.slice(0, -12)]), 300)).rejects.toThrow(/valid PNG/);
  });
});

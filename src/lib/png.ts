const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const MALFORMED_PNG = 'The image is not a valid PNG. Try exporting your print again.';

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let remainder = index;
  for (let bit = 0; bit < 8; bit++) {
    remainder = (remainder & 1) ? 0xedb88320 ^ (remainder >>> 1) : remainder >>> 1;
  }
  return remainder >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let remainder = 0xffffffff;
  for (const byte of bytes) remainder = CRC_TABLE[(remainder ^ byte) & 0xff] ^ (remainder >>> 8);
  return (remainder ^ 0xffffffff) >>> 0;
}

function physicalSizeChunk(dpi: number): Uint8Array<ArrayBuffer> {
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  if (!Number.isFinite(dpi) || dpi <= 0 || pixelsPerMeter < 1 || pixelsPerMeter > 0xffffffff) {
    throw new Error('Choose a valid positive DPI value for your print.');
  }
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9); // pHYs contains two 32-bit values and a unit byte.
  chunk.set([112, 72, 89, 115], 4); // pHYs
  view.setUint32(8, pixelsPerMeter);
  view.setUint32(12, pixelsPerMeter);
  chunk[16] = 1; // Pixels per metre, rather than an unspecified aspect ratio.
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  return chunk;
}

/** Add physical print resolution without re-encoding or changing any pixels. */
export async function withPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  const physicalSize = physicalSizeChunk(dpi);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < 33 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw new Error(MALFORMED_PNG);
  }
  const view = new DataView(bytes.buffer);
  const parts: BlobPart[] = [bytes.subarray(0, 8)];
  let offset = 8;
  let sawHeader = false;
  let pixelBytes = 0;
  let sawEnd = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error(MALFORMED_PNG);
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (length > 0x7fffffff || end > bytes.length) throw new Error(MALFORMED_PNG);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error(MALFORMED_PNG);
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13 || view.getUint32(offset + 8) === 0 || view.getUint32(offset + 12) === 0) {
        throw new Error(MALFORMED_PNG);
      }
      sawHeader = true;
      parts.push(bytes.subarray(offset, end), physicalSize);
    } else {
      if (type === 'IHDR') throw new Error(MALFORMED_PNG);
      if (type !== 'pHYs') parts.push(bytes.subarray(offset, end));
    }
    if (type === 'IDAT') pixelBytes += length;
    if (type === 'IEND') {
      if (length !== 0 || end !== bytes.length || !pixelBytes) throw new Error(MALFORMED_PNG);
      sawEnd = true;
    }
    offset = end;
  }
  if (!sawEnd) throw new Error(MALFORMED_PNG);
  return new Blob(parts, { type: 'image/png' });
}

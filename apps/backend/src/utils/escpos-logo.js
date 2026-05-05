import { PNG } from "pngjs";

/**
 * Converts a base64 data URL (PNG or JPEG) to ESC/POS GS v 0 raster bytes.
 * maxDots: target print width in dots (384 for 58mm @ 8dpi, 576 for 80mm).
 */
export const buildEscPosLogoBytes = async (dataUrl, maxDots = 384) => {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return [];

  const base64 = dataUrl.replace(/^data:image\/[^;]+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");

  // Decode PNG (JPEG support requires converting to PNG first — skip JPEG for now)
  const png = await new Promise((resolve, reject) => {
    const p = new PNG({ filterType: 4 });
    p.parse(buffer, (err, data) => (err ? reject(err) : resolve(data)));
  });

  const srcW = png.width;
  const srcH = png.height;

  // Scale to fit maxDots width
  const scale  = Math.min(1, maxDots / srcW);
  const dstW   = Math.max(1, Math.round(srcW * scale));
  const dstH   = Math.max(1, Math.round(srcH * scale));

  // Nearest-neighbor downsample + threshold to 1-bit
  const rowBytes = Math.ceil(dstW / 8);
  const bits     = new Uint8Array(rowBytes * dstH);

  for (let dy = 0; dy < dstH; dy++) {
    const sy = Math.floor(dy / scale);
    for (let dx = 0; dx < dstW; dx++) {
      const sx  = Math.floor(dx / scale);
      const idx = (sy * srcW + sx) * 4;
      const r   = png.data[idx];
      const g   = png.data[idx + 1];
      const b   = png.data[idx + 2];
      const a   = png.data[idx + 3];
      // Luminance — treat transparent as white
      const lum = a < 128 ? 255 : Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      if (lum < 128) {
        // Black pixel — set bit (ESC/POS: MSB first, 1 = black)
        const byteIdx = dy * rowBytes + Math.floor(dx / 8);
        bits[byteIdx] |= 0x80 >> (dx % 8);
      }
    }
  }

  // GS v 0 header: xL xH = rowBytes & 0xFF, rowBytes >> 8; yL yH = dstH & 0xFF, dstH >> 8
  const bytes = [
    0x1d, 0x76, 0x30, 0x00,          // GS v 0 m=0 (normal)
    rowBytes & 0xff, rowBytes >> 8,   // xL, xH
    dstH & 0xff,     dstH >> 8,       // yL, yH
    ...bits,
  ];

  return bytes;
};

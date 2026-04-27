/** Utilities for processing signature images:
 *  - Remove white/light background → transparent
 *  - Auto-crop empty borders
 *  - Return a clean PNG Blob ready for storage
 */

export type ProcessOptions = {
  /** Pixels with brightness >= this become transparent. 0–255. */
  whiteThreshold?: number;
  /** Trim padding (px) added around the content bounding box. */
  padding?: number;
  /** Max output dimension (px). Keeps aspect ratio. */
  maxSize?: number;
};

const DEFAULTS: Required<ProcessOptions> = {
  whiteThreshold: 235,
  padding: 8,
  maxSize: 800,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export async function processSignatureFile(
  file: File | Blob,
  opts: ProcessOptions = {}
): Promise<Blob> {
  const o = { ...DEFAULTS, ...opts };
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;

  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;

  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const brightness = (r + g + b) / 3;
      if (brightness >= o.whiteThreshold) {
        // Background → transparent
        px[i + 3] = 0;
      } else {
        // Soft alpha for anti-aliased edges
        const alpha = Math.round(255 * (1 - brightness / o.whiteThreshold));
        px[i + 3] = Math.max(alpha, 200);
        // Track bounding box of opaque ink
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  ctx.putImageData(data, 0, 0);

  if (maxX < 0) {
    // Nothing detected — return original as PNG
    return new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
  }

  // Crop with padding
  const pad = o.padding;
  const cx = Math.max(0, minX - pad);
  const cy = Math.max(0, minY - pad);
  const cw = Math.min(c.width - cx, maxX - minX + 1 + pad * 2);
  const ch = Math.min(c.height - cy, maxY - minY + 1 + pad * 2);

  // Optional downscale to maxSize
  let outW = cw, outH = ch;
  if (Math.max(cw, ch) > o.maxSize) {
    const scale = o.maxSize / Math.max(cw, ch);
    outW = Math.round(cw * scale);
    outH = Math.round(ch * scale);
  }

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(c, cx, cy, cw, ch, 0, 0, outW, outH);

  return new Promise<Blob>((res) => out.toBlob((b) => res(b!), "image/png"));
}

/**
 * Process a STAMP image:
 *  - Removes white / near-white background → fully transparent
 *  - PRESERVES original color of stamp ink (blue / red / black)
 *  - Auto-crops to content with padding
 *  - Always returns a transparent PNG (never JPG)
 *  - Uses alpha-enabled canvas; never fills with black/white
 */
export async function processStampFile(
  file: File | Blob,
  opts: ProcessOptions = {}
): Promise<Blob> {
  const o = { ...DEFAULTS, ...opts, whiteThreshold: opts.whiteThreshold ?? 230 };
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

  // alpha:true is the default but we set it explicitly to be safe.
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { alpha: true, willReadFrequently: true })!;
  // Do NOT fill background — keep canvas fully transparent.
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const T = o.whiteThreshold;

  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;

  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      // Distance from white. min channel is the chroma/darkness signal that
      // works well for colored stamps (blue/red/black) on white paper.
      const minCh = Math.min(r, g, b);
      const maxCh = Math.max(r, g, b);
      const sat = maxCh - minCh; // chromatic content

      if (minCh >= T && sat < 25) {
        // Near-white & near-grey → background, fully transparent
        px[i + 3] = 0;
      } else {
        // Keep original COLOR; just compute alpha from how far from white it is
        const distance = 255 - minCh; // larger = darker / more ink
        const alpha = Math.min(255, Math.max(180, distance + sat));
        px[i + 3] = alpha;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  ctx.putImageData(data, 0, 0);

  if (maxX < 0) {
    return new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
  }

  const pad = o.padding;
  const cx = Math.max(0, minX - pad);
  const cy = Math.max(0, minY - pad);
  const cw = Math.min(c.width - cx, maxX - minX + 1 + pad * 2);
  const ch = Math.min(c.height - cy, maxY - minY + 1 + pad * 2);

  let outW = cw, outH = ch;
  if (Math.max(cw, ch) > o.maxSize) {
    const scale = o.maxSize / Math.max(cw, ch);
    outW = Math.round(cw * scale);
    outH = Math.round(ch * scale);
  }

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d", { alpha: true })!;
  octx.clearRect(0, 0, outW, outH); // guarantee transparent background
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(c, cx, cy, cw, ch, 0, 0, outW, outH);

  // ALWAYS PNG — never JPG (JPG has no alpha channel)
  return new Promise<Blob>((res) => out.toBlob((b) => res(b!), "image/png"));
}

/** Convert a canvas drawing (already transparent bg) to a cropped, padded PNG. */
export async function processCanvasDataUrl(dataUrl: string, opts: ProcessOptions = {}): Promise<Blob> {
  const o = { ...DEFAULTS, ...opts };
  const img = await loadImage(dataUrl);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;

  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    return new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
  }
  const pad = o.padding;
  const cx = Math.max(0, minX - pad);
  const cy = Math.max(0, minY - pad);
  const cw = Math.min(c.width - cx, maxX - minX + 1 + pad * 2);
  const ch = Math.min(c.height - cy, maxY - minY + 1 + pad * 2);

  let outW = cw, outH = ch;
  if (Math.max(cw, ch) > o.maxSize) {
    const s = o.maxSize / Math.max(cw, ch);
    outW = Math.round(cw * s); outH = Math.round(ch * s);
  }
  const out = document.createElement("canvas");
  out.width = outW; out.height = outH;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = "high";
  octx.drawImage(c, cx, cy, cw, ch, 0, 0, outW, outH);
  return new Promise<Blob>((res) => out.toBlob((b) => res(b!), "image/png"));
}

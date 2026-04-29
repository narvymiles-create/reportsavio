const base64Cache = new Map<string, Promise<string | null>>();

export function toBase64(url: string): Promise<string> {
  if (url.startsWith("data:")) return Promise.resolve(url);

  return fetch(url, { cache: "force-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`Image failed to load (${res.status})`);
      return res.blob();
    })
    .then((blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Image conversion failed"));
      reader.readAsDataURL(blob);
    }));
}

async function decodeImage(src: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

export async function preloadImageAsBase64(url?: string | null): Promise<string | null> {
  if (!url) return null;

  let pending = base64Cache.get(url);
  if (!pending) {
    pending = toBase64(url)
      .then(async (dataUrl) => {
        await decodeImage(dataUrl);
        return dataUrl;
      })
      .catch((error) => {
        console.warn("[reportAssets] image preload failed", error);
        return null;
      });
    base64Cache.set(url, pending);
  }

  return pending;
}

export async function waitForImagesAndFonts(root?: ParentNode | null): Promise<void> {
  await document.fonts?.ready.catch(() => undefined);

  const scope = root ?? document;
  const images = Array.from(scope.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(images.map((img) => {
    if (img.complete && img.naturalWidth > 0) {
      return img.decode?.().catch(() => undefined) ?? Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    });
  }));

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
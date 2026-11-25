/**
 * Image helpers. Everything runs in the browser: preparing a provider
 * reference downscales locally, so a full-resolution photograph is never sent
 * anywhere unless the user explicitly generates from it.
 */

export async function prepareReferenceDataUrl(url: string, maxSide = 1280): Promise<{ dataUrl: string; width: number; height: number }> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Could not read the reference photograph.");
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not prepare the reference image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), width, height };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

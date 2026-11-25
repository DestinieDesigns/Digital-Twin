/**
 * Private file handling.
 * Every upload is validated by magic bytes (never by the client-supplied
 * content type), renamed with a random id, and stored outside any static root.
 * Files are only ever returned through an API route that looks the id up in
 * the database, so a crafted filename cannot escape the data directory.
 */
import { randomUUID } from "node:crypto";
import { writeFile, unlink, stat } from "node:fs/promises";
import { join } from "node:path";

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 80 * 1024 * 1024;
export const MAX_MODEL_BYTES = 250 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 400 * 1024 * 1024;

export interface SniffResult {
  kind: "image" | "audio" | "video" | "model" | "unknown";
  mime: string;
  format: string;
}

const IMAGE_SIGNATURES: { mime: string; format: string; test: (b: Uint8Array) => boolean }[] = [
  {
    mime: "image/jpeg",
    format: "jpeg",
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/png",
    format: "png",
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: "image/webp",
    format: "webp",
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  {
    mime: "image/gif",
    format: "gif",
    test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  },
];

const AUDIO_SIGNATURES: { mime: string; format: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: "audio/mpeg", format: "mp3", test: (b) => (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  {
    mime: "audio/wav",
    format: "wav",
    test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45,
  },
  { mime: "audio/mp4", format: "m4a", test: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
  { mime: "audio/ogg", format: "ogg", test: (b) => b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53 },
  { mime: "audio/flac", format: "flac", test: (b) => b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43 },
  { mime: "audio/webm", format: "weba", test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
];

export function sniff(bytes: Uint8Array): SniffResult {
  for (const sig of IMAGE_SIGNATURES) {
    if (bytes.length > 12 && sig.test(bytes)) return { kind: "image", mime: sig.mime, format: sig.format };
  }
  for (const sig of AUDIO_SIGNATURES) {
    if (bytes.length > 12 && sig.test(bytes)) return { kind: "audio", mime: sig.mime, format: sig.format };
  }
  if (bytes.length > 12 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) {
    return { kind: "model", mime: "model/gltf-binary", format: "glb" };
  }
  // FBX binary or OBJ / glTF JSON text
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 64));
  if (head.startsWith("Kaydara FBX Binary")) return { kind: "model", mime: "application/octet-stream", format: "fbx" };
  if (head.trimStart().startsWith("{") && head.includes("asset")) {
    return { kind: "model", mime: "model/gltf+json", format: "gltf" };
  }
  if (/^\s*(#.*\n)?\s*(v|o|mtllib|usemtl|g)\s/m.test(head) || /^\s*(v|o)\s/m.test(head)) {
    return { kind: "model", mime: "text/plain", format: "obj" };
  }
  return { kind: "unknown", mime: "application/octet-stream", format: "unknown" };
}

/* ------------------------------------------------------------------ */
/* Training media (video + audio)                                     */
/* ------------------------------------------------------------------ */

/**
 * Video containers and audio formats for the training library. MP4/MOV are
 * identified by their ISO-BMFF brand rather than the client's content type, so
 * an audio-only M4A is never mistaken for a video and vice versa.
 */
export function sniffMedia(bytes: Uint8Array): SniffResult {
  const ftyp = bytes.length > 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  if (ftyp) {
    const brand = new TextDecoder().decode(bytes.slice(8, 12));
    if (brand.startsWith("qt")) return { kind: "video", mime: "video/quicktime", format: "mov" };
    if (brand.startsWith("M4A") || brand.startsWith("M4B")) return { kind: "audio", mime: "audio/mp4", format: "m4a" };
    return { kind: "video", mime: "video/mp4", format: "mp4" };
  }
  if (bytes.length > 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { kind: "video", mime: "video/webm", format: "webm" };
  }
  const audio = sniff(bytes);
  if (audio.kind === "audio") return audio;
  return { kind: "unknown", mime: "application/octet-stream", format: "unknown" };
}

/* ------------------------------------------------------------------ */
/* Dimensions — read from the file itself so the UI can show real data  */
/* ------------------------------------------------------------------ */

export function imageDimensions(bytes: Uint8Array, mime: string): { width: number | null; height: number | null } {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (mime === "image/png") {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (mime === "image/gif") {
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    }
    if (mime === "image/webp") {
      const chunk = new TextDecoder().decode(bytes.slice(12, 16));
      if (chunk === "VP8X") {
        const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return { width: w, height: h };
      }
      if (chunk === "VP8 ") {
        return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
      }
      if (chunk === "VP8L") {
        const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
    if (mime === "image/jpeg") {
      let offset = 2;
      while (offset < bytes.length - 9) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = bytes[offset + 1];
        const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] };
        }
        offset += 2 + length;
      }
    }
  } catch {
    /* unreadable header — leave dimensions empty rather than guessing */
  }
  return { width: null, height: null };
}

/* ------------------------------------------------------------------ */
/* Writes                                                             */
/* ------------------------------------------------------------------ */

export function safeExtension(format: string): string {
  return [
    "jpeg",
    "png",
    "webp",
    "gif",
    "mp3",
    "wav",
    "m4a",
    "ogg",
    "flac",
    "weba",
    "mp4",
    "mov",
    "webm",
    "md",
    "json",
    "csv",
    "glb",
    "gltf",
    "fbx",
    "obj",
  ].includes(format)
    ? format
    : "bin";
}

export async function writePrivateFile(dir: string, bytes: Uint8Array, extension: string) {
  const id = randomUUID();
  const path = join(dir, `${id}.${safeExtension(extension)}`);
  await writeFile(path, bytes);
  return { id, path };
}

export async function removeFile(path: string) {
  try {
    await unlink(path);
  } catch {
    /* already gone */
  }
}

export async function fileExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function normalizeOriginalName(name: string | undefined, fallback: string) {
  const cleaned = (name ?? fallback).replace(/[^\w.\- ()]/g, "_").slice(0, 160);
  return cleaned || fallback;
}

/**
 * Copies the MediaPipe vision WASM runtime into public/mediapipe-wasm so face
 * analysis runs locally with no CDN and no network access at runtime.
 * The face_landmarker.task model is versioned in public/models.
 */
import { cp, mkdir, access } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const source = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const target = join(root, "public", "mediapipe-wasm");

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(source))) {
  console.warn("[setup] @mediapipe/tasks-vision is not installed yet; skipping WASM copy.");
  process.exit(0);
}

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log("[setup] MediaPipe vision runtime ready at public/mediapipe-wasm");

if (!(await exists(join(root, "public", "models", "face_landmarker.task")))) {
  console.warn(
    "[setup] public/models/face_landmarker.task is missing. Facial measurement will fall back to manual entry.",
  );
}

/**
 * Local facial measurement.
 *
 * Uses the MediaPipe Face Landmarker (478 landmarks) with a model and WASM
 * runtime served from this project — no CDN, no API key, no photograph ever
 * leaves the browser during analysis.
 *
 * The measurements are ratios between landmarks, so they describe proportions
 * rather than guessing a face shape. Anything the landmarks cannot establish
 * (e.g. ear position when the ear is not visible, or a profile bridge line from
 * a front-only set) is left unmeasured and reported as needing a reference.
 */
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { FaceAnalysis } from "../../shared/types";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

export async function loadFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe-wasm");
      const build = (delegate: "GPU" | "CPU") =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate },
          runningMode: "IMAGE",
          numFaces: 1,
          outputFaceBlendshapes: true,
          minFaceDetectionConfidence: 0.4,
          minFacePresenceConfidence: 0.4,
        });
      try {
        return await build("GPU");
      } catch {
        return await build("CPU");
      }
    })().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

interface Vec {
  x: number;
  y: number;
}

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 3) => Number(value.toFixed(digits));

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

function srgbToLinear(channel: number) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function rgbToLab(r: number, g: number, b: number) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

export interface AnalysisOutput {
  analysis: FaceAnalysis;
  overlay: string | null;
  preview: string | null;
  metrics: { label: string; value: string; note: string }[];
}

export async function analyzeFace(image: Blob): Promise<AnalysisOutput> {
  const bitmap = await createImageBitmap(image);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser could not open a 2D canvas for analysis.");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const landmarker = await loadFaceLandmarker();
  const result = landmarker.detect(canvas);

  const preview = canvas.toDataURL("image/jpeg", 0.8);
  const base: FaceAnalysis = {
    analyzedAt: new Date().toISOString(),
    method: "MediaPipe Face Landmarker · 478 landmarks · on-device",
    landmarks: 0,
    faceDetected: false,
    measurements: {},
    skinTone: null,
    expressions: null,
    framing: null,
    warnings: [],
  };

  if (!result.faceLandmarks?.length) {
    bitmap.close?.();
    return {
      analysis: { ...base, error: "No face detected. Use a clear, evenly lit photograph with one person facing the camera." },
      overlay: null,
      preview,
      metrics: [],
    };
  }

  const normalized = result.faceLandmarks[0];
  if (normalized.length < 468) {
    bitmap.close?.();
    return {
      analysis: { ...base, error: "The face mesh was incomplete. Try a sharper, more front-facing photograph." },
      overlay: null,
      preview,
      metrics: [],
    };
  }

  const p = (index: number): Vec => ({ x: normalized[index].x * width, y: normalized[index].y * height });

  const faceHeight = dist(p(10), p(152));
  const faceWidth = dist(p(234), p(454));
  if (!faceHeight || !faceWidth) {
    bitmap.close?.();
    return {
      analysis: { ...base, error: "The face outline could not be measured. Try a straight-on photograph." },
      overlay: null,
      preview,
      metrics: [],
    };
  }

  const rightEyeInner = p(133);
  const rightEyeOuter = p(33);
  const leftEyeInner = p(362);
  const leftEyeOuter = p(263);

  const measurements: Record<string, number> = {};
  measurements.faceLengthWidth = round(faceHeight / faceWidth);
  measurements.foreheadHeight = round((dist(p(10), p(9)) / faceHeight) * 100, 1);
  measurements.upperThird = round((dist(p(10), p(9)) / faceHeight) * 100, 1);
  measurements.midThird = round((dist(p(9), p(2)) / faceHeight) * 100, 1);
  measurements.lowerThird = round((dist(p(2), p(152)) / faceHeight) * 100, 1);
  measurements.eyeSpacing = round((dist(rightEyeInner, leftEyeInner) / faceWidth) * 100, 1);
  measurements.eyeWidth = round((((dist(rightEyeOuter, rightEyeInner) + dist(leftEyeOuter, leftEyeInner)) / 2) / faceWidth) * 100, 1);
  measurements.eyeAspect = round(
    (dist(p(159), p(145)) / dist(rightEyeOuter, rightEyeInner) + dist(p(386), p(374)) / dist(leftEyeOuter, leftEyeInner)) / 2,
  );
  measurements.browEyeGap = round(((dist(p(105), p(159)) + dist(p(334), p(386))) / 2 / faceHeight) * 100, 1);
  measurements.noseWidth = round((dist(p(129), p(358)) / faceWidth) * 100, 1);
  measurements.mouthWidth = round((dist(p(61), p(291)) / faceWidth) * 100, 1);
  measurements.upperLowerLip = round(dist(p(0), p(13)) / Math.max(0.001, dist(p(14), p(17))));
  measurements.jawWidth = round((dist(p(172), p(397)) / faceWidth) * 100, 1);
  measurements.chinProjection = round((dist(p(17), p(152)) / faceHeight) * 100, 1);

  const tiltRight = (Math.atan2(-(rightEyeOuter.y - rightEyeInner.y), Math.abs(rightEyeOuter.x - rightEyeInner.x)) * 180) / Math.PI;
  const tiltLeft = (Math.atan2(-(leftEyeOuter.y - leftEyeInner.y), Math.abs(leftEyeOuter.x - leftEyeInner.x)) * 180) / Math.PI;
  measurements.canthalTilt = round((tiltRight + tiltLeft) / 2, 1);

  // Bilateral symmetry: mirrored landmark pairs relative to the midline (10 → 152).
  const pairs: [number, number][] = [
    [33, 263],
    [133, 362],
    [61, 291],
    [129, 358],
    [234, 454],
    [172, 397],
    [50, 280],
    [205, 425],
    [70, 300],
    [105, 334],
  ];
  const lineA = p(10);
  const lineB = p(152);
  const lineLength = dist(lineA, lineB) || 1;
  const perpendicular = (point: Vec) =>
    Math.abs((lineB.x - lineA.x) * (point.y - lineA.y) - (lineB.y - lineA.y) * (point.x - lineA.x)) / lineLength;
  const deviations = pairs.map(([a, b]) => Math.abs(perpendicular(p(a)) - perpendicular(p(b))) / faceWidth);
  const meanDeviation = deviations.reduce((sum, v) => sum + v, 0) / deviations.length;
  measurements.symmetry = round(clamp(100 - meanDeviation * 300, 0, 100), 1);

  /* --------------------------- framing ---------------------------- */
  const eyeMidX = (rightEyeOuter.x + leftEyeOuter.x) / 2;
  const eyeDistance = dist(rightEyeOuter, leftEyeOuter) || 1;
  const yawEstimate = (p(1).x - eyeMidX) / eyeDistance;
  const roll = (Math.atan2(leftEyeOuter.y - rightEyeOuter.y, leftEyeOuter.x - rightEyeOuter.x) * 180) / Math.PI;

  const xs = normalized.map((l) => l.x * width);
  const ys = normalized.map((l) => l.y * height);
  const bboxWidth = Math.max(...xs) - Math.min(...xs);
  const bboxHeight = Math.max(...ys) - Math.min(...ys);
  const faceAreaRatio = (bboxWidth * bboxHeight) / (width * height);

  const detail = detailScore(ctx, Math.min(...xs), Math.min(...ys), bboxWidth, bboxHeight);

  /* ----------------------------- skin ----------------------------- */
  const skinTone = sampleSkin(ctx, [p(50), p(280)], width, height);

  /* -------------------------- expressions -------------------------- */
  let expressions: Record<string, number> | null = null;
  const categories = result.faceBlendshapes?.[0]?.categories;
  if (categories?.length) {
    const wanted = ["mouthSmileLeft", "mouthSmileRight", "jawOpen", "browInnerUp", "browDownLeft", "browDownRight", "eyeBlinkLeft", "eyeBlinkRight", "cheekSquintLeft", "cheekSquintRight"];
    expressions = {};
    for (const category of categories) {
      if (wanted.includes(category.categoryName)) {
        expressions[category.categoryName] = round(category.score, 3);
      }
    }
  }

  const warnings: string[] = [];
  if (Math.abs(roll) > 8) warnings.push(`Head tilt of ${Math.abs(roll).toFixed(0)}° — proportions may be skewed.`);
  if (Math.abs(yawEstimate) > 0.18) warnings.push("The face is turned away from the camera; this is not a straight-on view.");
  if (faceAreaRatio < 0.035) warnings.push("The face occupies very little of the frame; use a closer photograph.");
  if (detail < 35) warnings.push("Low fine detail (soft focus or compression). Measure from a sharper file if possible.");

  const analysis: FaceAnalysis = {
    ...base,
    landmarks: normalized.length,
    faceDetected: true,
    measurements,
    skinTone,
    expressions,
    framing: {
      roll: round(roll, 1),
      yawEstimate: round(yawEstimate, 3),
      faceAreaRatio: round(faceAreaRatio, 3),
      sharpness: round(detail, 1),
    },
    warnings,
  };

  const overlay = renderOverlay(canvas, normalized, width, height);
  bitmap.close?.();

  const metrics = [
    { label: "Face length ÷ width", value: measurements.faceLengthWidth.toFixed(2), note: "Proportion index" },
    { label: "Vertical thirds", value: `${measurements.upperThird.toFixed(0)} / ${measurements.midThird.toFixed(0)} / ${measurements.lowerThird.toFixed(0)}`, note: "Upper / middle / lower" },
    { label: "Eye spacing", value: `${measurements.eyeSpacing.toFixed(1)}%`, note: "Of face width" },
    { label: "Nose width", value: `${measurements.noseWidth.toFixed(1)}%`, note: "Of face width" },
    { label: "Mouth width", value: `${measurements.mouthWidth.toFixed(1)}%`, note: "Of face width" },
    { label: "Jaw width", value: `${measurements.jawWidth.toFixed(1)}%`, note: "Of face width" },
    { label: "Canthal tilt", value: `${measurements.canthalTilt.toFixed(1)}°`, note: "Outer vs inner corner" },
    { label: "Symmetry", value: `${measurements.symmetry.toFixed(0)}%`, note: "Mirror agreement, estimate" },
  ];

  return { analysis, overlay, preview, metrics };
}

/* ------------------------------------------------------------------ */
/* Pixel helpers                                                       */
/* ------------------------------------------------------------------ */

function detailScore(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): number {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.max(8, Math.floor(w));
  const sh = Math.max(8, Math.floor(h));
  let data: ImageData;
  try {
    data = ctx.getImageData(sx, sy, Math.min(sw, ctx.canvas.width - sx), Math.min(sh, ctx.canvas.height - sy));
  } catch {
    return 50;
  }
  const gray = new Float32Array(data.width * data.height);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data.data[o] + 0.587 * data.data[o + 1] + 0.114 * data.data[o + 2];
  }
  // Downsample by striding so the estimate is stable across image sizes.
  const stride = Math.max(1, Math.floor(data.width / 180));
  let sum = 0;
  let count = 0;
  for (let yy = stride; yy < data.height - stride; yy += stride) {
    for (let xx = stride; xx < data.width - stride; xx += stride) {
      const idx = yy * data.width + xx;
      const lap = 4 * gray[idx] - gray[idx - stride] - gray[idx + stride] - gray[idx - data.width * stride] - gray[idx + data.width * stride];
      sum += lap * lap;
      count++;
    }
  }
  const variance = count ? sum / count : 0;
  return clamp((Math.log10(1 + variance) / 3.4) * 100, 0, 100);
}

function sampleSkin(
  ctx: CanvasRenderingContext2D,
  points: Vec[],
  width: number,
  height: number,
): FaceAnalysis["skinTone"] {
  const patch = 7;
  const samples: [number, number, number][] = [];
  for (const point of points) {
    const cx = Math.round(point.x + (point.x < width / 2 ? -width * 0.012 : width * 0.012));
    const cy = Math.round(point.y + height * 0.01);
    const x0 = clamp(cx - patch, 0, width - patch * 2);
    const y0 = clamp(cy - patch, 0, height - patch * 2);
    try {
      const data = ctx.getImageData(x0, y0, patch * 2, patch * 2).data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue;
        samples.push([data[i], data[i + 1], data[i + 2]]);
      }
    } catch {
      /* out of bounds patch — skip */
    }
  }
  if (samples.length < 24) return null;

  const avg = samples.reduce(
    (acc, [r, g, b]) => {
      acc.r += r;
      acc.g += g;
      acc.b += b;
      return acc;
    },
    { r: 0, g: 0, b: 0 },
  );
  const count = samples.length;
  const r = avg.r / count;
  const g = avg.g / count;
  const b = avg.b / count;
  const lab = rgbToLab(r, g, b);
  const ita = (Math.atan((lab.L - 50) / (lab.b || 0.0001)) * 180) / Math.PI;
  const hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  const undertone: "warm" | "cool" | "neutral" = hue >= 55 ? "warm" : hue <= 38 ? "cool" : "neutral";
  const hex = `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("")}`;

  return {
    hex,
    labL: round(lab.L, 1),
    labA: round(lab.a, 1),
    labB: round(lab.b, 1),
    ita: round(ita, 1),
    undertone,
    method: `Cheek patch average of ${count} pixels · sRGB → CIE L*a*b* · ITA° ${round(ita, 1)}`,
  };
}

function renderOverlay(canvas: HTMLCanvasElement, landmarks: { x: number; y: number }[], width: number, height: number): string {
  const overlay = document.createElement("canvas");
  overlay.width = width;
  overlay.height = height;
  const ctx = overlay.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/jpeg", 0.75);
  ctx.drawImage(canvas, 0, 0);
  ctx.fillStyle = "rgba(194, 162, 104, 0.85)";
  for (let i = 0; i < landmarks.length; i += 2) {
    const x = landmarks[i].x * width;
    const y = landmarks[i].y * height;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  ctx.strokeStyle = "rgba(194, 162, 104, 0.55)";
  ctx.lineWidth = 1.5;
  const outline = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
  ctx.beginPath();
  outline.forEach((index, i) => {
    const lm = landmarks[index];
    if (!lm) return;
    const x = lm.x * width;
    const y = lm.y * height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
  return overlay.toDataURL("image/jpeg", 0.8);
}

/**
 * Behaviour extraction from your own recordings — all on this device.
 *
 * Video: MediaPipe Face Landmarker (478 landmarks, 52 blendshapes, gaze from
 * iris landmarks) + Pose Landmarker (33 body landmarks), sampled across the
 * timeline. Audio: a local speech measurement pass.
 *
 * This produces numeric timelines and a structured report. It does not solve a
 * skeleton, retarget anything, generate speech, or train a model.
 */
import { FaceLandmarker, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type {
  DerivedAnalysis,
  FaceStats,
  FrameSample,
  MediaEvent,
  PoseStats,
  SpeechMetrics,
} from "../../shared/behavior";
import { BLEND_CHANNELS } from "../../shared/behavior";
import { analyzeSpeechFromBlob } from "./speech";

export interface MediaProbe {
  kind: "video" | "audio";
  duration: number;
  width: number | null;
  height: number | null;
}

export interface AnalysisProgress {
  stage: string;
  percent: number;
}

/** Raised when the user cancels a run; no partial result is ever returned. */
export class AnalysisCancelled extends Error {
  constructor() {
    super("Analysis cancelled.");
    this.name = "AbortError";
  }
}

export function isAnalysisCancelled(error: unknown): boolean {
  if (error instanceof AnalysisCancelled) return true;
  return error instanceof Error && error.name === "AbortError";
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new AnalysisCancelled();
}

/** Metadata load that can be abandoned as soon as the user cancels. */
function waitForMetadata(element: HTMLMediaElement, message: string, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      element.onloadedmetadata = null;
      element.onerror = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new AnalysisCancelled());
    };
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out reading the media metadata."));
    }, 15000);
    element.onloadedmetadata = () => {
      cleanup();
      resolve();
    };
    element.onerror = () => {
      cleanup();
      reject(new Error(message));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "m4v"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "ogg", "flac", "weba"];

export function guessKind(file: File): "video" | "audio" {
  const extension = (file.name.split(".").pop() ?? "").toLowerCase();
  if (file.type.startsWith("video/") || VIDEO_EXTENSIONS.includes(extension)) return "video";
  if (file.type.startsWith("audio/") || AUDIO_EXTENSIONS.includes(extension)) return "audio";
  return "audio";
}

export async function probeMediaFile(file: File, signal?: AbortSignal): Promise<MediaProbe> {
  throwIfCancelled(signal);
  const kind = guessKind(file);
  const url = URL.createObjectURL(file);
  try {
    if (kind === "video") {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.src = url;
      await waitForMetadata(
        video,
        "This browser could not decode the video. Convert it to MP4 (H.264) or WebM and try again.",
        signal,
      );
      const width = video.videoWidth || null;
      const height = video.videoHeight || null;
      throwIfCancelled(signal);
      const duration = await resolveVideoDuration(video, video.duration, false, signal);
      return { kind, duration, width, height };
    }
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;
    await waitForMetadata(audio, "This browser could not decode the audio file.", signal);
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    return { kind, duration, width: null, height: null };
  } finally {
    // The element keeps its own handle; revoke after metadata is read.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/* ------------------------------------------------------------------ */
/* Video landmarkers                                                   */
/* ------------------------------------------------------------------ */

interface VideoLandmarkers {
  face: FaceLandmarker;
  pose: PoseLandmarker;
}

let cache: Promise<VideoLandmarkers> | null = null;

async function getLandmarkers(): Promise<VideoLandmarkers> {
  if (!cache) {
    cache = (async () => {
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe-wasm");
      const [face, pose] = await Promise.all([
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          minFaceDetectionConfidence: 0.3,
          minFacePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        }).catch(() =>
          FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate: "CPU" },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
            minFaceDetectionConfidence: 0.3,
            minFacePresenceConfidence: 0.3,
            minTrackingConfidence: 0.3,
          }),
        ),
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.3,
          minPosePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        }).catch(() =>
          PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate: "CPU" },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.3,
            minPosePresenceConfidence: 0.3,
            minTrackingConfidence: 0.3,
          }),
        ),
      ]);
      return { face, pose };
    })().catch((error) => {
      cache = null;
      throw error;
    });
  }
  return cache;
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

interface Vec {
  x: number;
  y: number;
  z?: number;
}

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const round = (value: number, digits = 3) => Number(value.toFixed(digits));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[clamp(Math.round((sorted.length - 1) * q), 0, sorted.length - 1)];
}

function angleAt(a: Vec, b: Vec, c: Vec): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magnitudes = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y) || 1;
  return (Math.acos(clamp(dot / magnitudes, -1, 1)) * 180) / Math.PI;
}

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

export interface AnalyzeOptions {
  category: string;
  onProgress?: (progress: AnalysisProgress) => void;
  signal?: AbortSignal;
}

export interface AnalyzeResult extends DerivedAnalysis {
  probe: MediaProbe;
}

export async function analyzeRecordingFile(file: File, options: AnalyzeOptions): Promise<AnalyzeResult> {
  const report = options.onProgress ?? (() => {});
  const signal = options.signal;
  throwIfCancelled(signal);
  const probe = await probeMediaFile(file, signal);
  const limitations: string[] = [
    "Landmarks come from a single 2D camera. There is no skeletal solve, no foot IK and no production motion-capture quality.",
    "Finger articulation is not tracked in this build — arm and wrist motion only.",
    "Expression categories are blendshape thresholds (smile, jaw, brow, blink), not emotion recognition.",
    "Head orientation is estimated from facial geometry, not from a head-mounted tracker.",
  ];

  report({ stage: "Reading media", percent: 2 });
  let speech: SpeechMetrics | null = null;
  try {
    speech = await analyzeSpeechFromBlob(file);
    if (speech.warnings.length) limitations.push(...speech.warnings);
  } catch {
    limitations.push(
      probe.kind === "video"
        ? "The audio track could not be decoded by this browser (common with MOV/AAC variants). Convert to MP4 with AAC or add a separate audio file."
        : "This browser could not decode the audio, so speech metrics are unavailable.",
    );
  }
  // Checked outside the try so a cancel is never mistaken for a decode failure.
  throwIfCancelled(signal);

  if (probe.kind === "audio" || !probe.width) {
    report({ stage: "Audio-only recording", percent: 92 });
    return {
      version: 1,
      engine: "Web Audio speech measurement · on-device",
      analyzedAt: new Date().toISOString(),
      duration: probe.duration,
      sampleStep: 0,
      coverageSeconds: 0,
      frames: [],
      blends: { times: [], channels: {} },
      events: [],
      face: null,
      pose: null,
      speech,
      probe,
      notes: ["Audio-only recording: no visual landmarks were extracted."],
      limitations: [
        ...limitations,
        "Speech-only recordings cannot supply facial or body movement references.",
      ],
    };
  }

  report({ stage: "Loading landmark models", percent: 6 });
  const { face, pose } = await getLandmarkers();
  throwIfCancelled(signal);

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Timed out loading the video.")), 20000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("This browser could not decode the video. Convert to MP4 (H.264) or WebM."));
      };
    });

    const duration = await resolveVideoDuration(video, video.duration || probe.duration, true, signal);
    if (!Number.isFinite(duration) || duration <= 0) {
      limitations.push("The file did not report a usable duration, so only a single frame could be sampled.");
    }
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const canvasWidth = 480;
    const canvasHeight = Math.max(2, Math.round((canvasWidth * (video.videoHeight || 9)) / (video.videoWidth || 16)));
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) throw new Error("This browser could not create a canvas for frame sampling.");

    // Sampling budget: denser for short clips, ≤ ~320 samples overall.
    const sampleStep = Math.max(0.4, Math.min(3, safeDuration / 320));
    const sampleCount = safeDuration > 0 ? Math.min(2000, Math.max(1, Math.floor(safeDuration / sampleStep))) : 1;
    const frames: FrameSample[] = [];
    const blendTimes: number[] = [];
    const blendChannels: Record<string, number[]> = Object.fromEntries(BLEND_CHANNELS.map((name) => [name, []]));
    let previousArms: { left: Vec; right: Vec } | null = null;
    let previousTimestamp = 0;

    if (video.readyState < 2) {
      await new Promise<void>((resolve) => {
        let timer = 0;
        const done = () => {
          window.clearTimeout(timer);
          video.removeEventListener("loadeddata", done);
          resolve();
        };
        timer = window.setTimeout(done, 8000);
        video.addEventListener("loadeddata", done, { once: true });
      });
    }

    for (let index = 0; index < sampleCount; index++) {
      throwIfCancelled(signal);
      const time = safeDuration > 0 ? Math.min(Math.max(0, index * sampleStep), Math.max(0, safeDuration - 0.05)) : 0;
      await seekTo(video, time);
      const timestamp = Math.round(index * sampleStep * 1000) + 1;
      ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);

      const frame: FrameSample = {
        t: round(time, 2),
        face: 0,
        pose: 0,
        smileL: 0,
        smileR: 0,
        smile: 0,
        jaw: 0,
        brow: 0,
        blink: 0,
        squint: 0,
        frown: 0,
        yaw: 0,
        pitch: 0,
        roll: 0,
        gazeX: 0,
        gazeY: 0,
        armL: 0,
        armR: 0,
        sway: 0,
        gesture: 0,
        shoulderTilt: 0,
        stepPhase: 0,
      };

      try {
        const faceResult = face.detectForVideo(canvas, Math.max(timestamp, previousTimestamp + 1));
        previousTimestamp = Math.max(timestamp, previousTimestamp + 1);
        const landmarks = faceResult.faceLandmarks?.[0];
        if (landmarks?.length >= 468) {
          const point = (i: number): Vec => ({ x: landmarks[i].x * canvasWidth, y: landmarks[i].y * canvasHeight });
          frame.face = 1;
          const blends = new Map<string, number>();
          for (const category of faceResult.faceBlendshapes?.[0]?.categories ?? []) {
            blends.set(category.categoryName, category.score);
          }
          const smileL = blends.get("mouthSmileLeft") ?? 0;
          const smileR = blends.get("mouthSmileRight") ?? 0;
          frame.smileL = round(smileL);
          frame.smileR = round(smileR);
          frame.smile = round((smileL + smileR) / 2);
          frame.jaw = round(blends.get("jawOpen") ?? 0);
          frame.brow = round(
            Math.max(blends.get("browInnerUp") ?? 0, blends.get("browOuterUpLeft") ?? 0, blends.get("browOuterUpRight") ?? 0),
          );
          frame.blink = round(Math.max(blends.get("eyeBlinkLeft") ?? 0, blends.get("eyeBlinkRight") ?? 0));
          frame.squint = round(((blends.get("cheekSquintLeft") ?? 0) + (blends.get("cheekSquintRight") ?? 0)) / 2);
          frame.frown = round(((blends.get("mouthFrownLeft") ?? 0) + (blends.get("mouthFrownRight") ?? 0)) / 2);

          const rightInner = point(133);
          const rightOuter = point(33);
          const leftInner = point(362);
          const leftOuter = point(263);
          const eyeMid = { x: (rightOuter.x + leftOuter.x) / 2, y: (rightOuter.y + leftOuter.y) / 2 };
          const eyeDistance = dist(rightOuter, leftOuter) || 1;
          const nose = point(1);
          const forehead = point(10);
          const chin = point(152);
          frame.yaw = round(clamp((nose.x - eyeMid.x) / eyeDistance, -1.5, 1.5));
          frame.roll = round((Math.atan2(leftOuter.y - rightOuter.y, leftOuter.x - rightOuter.x) * 180) / Math.PI, 1);
          const faceHeight = Math.max(1, chin.y - forehead.y);
          frame.pitch = round((nose.y - eyeMid.y) / faceHeight);

          if (landmarks.length >= 478) {
            const irisRight = meanPoint([468, 469, 470, 471, 472].map(point));
            const irisLeft = meanPoint([473, 474, 475, 476, 477].map(point));
            const rightSpan = Math.max(1, rightOuter.x - rightInner.x);
            const leftSpan = Math.max(1, leftInner.x - leftOuter.x);
            const rightGaze = (irisRight.x - (rightOuter.x + rightInner.x) / 2) / (rightSpan / 2);
            const leftGaze = (irisLeft.x - (leftOuter.x + leftInner.x) / 2) / (leftSpan / 2);
            frame.gazeX = round(clamp((rightGaze + leftGaze) / 2, -2, 2));
            const rightLid = Math.max(1, point(145).y - point(159).y);
            const leftLid = Math.max(1, point(374).y - point(386).y);
            const rightGazeY = (irisRight.y - (point(159).y + point(145).y) / 2) / (rightLid / 2);
            const leftGazeY = (irisLeft.y - (point(386).y + point(374).y) / 2) / (leftLid / 2);
            frame.gazeY = round(clamp((rightGazeY + leftGazeY) / 2, -2, 2));
          }

          blendTimes.push(round(time, 2));
          for (const name of BLEND_CHANNELS) blendChannels[name].push(round(blends.get(name) ?? 0, 3));
        }
      } catch {
        /* A single unreadable frame should not abort the whole analysis. */
      }

      try {
        const poseResult = pose.detectForVideo(canvas, Math.max(timestamp, previousTimestamp + 1));
        const body = poseResult.landmarks?.[0];
        if (body?.length >= 29) {
          const point = (i: number): Vec => ({ x: body[i].x, y: body[i].y });
          const leftShoulder = point(11);
          const rightShoulder = point(12);
          const leftElbow = point(13);
          const rightElbow = point(14);
          const leftWrist = point(15);
          const rightWrist = point(16);
          const leftHip = point(23);
          const rightHip = point(24);
          const leftKnee = point(25);
          const rightKnee = point(26);
          const leftAnkle = point(27);
          const rightAnkle = point(28);
          const shoulderWidth = Math.max(0.02, dist(leftShoulder, rightShoulder));
          frame.pose = 1;
          frame.armL = round(clamp(dist(leftShoulder, leftWrist) / shoulderWidth, 0, 4));
          frame.armR = round(clamp(dist(rightShoulder, rightWrist) / shoulderWidth, 0, 4));
          frame.shoulderTilt = round(clamp((leftShoulder.y - rightShoulder.y) / shoulderWidth, -1, 1));
          frame.sway = round(clamp((leftHip.x + rightHip.x) / 2, -1, 2));
          frame.stepPhase = round(
            clamp(((leftHip.y - leftAnkle.y) - (rightHip.y - rightAnkle.y)) / shoulderWidth, -2, 2),
          );
          if (previousArms) {
            const displacement =
              (dist(leftWrist, previousArms.left) + dist(rightWrist, previousArms.right)) / 2 / sampleStep;
            frame.gesture = round(clamp(displacement / shoulderWidth, 0, 6));
          }
          previousArms = { left: leftWrist, right: rightWrist };
        } else {
          previousArms = null;
        }
      } catch {
        previousArms = null;
      }

      frames.push(frame);
      if (index % 2 === 0 || index === sampleCount - 1) {
        report({
          stage: `Extracting landmarks · ${time.toFixed(1)}s of ${duration.toFixed(1)}s`,
          percent: 8 + Math.round((index / Math.max(1, sampleCount - 1)) * 84),
        });
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    }

    report({ stage: "Summarising behaviour", percent: 95 });
    const derived = buildDerived({
      frames,
      blendTimes,
      blendChannels,
      duration: safeDuration,
      sampleStep,
      speech,
      limitations,
      category: options.category,
    });

    return { ...derived, probe: { ...probe, duration: safeDuration } };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

/**
 * MediaRecorder WebM files often report `Infinity` duration until the browser
 * has seeked to the end. Resolve it once, then return to the start.
 */
async function resolveVideoDuration(
  video: HTMLVideoElement,
  initial: number,
  allowPlayThrough = false,
  signal?: AbortSignal,
): Promise<number> {
  throwIfCancelled(signal);
  const base = Number.isFinite(initial) && initial > 0 ? initial : 0;
  if (base) return base;

  // Some containers (notably MediaRecorder WebM) only reveal their duration
  // after the browser has seeked to the end of the stream.
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener("timeupdate", onUpdate);
      video.removeEventListener("durationchange", onUpdate);
      resolve();
    };
    const onUpdate = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) finish();
    };
    const timer = window.setTimeout(finish, 4000);
    video.addEventListener("timeupdate", onUpdate);
    video.addEventListener("durationchange", onUpdate);
    try {
      video.currentTime = 1e7;
    } catch {
      finish();
    }
  });

  let resolved = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  try {
    const seekable = video.seekable.length ? video.seekable.end(video.seekable.length - 1) : 0;
    if (Number.isFinite(seekable) && seekable > resolved && seekable < 86400) resolved = seekable;
  } catch {
    /* seekable ranges can be unavailable */
  }

  // Last resort: play a muted stream to its end. Only done during analysis,
  // never while probing an upload, and bounded so a live stream cannot hang.
  if (!resolved && allowPlayThrough) {
    resolved = await playThroughDuration(video, signal);
  }

  try {
    video.currentTime = 0;
  } catch {
    /* some streams are not seekable */
  }
  await new Promise((resolve) => window.setTimeout(resolve, 80));
  throwIfCancelled(signal);
  return resolved;
}

async function playThroughDuration(video: HTMLVideoElement, signal?: AbortSignal): Promise<number> {
  try {
    throwIfCancelled(signal);
    video.muted = true;
    const started = performance.now();
    await video.play();
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearInterval(timer);
        video.removeEventListener("ended", finish);
        signal?.removeEventListener("abort", finish);
        video.pause();
        resolve();
      };
      const timer = window.setInterval(() => {
        if (signal?.aborted || video.ended || performance.now() - started > 15000) finish();
      }, 200);
      signal?.addEventListener("abort", finish, { once: true });
      video.addEventListener("ended", finish, { once: true });
    });
    throwIfCancelled(signal);
    if (!video.ended) return 0;
    const played = video.currentTime;
    if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
    return Number.isFinite(played) && played > 0 ? played : 0;
  } catch {
    return 0;
  }
}

async function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.02 && video.readyState >= 2) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener("seeked", finish);
      resolve();
    };
    const timer = window.setTimeout(finish, 5000);
    video.addEventListener("seeked", finish, { once: true });
    video.currentTime = time;
  });
}

const meanPoint = (points: Vec[]): Vec => ({
  x: mean(points.map((p) => p.x)),
  y: mean(points.map((p) => p.y)),
});

/* ------------------------------------------------------------------ */
/* Summarisation                                                       */
/* ------------------------------------------------------------------ */

function buildDerived(input: {
  frames: FrameSample[];
  blendTimes: number[];
  blendChannels: Record<string, number[]>;
  duration: number;
  sampleStep: number;
  speech: SpeechMetrics | null;
  limitations: string[];
  category: string;
}): DerivedAnalysis {
  const { frames, duration, sampleStep, speech } = input;
  const faceFrames = frames.filter((frame) => frame.face);
  const poseFrames = frames.filter((frame) => frame.pose);
  const coveredSeconds = frames.length ? Math.min(duration, frames[frames.length - 1].t - frames[0].t + sampleStep) : 0;
  const minutes = Math.max(0.01, coveredSeconds / 60);
  const limitations = [...input.limitations];

  let face: FaceStats | null = null;
  if (faceFrames.length > 2) {
    const blinks = countRises(faceFrames.map((f) => f.blink), 0.5, sampleStep);
    const nodPeaks = countPeaks(
      faceFrames.map((f) => f.pitch),
      0.02,
      Math.max(2, Math.round(0.3 / sampleStep)),
    );
    const expressionMix = classifyExpressions(faceFrames);
    face = {
      faceFrames: faceFrames.length,
      smileMean: round(mean(faceFrames.map((f) => f.smile))),
      smileAsymmetry: round(mean(faceFrames.map((f) => f.smileL - f.smileR))),
      jawMean: round(mean(faceFrames.map((f) => f.jaw))),
      browMean: round(mean(faceFrames.map((f) => f.brow))),
      blinkPerMinute: round((blinks / Math.max(0.01, (faceFrames.length * sampleStep) / 60)), 1),
      blinkCount: blinks,
      squintMean: round(mean(faceFrames.map((f) => f.squint))),
      frownMean: round(mean(faceFrames.map((f) => f.frown))),
      headTiltMean: round(mean(faceFrames.map((f) => f.roll)), 1),
      headTiltDominant: mean(faceFrames.map((f) => f.roll)) > 2 ? "right" : mean(faceFrames.map((f) => f.roll)) < -2 ? "left" : "none",
      headYawRange: round(quantile(faceFrames.map((f) => f.yaw), 0.95) - quantile(faceFrames.map((f) => f.yaw), 0.05), 2),
      nodPerMinute: round(nodPeaks / minutes, 1),
      gazeOffShare: round(mean(faceFrames.map((f) => (Math.abs(f.gazeX) > 0.22 ? 1 : 0)))),
      expressionMix,
    };
  } else {
    limitations.push("No face was detected in the sampled frames, so facial statistics are absent.");
  }

  let pose: PoseStats | null = null;
  if (poseFrames.length > 2) {
    const gestures = poseFrames.map((f) => f.gesture);
    const stepSeries = poseFrames.map((f) => f.stepPhase);
    const stepMedian = quantile(stepSeries, 0.5);
    const stepRange = quantile(stepSeries, 0.95) - quantile(stepSeries, 0.05);
    let crossings = 0;
    let direction = 0;
    for (const value of stepSeries) {
      const sign = Math.sign(value - stepMedian);
      if (sign !== 0 && Math.abs(value - stepMedian) > 0.015) {
        if (direction !== 0 && sign !== direction) crossings++;
        direction = sign;
      }
    }
    const cadenceRaw = (crossings / Math.max(0.01, coveredSeconds)) * 60;
    const cadence = cadenceRaw >= 40 && cadenceRaw <= 220 ? round(cadenceRaw, 0) : null;
    const shoulderTilt = mean(poseFrames.map((f) => f.shoulderTilt));
    pose = {
      poseFrames: poseFrames.length,
      gestureMean: round(mean(gestures)),
      gesturePeak: round(quantile(gestures, 0.9)),
      armMean: round(mean(poseFrames.map((f) => (f.armL + f.armR) / 2))),
      twoHandedShare: round(mean(poseFrames.map((f) => (f.armL > 0.6 && f.armR > 0.6 ? 1 : 0)))),
      shoulderTiltMean: round(shoulderTilt),
      shoulderHigher: Math.abs(shoulderTilt) < 0.012 ? "even" : shoulderTilt > 0 ? "left" : "right",
      stanceWidthMean: null,
      kneeFlexionMean: null,
      swayRange: round(quantile(poseFrames.map((f) => f.sway), 0.95) - quantile(poseFrames.map((f) => f.sway), 0.05), 3),
      stepCadence: cadence,
      walkingShare: round(mean(stepSeries.map((value) => (Math.abs(value - stepMedian) > 0.02 ? 1 : 0))), 3),
    };
    if (stepRange > 0.05 && !cadence) {
      limitations.push("Foot alternation was visible but too irregular to state a step cadence confidently.");
    }
  } else {
    limitations.push("No full-body pose was detected; movement statistics are absent (frame the whole body for movement footage).");
  }

  const events = detectEvents(frames, duration, sampleStep, pose, speech, input.category);
  if (sampleStep > 1) {
    limitations.push(
      `Sampling interval was ${sampleStep.toFixed(2)} s; very short expressions or gestures between samples will be missed.`,
    );
  }

  return {
    version: 1,
    engine: "MediaPipe Face Landmarker (478 landmarks · 52 blendshapes) + Pose Landmarker (33 landmarks) · Web Audio · on-device",
    analyzedAt: new Date().toISOString(),
    duration: round(duration, 2),
    sampleStep: round(sampleStep, 2),
    coverageSeconds: round(coveredSeconds, 2),
    frames,
    blends: { times: input.blendTimes, channels: input.blendChannels },
    events,
    face,
    pose,
    speech,
    notes: [
      `Sampled ${frames.length} frames · ${faceFrames.length} with a face · ${poseFrames.length} with a body pose.`,
      ...(speech ? [`Speech: ${speech.pauseCount} pauses, median pitch ${speech.medianF0 ?? "—"} Hz.`] : []),
    ],
    limitations,
  };
}

function countRises(values: number[], threshold: number, step: number): number {
  let count = 0;
  let armed = true;
  for (const value of values) {
    if (armed && value > threshold) {
      count++;
      armed = false;
    } else if (!armed && value < threshold * 0.5) {
      armed = true;
    }
  }
  // Avoid counting a hold across the whole clip as many blinks.
  return Math.min(count, Math.round((values.length * step) / 1.5) + 1);
}

function countPeaks(values: number[], prominence: number, minGap: number): number {
  let count = 0;
  let lastIndex = -minGap;
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] < values[i - 1] || values[i] < values[i + 1]) continue;
    const base = Math.min(values[i - 1], values[i + 1]);
    if (values[i] - base < prominence) continue;
    if (i - lastIndex < minGap) continue;
    count++;
    lastIndex = i;
  }
  return count;
}

function classifyExpressions(faceFrames: FrameSample[]): Record<string, number> {
  const buckets: Record<string, number> = {
    laughing: 0,
    smiling: 0,
    neutral: 0,
    serious: 0,
    surprised: 0,
    frowning: 0,
  };
  for (const frame of faceFrames) {
    if (frame.smile > 0.45 && frame.jaw > 0.22) buckets.laughing++;
    else if (frame.smile > 0.35) buckets.smiling++;
    else if (frame.brow > 0.4 && frame.jaw > 0.28) buckets.surprised++;
    else if (frame.brow > 0.22) buckets.serious++;
    else if (frame.frown > 0.15) buckets.frowning++;
    else buckets.neutral++;
  }
  const total = Math.max(1, faceFrames.length);
  return Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, round(value / total)]));
}

function detectEvents(
  frames: FrameSample[],
  duration: number,
  step: number,
  pose: PoseStats | null,
  speech: SpeechMetrics | null,
  category: string,
): MediaEvent[] {
  const events: MediaEvent[] = [];
  const minGap = Math.max(2, step * 2);

  // Smile highlights.
  const smilePeaks: { t: number; score: number; jaw: number }[] = [];
  for (let i = 1; i < frames.length - 1; i++) {
    const frame = frames[i];
    if (!frame.face || frame.smile < 0.35) continue;
    if (frame.smile < frames[i - 1].smile || frame.smile < frames[i + 1].smile) continue;
    if (smilePeaks.length && frame.t - smilePeaks[smilePeaks.length - 1].t < minGap) continue;
    smilePeaks.push({ t: frame.t, score: frame.smile, jaw: frame.jaw });
  }
  smilePeaks
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .forEach((peak) => {
      events.push({
        type: "smile",
        start: round(Math.max(0, peak.t - 0.8), 1),
        end: round(Math.min(duration, peak.t + 0.8), 1),
        label: `Smile peak (${peak.score.toFixed(2)})`,
        score: round(peak.score, 2),
        metrics: { smile: round(peak.score), jaw: round(peak.jaw) },
      });
    });

  // Laugh episodes.
  for (const run of findRuns(frames, (f) => f.face === 1 && f.smile > 0.45 && f.jaw > 0.22, step, 0.4)) {
    events.push({
      type: "laugh",
      start: run.start,
      end: run.end,
      label: "Open laugh",
      score: round(Math.max(...run.frames.map((f) => f.smile * f.jaw)), 2),
      metrics: {
        smile: round(mean(run.frames.map((f) => f.smile))),
        jaw: round(mean(run.frames.map((f) => f.jaw))),
      },
    });
  }

  // Gesture bursts.
  if (pose && pose.gesturePeak > 0) {
    const threshold = Math.max(0.2, pose.gesturePeak * 0.85);
    for (const run of findRuns(frames, (f) => f.pose === 1 && f.gesture >= threshold, step, 0.5)) {
      events.push({
        type: "gesture-burst",
        start: run.start,
        end: run.end,
        label: "Expressive gesture",
        score: round(Math.max(...run.frames.map((f) => f.gesture)), 2),
        metrics: { gesture: round(mean(run.frames.map((f) => f.gesture))) },
      });
    }
  }

  // Head turns.
  for (const run of findRuns(frames, (f) => f.face === 1 && Math.abs(f.yaw) > 0.16, step, 0.6)) {
    const direction = mean(run.frames.map((f) => Math.sign(f.yaw))) > 0 ? "right" : "left";
    events.push({
      type: "head-turn",
      start: run.start,
      end: run.end,
      label: `Head turn to the ${direction}`,
      score: round(Math.max(...run.frames.map((f) => Math.abs(f.yaw))), 2),
      metrics: { yaw: round(mean(run.frames.map((f) => f.yaw))) },
    });
  }

  // Posture shifts.
  const postures: MediaEvent[] = [];
  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    if (!frame.pose) continue;
    if (Math.abs(frame.sway - frames[i - 1].sway) > 0.03) {
      if (postures.length && frame.t - postures[postures.length - 1].start < 1.5) continue;
      postures.push({
        type: "posture-shift",
        start: round(frame.t, 1),
        end: round(Math.min(duration, frame.t + 0.8), 1),
        label: "Weight shift",
        score: round(Math.abs(frame.sway - frames[i - 1].sway) * 10, 2),
        metrics: { sway: round(frame.sway) },
      });
    }
  }
  events.push(...postures.slice(0, 8));

  // Walking / weight alternation.
  if (pose && pose.walkingShare > 0.2) {
    for (const run of findRuns(frames, (f) => f.pose === 1 && Math.abs(f.stepPhase) > 0.02, step, 1.5)) {
      events.push({
        type: "walking",
        start: run.start,
        end: run.end,
        label: pose.stepCadence ? `Walking (~${pose.stepCadence} steps/min)` : "Foot alternation",
        score: round(pose.walkingShare, 2),
        metrics: { cadence: pose.stepCadence ?? 0 },
      });
    }
  }

  // Sustained sung notes (from the speech contour, mapped onto time).
  if (speech && category === "singing") {
    const contour = speech.pitchContour;
    const perSample = duration / Math.max(1, contour.length);
    let runStart: number | null = null;
    contour.forEach((value, index) => {
      if (value !== null && runStart === null) runStart = index * perSample;
      if ((value === null || index === contour.length - 1) && runStart !== null) {
        const end = index * perSample;
        if (end - runStart >= 0.8) {
          events.push({
            type: "sung-phrase",
            start: round(runStart, 1),
            end: round(end, 1),
            label: `Sustained sung note (${(end - runStart).toFixed(1)} s)`,
            score: round(end - runStart, 2),
            metrics: { seconds: round(end - runStart, 2) },
          });
        }
        runStart = null;
      }
    });
  }

  return events
    .map((event) => ({
      ...event,
      start: round(Math.min(duration, Math.max(0, event.start)), 1),
      end: round(Math.min(duration, Math.max(0, event.end)), 1),
    }))
    .filter((event) => event.end > event.start)
    .sort((a, b) => a.start - b.start)
    .slice(0, 60);
}

function findRuns(
  frames: FrameSample[],
  predicate: (frame: FrameSample) => boolean,
  step: number,
  minSeconds: number,
): { start: number; end: number; frames: FrameSample[] }[] {
  const runs: { start: number; end: number; frames: FrameSample[] }[] = [];
  let current: FrameSample[] = [];
  const flush = () => {
    if (!current.length) return;
    const start = current[0].t;
    const end = current[current.length - 1].t + step;
    if (end - start >= minSeconds - step * 0.5) {
      runs.push({ start: round(start, 1), end: round(end, 1), frames: [...current] });
    }
    current = [];
  };
  for (const frame of frames) {
    if (predicate(frame)) current.push(frame);
    else flush();
  }
  flush();
  return runs;
}

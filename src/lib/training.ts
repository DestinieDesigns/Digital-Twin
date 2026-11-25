/**
 * Behaviour-learning client helpers.
 *
 * `useTraining` keeps the training state in one place per view and merges any
 * training payload returned by a mutation, so the dashboard never shows a
 * stale count after an upload, analysis or review.
 */
import { useCallback, useEffect, useState } from "react";
import { api, recordingUrl, type TrainingResponse } from "../api";
import type { DerivedAnalysis, Recording, TrainingState } from "../../shared/behavior";
import { useStudio } from "../store";
import { analyzeRecordingFile, type AnalysisProgress } from "./media";

export { AnalysisCancelled, isAnalysisCancelled } from "./media";

export function useTraining() {
  const { run } = useStudio();
  const [training, setTraining] = useState<TrainingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await api.trainingState();
      setTraining(response.training);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The training library could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutate = useCallback(
    async <T extends TrainingResponse>(label: string, fn: () => Promise<T>, success?: string) => {
      const result = await run(label, fn, success);
      if (result.ok && result.data?.training) setTraining(result.data.training);
      return result;
    },
    [run],
  );

  return { training, loading, error, refresh, mutate };
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function formatMinutes(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 min";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 10) / 10);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toFixed(1).padStart(4, "0")}`;
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** CSV of the sampled timelines, suitable for Blender/Unreal import or a spreadsheet. */
export function buildTimelineCsv(analysis: DerivedAnalysis, title: string): string {
  const channels = Object.keys(analysis.blends.channels);
  const header = [
    "time_seconds",
    "face_detected",
    "pose_detected",
    "smile",
    "smile_left",
    "smile_right",
    "jaw_open",
    "brow",
    "blink",
    "head_yaw",
    "head_pitch",
    "head_roll",
    "gaze_x",
    "gaze_y",
    "arm_left",
    "arm_right",
    "gesture_speed",
    "shoulder_tilt",
    "step_phase",
    ...channels,
  ];
  const rows = analysis.frames.map((frame) => {
    const blendIndex = analysis.blends.times.indexOf(frame.t);
    return [
      frame.t,
      frame.face,
      frame.pose,
      frame.smile,
      frame.smileL,
      frame.smileR,
      frame.jaw,
      frame.brow,
      frame.blink,
      frame.yaw,
      frame.pitch,
      frame.roll,
      frame.gazeX,
      frame.gazeY,
      frame.armL,
      frame.armR,
      frame.gesture,
      frame.shoulderTilt,
      frame.stepPhase,
      ...channels.map((channel) =>
        blendIndex >= 0 ? (analysis.blends.channels[channel]?.[blendIndex] ?? "") : "",
      ),
    ];
  });
  return [`# ${title} — ${analysis.engine}`, header.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

/**
 * Re-open a stored recording through the private API and run the on-device
 * analysis on it. The file never leaves the machine.
 */
export async function analyseStoredRecording(
  recording: Recording,
  options: { onProgress?: (progress: AnalysisProgress) => void; signal?: AbortSignal } = {},
): Promise<DerivedAnalysis> {
  const res = await fetch(recordingUrl(recording.id), { credentials: "same-origin", signal: options.signal });
  if (!res.ok) throw new Error("The stored recording could not be read from disk.");
  const blob = await res.blob();
  const file = new File([blob], `${recording.title}.${recording.kind === "video" ? "mp4" : "wav"}`, {
    type: recording.mime,
  });
  const result = await analyzeRecordingFile(file, {
    category: recording.category,
    onProgress: options.onProgress,
    signal: options.signal,
  });
  const { probe: _probe, ...derived } = result;
  return derived;
}

export function recordingFileName(title: string, format: "csv" | "json"): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${slug || "recording"}-timeline.${format}`;
}

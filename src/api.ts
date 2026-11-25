/**
 * Typed client for the private studio API.
 * Errors carry the server's message and any structured payload (blocking
 * reasons, missing env var, consent requirement) so views can explain exactly
 * what is missing instead of failing silently.
 */
import type { AppState, AudioAnalysis, FaceAnalysis, Settings, ViewKey } from "../shared/types";
import type { DerivedAnalysis, TrainingState } from "../shared/behavior";

export interface TrainingResponse {
  training: TrainingState;
  id?: string;
  segmentId?: string;
  assetId?: string;
  name?: string;
  content?: string;
  created?: number;
  updated?: number;
  deleted?: number;
  withdrawal?: {
    profilesFlagged: number;
    mannerismsRemoved: number;
    mannerismsUpdated: number;
  } | null;
}

export class ApiError extends Error {
  status: number;
  payload: any;
  constructor(message: string, status = 500, payload: any = null) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init });
  } catch (err) {
    throw new ApiError(
      "Cannot reach the studio server. Make sure the local API is running (bun run dev).",
      0,
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const message = typeof body === "object" && body?.error ? body.error : `Request failed (${res.status}).`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

const jsonInit = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  state: () => request<AppState>("/api/state"),
  health: () => request<{ ok: boolean; dataDir: string }>("/api/health"),

  updateIdentity: (patch: { name?: string; masterPhotoId?: string | null }) =>
    request<AppState>("/api/identity", jsonInit(patch, "PATCH")),

  saveProfile: (profile: any, draftNotes?: string) =>
    request<AppState>("/api/identity/profile", jsonInit({ profile, draftNotes }, "PATCH")),

  saveMeasurements: (samples: { photoId: string; measurements: Record<string, number> }[], applySuggestions: boolean) =>
    request<AppState>("/api/identity/measurements", jsonInit({ samples, applySuggestions })),

  createVersion: (label: string, notes?: string) =>
    request<AppState>("/api/identity/versions", jsonInit({ label, notes })),

  approveVersion: (id: string) => request<AppState>(`/api/identity/versions/${id}/approve`, jsonInit({})),
  rejectVersion: (id: string) => request<AppState>(`/api/identity/versions/${id}/reject`, jsonInit({})),
  restoreVersion: (id: string) => request<AppState>(`/api/identity/versions/${id}/restore`, jsonInit({})),

  uploadPhotos: (files: File[], view: ViewKey) => {
    const form = new FormData();
    for (const file of files) form.append("photos", file);
    form.append("view", view);
    return request<{ state: AppState; saved: string[]; rejected: string[] }>("/api/photos", { method: "POST", body: form });
  },

  patchPhoto: (id: string, patch: { view?: string; expression?: string; hairstyle?: string; notes?: string }) =>
    request<AppState>(`/api/photos/${id}`, jsonInit(patch, "PATCH")),

  saveAnalysis: (id: string, analysis: FaceAnalysis) =>
    request<AppState>(`/api/photos/${id}/analysis`, jsonInit(analysis)),

  deletePhoto: (id: string) => request<AppState>(`/api/photos/${id}`, { method: "DELETE" }),

  generate: (body: Record<string, unknown>) =>
    request<{ state?: AppState; generationId?: string; prompt?: string; negative?: string }>("/api/generate", jsonInit(body)),

  review: (id: string, review: "approved" | "rejected" | "pending", note: string) =>
    request<AppState>(`/api/generations/${id}/review`, jsonInit({ review, note })),

  deleteGeneration: (id: string) => request<AppState>(`/api/generations/${id}`, { method: "DELETE" }),

  uploadModel: (file: File, meta: { name: string; notes: string; lod: string; rigged: boolean }) => {
    const form = new FormData();
    form.append("file", file);
    form.append("name", meta.name);
    form.append("notes", meta.notes);
    form.append("lod", meta.lod);
    form.append("rigged", String(meta.rigged));
    return request<AppState>("/api/models", { method: "POST", body: form });
  },

  patchModel: (id: string, patch: { name?: string; notes?: string; lod?: string; rigged?: boolean }) =>
    request<AppState>(`/api/models/${id}`, jsonInit(patch, "PATCH")),

  deleteModel: (id: string) => request<AppState>(`/api/models/${id}`, { method: "DELETE" }),

  uploadAudio: (file: File, meta: { name: string; kind: string; notes: string }) => {
    const form = new FormData();
    form.append("file", file);
    form.append("name", meta.name);
    form.append("kind", meta.kind);
    form.append("notes", meta.notes);
    return request<AppState>("/api/audio", { method: "POST", body: form });
  },

  saveAudioAnalysis: (id: string, analysis: AudioAnalysis, duration: number) =>
    request<AppState>(`/api/audio/${id}/analysis`, jsonInit({ analysis, duration })),

  deleteAudio: (id: string) => request<AppState>(`/api/audio/${id}`, { method: "DELETE" }),

  saveCreation: (body: { title: string; kind: string; collection: string; generationId?: string; notes?: string }) =>
    request<AppState>("/api/creations", jsonInit(body)),

  deleteCreation: (id: string) => request<AppState>(`/api/creations/${id}`, { method: "DELETE" }),

  saveSettings: (patch: Partial<Settings>) => request<AppState>("/api/settings", jsonInit(patch, "PUT")),

  exportDocument: (type: "markdown" | "json" | "prompts") =>
    request<{ state: AppState; assetId: string; name: string; content: string }>("/api/export", jsonInit({ type })),

  deleteAllPhotos: () => request<{ state: AppState; deleted: number }>("/api/privacy/delete-photos", jsonInit({})),
  deleteAllGenerations: () => request<{ state: AppState; deleted: number }>("/api/privacy/delete-generations", jsonInit({})),
  deleteEverything: (confirm: string) => request<{ state: AppState }>("/api/privacy/delete-all", jsonInit({ confirm })),

  /* ------------------------- behaviour learning ------------------------ */
  trainingState: () => request<TrainingResponse>("/api/training"),

  uploadRecording: (
    file: File,
    meta: {
      title: string;
      category: string;
      collectionId: string;
      recordedAt: string;
      description: string;
      tags: string[];
      duration: number;
      width: number | null;
      height: number | null;
    },
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("title", meta.title);
    form.append("category", meta.category);
    form.append("collectionId", meta.collectionId);
    form.append("recordedAt", meta.recordedAt);
    form.append("description", meta.description);
    form.append("tags", meta.tags.join(","));
    form.append("duration", String(meta.duration));
    if (meta.width) form.append("width", String(meta.width));
    if (meta.height) form.append("height", String(meta.height));
    return request<TrainingResponse>("/api/recordings", { method: "POST", body: form });
  },

  patchRecording: (
    id: string,
    patch: Partial<{
      title: string;
      category: string;
      collectionId: string;
      recordedAt: string;
      description: string;
      tags: string[];
      allowTraining: boolean;
      approved: boolean;
    }>,
  ) => request<TrainingResponse>(`/api/recordings/${id}`, jsonInit(patch, "PATCH")),

  deleteRecording: (id: string) => request<TrainingResponse>(`/api/recordings/${id}`, { method: "DELETE" }),

  recordingAnalysis: (id: string) => request<{ derived: DerivedAnalysis }>(`/api/recordings/${id}/derived`),

  saveRecordingAnalysis: (id: string, derived: DerivedAnalysis, duration: number) =>
    request<TrainingResponse>(`/api/recordings/${id}/analysis`, jsonInit({ derived, duration })),

  failRecordingAnalysis: (id: string, error: string) =>
    request<TrainingResponse>(`/api/recordings/${id}/fail`, jsonInit({ error })),

  createSegment: (body: { recordingId: string; label: string; category: string; emotion: string; start: number; end: number }) =>
    request<TrainingResponse>("/api/segments", jsonInit(body)),

  patchSegment: (id: string, patch: { review?: string; label?: string; emotion?: string }) =>
    request<TrainingResponse>(`/api/segments/${id}`, jsonInit(patch, "PATCH")),

  deleteSegment: (id: string) => request<TrainingResponse>(`/api/segments/${id}`, { method: "DELETE" }),

  suggestMannerisms: () => request<TrainingResponse>("/api/mannerisms/suggest", jsonInit({})),

  createMannerism: (body: { title: string; category: string; description: string }) =>
    request<TrainingResponse>("/api/mannerisms", jsonInit(body)),

  patchMannerism: (id: string, patch: { review?: string; title?: string; description?: string; category?: string }) =>
    request<TrainingResponse>(`/api/mannerisms/${id}`, jsonInit(patch, "PATCH")),

  deleteMannerism: (id: string) => request<TrainingResponse>(`/api/mannerisms/${id}`, { method: "DELETE" }),

  createCollection: (body: { name: string; description: string; code?: string }) =>
    request<TrainingResponse>("/api/collections", jsonInit(body)),

  patchCollection: (id: string, patch: { name?: string; description?: string }) =>
    request<TrainingResponse>(`/api/collections/${id}`, jsonInit(patch, "PATCH")),

  deleteCollection: (id: string) => request<TrainingResponse>(`/api/collections/${id}`, { method: "DELETE" }),

  createBehaviorProfile: (body: {
    label: string;
    notes: string;
    speechNotes: string;
    expressionNotes: string;
    movementNotes: string;
  }) => request<TrainingResponse>("/api/behavior-profiles", jsonInit(body)),

  behaviorProfileAction: (id: string, action: "approve" | "reject" | "restore") =>
    request<TrainingResponse>(`/api/behavior-profiles/${id}/${action}`, jsonInit({})),

  exportBehavior: (type: "markdown" | "json") =>
    request<TrainingResponse>("/api/export/behavior", jsonInit({ type })),

  deleteAllRecordings: () => request<TrainingResponse>("/api/privacy/delete-recordings", jsonInit({})),
};

export const photoUrl = (id: string) => `/api/photos/${id}/file`;
export const assetUrl = (id: string) => `/api/assets/${id}/file`;
export const modelUrl = (id: string) => `/api/models/${id}/file`;
export const audioUrl = (id: string) => `/api/audio/${id}/file`;
export const recordingUrl = (id: string) => `/api/recordings/${id}/file`;

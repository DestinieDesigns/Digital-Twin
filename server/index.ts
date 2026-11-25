/**
 * Destinie AI Twin Studio — private local API.
 *
 * Design rules encoded here:
 *  - Nothing is ever faked. A generation exists only if a provider returned it.
 *  - Missing provider keys produce an explicit 412 with the exact env var.
 *  - Reference photographs leave the machine only when the user enabled that
 *    in Settings, and only inside the provider request they triggered.
 *  - The approved master never changes implicitly: approval is a separate,
 *    explicit endpoint and generation review never rewrites the master.
 */
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  AUDIO_DIR,
  DATA_DIR,
  EXPORT_DIR,
  GENERATED_DIR,
  MEDIA_DIR,
  MODEL_DIR,
  UPLOAD_DIR,
  approveVersion,
  createVersion,
  db,
  ensureIdentity,
  getDraftVersion,
  getIdentityRow,
  getMasterVersion,
  getVersionRow,
  mapVersion,
  now,
  readSettings,
  storageUsage,
  updateDraftProfile,
  writeSettings,
} from "./db";
import {
  MAX_AUDIO_BYTES,
  MAX_MEDIA_BYTES,
  MAX_MODEL_BYTES,
  MAX_PHOTO_BYTES,
  imageDimensions,
  normalizeOriginalName,
  removeFile,
  safeExtension,
  sniff,
  sniffMedia,
  writePrivateFile,
} from "./storage";
import { mediaResponse } from "./range";
import {
  buildProfileContent,
  buildTrainingState,
  clearMiningAudit,
  createSegment,
  ensureCollections,
  clearDerived,
  getDerived,
  invalidateMiningAudit,
  mapRecording,
  pruneMannerismEvidence,
  sanitizeDerived,
  saveDerived,
  suggestMannerisms,
  withdrawRecordingEvidence,
} from "./training";
import { ALL_CATEGORIES, SEGMENT_CATEGORIES, behaviorMarkdown, COLLECTION_PRESETS } from "../shared/behavior";
import { ProviderError, generate3D, generateImage, type ProviderReference } from "./providers";
import { identityMarkdown, promptPackText } from "./exports";
import { computeReadiness, clampAppearance, mergeMeasurements, composeGeneration } from "../shared/identity";
import { DEFAULT_SETTINGS, integrationList, providerStatuses } from "../shared/providers";
import { TURNAROUND_VIEWS } from "../shared/catalog";
import {
  APPEARANCE_CONTROLS,
  VIEWS,
  type AppState,
  type AudioTake,
  type Creation,
  type FaceAnalysis,
  type Generation,
  type IdentityProfile,
  type ModelAsset,
  type Photo,
  type Settings,
  type ViewKey,
} from "../shared/types";

const PORT = (() => {
  const raw = (Bun.env.PORT ?? "").trim();
  const parsed = Number(raw);
  return raw && Number.isFinite(parsed) && parsed > 0 ? parsed : 8787;
})();
const DIST_DIR = join(process.cwd(), "dist");

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
  });
}

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ error: message, ...extra }, status);
}

async function readJson<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError("Request body must be valid JSON.", 400);
  }
}

class HttpError extends Error {
  status: number;
  extra: Record<string, unknown>;
  constructor(message: string, status = 400, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from some clients omit it
  try {
    const originHost = new URL(origin).hostname;
    const host = (req.headers.get("host") ?? "").split(":")[0];
    if (!host) return false;
    if (originHost === host) return true;
    const loopback = new Set(["127.0.0.1", "localhost", "::1"]);
    return loopback.has(originHost) && loopback.has(host);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Row mappers                                                         */
/* ------------------------------------------------------------------ */

function mapPhoto(row: any): Photo {
  let analysis: FaceAnalysis | null = null;
  if (row.analysis_json) {
    try {
      analysis = JSON.parse(row.analysis_json);
    } catch {
      analysis = null;
    }
  }
  return {
    id: row.id,
    identityId: row.identity_id,
    originalName: row.original_name,
    mime: row.mime,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    view: row.view as ViewKey,
    expression: row.expression,
    hairstyle: row.hairstyle,
    notes: row.notes,
    createdAt: row.created_at,
    analysis,
  };
}

function mapGeneration(row: any): Generation {
  return {
    id: row.id,
    identityId: row.identity_id,
    versionId: row.version_id,
    kind: row.kind,
    label: row.label,
    view: row.view,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt,
    params: safeParse(row.params_json),
    status: row.status,
    error: row.error,
    assetId: row.asset_id,
    review: row.review,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    meta: safeParse(row.meta_json),
  };
}

function safeParse(text: string | null | undefined): any {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function mapModel(row: any): ModelAsset {
  return {
    id: row.id,
    identityId: row.identity_id,
    name: row.name,
    format: row.format,
    source: row.source,
    bytes: row.bytes,
    createdAt: row.created_at,
    notes: row.notes,
    lod: row.lod,
    rigged: Boolean(row.rigged),
    provider: row.provider,
  };
}

function mapAudio(row: any): AudioTake {
  return {
    id: row.id,
    identityId: row.identity_id,
    name: row.name,
    kind: row.kind,
    bytes: row.bytes,
    mime: row.mime,
    durationSeconds: row.duration,
    analysis: safeParse(row.analysis_json) ?? null,
    createdAt: row.created_at,
    notes: row.notes,
  };
}

function mapCreation(row: any): Creation {
  return {
    id: row.id,
    identityId: row.identity_id,
    title: row.title,
    kind: row.kind,
    collection: row.collection,
    generationId: row.generation_id,
    createdAt: row.created_at,
    notes: row.notes,
  };
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

function currentSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(readSettings() as Partial<Settings>) };
}

function buildState(): AppState {
  const identityRow = ensureIdentity();
  const identityId = identityRow.id;

  let draftRow = getDraftVersion(identityId);
  if (!draftRow) {
    const master = getMasterVersion(identityId);
    const profile = master ? (mapVersion(master).profile as IdentityProfile) : undefined;
    if (!profile) throw new HttpError("Identity has no working draft and no approved master.", 500);
    draftRow = createVersion(identityId, profile, "Working draft", { basedOn: master?.id ?? null });
  }
  const draft = mapVersion(draftRow);
  const masterRow = getMasterVersion(identityId);
  const masterVersion = masterRow ? mapVersion(masterRow) : null;
  const versions = (db.query("SELECT * FROM versions WHERE identity_id = ? ORDER BY number DESC").all(identityId) as any[]).map(mapVersion);

  const photos = (db.query("SELECT * FROM photos WHERE identity_id = ? ORDER BY created_at DESC").all(identityId) as any[]).map(mapPhoto);
  const generations = (db.query("SELECT * FROM generations WHERE identity_id = ? ORDER BY created_at DESC").all(identityId) as any[]).map(mapGeneration);
  const models = (db.query("SELECT * FROM models WHERE identity_id = ? ORDER BY created_at DESC").all(identityId) as any[]).map(mapModel);
  const audio = (db.query("SELECT * FROM audio WHERE identity_id = ? ORDER BY created_at DESC").all(identityId) as any[]).map(mapAudio);
  const creations = (db.query("SELECT * FROM creations WHERE identity_id = ? ORDER BY created_at DESC").all(identityId) as any[]).map(mapCreation);
  const exports = db
    .query("SELECT * FROM assets WHERE identity_id = ? AND kind = 'export' ORDER BY created_at DESC")
    .all(identityId);

  const readiness = computeReadiness(photos, draft.profile);
  const providers = providerStatuses(Bun.env);

  return {
    identity: {
      id: identityRow.id,
      name: identityRow.name,
      createdAt: identityRow.created_at,
      masterVersionId: identityRow.master_version_id,
      masterPhotoId: identityRow.master_photo_id,
    },
    versions,
    masterVersion,
    draft,
    photos,
    generations,
    models,
    audio,
    creations,
    exports: exports.map((row: any) => ({
      id: row.id,
      identityId: row.identity_id,
      kind: row.kind,
      mime: row.mime,
      bytes: row.bytes,
      originalName: row.original_name,
      createdAt: row.created_at,
    })),
    settings: currentSettings(),
    providers,
    integrations: integrationList(providers),
    readiness,
    stats: {
      photos: photos.length,
      analyzedPhotos: photos.filter((p) => p.analysis?.faceDetected).length,
      generations: generations.length,
      approvedGenerations: generations.filter((g) => g.review === "approved").length,
      models: models.length,
      audioTakes: audio.length,
      versions: versions.length,
      storageBytes: storageUsage(),
    },
    dataDir: DATA_DIR,
  } as AppState;
}

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

function parseDataUrl(input: string): ProviderReference | null {
  if (typeof input !== "string") return null;
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(input.trim());
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.byteLength || bytes.byteLength > 12 * 1024 * 1024) return null;
  return { mime: match[1] === "image/jpg" ? "image/jpeg" : match[1], bytes };
}

function sanitizeProfile(input: Partial<IdentityProfile>, base: IdentityProfile): IdentityProfile {
  const profile: IdentityProfile = {
    ...base,
    ...input,
    features: { ...base.features, ...(input.features ?? {}) },
    measurements: { ...base.measurements, ...(input.measurements ?? {}) },
    skin: { ...base.skin, ...(input.skin ?? {}) },
    smile: { ...base.smile, ...(input.smile ?? {}) },
    hairstyle: { ...base.hairstyle, ...(input.hairstyle ?? {}) },
    appearance: clampAppearance({ ...base.appearance, ...(input.appearance ?? {}) }),
    marks: Array.isArray(input.marks) ? input.marks.slice(0, 40) : base.marks,
  };
  profile.displayName = String(profile.displayName || base.displayName).slice(0, 120);
  profile.summary = String(profile.summary ?? "").slice(0, 2000);
  profile.notes = String(profile.notes ?? "").slice(0, 4000);
  profile.identityStrength = Math.max(55, Math.min(100, Number(profile.identityStrength) || base.identityStrength));
  for (const [key, value] of Object.entries(profile.features)) {
    profile.features[key] = {
      value: String(value?.value ?? "").slice(0, 600),
      source: ["user", "measured", "missing"].includes(value?.source ?? "")
        ? value.source
        : String(value?.value ?? "").trim()
          ? "user"
          : "missing",
    };
  }
  for (const [key, value] of Object.entries(profile.measurements)) {
    const n = Number(value);
    if (!Number.isFinite(n)) delete profile.measurements[key];
    else profile.measurements[key] = Number(n.toFixed(3));
  }
  profile.skin = {
    hex: /^#[0-9a-fA-F]{6}$/.test(profile.skin.hex) ? profile.skin.hex : "",
    undertone: ["warm", "cool", "neutral", "unspecified"].includes(profile.skin.undertone) ? profile.skin.undertone : "unspecified",
    description: String(profile.skin.description ?? "").slice(0, 400),
    source: ["user", "measured", "missing"].includes(profile.skin.source) ? profile.skin.source : "missing",
  };
  return profile;
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method.toUpperCase();

  if (!path.startsWith("/api/")) return serveStatic(path);

  if (method !== "GET" && !sameOrigin(req)) {
    return fail("Cross-origin writes are blocked. Use the studio at its own local address.", 403);
  }

  if (path === "/api/health") return json({ ok: true, at: now(), dataDir: DATA_DIR });

  if (path === "/api/state" && method === "GET") return json(buildState());

  if (path === "/api/providers" && method === "GET") {
    const providers = providerStatuses(Bun.env);
    return json({ providers, integrations: integrationList(providers) });
  }

  /* ---------------------------------------------------------------- */
  /* Identity                                                          */
  /* ---------------------------------------------------------------- */

  if (path === "/api/identity" && method === "PATCH") {
    const body = await readJson<{ name?: string; masterPhotoId?: string | null }>(req);
    const identity = getIdentityRow();
    if (body.name) {
      const name = String(body.name).slice(0, 120).trim();
      if (!name) return fail("The identity name cannot be empty.");
      db.query("UPDATE identity SET name = ? WHERE id = ?").run(name, identity.id);
    }
    if (body.masterPhotoId !== undefined) {
      if (body.masterPhotoId) {
        const photo = db.query("SELECT id FROM photos WHERE id = ? AND identity_id = ?").get(body.masterPhotoId, identity.id);
        if (!photo) return fail("That photograph is not part of this identity.", 404);
      }
      db.query("UPDATE identity SET master_photo_id = ? WHERE id = ?").run(body.masterPhotoId, identity.id);
    }
    return json(buildState());
  }

  if (path === "/api/identity/profile" && method === "PATCH") {
    const identity = getIdentityRow();
    const body = await readJson<{ profile?: Partial<IdentityProfile>; draftNotes?: string }>(req);
    const draftRow = getDraftVersion(identity.id);
    if (!draftRow) return fail("No working draft found.", 409);
    const base = mapVersion(draftRow).profile;
    const profile = sanitizeProfile(body.profile ?? {}, base);
    updateDraftProfile(identity.id, profile);
    if (body.draftNotes !== undefined) {
      db.query("UPDATE versions SET notes = ? WHERE id = ?").run(String(body.draftNotes).slice(0, 1000), draftRow.id);
    }
    return json(buildState());
  }

  if (path === "/api/identity/measurements" && method === "POST") {
    const identity = getIdentityRow();
    const body = await readJson<{ samples?: { photoId: string; measurements: Record<string, number> }[]; applySuggestions?: boolean }>(req);
    const draftRow = getDraftVersion(identity.id);
    if (!draftRow) return fail("No working draft found.", 409);
    const base = mapVersion(draftRow).profile;
    const samples = (body.samples ?? []).slice(0, 80).map((s) => ({
      photoId: String(s.photoId),
      view: "front" as ViewKey,
      measurements: s.measurements ?? {},
    }));
    const merged = mergeMeasurements(base, samples);
    let profile: IdentityProfile = { ...base, measurements: merged.measurements };

    // Pull skin tone from the most recent analysed front photo when unset.
    if (!profile.skin.hex) {
      const analysed = db
        .query("SELECT analysis_json FROM photos WHERE identity_id = ? AND analysis_json IS NOT NULL ORDER BY created_at DESC")
        .all(identity.id) as { analysis_json: string }[];
      for (const row of analysed) {
        const analysis = safeParse(row.analysis_json) as FaceAnalysis;
        if (analysis?.skinTone?.hex) {
          profile.skin = {
            hex: analysis.skinTone.hex,
            undertone: analysis.skinTone.undertone,
            description: `${analysis.skinTone.undertone} undertone, ITA ${analysis.skinTone.ita.toFixed(1)}°`,
            source: "measured",
          };
          break;
        }
      }
    }

    if (body.applySuggestions) {
      const { suggestedValueFor } = await import("../shared/identity");
      for (const [key, feature] of Object.entries(profile.features)) {
        if (feature.value.trim()) continue;
        const suggestion = suggestedValueFor(key, profile);
        if (suggestion) profile.features[key] = { value: suggestion, source: "measured" };
      }
    }

    updateDraftProfile(identity.id, profile);
    return json(buildState());
  }

  if (path === "/api/identity/versions" && method === "POST") {
    const identity = getIdentityRow();
    const body = await readJson<{ label?: string; notes?: string }>(req);
    const draftRow = getDraftVersion(identity.id);
    if (!draftRow) return fail("No working draft found.", 409);
    const current = mapVersion(draftRow);
    db.query("UPDATE versions SET status = 'superseded' WHERE id = ? AND status = 'draft'").run(draftRow.id);
    const version = createVersion(identity.id, current.profile, String(body.label ?? `Draft v${current.number + 1}`).slice(0, 120), {
      notes: body.notes ?? current.notes,
      basedOn: draftRow.id,
      changeSummary: "Saved draft snapshot",
    });
    return json(buildState());
  }

  const approveMatch = /^\/api\/identity\/versions\/([\w-]+)\/(approve|reject|restore)$/.exec(path);
  if (approveMatch && method === "POST") {
    const identity = getIdentityRow();
    const [, versionId, action] = approveMatch;
    const row = getVersionRow(versionId);
    if (!row || row.identity_id !== identity.id) return fail("Version not found.", 404);
    const version = mapVersion(row);

    if (action === "approve") {
      const photos = (db.query("SELECT * FROM photos WHERE identity_id = ?").all(identity.id) as any[]).map(mapPhoto);
      const readiness = computeReadiness(photos, version.profile);
      if (!readiness.canApprove) {
        return fail("This identity is not ready to approve yet.", 422, { blocking: readiness.blocking });
      }
      approveVersion(identity.id, versionId);
      // Work continues from a fresh draft so the approved master stays untouched.
      createVersion(identity.id, version.profile, `Working draft after v${version.number}`, {
        basedOn: versionId,
        changeSummary: "Opened for editing after approval",
      });
      return json(buildState());
    }

    if (action === "reject") {
      db.query("UPDATE versions SET status = 'rejected' WHERE id = ?").run(versionId);
      const draft = getDraftVersion(identity.id);
      if (!draft) {
        const master = getMasterVersion(identity.id);
        createVersion(identity.id, master ? mapVersion(master).profile : version.profile, "Working draft", { basedOn: master?.id ?? null });
      }
      return json(buildState());
    }

    // restore: copy this version forward as a fresh draft
    db.query("UPDATE versions SET status = 'superseded' WHERE id = ? AND status = 'draft'").run(versionId);
    createVersion(identity.id, version.profile, `Restored from v${version.number}`, {
      basedOn: versionId,
      changeSummary: `Restored the profile of version ${version.number}`,
    });
    return json(buildState());
  }

  /* ---------------------------------------------------------------- */
  /* Photos                                                            */
  /* ---------------------------------------------------------------- */

  if (path === "/api/photos" && method === "POST") {
    const identity = getIdentityRow();
    const form = await req.formData().catch(() => null);
    if (!form) return fail("Upload must be multipart/form-data.");
    const entries = form.getAll("photos").concat(form.getAll("file")).filter((v): v is File => v instanceof File);
    if (!entries.length) return fail("No photograph was included in the upload.");
    if (entries.length > 12) return fail("Upload at most 12 photographs at a time.");

    const viewField = String(form.get("view") ?? "front") as ViewKey;
    const validView = VIEWS.some((v) => v.key === viewField) ? viewField : "other";
    const saved: Photo[] = [];
    const rejected: string[] = [];

    for (const file of entries) {
      if (file.size > MAX_PHOTO_BYTES) {
        rejected.push(`${file.name}: larger than 25 MB`);
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sniffed = sniff(bytes);
      if (sniffed.kind !== "image") {
        rejected.push(`${file.name}: not a JPEG, PNG, WebP or GIF image`);
        continue;
      }
      const dims = imageDimensions(bytes, sniffed.mime);
      const stored = await writePrivateFile(UPLOAD_DIR, bytes, sniffed.format);
      const id = randomUUID();
      const originalName = normalizeOriginalName(file.name, "reference");
      db.query(
        `INSERT INTO photos (id, identity_id, path, original_name, mime, bytes, width, height, view, expression, hairstyle, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', ?)`,
      ).run(
        id,
        identity.id,
        stored.path,
        originalName,
        sniffed.mime,
        bytes.byteLength,
        dims.width,
        dims.height,
        validView,
        now(),
      );
      saved.push(mapPhoto(db.query("SELECT * FROM photos WHERE id = ?").get(id)));
    }

    if (!saved.length) return fail(`None of the files could be accepted. ${rejected.join("; ")}`, 415);
    return json({ state: buildState(), saved: saved.map((p) => p.id), rejected });
  }

  const photoMatch = /^\/api\/photos\/([\w-]+)(?:\/(file|analysis))?$/.exec(path);
  if (photoMatch) {
    const identity = getIdentityRow();
    const [, photoId, sub] = photoMatch;
    const row = db.query("SELECT * FROM photos WHERE id = ? AND identity_id = ?").get(photoId, identity.id) as any;
    if (!row) return fail("Photograph not found.", 404);

    if (method === "GET" && sub === "file") {
      const file = Bun.file(row.path);
      if (!(await file.exists())) return fail("The stored file is missing from disk.", 404);
      return new Response(file, {
        headers: {
          "content-type": row.mime,
          "content-disposition": `inline; filename="${row.id}.${safeExtension(row.mime.split("/")[1])}"`,
          ...SECURITY_HEADERS,
        },
      });
    }

    if (method === "PATCH") {
      const body = await readJson<{ view?: string; expression?: string; hairstyle?: string; notes?: string }>(req);
      const view = body.view && VIEWS.some((v) => v.key === body.view) ? body.view : row.view;
      db.query("UPDATE photos SET view = ?, expression = ?, hairstyle = ?, notes = ? WHERE id = ?").run(
        view,
        String(body.expression ?? row.expression).slice(0, 160),
        String(body.hairstyle ?? row.hairstyle).slice(0, 160),
        String(body.notes ?? row.notes).slice(0, 800),
        photoId,
      );
      return json(buildState());
    }

    if (method === "POST" && sub === "analysis") {
      const body = await readJson<FaceAnalysis>(req);
      const analysis: FaceAnalysis = {
        analyzedAt: now(),
        method: body.method ?? "MediaPipe Face Landmarker",
        landmarks: Number(body.landmarks ?? 0),
        faceDetected: Boolean(body.faceDetected),
        measurements: body.measurements ?? {},
        skinTone: body.skinTone ?? null,
        expressions: body.expressions ?? null,
        framing: body.framing ?? null,
        warnings: Array.isArray(body.warnings) ? body.warnings.slice(0, 8) : [],
        error: body.error,
      };
      db.query("UPDATE photos SET analysis_json = ? WHERE id = ?").run(JSON.stringify(analysis), photoId);
      return json(buildState());
    }

    if (method === "DELETE") {
      if (identity.master_photo_id === photoId) {
        return fail(
          "This photograph is your approved master reference. Choose a different master reference in Facial Identity Lab before deleting it.",
          409,
        );
      }
      await removeFile(row.path);
      db.query("DELETE FROM photos WHERE id = ?").run(photoId);
      return json(buildState());
    }
  }

  /* ---------------------------------------------------------------- */
  /* Generation                                                        */
  /* ---------------------------------------------------------------- */

  if (path === "/api/generate" && method === "POST") {
    const identity = getIdentityRow();
    const draftRow = getDraftVersion(identity.id);
    if (!draftRow) return fail("No working draft found.", 409);
    const version = mapVersion(draftRow);
    const settings = currentSettings();

    const body = await readJson<{
      kind?: string;
      provider?: "fal" | "openai";
      model?: string;
      viewKey?: string;
      environmentId?: string;
      hairstyle?: IdentityProfile["hairstyle"];
      appearance?: Record<string, number>;
      outfit?: string;
      extra?: string;
      framing?: "portrait" | "halfBody" | "fullBody";
      aspect?: "square" | "portrait" | "landscape";
      reference?: string;
      referenceSet?: string[];
      dryRun?: boolean;
    }>(req);

    const kind = (body.kind ?? "portrait") as Generation["kind"];
    const provider = body.provider ?? settings.preferredImageProvider;
    const providerInfo = providerStatuses(Bun.env).find((p) => p.id === provider);
    const envVar = provider === "fal" ? "FAL_KEY" : "OPENAI_API_KEY";

    const profile = sanitizeProfile(
      {
        appearance: body.appearance as any,
        hairstyle: body.hairstyle,
      },
      version.profile,
    );

    const viewDef = TURNAROUND_VIEWS.find((v) => v.key === body.viewKey) ?? null;
    const composed = composeGeneration({
      profile,
      kind,
      viewKey: body.viewKey ?? null,
      environmentId: body.environmentId ?? null,
      outfit: body.outfit,
      extra: body.extra,
      framing: body.framing,
    });

    if (body.dryRun) {
      return json({ prompt: composed.prompt, negative: composed.negative, provider, kind });
    }

    if (!providerInfo?.configured) {
      return fail(
        `${providerInfo?.name ?? provider} is not connected. Set ${envVar} in .env and restart the studio. The prompt below is ready to use once a key is added.`,
        412,
        { needsEnvVar: envVar, prompt: composed.prompt, negative: composed.negative },
      );
    }

    if (!settings.allowExternalReferenceUpload) {
      return fail(
        "External reference upload is turned off. Enable it in Settings to allow this provider to receive your reference portrait.",
        412,
        { needsConsent: true },
      );
    }

    const label =
      kind === "turnaround"
        ? `Turnaround — ${viewDef?.label ?? "view"}`
        : kind === "hairstyle"
          ? `Hairstyle — ${profile.hairstyle.styleId.replace(/-/g, " ")}`
          : kind === "environment"
            ? `Environment — ${body.environmentId ?? "studio"}`
            : kind === "appearance"
              ? "Appearance study"
              : "Identity portrait";

    if (kind === "model3d") {
      const reference = parseDataUrl(body.reference ?? "");
      if (!reference) return fail("A prepared front-view reference image is required for 3D reconstruction.", 400);
      const generationId = randomUUID();
      db.query(
        `INSERT INTO generations (id, identity_id, version_id, kind, label, view, provider, model, prompt, negative_prompt, params_json, status, created_at, meta_json)
         VALUES (?, ?, ?, 'model3d', ?, 'front', 'fal', ?, ?, '', '{}', 'failed', ?, '{}')`,
      ).run(generationId, identity.id, draftRow.id, label, "fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d", composed.prompt, now());
      try {
        const result = await generate3D(reference);
        const stored = await writePrivateFile(MODEL_DIR, result.glb, "glb");
        const modelId = randomUUID();
        db.query(
          `INSERT INTO models (id, identity_id, name, format, source, path, bytes, notes, lod, rigged, provider, created_at)
           VALUES (?, ?, ?, 'glb', 'generated', ?, ?, ?, ?, 0, ?, ?)`,
        ).run(
          modelId,
          identity.id,
          `Reconstruction ${new Date().toLocaleString()}`,
          stored.path,
          result.glb.byteLength,
          "Single-image reconstruction from the approved front view. Unseen geometry (back of head, ears, body) is approximated by the model and needs artist refinement.",
          "base mesh",
          "fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d",
          now(),
        );
        db.query("UPDATE generations SET status = 'completed', meta_json = ? WHERE id = ?").run(
          JSON.stringify({ modelId, ...result.meta }),
          generationId,
        );
        return json(buildState());
      } catch (err) {
        const message = err instanceof ProviderError ? err.message : err instanceof Error ? err.message : String(err);
        db.query("UPDATE generations SET error = ? WHERE id = ?").run(message.slice(0, 800), generationId);
        return fail(message, err instanceof ProviderError ? err.status : 502, { generationId: generationId });
      }
    }

    const references: ProviderReference[] = [];
    const primary = parseDataUrl(body.reference ?? "");
    if (primary) references.push(primary);
    for (const extra of (body.referenceSet ?? []).slice(0, 3)) {
      const parsed = parseDataUrl(extra);
      if (parsed) references.push(parsed);
    }
    if (!references.length) {
      return fail(
        "No reference portrait was supplied. Approve or select a reference photograph in My Identity first — the studio never generates from a face it has not been given.",
        400,
      );
    }

    let model = body.model?.trim();
    if (!model) {
      model = provider === "fal" ? "fal-ai/flux-pulid" : "gpt-image-1";
      if (provider === "fal" && references.length > 1) model = "fal-ai/pulid";
    }
    const option = providerInfo.models.find((m) => m.id === model);
    if (option && !option.supports.includes(kind === "turnaround" ? "turnaround" : kind)) {
      return fail(`${option.label} does not support ${kind} generations. Pick one of: ${option.supports.join(", ")}.`, 400);
    }

    const aspect = body.aspect ?? (viewDef?.fullBody ? "portrait" : "square");
    const generationId = randomUUID();
    const params = {
      aspect,
      references: references.length,
      identityStrength: profile.identityStrength,
      environmentId: body.environmentId ?? null,
      viewKey: body.viewKey ?? null,
      hairstyle: profile.hairstyle.styleId,
    };

    db.query(
      `INSERT INTO generations (id, identity_id, version_id, kind, label, view, provider, model, prompt, negative_prompt, params_json, status, created_at, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?, '{}')`,
    ).run(
      generationId,
      identity.id,
      draftRow.id,
      kind,
      label,
      body.viewKey ?? "",
      provider,
      model,
      composed.prompt,
      composed.negative,
      JSON.stringify(params),
      now(),
    );

    try {
      const result = await generateImage({
        provider,
        model,
        prompt: composed.prompt,
        negative: composed.negative,
        references,
        aspect: aspect as "square" | "portrait" | "landscape",
        identityStrength: profile.identityStrength,
      });
      const extension = result.mime.includes("jpeg") ? "jpeg" : result.mime.includes("webp") ? "webp" : "png";
      const stored = await writePrivateFile(GENERATED_DIR, result.bytes, extension);
      const assetId = randomUUID();
      db.query(
        `INSERT INTO assets (id, identity_id, kind, path, mime, bytes, original_name, created_at)
         VALUES (?, ?, 'generation', ?, ?, ?, ?, ?)`,
      ).run(assetId, identity.id, stored.path, result.mime, result.bytes.byteLength, `${label}.${extension}`, now());
      db.query(
        "UPDATE generations SET status = 'completed', asset_id = ?, meta_json = ? WHERE id = ?",
      ).run(assetId, JSON.stringify(result.meta ?? {}), generationId);
      return json({ state: buildState(), generationId });
    } catch (err) {
      const message = err instanceof ProviderError ? err.message : err instanceof Error ? err.message : String(err);
      db.query("UPDATE generations SET error = ? WHERE id = ?").run(message.slice(0, 800), generationId);
      return fail(message, err instanceof ProviderError ? err.status : 502, { generationId });
    }
  }

  const reviewMatch = /^\/api\/generations\/([\w-]+)(?:\/(review|file))?$/.exec(path);
  if (reviewMatch) {
    const identity = getIdentityRow();
    const [, generationId, sub] = reviewMatch;
    const row = db.query("SELECT * FROM generations WHERE id = ? AND identity_id = ?").get(generationId, identity.id) as any;
    if (!row) return fail("Generation not found.", 404);

    if (method === "GET" && sub === "file") {
      if (!row.asset_id) return fail("This generation has no image.", 404);
      return assetResponse(identity.id, row.asset_id);
    }
    if (method === "POST" && sub === "review") {
      const body = await readJson<{ review?: "approved" | "rejected" | "pending"; note?: string }>(req);
      const review = body.review ?? "pending";
      if (!["approved", "rejected", "pending"].includes(review)) return fail("Unknown review state.");
      db.query("UPDATE generations SET review = ?, review_note = ? WHERE id = ?").run(
        review,
        String(body.note ?? "").slice(0, 800),
        generationId,
      );
      return json(buildState());
    }
    if (method === "DELETE") {
      if (row.asset_id) {
        const asset = db.query("SELECT * FROM assets WHERE id = ?").get(row.asset_id) as any;
        if (asset) {
          await removeFile(asset.path);
          db.query("DELETE FROM assets WHERE id = ?").run(row.asset_id);
        }
      }
      db.query("DELETE FROM generations WHERE id = ?").run(generationId);
      return json(buildState());
    }
  }

  /* ---------------------------------------------------------------- */
  /* Assets + exports                                                  */
  /* ---------------------------------------------------------------- */

  const assetMatch = /^\/api\/assets\/([\w-]+)\/file$/.exec(path);
  if (assetMatch && method === "GET") {
    const identity = getIdentityRow();
    return assetResponse(identity.id, assetMatch[1]);
  }

  async function assetResponse(identityId: string, assetId: string) {
    const asset = db.query("SELECT * FROM assets WHERE id = ? AND identity_id = ?").get(assetId, identityId) as any;
    if (!asset) return fail("Asset not found.", 404);
    const file = Bun.file(asset.path);
    if (!(await file.exists())) return fail("The stored asset is missing from disk.", 404);
    const download = asset.kind === "export";
    return new Response(file, {
      headers: {
        "content-type": asset.mime || "application/octet-stream",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${normalizeOriginalName(asset.original_name, "asset")}"`,
        ...SECURITY_HEADERS,
      },
    });
  }

  if (path === "/api/export" && method === "POST") {
    const identity = getIdentityRow();
    const body = await readJson<{ type?: "markdown" | "json" | "prompts" }>(req);
    const type = body.type ?? "markdown";
    const state = buildState();

    let content = "";
    let name = "";
    let mime = "text/plain; charset=utf-8";
    if (type === "markdown") {
      content = identityMarkdown(state);
      name = `destinie-identity-v${state.masterVersion?.number ?? "draft"}.md`;
      mime = "text/markdown; charset=utf-8";
    } else if (type === "prompts") {
      content = promptPackText(state);
      name = `destinie-prompt-pack-v${state.masterVersion?.number ?? "draft"}.txt`;
    } else {
      content = JSON.stringify(
        {
          exportedAt: now(),
          identity: state.identity,
          masterVersion: state.masterVersion,
          draft: state.draft,
          settings: { identityStrength: state.settings.defaultIdentityStrength },
          providers: state.providers.map((p) => ({ id: p.id, name: p.name, configured: p.configured, models: p.models.map((m) => m.id) })),
        },
        null,
        2,
      );
      name = `destinie-identity-v${state.masterVersion?.number ?? "draft"}.json`;
      mime = "application/json";
    }

    const bytes = new TextEncoder().encode(content);
    const stored = await writePrivateFile(EXPORT_DIR, bytes, type === "json" ? "json" : type === "markdown" ? "md" : "txt");
    const assetId = randomUUID();
    db.query(
      `INSERT INTO assets (id, identity_id, kind, path, mime, bytes, original_name, created_at)
       VALUES (?, ?, 'export', ?, ?, ?, ?, ?)`,
    ).run(assetId, identity.id, stored.path, mime, bytes.byteLength, name, now());

    return json({ state: buildState(), assetId, name, content });
  }

  /* ---------------------------------------------------------------- */
  /* Models                                                            */
  /* ---------------------------------------------------------------- */

  if (path === "/api/models" && method === "POST") {
    const identity = getIdentityRow();
    const form = await req.formData().catch(() => null);
    if (!form) return fail("Model upload must be multipart/form-data.");
    const file = form.get("file");
    if (!(file instanceof File)) return fail("No model file was included.");
    if (file.size > MAX_MODEL_BYTES) return fail("Model files must be under 250 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniff(bytes);
    if (sniffed.kind !== "model" || !["glb", "gltf", "fbx", "obj"].includes(sniffed.format)) {
      return fail("Unsupported model. Export as GLB, GLTF, FBX or OBJ and try again.", 415);
    }
    const stored = await writePrivateFile(MODEL_DIR, bytes, sniffed.format);
    const id = randomUUID();
    db.query(
      `INSERT INTO models (id, identity_id, name, format, source, path, bytes, notes, lod, rigged, provider, created_at)
       VALUES (?, ?, ?, ?, 'upload', ?, ?, ?, ?, ?, 'manual', ?)`,
    ).run(
      id,
      identity.id,
      String(form.get("name") ?? file.name ?? "Imported model").slice(0, 160),
      sniffed.format,
      stored.path,
      bytes.byteLength,
      String(form.get("notes") ?? "").slice(0, 800),
      String(form.get("lod") ?? "").slice(0, 60),
      String(form.get("rigged") ?? "") === "true" ? 1 : 0,
      now(),
    );
    return json(buildState());
  }

  const modelMatch = /^\/api\/models\/([\w-]+)(?:\/file)?$/.exec(path);
  if (modelMatch) {
    const identity = getIdentityRow();
    const row = db.query("SELECT * FROM models WHERE id = ? AND identity_id = ?").get(modelMatch[1], identity.id) as any;
    if (!row) return fail("Model not found.", 404);
    if (method === "GET") {
      const file = Bun.file(row.path);
      if (!(await file.exists())) return fail("The model file is missing from disk.", 404);
      const mime =
        row.format === "glb" ? "model/gltf-binary" : row.format === "gltf" ? "model/gltf+json" : "application/octet-stream";
      return new Response(file, {
        headers: {
          "content-type": mime,
          "content-disposition": `attachment; filename="${normalizeOriginalName(row.name, "model")}.${row.format}"`,
          ...SECURITY_HEADERS,
        },
      });
    }
    if (method === "PATCH") {
      const body = await readJson<{ name?: string; notes?: string; lod?: string; rigged?: boolean }>(req);
      db.query("UPDATE models SET name = ?, notes = ?, lod = ?, rigged = ? WHERE id = ?").run(
        String(body.name ?? row.name).slice(0, 160),
        String(body.notes ?? row.notes).slice(0, 800),
        String(body.lod ?? row.lod).slice(0, 60),
        body.rigged === undefined ? row.rigged : body.rigged ? 1 : 0,
        row.id,
      );
      return json(buildState());
    }
    if (method === "DELETE") {
      await removeFile(row.path);
      db.query("DELETE FROM models WHERE id = ?").run(row.id);
      return json(buildState());
    }
  }

  /* ---------------------------------------------------------------- */
  /* Audio                                                             */
  /* ---------------------------------------------------------------- */

  if (path === "/api/audio" && method === "POST") {
    const identity = getIdentityRow();
    const form = await req.formData().catch(() => null);
    if (!form) return fail("Audio upload must be multipart/form-data.");
    const file = form.get("file");
    if (!(file instanceof File)) return fail("No audio file was included.");
    if (file.size > MAX_AUDIO_BYTES) return fail("Audio files must be under 80 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniff(bytes);
    if (sniffed.kind !== "audio") return fail("Unsupported audio format. Use MP3, WAV, M4A, OGG or FLAC.", 415);
    const kind = String(form.get("kind") ?? "vocal");
    if (!["vocal", "instrumental", "mix", "reference"].includes(kind)) return fail("Unknown audio kind.");
    const stored = await writePrivateFile(AUDIO_DIR, bytes, sniffed.format);
    const id = randomUUID();
    db.query(
      `INSERT INTO audio (id, identity_id, name, kind, path, mime, bytes, duration, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(
      id,
      identity.id,
      String(form.get("name") ?? file.name ?? "Take").slice(0, 160),
      kind,
      stored.path,
      sniffed.mime,
      bytes.byteLength,
      String(form.get("notes") ?? "").slice(0, 600),
      now(),
    );
    return json(buildState());
  }

  const audioMatch = /^\/api\/audio\/([\w-]+)(?:\/(file|analysis))?$/.exec(path);
  if (audioMatch) {
    const identity = getIdentityRow();
    const row = db.query("SELECT * FROM audio WHERE id = ? AND identity_id = ?").get(audioMatch[1], identity.id) as any;
    if (!row) return fail("Audio take not found.", 404);
    const sub = audioMatch[2];
    if (method === "GET" && sub === "file") {
      const file = Bun.file(row.path);
      if (!(await file.exists())) return fail("The audio file is missing from disk.", 404);
      return new Response(file, {
        headers: {
          "content-type": row.mime,
          "content-disposition": `inline; filename="${normalizeOriginalName(row.name, "take")}.${row.path.split(".").pop()}"`,
          ...SECURITY_HEADERS,
        },
      });
    }
    if (method === "POST" && sub === "analysis") {
      const body = await readJson<any>(req);
      db.query("UPDATE audio SET analysis_json = ?, duration = ? WHERE id = ?").run(
        JSON.stringify(body.analysis ?? null),
        Number(body.duration ?? row.duration ?? 0) || null,
        row.id,
      );
      return json(buildState());
    }
    if (method === "DELETE") {
      await removeFile(row.path);
      db.query("DELETE FROM audio WHERE id = ?").run(row.id);
      return json(buildState());
    }
  }

  /* ---------------------------------------------------------------- */
  /* Personal behaviour learning                                       */
  /* ---------------------------------------------------------------- */

  if (path === "/api/training" && method === "GET") {
    const identity = getIdentityRow();
    ensureCollections(identity.id);
    return json({ training: buildTrainingState(identity.id) });
  }

  if (path === "/api/recordings" && method === "POST") {
    const identity = getIdentityRow();
    ensureCollections(identity.id);
    const form = await req.formData().catch(() => null);
    if (!form) return fail("Recording upload must be multipart/form-data.");
    const file = form.get("file");
    if (!(file instanceof File)) return fail("No recording file was included.");
    if (file.size > MAX_MEDIA_BYTES) return fail("Recordings must be under 400 MB.", 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffMedia(bytes);
    if (sniffed.kind !== "video" && sniffed.kind !== "audio") {
      return fail("Unsupported media. Use MP4, MOV, WebM, MP3, WAV, M4A, OGG or FLAC.", 415);
    }

    const requestedCategory = String(form.get("category") ?? "other");
    const category = ALL_CATEGORIES.some((c) => c.key === requestedCategory) ? requestedCategory : "other";
    const requestedCollection = String(form.get("collectionId") ?? "");
    const collection = db
      .query("SELECT id FROM collections WHERE id = ? AND identity_id = ?")
      .get(requestedCollection, identity.id) as { id: string } | null;
    const fallback = db.query("SELECT id FROM collections WHERE identity_id = ? ORDER BY code LIMIT 1").get(identity.id) as { id: string } | null;
    if (!fallback) return fail("No training collection exists.", 500);

    const stored = await writePrivateFile(MEDIA_DIR, bytes, sniffed.format);
    const tags = String(form.get("tags") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20);
    const duration = Math.max(0, Math.min(8 * 3600, Number(form.get("duration")) || 0));
    const width = Number(form.get("width")) || null;
    const height = Number(form.get("height")) || null;
    const recordedRaw = String(form.get("recordedAt") ?? "").trim();
    const recordedDate = recordedRaw ? new Date(recordedRaw) : new Date();
    const recordedAt = Number.isNaN(recordedDate.getTime()) ? now() : recordedDate.toISOString();
    const title = normalizeOriginalName(String(form.get("title") ?? ""), file.name || "Recording").slice(0, 160);
    const description = String(form.get("description") ?? "").slice(0, 1200);
    const id = randomUUID();

    db.query(
      `INSERT INTO recordings (id, identity_id, title, category, collection_id, recorded_at, description, tags_json, kind, path, mime, bytes, duration, width, height, status, allow_training, approved, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', 1, 0, ?)`,
    ).run(
      id,
      identity.id,
      title || "Recording",
      category,
      collection?.id ?? fallback.id,
      recordedAt,
      description,
      JSON.stringify(tags),
      sniffed.kind,
      stored.path,
      sniffed.mime,
      bytes.byteLength,
      duration,
      width,
      height,
      now(),
    );
    invalidateMiningAudit(identity.id, "a recording was added");
    return json({ training: buildTrainingState(identity.id), id });
  }

  const recordingMatch = /^\/api\/recordings\/([\w-]+)(?:\/(file|derived|analysis|fail))?$/.exec(path);
  if (recordingMatch) {
    const identity = getIdentityRow();
    const [, recordingId, sub] = recordingMatch;
    const row = db.query("SELECT * FROM recordings WHERE id = ? AND identity_id = ?").get(recordingId, identity.id) as any;
    if (!row) return fail("Recording not found.", 404);

    if (method === "GET" && sub === "file") {
      return mediaResponse(req, row.path, row.mime, `${normalizeOriginalName(row.title, "recording")}.${row.path.split(".").pop() ?? "mp4"}`);
    }

    if (method === "GET" && sub === "derived") {
      const derived = getDerived(recordingId);
      if (!derived) return fail("This recording has not been analysed yet.", 404);
      return json({ derived });
    }

    if (method === "PATCH") {
      const body = await readJson<{
        title?: string;
        category?: string;
        collectionId?: string;
        recordedAt?: string;
        description?: string;
        tags?: string[];
        allowTraining?: boolean;
        approved?: boolean;
      }>(req);
      const category =
        body.category && ALL_CATEGORIES.some((c) => c.key === body.category) ? body.category : row.category;
      let collectionId = row.collection_id;
      if (body.collectionId) {
        const collection = db
          .query("SELECT id FROM collections WHERE id = ? AND identity_id = ?")
          .get(body.collectionId, identity.id) as { id: string } | null;
        if (collection) collectionId = collection.id;
      }
      const recordedDate = body.recordedAt ? new Date(body.recordedAt) : new Date(row.recorded_at);
      const withdrawingTrainingUse = Boolean(row.allow_training) && body.allowTraining === false;
      const trainingUseChanged =
        body.allowTraining !== undefined && Boolean(body.allowTraining) !== Boolean(row.allow_training);
      db.query(
        `UPDATE recordings SET title = ?, category = ?, collection_id = ?, recorded_at = ?, description = ?, tags_json = ?, allow_training = ?, approved = ? WHERE id = ?`,
      ).run(
        String(body.title ?? row.title).slice(0, 160),
        category,
        collectionId,
        Number.isNaN(recordedDate.getTime()) ? row.recorded_at : recordedDate.toISOString(),
        String(body.description ?? row.description).slice(0, 1200),
        JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 20).map((t) => String(t).slice(0, 60)) : parseTags(row.tags_json)),
        body.allowTraining === undefined ? row.allow_training : body.allowTraining ? 1 : 0,
        body.approved === undefined ? row.approved : body.approved ? 1 : 0,
        recordingId,
      );
      // Turning training use off retracts the recording from inferred evidence
      // instead of only excluding it from the next mining run.
      const withdrawal = withdrawingTrainingUse ? withdrawRecordingEvidence(identity.id, recordingId) : null;
      if (trainingUseChanged) invalidateMiningAudit(identity.id, "training use changed on a recording");
      return json({ training: buildTrainingState(identity.id), withdrawal });
    }

    if (method === "POST" && sub === "analysis") {
      const body = await readJson<{ derived?: unknown; duration?: number }>(req);
      const duration = Number(body.duration) || row.duration || 0;
      const derived = sanitizeDerived(body.derived, duration);
      if (!derived.frames.length && !derived.speech) {
        return fail("The analysis contained no samples, so nothing was stored.", 400);
      }
      saveDerived(identity.id, recordingId, derived);
      return json({ training: buildTrainingState(identity.id) });
    }

    if (method === "POST" && sub === "fail") {
      const body = await readJson<{ error?: string }>(req);
      clearDerived(identity.id, recordingId, String(body.error ?? "Analysis failed."));
      return json({ training: buildTrainingState(identity.id) });
    }

    if (method === "DELETE") {
      await removeFile(row.path);
      db.query("DELETE FROM recording_analysis WHERE recording_id = ?").run(recordingId);
      db.query("DELETE FROM segments WHERE recording_id = ? AND identity_id = ?").run(recordingId, identity.id);
      db.query("DELETE FROM recordings WHERE id = ? AND identity_id = ?").run(recordingId, identity.id);
      pruneMannerismEvidence(identity.id, recordingId);
      const remaining = db.query("SELECT COUNT(*) AS n FROM recordings WHERE identity_id = ?").get(identity.id) as { n: number };
      if (remaining.n === 0) clearMiningAudit(identity.id);
      else invalidateMiningAudit(identity.id, "a recording was deleted");
      return json({ training: buildTrainingState(identity.id) });
    }
  }

  if (path === "/api/segments" && method === "POST") {
    const identity = getIdentityRow();
    const body = await readJson<{ recordingId?: string; label?: string; category?: string; emotion?: string; start?: number; end?: number }>(req);
    const category = SEGMENT_CATEGORIES.some((c) => c.key === body.category) ? body.category! : "expression";
    const result = createSegment(identity.id, {
      recordingId: String(body.recordingId ?? ""),
      label: String(body.label ?? "Reference segment"),
      category,
      emotion: String(body.emotion ?? ""),
      start: Number(body.start ?? 0),
      end: Number(body.end ?? 0),
    });
    if ("error" in result) return fail(String(result.error ?? "The segment could not be created."), result.status);
    return json({ training: buildTrainingState(identity.id), segmentId: result.id });
  }

  const segmentMatch = /^\/api\/segments\/([\w-]+)$/.exec(path);
  if (segmentMatch) {
    const identity = getIdentityRow();
    const row = db.query("SELECT * FROM segments WHERE id = ? AND identity_id = ?").get(segmentMatch[1], identity.id) as any;
    if (!row) return fail("Segment not found.", 404);
    if (method === "PATCH") {
      const body = await readJson<{ review?: string; label?: string; emotion?: string }>(req);
      const review = ["pending", "approved", "rejected"].includes(body.review ?? "") ? body.review : row.review;
      db.query("UPDATE segments SET review = ?, label = ?, emotion = ? WHERE id = ?").run(
        review,
        String(body.label ?? row.label).slice(0, 160),
        String(body.emotion ?? row.emotion).slice(0, 60),
        row.id,
      );
      return json({ training: buildTrainingState(identity.id) });
    }
    if (method === "DELETE") {
      db.query("DELETE FROM segments WHERE id = ? AND identity_id = ?").run(row.id, identity.id);
      return json({ training: buildTrainingState(identity.id) });
    }
  }

  if (path === "/api/mannerisms/suggest" && method === "POST") {
    const identity = getIdentityRow();
    const result = suggestMannerisms(identity.id);
    return json({
      training: buildTrainingState(identity.id),
      created: result.created,
      updated: result.updated,
    });
  }

  if (path === "/api/mannerisms" && method === "POST") {
    const identity = getIdentityRow();
    const body = await readJson<{ title?: string; category?: string; description?: string }>(req);
    const title = String(body.title ?? "").trim();
    if (!title) return fail("Give the mannerism a title.");
    const id = randomUUID();
    db.query(
      `INSERT INTO mannerisms (id, identity_id, key, title, category, description, evidence_json, occurrences, confidence, review, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '[]', 0, 'unverified', 'pending', 'manual', ?, ?)`,
    ).run(
      id,
      identity.id,
      `manual-${id}`,
      title.slice(0, 200),
      String(body.category ?? "Personal").slice(0, 60),
      String(body.description ?? "").slice(0, 800),
      now(),
      now(),
    );
    return json({ training: buildTrainingState(identity.id), id });
  }

  const mannerismMatch = /^\/api\/mannerisms\/([\w-]+)$/.exec(path);
  if (mannerismMatch) {
    const identity = getIdentityRow();
    const row = db.query("SELECT * FROM mannerisms WHERE id = ? AND identity_id = ?").get(mannerismMatch[1], identity.id) as any;
    if (!row) return fail("Mannerism not found.", 404);
    if (method === "PATCH") {
      const body = await readJson<{ review?: string; title?: string; description?: string; category?: string }>(req);
      if (body.review === "approved") {
        let evidenceLength = 0;
        try {
          evidenceLength = (JSON.parse(row.evidence_json) as unknown[]).length;
        } catch {
          evidenceLength = 0;
        }
        if (row.source !== "manual" && (row.confidence !== "consistent" || evidenceLength < 2)) {
          const reason =
            row.confidence === "mixed"
              ? "The recordings disagree on this pattern, so it cannot be approved as a permanent trait."
              : row.confidence === "unverified"
                ? "Agreement has not been measured for this pattern yet. Run 'Find recurring patterns' again before approving it."
                : "This pattern is measured in a single recording. Record more footage so it recurs before approving it — temporary behaviour is never approved as a permanent trait.";
          return fail(reason, 422);
        }
      }
      const review = ["pending", "approved", "rejected"].includes(body.review ?? "") ? body.review : row.review;
      db.query("UPDATE mannerisms SET review = ?, title = ?, description = ?, category = ?, updated_at = ? WHERE id = ?").run(
        review,
        String(body.title ?? row.title).slice(0, 200),
        String(body.description ?? row.description).slice(0, 800),
        String(body.category ?? row.category).slice(0, 60),
        now(),
        row.id,
      );
      return json({ training: buildTrainingState(identity.id) });
    }
    if (method === "DELETE") {
      db.query("DELETE FROM mannerisms WHERE id = ? AND identity_id = ?").run(row.id, identity.id);
      return json({ training: buildTrainingState(identity.id) });
    }
  }

  if (path === "/api/collections" && method === "POST") {
    const identity = getIdentityRow();
    const body = await readJson<{ name?: string; description?: string; code?: string }>(req);
    const name = String(body.name ?? "").trim();
    if (!name) return fail("Give the collection a name.");
    const existing = db.query("SELECT COUNT(*) AS n FROM collections WHERE identity_id = ?").get(identity.id) as { n: number };
    const code = String(body.code ?? "").trim().slice(0, 6) || String.fromCharCode(65 + (existing.n % 26));
    db.query(
      "INSERT INTO collections (id, identity_id, code, name, description, preset, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
    ).run(randomUUID(), identity.id, code, name.slice(0, 80), String(body.description ?? "").slice(0, 400), now());
    return json({ training: buildTrainingState(identity.id) });
  }

  const collectionMatch = /^\/api\/collections\/([\w-]+)$/.exec(path);
  if (collectionMatch) {
    const identity = getIdentityRow();
    const row = db.query("SELECT * FROM collections WHERE id = ? AND identity_id = ?").get(collectionMatch[1], identity.id) as any;
    if (!row) return fail("Collection not found.", 404);
    if (method === "PATCH") {
      const body = await readJson<{ name?: string; description?: string }>(req);
      db.query("UPDATE collections SET name = ?, description = ? WHERE id = ?").run(
        String(body.name ?? row.name).slice(0, 80),
        String(body.description ?? row.description).slice(0, 400),
        row.id,
      );
      return json({ training: buildTrainingState(identity.id) });
    }
    if (method === "DELETE") {
      if (row.preset) return fail("The seven starter collections are fixed. Rename it instead of deleting it.", 409);
      const fallback = db.query("SELECT id FROM collections WHERE identity_id = ? ORDER BY code LIMIT 1").get(identity.id) as { id: string } | null;
      db.query("UPDATE recordings SET collection_id = ? WHERE collection_id = ?").run(fallback?.id ?? "", row.id);
      db.query("DELETE FROM collections WHERE id = ?").run(row.id);
      return json({ training: buildTrainingState(identity.id) });
    }
  }

  if (path === "/api/behavior-profiles" && method === "POST") {
    const identity = getIdentityRow();
    const body = await readJson<{
      label?: string;
      notes?: string;
      speechNotes?: string;
      expressionNotes?: string;
      movementNotes?: string;
      mannerismIds?: string[];
      segmentIds?: string[];
    }>(req);
    const max = db.query("SELECT COALESCE(MAX(number), 0) AS n FROM behavior_profiles WHERE identity_id = ?").get(identity.id) as { n: number };
    const content = buildProfileContent(
      identity.id,
      { speechNotes: body.speechNotes, expressionNotes: body.expressionNotes, movementNotes: body.movementNotes },
      { mannerismIds: body.mannerismIds, segmentIds: body.segmentIds },
    );
    if (!content.mannerismIds.length && !content.segmentIds.length) {
      return fail("Approve at least one mannerism or reference segment before snapshotting a behaviour profile.", 409);
    }
    db.query(
      "INSERT INTO behavior_profiles (id, identity_id, number, label, status, content_json, notes, created_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)",
    ).run(
      randomUUID(),
      identity.id,
      max.n + 1,
      String(body.label ?? `Behaviour profile v${max.n + 1}`).slice(0, 160),
      JSON.stringify(content),
      String(body.notes ?? "").slice(0, 4000),
      now(),
    );
    return json({ training: buildTrainingState(identity.id) });
  }

  const profileMatch = /^\/api\/behavior-profiles\/([\w-]+)\/(approve|reject|restore)$/.exec(path);
  if (profileMatch && method === "POST") {
    const identity = getIdentityRow();
    const [, profileId, action] = profileMatch;
    const row = db.query("SELECT * FROM behavior_profiles WHERE id = ? AND identity_id = ?").get(profileId, identity.id) as any;
    if (!row) return fail("Behaviour profile not found.", 404);

    if (action === "approve") {
      db.transaction(() => {
        db.query("UPDATE behavior_profiles SET status = 'superseded' WHERE identity_id = ? AND status = 'approved'").run(identity.id);
        db.query("UPDATE behavior_profiles SET status = 'approved', approved_at = ? WHERE id = ?").run(now(), profileId);
      })();
      return json({ training: buildTrainingState(identity.id) });
    }
    if (action === "reject") {
      db.query("UPDATE behavior_profiles SET status = 'rejected' WHERE id = ?").run(profileId);
      return json({ training: buildTrainingState(identity.id) });
    }
    const max = db.query("SELECT COALESCE(MAX(number), 0) AS n FROM behavior_profiles WHERE identity_id = ?").get(identity.id) as { n: number };
    db.query(
      "INSERT INTO behavior_profiles (id, identity_id, number, label, status, content_json, notes, created_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)",
    ).run(
      randomUUID(),
      identity.id,
      max.n + 1,
      `Restored from v${row.number}`.slice(0, 160),
      row.content_json,
      row.notes,
      now(),
    );
    return json({ training: buildTrainingState(identity.id) });
  }

  if (path === "/api/export/behavior" && method === "POST") {
    const identity = getIdentityRow();
    const body = await readJson<{ type?: "markdown" | "json" }>(req);
    const type = body.type === "json" ? "json" : "markdown";
    ensureCollections(identity.id);
    const training = buildTrainingState(identity.id);
    const content = type === "json" ? JSON.stringify(training, null, 2) : behaviorMarkdown(training, identity.name);
    const name = `destinie-behaviour-reference.${type === "json" ? "json" : "md"}`;
    const mime = type === "json" ? "application/json" : "text/markdown; charset=utf-8";
    const bytes = new TextEncoder().encode(content);
    const stored = await writePrivateFile(EXPORT_DIR, bytes, type === "json" ? "json" : "md");
    const assetId = randomUUID();
    db.query(
      `INSERT INTO assets (id, identity_id, kind, path, mime, bytes, original_name, created_at)
       VALUES (?, ?, 'export', ?, ?, ?, ?, ?)`,
    ).run(assetId, identity.id, stored.path, mime, bytes.byteLength, name, now());
    return json({ training, assetId, name, content });
  }

  if (path === "/api/privacy/delete-recordings" && method === "POST") {
    const identity = getIdentityRow();
    const rows = db.query("SELECT * FROM recordings WHERE identity_id = ?").all(identity.id) as any[];
    for (const row of rows) await removeFile(row.path);
    db.transaction(() => {
      db.query("DELETE FROM recording_analysis WHERE identity_id = ?").run(identity.id);
      db.query("DELETE FROM segments WHERE identity_id = ?").run(identity.id);
      db.query("DELETE FROM mannerisms WHERE identity_id = ?").run(identity.id);
      db.query("DELETE FROM recordings WHERE identity_id = ?").run(identity.id);
    })();
    // No footage is left, so no measurement from it may remain either.
    clearMiningAudit(identity.id);
    return json({ training: buildTrainingState(identity.id), deleted: rows.length });
  }

  /* ---------------------------------------------------------------- */
  /* Creations                                                         */
  /* ---------------------------------------------------------------- */

  if (path === "/api/creations" && method === "POST") {
    const identity = getIdentityRow();
    const body = await readJson<{ title?: string; kind?: string; collection?: string; generationId?: string; notes?: string }>(req);
    const title = String(body.title ?? "").trim();
    if (!title) return fail("Give the creation a title.");
    db.query(
      "INSERT INTO creations (id, identity_id, title, kind, collection, generation_id, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      randomUUID(),
      identity.id,
      title.slice(0, 160),
      String(body.kind ?? "image").slice(0, 60),
      String(body.collection ?? "").slice(0, 80),
      body.generationId ?? null,
      String(body.notes ?? "").slice(0, 800),
      now(),
    );
    return json(buildState());
  }

  const creationMatch = /^\/api\/creations\/([\w-]+)$/.exec(path);
  if (creationMatch && method === "DELETE") {
    const identity = getIdentityRow();
    db.query("DELETE FROM creations WHERE id = ? AND identity_id = ?").run(creationMatch[1], identity.id);
    return json(buildState());
  }

  /* ---------------------------------------------------------------- */
  /* Settings                                                          */
  /* ---------------------------------------------------------------- */

  if (path === "/api/settings" && method === "PUT") {
    const body = await readJson<Partial<Settings>>(req);
    const next: Partial<Settings> = {};
    if (typeof body.allowExternalReferenceUpload === "boolean") next.allowExternalReferenceUpload = body.allowExternalReferenceUpload;
    if (body.preferredImageProvider === "fal" || body.preferredImageProvider === "openai") next.preferredImageProvider = body.preferredImageProvider;
    if (typeof body.defaultIdentityStrength === "number") {
      next.defaultIdentityStrength = Math.max(55, Math.min(100, Math.round(body.defaultIdentityStrength)));
    }
    if (typeof body.requireReviewBeforeMaster === "boolean") next.requireReviewBeforeMaster = body.requireReviewBeforeMaster;
    if (typeof body.defaultEnvironmentId === "string") next.defaultEnvironmentId = body.defaultEnvironmentId.slice(0, 80);
    if (typeof body.studioName === "string") next.studioName = body.studioName.slice(0, 120);
    writeSettings(next as Record<string, unknown>);
    return json(buildState());
  }

  /* ---------------------------------------------------------------- */
  /* Privacy                                                           */
  /* ---------------------------------------------------------------- */

  if (path === "/api/privacy/delete-photos" && method === "POST") {
    const identity = getIdentityRow();
    const rows = db.query("SELECT * FROM photos WHERE identity_id = ?").all(identity.id) as any[];
    for (const row of rows) await removeFile(row.path);
    db.query("DELETE FROM photos WHERE identity_id = ?").run(identity.id);
    db.query("UPDATE identity SET master_photo_id = NULL WHERE id = ?").run(identity.id);
    return json({ state: buildState(), deleted: rows.length });
  }

  if (path === "/api/privacy/delete-generations" && method === "POST") {
    const identity = getIdentityRow();
    const rows = db.query("SELECT * FROM assets WHERE identity_id = ? AND kind = 'generation'").all(identity.id) as any[];
    for (const row of rows) await removeFile(row.path);
    db.query("DELETE FROM assets WHERE identity_id = ? AND kind = 'generation'").run(identity.id);
    db.query("DELETE FROM generations WHERE identity_id = ?").run(identity.id);
    return json({ state: buildState(), deleted: rows.length });
  }

  if (path === "/api/privacy/delete-all" && method === "POST") {
    const body = await readJson<{ confirm?: string }>(req);
    if (body.confirm !== "DELETE EVERYTHING") {
      return fail('Type "DELETE EVERYTHING" to confirm. This removes the identity, all photographs, generations, models and audio from this computer.', 400);
    }
    const identity = getIdentityRow();
    for (const table of [
      "photos",
      "assets",
      "generations",
      "models",
      "audio",
      "creations",
      "versions",
      "recordings",
      "recording_analysis",
      "segments",
      "mannerisms",
      "behavior_profiles",
      "collections",
    ]) {
      const rows = db.query(`SELECT * FROM ${table} WHERE ${table === "versions" ? "identity_id" : "identity_id"}`).all(identity.id) as any[];
      for (const row of rows) if (row.path) await removeFile(row.path);
      db.query(`DELETE FROM ${table} WHERE identity_id = ?`).run(identity.id);
    }
    db.query("DELETE FROM identity").run();
    db.query("DELETE FROM settings").run();
    ensureIdentity();
    return json({ state: buildState(), deleted: true });
  }

  return fail(`No route for ${method} ${path}`, 404);
}

function parseTags(json: string | null): string[] {
  try {
    const parsed = JSON.parse(json ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Static files (production build)                                     */
/* ------------------------------------------------------------------ */

async function serveStatic(pathname: string): Promise<Response> {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const target = resolve(join(DIST_DIR, decodeURIComponent(safePath)));
  if (!target.startsWith(resolve(DIST_DIR))) return fail("Not found.", 404);
  if (existsSync(target)) {
    const file = Bun.file(target);
    if (await file.exists()) {
      const ext = target.split(".").pop() ?? "";
      const types: Record<string, string> = {
        html: "text/html; charset=utf-8",
        js: "text/javascript; charset=utf-8",
        css: "text/css; charset=utf-8",
        svg: "image/svg+xml",
        task: "application/octet-stream",
        wasm: "application/wasm",
        png: "image/png",
        jpg: "image/jpeg",
        json: "application/json",
      };
      return new Response(file, {
        headers: { "content-type": types[ext] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" },
      });
    }
  }
  const index = Bun.file(join(DIST_DIR, "index.html"));
  if (await index.exists()) return new Response(index, { headers: { "content-type": "text/html; charset=utf-8" } });
  return new Response(
    "Destinie AI Twin Studio API is running. Start the interface with `bun run dev` (development) or build it with `bun run build`.",
    { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

/* ------------------------------------------------------------------ */
/* Server                                                             */
/* ------------------------------------------------------------------ */

ensureIdentity();

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  maxRequestBodySize: 440 * 1024 * 1024,
  async fetch(req) {
    try {
      return await handle(req);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.message, err.status, err.extra);
      console.error("[api] unhandled error", err);
      const message = err instanceof Error ? err.message : "Unexpected server error.";
      return fail(message, 500);
    }
  },
});

console.log(`[api] Destinie AI Twin Studio API on http://127.0.0.1:${server.port}`);
console.log(`[api] Private data directory: ${DATA_DIR}`);

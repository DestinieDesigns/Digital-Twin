/**
 * Behaviour-learning persistence and aggregation.
 * The server never computes vision features itself — it validates, stores and
 * aggregates the on-device analysis, and it enforces the rules that keep
 * unverified patterns out of the approved profile.
 */
import { randomUUID } from "node:crypto";
import { db, now } from "./db";
import {
  COLLECTION_PRESETS,
  classifyAgreement,
  computeCoverage,
  mineMannerismsWithAudit,
  segmentMetrics as computeSegmentMetrics,
  speechProfile,
  summarizeAnalysis,
  TRAINING_INTEGRATIONS,
  type BehaviorProfile,
  type BehaviorProfileContent,
  type Collection,
  type AgreementRule,
  type DerivedAnalysis,
  type Mannerism,
  type MannerismEvidence,
  type MiningAudit,
  type ProfileFlag,
  type Recording,
  type Segment,
  type TrainingState,
  type TrainingStats,
} from "../shared/behavior";

/* ------------------------------------------------------------------ */
/* Collections                                                        */
/* ------------------------------------------------------------------ */

export function ensureCollections(identityId: string) {
  const existing = db.query("SELECT COUNT(*) AS n FROM collections WHERE identity_id = ?").get(identityId) as { n: number };
  if (existing.n > 0) return;
  const stmt = db.query(
    "INSERT INTO collections (id, identity_id, code, name, description, preset, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
  );
  for (const preset of COLLECTION_PRESETS) {
    stmt.run(randomUUID(), identityId, preset.code, preset.name, preset.description, now());
  }
}

function mapCollection(row: any): Collection {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    preset: Boolean(row.preset),
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* Row mappers                                                        */
/* ------------------------------------------------------------------ */

export function mapRecording(row: any): Recording {
  let analysis = null;
  if (row.analysis_summary_json) {
    try {
      analysis = JSON.parse(row.analysis_summary_json);
    } catch {
      analysis = null;
    }
  }
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags_json ?? "[]");
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    title: row.title,
    category: row.category as Recording["category"],
    collectionId: row.collection_id,
    recordedAt: row.recorded_at,
    description: row.description,
    tags: Array.isArray(tags) ? tags.slice(0, 30) : [],
    kind: row.kind as Recording["kind"],
    mime: row.mime,
    bytes: row.bytes,
    duration: row.duration,
    width: row.width,
    height: row.height,
    status: row.status as Recording["status"],
    allowTraining: Boolean(row.allow_training),
    approved: Boolean(row.approved),
    error: row.error,
    createdAt: row.created_at,
    hasAnalysis: Boolean(analysis),
    analysis,
  };
}

export function mapSegment(row: any, recordingTitle: string): Segment {
  let metrics: Record<string, number> = {};
  try {
    metrics = JSON.parse(row.metrics_json ?? "{}");
  } catch {
    metrics = {};
  }
  return {
    id: row.id,
    recordingId: row.recording_id,
    recordingTitle,
    label: row.label,
    category: row.category as Segment["category"],
    emotion: row.emotion,
    start: row.start,
    end: row.end,
    summary: row.summary,
    metrics,
    review: row.review as Segment["review"],
    createdAt: row.created_at,
  };
}

const CONFIDENCE_STATES: Mannerism["confidence"][] = ["consistent", "mixed", "single-observation", "unverified"];

export function mapMannerism(row: any): Mannerism {
  let evidence: MannerismEvidence[] = [];
  try {
    evidence = JSON.parse(row.evidence_json ?? "[]");
  } catch {
    evidence = [];
  }
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    category: row.category,
    description: row.description,
    evidence: Array.isArray(evidence) ? evidence : [],
    occurrences: row.occurrences,
    confidence: CONFIDENCE_STATES.includes(row.confidence) ? (row.confidence as Mannerism["confidence"]) : "unverified",
    review: row.review as Mannerism["review"],
    source: row.source as Mannerism["source"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProfile(row: any): BehaviorProfile {
  let content: BehaviorProfileContent;
  try {
    content = JSON.parse(row.content_json);
  } catch {
    content = emptyContent();
  }
  let flags: ProfileFlag[] = [];
  try {
    const parsed = JSON.parse(row.flags_json ?? "[]");
    if (Array.isArray(parsed)) flags = parsed.slice(0, 20) as ProfileFlag[];
  } catch {
    flags = [];
  }
  return {
    id: row.id,
    number: row.number,
    label: row.label,
    status: row.status as BehaviorProfile["status"],
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    notes: row.notes,
    content,
    flags,
  };
}

function emptyContent(): BehaviorProfileContent {
  return {
    mannerismIds: [],
    segmentIds: [],
    speechNotes: "",
    expressionNotes: "",
    movementNotes: "",
    coverage: [],
    speech: { categories: [], totalSeconds: 0 },
    expression: { labels: [], approvedSegments: 0, approvedSeconds: 0 },
    movement: { approvedSegments: 0, approvedSeconds: 0, cadence: null, gestureMean: null },
  };
}

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

export function buildTrainingState(identityId: string): TrainingState {
  ensureCollections(identityId);
  const recordings = (db.query("SELECT * FROM recordings WHERE identity_id = ? ORDER BY created_at DESC").all(identityId) as any[]).map(mapRecording);
  const titleById = new Map(recordings.map((r) => [r.id, r.title]));
  const segments = (db.query("SELECT * FROM segments WHERE identity_id = ? ORDER BY created_at DESC").all(identityId) as any[]).map((row) =>
    mapSegment(row, titleById.get(row.recording_id) ?? "Deleted recording"),
  );
  const mannerisms = (db.query("SELECT * FROM mannerisms WHERE identity_id = ? ORDER BY created_at DESC").all(identityId) as any[]).map(mapMannerism);
  const collections = (db.query("SELECT * FROM collections WHERE identity_id = ? ORDER BY code ASC").all(identityId) as any[]).map(mapCollection);
  const profiles = (db.query("SELECT * FROM behavior_profiles WHERE identity_id = ? ORDER BY number DESC").all(identityId) as any[]).map(mapProfile);

  const videoSeconds = recordings.filter((r) => r.kind === "video").reduce((sum, r) => sum + r.duration, 0);
  const audioSeconds = recordings.filter((r) => r.kind === "audio").reduce((sum, r) => sum + r.duration, 0);
  const lastRow = db.query("SELECT MAX(created_at) AS at FROM recording_analysis WHERE identity_id = ?").get(identityId) as { at: string | null };

  const stats: TrainingStats = {
    recordings: recordings.length,
    videos: recordings.filter((r) => r.kind === "video").length,
    audio: recordings.filter((r) => r.kind === "audio").length,
    videoSeconds: Math.round(videoSeconds),
    audioSeconds: Math.round(audioSeconds),
    analyzed: recordings.filter((r) => r.status === "analyzed").length,
    approved: recordings.filter((r) => r.approved).length,
    failed: recordings.filter((r) => r.status === "failed").length,
    segments: segments.length,
    approvedSegments: segments.filter((s) => s.review === "approved").length,
    mannerisms: mannerisms.length,
    approvedMannerisms: mannerisms.filter((m) => m.review === "approved").length,
    pendingMannerisms: mannerisms.filter((m) => m.review === "pending").length,
    collections: collections.length,
    storageBytes: recordings.reduce((sum, r) => sum + r.bytes, 0),
    lastAnalyzedAt: lastRow?.at ?? null,
  };

  return {
    recordings,
    segments,
    mannerisms,
    collections,
    profiles,
    stats,
    coverage: computeCoverage(recordings, segments, mannerisms),
    integrations: TRAINING_INTEGRATIONS,
    miningAudit: getMiningAudit(identityId),
  };
}

/* ------------------------------------------------------------------ */
/* Mining audit                                                       */
/* ------------------------------------------------------------------ */

const auditKey = (identityId: string) => `mining_audit:${identityId}`;

export function getMiningAudit(identityId: string): MiningAudit | null {
  const row = db.query("SELECT value FROM settings WHERE key = ?").get(auditKey(identityId)) as { value: string } | null;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as MiningAudit;
    return parsed && Array.isArray(parsed.rows) ? parsed : null;
  } catch {
    return null;
  }
}

function saveMiningAudit(identityId: string, audit: MiningAudit) {
  db.query(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(auditKey(identityId), JSON.stringify(audit));
}

/**
 * Mark the stored audit as out of date after recordings change. The rows are
 * kept for reference but must never be presented as describing current data.
 */
export function invalidateMiningAudit(identityId: string, reason: string) {
  const audit = getMiningAudit(identityId);
  if (!audit || audit.staleAt) return;
  saveMiningAudit(identityId, { ...audit, staleAt: now(), staleReason: reason });
}

/** Remove the audit entirely, e.g. when every recording is deleted. */
export function clearMiningAudit(identityId: string) {
  db.query("DELETE FROM settings WHERE key = ?").run(auditKey(identityId));
}

/* ------------------------------------------------------------------ */
/* Derived analysis                                                   */
/* ------------------------------------------------------------------ */

export function getDerived(recordingId: string): DerivedAnalysis | null {
  const row = db.query("SELECT derived_json FROM recording_analysis WHERE recording_id = ?").get(recordingId) as { derived_json: string } | null;
  if (!row) return null;
  try {
    return JSON.parse(row.derived_json) as DerivedAnalysis;
  } catch {
    return null;
  }
}

const EVENT_TYPES: DerivedAnalysis["events"][number]["type"][] = [
  "smile",
  "laugh",
  "blink-cluster",
  "gesture-burst",
  "head-turn",
  "posture-shift",
  "walking",
  "sung-phrase",
];

const num = (value: unknown, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clampNumber = (value: unknown, min: number, max: number, fallback = 0) => Math.max(min, Math.min(max, num(value, fallback)));
const str = (value: unknown, max = 400) => String(value ?? "").slice(0, max);

/** Structural validation of the on-device analysis payload. */
export function sanitizeDerived(input: any, duration: number): DerivedAnalysis {
  const frames = Array.isArray(input?.frames) ? input.frames.slice(0, 2000) : [];
  const cleanFrames = frames.map((frame: any) => ({
    t: clampNumber(frame?.t, 0, Math.max(duration, 0) + 1),
    face: clampNumber(frame?.face, 0, 1),
    pose: clampNumber(frame?.pose, 0, 1),
    smileL: clampNumber(frame?.smileL, 0, 1),
    smileR: clampNumber(frame?.smileR, 0, 1),
    smile: clampNumber(frame?.smile, 0, 1),
    jaw: clampNumber(frame?.jaw, 0, 1),
    brow: clampNumber(frame?.brow, 0, 1),
    blink: clampNumber(frame?.blink, 0, 1),
    squint: clampNumber(frame?.squint, 0, 1),
    frown: clampNumber(frame?.frown, 0, 1),
    yaw: clampNumber(frame?.yaw, -1.5, 1.5),
    pitch: clampNumber(frame?.pitch, -1.5, 1.5),
    roll: clampNumber(frame?.roll, -90, 90),
    gazeX: clampNumber(frame?.gazeX, -2, 2),
    gazeY: clampNumber(frame?.gazeY, -2, 2),
    armL: clampNumber(frame?.armL, 0, 4),
    armR: clampNumber(frame?.armR, 0, 4),
    sway: clampNumber(frame?.sway, -1, 2),
    gesture: clampNumber(frame?.gesture, 0, 6),
    shoulderTilt: clampNumber(frame?.shoulderTilt, -1, 1),
    stepPhase: clampNumber(frame?.stepPhase, -2, 2),
  }));

  const times = Array.isArray(input?.blends?.times) ? input.blends.times.slice(0, 2000).map((t: unknown) => clampNumber(t, 0, duration + 1)) : [];
  const channels: Record<string, number[]> = {};
  if (input?.blends?.channels && typeof input.blends.channels === "object") {
    for (const [key, values] of Object.entries(input.blends.channels)) {
      if (!Array.isArray(values)) continue;
      channels[str(key, 40)] = values.slice(0, 2000).map((v) => clampNumber(v, 0, 1));
    }
  }

  const events = Array.isArray(input?.events) ? input.events.slice(0, 120) : [];
  const cleanEvents = events
    .filter((event: any) => EVENT_TYPES.includes(event?.type))
    .map((event: any) => ({
      type: event.type as DerivedAnalysis["events"][number]["type"],
      start: clampNumber(event?.start, 0, duration),
      end: clampNumber(event?.end, 0, duration),
      label: str(event?.label, 160),
      score: clampNumber(event?.score, 0, 10),
      metrics:
        typeof event?.metrics === "object" && event.metrics
          ? Object.fromEntries(Object.entries(event.metrics).slice(0, 12).map(([k, v]) => [str(k, 40), num(v)]))
          : {},
    }));

  const coverageSeconds = cleanFrames.length ? clampNumber(cleanFrames[cleanFrames.length - 1].t - cleanFrames[0].t, 0, duration) : 0;

  const derived: DerivedAnalysis = {
    version: 1,
    engine: str(input?.engine, 240) || "MediaPipe Face + Pose Landmarker · on-device",
    analyzedAt: new Date().toISOString(),
    duration: clampNumber(duration, 0, 60 * 60 * 8),
    sampleStep: clampNumber(input?.sampleStep, 0.1, 5, 1),
    coverageSeconds: Number(coverageSeconds.toFixed(2)),
    frames: cleanFrames,
    blends: { times, channels },
    events: cleanEvents,
    face: input?.face
      ? {
          faceFrames: clampNumber(input.face.faceFrames, 0, 5000),
          smileMean: clampNumber(input.face.smileMean, 0, 1),
          smileAsymmetry: clampNumber(input.face.smileAsymmetry, -1, 1),
          jawMean: clampNumber(input.face.jawMean, 0, 1),
          browMean: clampNumber(input.face.browMean, 0, 1),
          blinkPerMinute: clampNumber(input.face.blinkPerMinute, 0, 200),
          blinkCount: clampNumber(input.face.blinkCount, 0, 2000),
          squintMean: clampNumber(input.face.squintMean, 0, 1),
          frownMean: clampNumber(input.face.frownMean, 0, 1),
          headTiltMean: clampNumber(input.face.headTiltMean, -90, 90),
          headTiltDominant: ["left", "right", "none"].includes(input.face.headTiltDominant) ? input.face.headTiltDominant : "none",
          headYawRange: clampNumber(input.face.headYawRange, 0, 3),
          nodPerMinute: clampNumber(input.face.nodPerMinute, 0, 300),
          gazeOffShare: clampNumber(input.face.gazeOffShare, 0, 1),
          expressionMix:
            input.face.expressionMix && typeof input.face.expressionMix === "object"
              ? Object.fromEntries(Object.entries(input.face.expressionMix).slice(0, 20).map(([k, v]) => [str(k, 40), clampNumber(v, 0, 1, 0)]))
              : {},
        }
      : null,
    pose: input?.pose
      ? {
          poseFrames: clampNumber(input.pose.poseFrames, 0, 5000),
          gestureMean: clampNumber(input.pose.gestureMean, 0, 6),
          gesturePeak: clampNumber(input.pose.gesturePeak, 0, 6),
          armMean: clampNumber(input.pose.armMean, 0, 4),
          twoHandedShare: clampNumber(input.pose.twoHandedShare, 0, 1),
          shoulderTiltMean: clampNumber(input.pose.shoulderTiltMean, -1, 1),
          shoulderHigher: ["left", "right", "even"].includes(input.pose.shoulderHigher) ? input.pose.shoulderHigher : "even",
          stanceWidthMean: input.pose.stanceWidthMean === null ? null : clampNumber(input.pose.stanceWidthMean, 0, 10),
          kneeFlexionMean: input.pose.kneeFlexionMean === null ? null : clampNumber(input.pose.kneeFlexionMean, 0, 180),
          swayRange: clampNumber(input.pose.swayRange, 0, 5),
          stepCadence: input.pose.stepCadence === null ? null : clampNumber(input.pose.stepCadence, 0, 300),
          walkingShare: clampNumber(input.pose.walkingShare, 0, 1),
        }
      : null,
    speech: input?.speech
      ? {
          durationSeconds: clampNumber(input.speech.durationSeconds, 0, 60 * 60 * 8),
          sampleRate: clampNumber(input.speech.sampleRate, 0, 192000),
          peakDb: clampNumber(input.speech.peakDb, -120, 24),
          rmsDb: clampNumber(input.speech.rmsDb, -120, 24),
          medianF0: input.speech.medianF0 === null ? null : clampNumber(input.speech.medianF0, 40, 1500),
          f0Min: input.speech.f0Min === null ? null : clampNumber(input.speech.f0Min, 40, 1500),
          f0Max: input.speech.f0Max === null ? null : clampNumber(input.speech.f0Max, 40, 1500),
          intonationRangeSemitones: input.speech.intonationRangeSemitones === null ? null : clampNumber(input.speech.intonationRangeSemitones, 0, 60),
          voicedRatio: clampNumber(input.speech.voicedRatio, 0, 1),
          speechRateSyllablesPerMinute: input.speech.speechRateSyllablesPerMinute === null ? null : clampNumber(input.speech.speechRateSyllablesPerMinute, 0, 900),
          pauseCount: clampNumber(input.speech.pauseCount, 0, 10000),
          pauseRatio: clampNumber(input.speech.pauseRatio, 0, 1),
          meanPauseSeconds: input.speech.meanPauseSeconds === null ? null : clampNumber(input.speech.meanPauseSeconds, 0, 60),
          longestPauseSeconds: input.speech.longestPauseSeconds === null ? null : clampNumber(input.speech.longestPauseSeconds, 0, 600),
          loudnessRangeDb: clampNumber(input.speech.loudnessRangeDb, 0, 120),
          vibratoRateHz: input.speech.vibratoRateHz === null ? null : clampNumber(input.speech.vibratoRateHz, 0, 30),
          vibratoExtentCents: input.speech.vibratoExtentCents === null ? null : clampNumber(input.speech.vibratoExtentCents, 0, 500),
          energyContour: Array.isArray(input.speech.energyContour) ? input.speech.energyContour.slice(0, 400).map((v: unknown) => clampNumber(v, 0, 1)) : [],
          pitchContour: Array.isArray(input.speech.pitchContour)
            ? input.speech.pitchContour.slice(0, 400).map((v: unknown) => (v === null ? null : clampNumber(v, 40, 1500)))
            : [],
          method: str(input.speech.method, 240) || "Web Audio · on-device",
          warnings: Array.isArray(input.speech.warnings) ? input.speech.warnings.slice(0, 8).map((w: unknown) => str(w, 240)) : [],
        }
      : null,
    notes: Array.isArray(input?.notes) ? input.notes.slice(0, 20).map((n: unknown) => str(n, 300)) : [],
    limitations: Array.isArray(input?.limitations) ? input.limitations.slice(0, 12).map((n: unknown) => str(n, 300)) : [],
  };
  return derived;
}

export function saveDerived(identityId: string, recordingId: string, derived: DerivedAnalysis) {
  const summary = summarizeAnalysis(derived);
  db.transaction(() => {
    db.query(
      "INSERT INTO recording_analysis (recording_id, identity_id, derived_json, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(recording_id) DO UPDATE SET derived_json = excluded.derived_json, created_at = excluded.created_at",
    ).run(recordingId, identityId, JSON.stringify(derived), now());
    db.query(
      "UPDATE recordings SET analysis_summary_json = ?, duration = CASE WHEN duration > 0 THEN duration ELSE ? END, status = 'analyzed', error = NULL WHERE id = ? AND identity_id = ?",
    ).run(JSON.stringify(summary), derived.duration, recordingId, identityId);
  })();
  invalidateMiningAudit(identityId, "a recording was analysed or re-analysed");
  return summary;
}

/**
 * Discard a stored analysis after a failed run.
 *
 * A failed re-analysis must not leave the earlier features in place: the
 * library would keep showing "analysed" chips and the workspace would open an
 * old timeline as if the new run had produced it. Segments the user already
 * reviewed are kept — they are their own snapshots — but the derived timeline,
 * the summary and the analysed status are removed.
 */
export function clearDerived(identityId: string, recordingId: string, error: string) {
  db.transaction(() => {
    db.query("DELETE FROM recording_analysis WHERE recording_id = ? AND identity_id = ?").run(recordingId, identityId);
    db.query(
      "UPDATE recordings SET status = 'failed', error = ?, analysis_summary_json = NULL WHERE id = ? AND identity_id = ?",
    ).run(error.slice(0, 800), recordingId, identityId);
  })();
  invalidateMiningAudit(identityId, "a stored analysis was cleared");
}

/* ------------------------------------------------------------------ */
/* Segments                                                           */
/* ------------------------------------------------------------------ */

export function createSegment(
  identityId: string,
  input: { recordingId: string; label: string; category: string; emotion: string; start: number; end: number },
) {
  const row = db.query("SELECT * FROM recordings WHERE id = ? AND identity_id = ?").get(input.recordingId, identityId) as any;
  if (!row) return { error: "Recording not found." as const, status: 404 };
  const derived = getDerived(input.recordingId);
  if (!derived) return { error: "Analyse this recording before creating segments from it." as const, status: 409 };

  const start = Math.max(0, Math.min(input.start, input.end));
  const end = Math.min(derived.duration, Math.max(input.start, input.end));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.5) {
    return { error: "A segment must be at least half a second long." as const, status: 400 };
  }
  const computed = computeSegmentMetrics(derived, start, end);
  const id = randomUUID();
  db.query(
    `INSERT INTO segments (id, identity_id, recording_id, label, category, emotion, start, end, summary, metrics_json, review, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(
    id,
    identityId,
    input.recordingId,
    str(input.label, 160) || "Reference segment",
    str(input.category, 40),
    str(input.emotion, 60),
    Number(start.toFixed(2)),
    Number(end.toFixed(2)),
    computed.summary,
    JSON.stringify(computed.metrics),
    now(),
  );
  return { id, computed };
}

/* ------------------------------------------------------------------ */
/* Mannerisms                                                         */
/* ------------------------------------------------------------------ */

export function suggestMannerisms(identityId: string): { created: number; updated: number } {
  const rows = db
    .query("SELECT * FROM recordings WHERE identity_id = ? AND status = 'analyzed' AND allow_training = 1")
    .all(identityId) as any[];
  const sources = rows
    .map((row) => {
      const derived = getDerived(row.id);
      return derived ? { recordingId: row.id as string, title: row.title as string, analysis: derived } : null;
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  const { candidates, audit } = mineMannerismsWithAudit(sources);
  saveMiningAudit(identityId, audit);
  let created = 0;
  let updated = 0;
  const stamp = now();

  for (const candidate of candidates) {
    const existing = db.query("SELECT * FROM mannerisms WHERE identity_id = ? AND key = ?").get(identityId, candidate.key) as any;
    if (!existing) {
      db.query(
        `INSERT INTO mannerisms (id, identity_id, key, title, category, description, evidence_json, occurrences, confidence, agreement_json, review, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'suggested', ?, ?)`,
      ).run(
        randomUUID(),
        identityId,
        candidate.key,
        str(candidate.title, 200),
        str(candidate.category, 60),
        str(candidate.description, 800),
        JSON.stringify(candidate.evidence),
        candidate.occurrences,
        candidate.confidence,
        JSON.stringify(candidate.rule),
        stamp,
        stamp,
      );
      created++;
    } else if (existing.review === "pending" && existing.source === "suggested") {
      db.query(
        "UPDATE mannerisms SET title = ?, description = ?, evidence_json = ?, occurrences = ?, confidence = ?, agreement_json = ?, updated_at = ? WHERE id = ?",
      ).run(
        str(candidate.title, 200),
        str(candidate.description, 800),
        JSON.stringify(candidate.evidence),
        candidate.occurrences,
        candidate.confidence,
        JSON.stringify(candidate.rule),
        stamp,
        existing.id,
      );
      updated++;
    }
    // Reviewed (approved/rejected) patterns are never overwritten by a new analysis.
  }
  return { created, updated };
}

/* ------------------------------------------------------------------ */
/* Behaviour profile                                                  */
/* ------------------------------------------------------------------ */

/**
 * A recording can be deleted — or its "training use" permission withdrawn — at
 * any time. Any suggested mannerism that cited it loses that evidence; if the
 * pattern no longer recurs across two recordings it drops back to a single
 * observation and its approval is reset.
 */
function parseAgreementRule(raw: unknown): AgreementRule | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return null;
    if (!["sign", "absolute", "relative"].includes(value.mode)) return null;
    if (typeof value.unit !== "string") return null;
    if (value.mode !== "sign" && !Number.isFinite(Number(value.tolerance))) return null;
    return value as AgreementRule;
  } catch {
    return null;
  }
}

export function pruneMannerismEvidence(
  identityId: string,
  recordingId: string,
): { mannerismsRemoved: number; mannerismsUpdated: number } {
  const rows = db
    .query("SELECT * FROM mannerisms WHERE identity_id = ? AND source = 'suggested'")
    .all(identityId) as any[];
  let mannerismsRemoved = 0;
  let mannerismsUpdated = 0;
  for (const row of rows) {
    let evidence: MannerismEvidence[] = [];
    try {
      evidence = JSON.parse(row.evidence_json);
    } catch {
      evidence = [];
    }
    const next = evidence.filter((item) => item.recordingId !== recordingId);
    if (next.length === evidence.length) continue;
    if (!next.length) {
      db.query("DELETE FROM mannerisms WHERE id = ?").run(row.id);
      mannerismsRemoved++;
      continue;
    }
    const seconds = next.reduce((sum, item) => sum + (item.seconds || 0), 0);
    const values = next.map((item) => item.value).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    // Multiple recordings with no stored measurements cannot be re-judged and
    // must not silently keep an approval; label them unverified instead.
    const confidence =
      values.length < 2
        ? next.length >= 2 && seconds >= 20
          ? "unverified"
          : "single-observation"
        : classifyAgreement(values, parseAgreementRule(row.agreement_json), seconds);
    const occurrences = next.reduce((sum, item) => sum + (item.occurrences || 0), 0);
    db.query(
      "UPDATE mannerisms SET evidence_json = ?, occurrences = ?, confidence = ?, review = ?, updated_at = ? WHERE id = ?",
    ).run(
      JSON.stringify(next),
      occurrences,
      confidence,
      confidence === "consistent" ? row.review : "pending",
      now(),
      row.id,
    );
    mannerismsUpdated++;
  }
  return { mannerismsRemoved, mannerismsUpdated };
}

/**
 * Withdraw a recording from everything the behaviour module inferred from it.
 *
 * Flags are written before the evidence is pruned: pruning deletes the evidence
 * entries that identify which profiles cited the recording, so the citation has
 * to be captured first. Profiles are immutable snapshots, so they are marked
 * rather than rewritten, and the flag stays even if training use is re-enabled —
 * the evidence it was built from has already been retracted.
 */
export function withdrawRecordingEvidence(
  identityId: string,
  recordingId: string,
): { profilesFlagged: number; mannerismsRemoved: number; mannerismsUpdated: number } {
  const profilesFlagged = flagProfilesForWithdrawnRecording(identityId, recordingId);
  const pruned = pruneMannerismEvidence(identityId, recordingId);
  return { profilesFlagged, ...pruned };
}

function flagProfilesForWithdrawnRecording(identityId: string, recordingId: string): number {
  const recording = db
    .query("SELECT title FROM recordings WHERE id = ? AND identity_id = ?")
    .get(recordingId, identityId) as { title: string } | null;
  if (!recording) return 0;

  const segmentIds = new Set(
    (db.query("SELECT id FROM segments WHERE identity_id = ? AND recording_id = ?").all(identityId, recordingId) as { id: string }[]).map(
      (row) => row.id,
    ),
  );

  const citedMannerisms = new Map<string, string>();
  const mannerismRows = db.query("SELECT id, title, evidence_json FROM mannerisms WHERE identity_id = ?").all(identityId) as any[];
  for (const row of mannerismRows) {
    let evidence: MannerismEvidence[] = [];
    try {
      evidence = JSON.parse(row.evidence_json);
    } catch {
      evidence = [];
    }
    if (Array.isArray(evidence) && evidence.some((item) => item.recordingId === recordingId)) {
      citedMannerisms.set(row.id, row.title);
    }
  }

  const profiles = db.query("SELECT * FROM behavior_profiles WHERE identity_id = ?").all(identityId) as any[];
  let flagged = 0;
  for (const row of profiles) {
    let content: BehaviorProfileContent;
    try {
      content = JSON.parse(row.content_json);
    } catch {
      continue;
    }
    const citedSegments = (content.segmentIds ?? []).filter((id) => segmentIds.has(id));
    const citedPatterns = (content.mannerismIds ?? []).filter((id) => citedMannerisms.has(id));
    if (!citedSegments.length && !citedPatterns.length) continue;

    let flags: ProfileFlag[] = [];
    try {
      const parsed = JSON.parse(row.flags_json ?? "[]");
      if (Array.isArray(parsed)) flags = parsed as ProfileFlag[];
    } catch {
      flags = [];
    }
    if (flags.some((flag) => flag.kind === "withdrawn-training-use" && flag.recordingId === recordingId)) continue;

    const parts: string[] = [];
    if (citedSegments.length) {
      parts.push(`${citedSegments.length} approved segment${citedSegments.length === 1 ? "" : "s"}`);
    }
    if (citedPatterns.length) {
      parts.push(`${citedPatterns.length} mannerism${citedPatterns.length === 1 ? "" : "s"}`);
    }
    flags.push({
      kind: "withdrawn-training-use",
      recordingId,
      recordingTitle: recording.title,
      at: now(),
      detail: `Cites ${parts.join(" and ")} from “${recording.title}”, whose training use you withdrew on ${now().slice(0, 10)}. The snapshot is unchanged — create a new version to leave that recording out.`,
      mannerismTitles: citedPatterns.map((id) => citedMannerisms.get(id) ?? "Mannerism"),
      segmentCount: citedSegments.length,
    });
    db.query("UPDATE behavior_profiles SET flags_json = ? WHERE id = ? AND identity_id = ?").run(
      JSON.stringify(flags),
      row.id,
      identityId,
    );
    flagged++;
  }
  return flagged;
}

export function buildProfileContent(
  identityId: string,
  notes: { speechNotes?: string; expressionNotes?: string; movementNotes?: string } = {},
  selected?: { mannerismIds?: string[]; segmentIds?: string[] },
): BehaviorProfileContent {
  const state = buildTrainingState(identityId);
  const approvedMannerisms = state.mannerisms.filter((m) => m.review === "approved");
  const approvedSegments = state.segments.filter((s) => s.review === "approved");
  const chosenMannerisms = selected?.mannerismIds ? approvedMannerisms.filter((m) => selected.mannerismIds!.includes(m.id)) : approvedMannerisms;
  const chosenSegments = selected?.segmentIds ? approvedSegments.filter((s) => selected.segmentIds!.includes(s.id)) : approvedSegments;

  const speech = speechProfile(state.recordings);
  const expressionSegments = chosenSegments.filter((s) => s.category === "expression" || s.category === "singing");
  const movementSegments = chosenSegments.filter((s) => ["movement", "gesture", "posture"].includes(s.category));
  const movementRecordings = state.recordings.filter((r) => r.analysis?.hasPose);
  const cadences = movementRecordings.map((r) => r.analysis!.stepCadence).filter((v): v is number => v !== null);
  const gestures = movementRecordings.map((r) => r.analysis!.gestureMean);

  return {
    mannerismIds: chosenMannerisms.map((m) => m.id),
    segmentIds: chosenSegments.map((s) => s.id),
    speechNotes: str(notes.speechNotes, 4000),
    expressionNotes: str(notes.expressionNotes, 4000),
    movementNotes: str(notes.movementNotes, 4000),
    coverage: state.coverage,
    speech: {
      categories: speech.rows.map((row) => ({
        category: row.category,
        recordings: row.recordings,
        seconds: row.seconds,
        medianF0: row.medianF0,
        speechRate: row.speechRate,
        pauseRatio: row.pauseRatio,
        intonationRange: row.intonationRange,
      })),
      totalSeconds: speech.totalSeconds,
    },
    expression: {
      labels: Array.from(new Set(expressionSegments.map((s) => s.emotion).filter(Boolean))),
      approvedSegments: expressionSegments.length,
      approvedSeconds: Number(expressionSegments.reduce((sum, s) => sum + (s.end - s.start), 0).toFixed(1)),
    },
    movement: {
      approvedSegments: movementSegments.length,
      approvedSeconds: Number(movementSegments.reduce((sum, s) => sum + (s.end - s.start), 0).toFixed(1)),
      cadence: cadences.length ? Number((cadences.reduce((a, b) => a + b, 0) / cadences.length).toFixed(0)) : null,
      gestureMean: gestures.length ? Number((gestures.reduce((a, b) => a + b, 0) / gestures.length).toFixed(3)) : null,
    },
  };
}

/**
 * Destinie AI Twin Studio — personal behaviour learning model.
 *
 * Everything here describes measured evidence, never a claim that a model has
 * "learned" something. A pattern is only proposed as a mannerism when it
 * recurs across at least two recordings; single-recording observations are
 * labelled as such and cannot be approved.
 *
 * Real extraction (on-device, in the browser):
 *   • MediaPipe Face Landmarker — 478 landmarks, 52 ARKit-style blendshapes
 *   • MediaPipe Pose Landmarker — 33 body landmarks
 *   • Web Audio — pitch, level, pauses, syllable-nuclei rate
 *
 * Not done here: skeletal solving, finger articulation, retargeting, voice
 * cloning, or any trained generative model. Those need external tools and are
 * listed as integration requirements in the UI rather than simulated.
 */

export type RecordingKind = "video" | "audio";
export type RecordingStatus = "uploaded" | "analyzed" | "failed";

export type RecordingCategory =
  | "casual"
  | "formal"
  | "storytelling"
  | "teaching"
  | "presentation"
  | "excited"
  | "emotional"
  | "singing"
  | "walking"
  | "sitting"
  | "standing"
  | "gestures"
  | "expressions"
  | "daily"
  | "performance"
  | "other";

export interface CategoryOption {
  key: RecordingCategory;
  label: string;
  hint: string;
}

export const CATEGORY_GROUPS: { label: string; options: CategoryOption[] }[] = [
  {
    label: "Speech & voice",
    options: [
      { key: "casual", label: "Casual conversation", hint: "Relaxed, unscripted talking — your everyday cadence." },
      { key: "formal", label: "Formal speaking", hint: "Considered delivery, professional setting." },
      { key: "storytelling", label: "Storytelling", hint: "You carrying a narrative with pacing and emphasis." },
      { key: "teaching", label: "Teaching & explaining", hint: "Walking someone through an idea, hands likely involved." },
      { key: "presentation", label: "Presentation / speech", hint: "Addressing a room, full projection." },
      { key: "excited", label: "Excited conversation", hint: "High energy, fast, animated." },
      { key: "emotional", label: "Emotional conversation", hint: "Tender, serious or vulnerable delivery." },
      { key: "singing", label: "Singing / musical", hint: "Sung phrases, sustained notes, performance energy." },
    ],
  },
  {
    label: "Movement & expression",
    options: [
      { key: "walking", label: "Walking", hint: "Full body, moving through frame or toward camera." },
      { key: "standing", label: "Standing", hint: "Static posture, weight distribution, shoulders." },
      { key: "sitting", label: "Sitting", hint: "Seated posture and hand placement." },
      { key: "gestures", label: "Hand gestures", hint: "Deliberate demonstration of how you use your hands." },
      { key: "expressions", label: "Facial expressions", hint: "Smiling, laughing, reacting, frowning." },
      { key: "daily", label: "Everyday personality", hint: "Unposed, ordinary moments." },
      { key: "performance", label: "Performance style", hint: "Camera interaction, stage or screen presence." },
      { key: "other", label: "Other", hint: "Anything that does not fit the categories above." },
    ],
  },
];

export const ALL_CATEGORIES: CategoryOption[] = CATEGORY_GROUPS.flatMap((group) => group.options);
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(ALL_CATEGORIES.map((c) => [c.key, c.label]));
export const SPEECH_CATEGORY_KEYS: RecordingCategory[] = CATEGORY_GROUPS[0].options.map((o) => o.key);
export const MOVEMENT_CATEGORY_KEYS: RecordingCategory[] = CATEGORY_GROUPS[1].options.map((o) => o.key);

export function isSpeechCategory(category: string): boolean {
  return SPEECH_CATEGORY_KEYS.includes(category as RecordingCategory);
}

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

export interface CollectionPreset {
  code: string;
  name: string;
  description: string;
}

export const COLLECTION_PRESETS: CollectionPreset[] = [
  { code: "A", name: "How I Talk", description: "Conversations, explanations and natural speaking." },
  { code: "B", name: "How I Move", description: "Walking, sitting, standing, turning and everyday movement." },
  { code: "C", name: "My Expressions", description: "Smiling, laughing, reacting and emotional range." },
  { code: "D", name: "My Hand Gestures", description: "Natural hand and arm movement while talking." },
  { code: "E", name: "My Singing", description: "Sung takes across genres, notes and emotional styles." },
  { code: "F", name: "My Performance Style", description: "Performing to camera and expressing music physically." },
  { code: "G", name: "My Everyday Personality", description: "Casual footage of ordinary mannerisms." },
];

/* ------------------------------------------------------------------ */
/* Analysis payloads                                                   */
/* ------------------------------------------------------------------ */

export interface FrameSample {
  /** Seconds from the start of the recording. */
  t: number;
  /** 1 when a face was detected in this sample. */
  face: number;
  /** 1 when a body pose was detected. */
  pose: number;
  smileL: number;
  smileR: number;
  smile: number;
  jaw: number;
  brow: number;
  blink: number;
  squint: number;
  frown: number;
  /** Head orientation estimates in degrees / normalised units. */
  yaw: number;
  pitch: number;
  roll: number;
  gazeX: number;
  gazeY: number;
  /** Arm extension (shoulder→wrist, in shoulder widths). */
  armL: number;
  armR: number;
  /** Hip centre horizontal position, 0–1. */
  sway: number;
  /** Wrist speed in shoulder-widths per second. */
  gesture: number;
  /** Signed shoulder height difference. */
  shoulderTilt: number;
  /** Relative foot lift, used for step counting. */
  stepPhase: number;
}

export interface MediaEvent {
  type:
    | "smile"
    | "laugh"
    | "blink-cluster"
    | "gesture-burst"
    | "head-turn"
    | "posture-shift"
    | "walking"
    | "sung-phrase";
  start: number;
  end: number;
  label: string;
  score: number;
  metrics: Record<string, number>;
}

export interface SpeechMetrics {
  durationSeconds: number;
  sampleRate: number;
  peakDb: number;
  rmsDb: number;
  medianF0: number | null;
  f0Min: number | null;
  f0Max: number | null;
  intonationRangeSemitones: number | null;
  voicedRatio: number;
  speechRateSyllablesPerMinute: number | null;
  pauseCount: number;
  pauseRatio: number;
  meanPauseSeconds: number | null;
  longestPauseSeconds: number | null;
  loudnessRangeDb: number;
  vibratoRateHz: number | null;
  vibratoExtentCents: number | null;
  energyContour: number[];
  pitchContour: (number | null)[];
  method: string;
  warnings: string[];
}

export interface FaceStats {
  faceFrames: number;
  smileMean: number;
  smileAsymmetry: number;
  jawMean: number;
  browMean: number;
  blinkPerMinute: number;
  blinkCount: number;
  squintMean: number;
  frownMean: number;
  headTiltMean: number;
  headTiltDominant: "left" | "right" | "none";
  headYawRange: number;
  nodPerMinute: number;
  gazeOffShare: number;
  expressionMix: Record<string, number>;
}

export interface PoseStats {
  poseFrames: number;
  gestureMean: number;
  gesturePeak: number;
  armMean: number;
  twoHandedShare: number;
  shoulderTiltMean: number;
  shoulderHigher: "left" | "right" | "even";
  stanceWidthMean: number | null;
  kneeFlexionMean: number | null;
  swayRange: number;
  stepCadence: number | null;
  walkingShare: number;
}

export const BLEND_CHANNELS = [
  "mouthSmileLeft",
  "mouthSmileRight",
  "jawOpen",
  "browInnerUp",
  "browDownLeft",
  "browDownRight",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "cheekSquintLeft",
  "cheekSquintRight",
  "mouthFrownLeft",
  "mouthFrownRight",
  "eyeLookInLeft",
  "eyeLookInRight",
  "eyeLookOutLeft",
  "eyeLookOutRight",
] as const;

export interface DerivedAnalysis {
  version: 1;
  engine: string;
  analyzedAt: string;
  duration: number;
  sampleStep: number;
  coverageSeconds: number;
  frames: FrameSample[];
  /** Down-sampled blendshape channels aligned to frame timestamps (for CSV export / retargeting). */
  blends: { times: number[]; channels: Record<string, number[]> };
  events: MediaEvent[];
  face: FaceStats | null;
  pose: PoseStats | null;
  speech: SpeechMetrics | null;
  notes: string[];
  limitations: string[];
}

export interface AnalysisSummary {
  analyzedAt: string;
  engine: string;
  duration: number;
  sampleStep: number;
  framesAnalyzed: number;
  coverageSeconds: number;
  hasFace: boolean;
  hasPose: boolean;
  hasAudio: boolean;
  smileMean: number;
  blinkPerMinute: number;
  gestureMean: number;
  headTiltMean: number;
  stepCadence: number | null;
  expressionMix: Record<string, number>;
  speech: { medianF0: number | null; speechRate: number | null; pauseRatio: number; intonationRange: number | null } | null;
  events: number;
  limitations: string[];
}

export interface Recording {
  id: string;
  title: string;
  category: RecordingCategory;
  collectionId: string;
  recordedAt: string;
  description: string;
  tags: string[];
  kind: RecordingKind;
  mime: string;
  bytes: number;
  duration: number;
  width: number | null;
  height: number | null;
  status: RecordingStatus;
  allowTraining: boolean;
  approved: boolean;
  error: string | null;
  createdAt: string;
  hasAnalysis: boolean;
  analysis: AnalysisSummary | null;
}

export type SegmentCategory =
  | "expression"
  | "gesture"
  | "movement"
  | "posture"
  | "speech"
  | "singing";

export const SEGMENT_CATEGORIES: { key: SegmentCategory; label: string }[] = [
  { key: "expression", label: "Facial expression" },
  { key: "gesture", label: "Hand gesture" },
  { key: "movement", label: "Body movement" },
  { key: "posture", label: "Posture" },
  { key: "speech", label: "Speech delivery" },
  { key: "singing", label: "Singing" },
];

export const EXPRESSION_LABELS = [
  "happy",
  "excited",
  "calm",
  "thoughtful",
  "serious",
  "sad",
  "surprised",
  "confident",
  "laughing",
  "concentrating",
  "speaking naturally",
  "singing emotionally",
] as const;

export interface Segment {
  id: string;
  recordingId: string;
  recordingTitle: string;
  label: string;
  category: SegmentCategory;
  emotion: string;
  start: number;
  end: number;
  summary: string;
  metrics: Record<string, number>;
  review: "pending" | "approved" | "rejected";
  createdAt: string;
}

/**
 * How well the recordings agree, not how much footage there is.
 *
 *   consistent         the measured value agrees across 2+ recordings
 *   mixed              the recordings disagree (including opposite directions)
 *   single-observation measured in one recording only — never approvable
 *   unverified         stored before agreement was measured; re-run mining
 */
export type MannerismConfidence = "consistent" | "mixed" | "single-observation" | "unverified";

export interface MannerismEvidence {
  recordingId: string;
  recordingTitle: string;
  occurrences: number;
  seconds: number;
  /** The measured value for this recording, in `unit`. Null when unavailable. */
  value?: number | null;
  /** Unit of `value`, e.g. "blinks/min". Absent on older stored evidence. */
  unit?: string;
  /** Seconds in this recording where the pattern is clearest. */
  exemplars?: number[];
}

/** How agreement is judged for one candidate. Stored so pruning can re-judge it. */
export type AgreementRule =
  | { mode: "sign"; unit: string }
  | { mode: "absolute"; tolerance: number; unit: string }
  | { mode: "relative"; tolerance: number; unit: string };

export interface EvidenceSpread {
  values: number[];
  count: number;
  min: number | null;
  max: number | null;
  /** max − min across recordings, in `unit`. */
  spread: number | null;
  median: number | null;
  unit: string;
}

export interface Mannerism {
  id: string;
  key: string;
  title: string;
  category: string;
  description: string;
  evidence: MannerismEvidence[];
  occurrences: number;
  confidence: MannerismConfidence;
  review: "pending" | "approved" | "rejected";
  source: "suggested" | "manual";
  createdAt: string;
  updatedAt: string;
}

export type MiningAuditStatus = MannerismConfidence | "no-data";

/** One signal the miner evaluates, with the value it measured and the gate it had to clear. */
export interface MiningAuditRow {
  key: string;
  label: string;
  /** What the measurement is. */
  metric: string;
  unit: string;
  /** Human-readable threshold, e.g. "|tilt| > 2.5°". */
  threshold: string;
  /** Range measured across eligible recordings, in `unit`. */
  measured: string;
  /** Recordings that produced a value. */
  recordings: number;
  /** Recordings that had the channel this signal needs (face, pose, speech). */
  eligible: number;
  /** At least one recording crossed the per-recording threshold. */
  passed: boolean;
  status: MiningAuditStatus;
  note: string;
}

export interface MiningAudit {
  ranAt: string;
  recordingsConsidered: number;
  usableRecordings: number;
  faceRecordings: number;
  poseRecordings: number;
  speechRecordings: number;
  /** Patterns proposed in this run, including mixed ones. */
  candidates: number;
  rows: MiningAuditRow[];
  /** Set when recordings changed after the run; the rows may no longer be true. */
  staleAt?: string | null;
  staleReason?: string | null;
}

export interface MinedCandidate {
  key: string;
  title: string;
  category: string;
  description: string;
  evidence: MannerismEvidence[];
  occurrences: number;
  confidence: MannerismConfidence;
  rule: AgreementRule;
}

export interface Collection {
  id: string;
  code: string;
  name: string;
  description: string;
  preset: boolean;
  createdAt: string;
}

/**
 * A note attached to an immutable profile when the evidence behind it is
 * retracted (for example, the user turns off "training use" on a recording it
 * cited). The snapshot itself is never rewritten; the flag records that it no
 * longer reflects the current consent state.
 */
export interface ProfileFlag {
  kind: "withdrawn-training-use";
  recordingId: string;
  recordingTitle: string;
  at: string;
  detail: string;
  mannerismTitles: string[];
  segmentCount: number;
}

export interface BehaviorProfile {
  id: string;
  number: number;
  label: string;
  status: "draft" | "approved" | "superseded" | "rejected";
  createdAt: string;
  approvedAt: string | null;
  notes: string;
  content: BehaviorProfileContent;
  flags: ProfileFlag[];
}

export interface BehaviorProfileContent {
  mannerismIds: string[];
  segmentIds: string[];
  speechNotes: string;
  expressionNotes: string;
  movementNotes: string;
  coverage: CoverageItem[];
  speech: {
    categories: {
      category: string;
      recordings: number;
      seconds: number;
      medianF0: number | null;
      speechRate: number | null;
      pauseRatio: number;
      intonationRange: number | null;
    }[];
    totalSeconds: number;
  };
  expression: {
    labels: string[];
    approvedSegments: number;
    approvedSeconds: number;
  };
  movement: {
    approvedSegments: number;
    approvedSeconds: number;
    cadence: number | null;
    gestureMean: number | null;
  };
}

export interface CoverageItem {
  area: "speech" | "expression" | "movement" | "singing" | "mannerisms";
  label: string;
  ready: boolean;
  detail: string;
  evidence: { label: string; value: string; target: string; met: boolean }[];
  missing: string[];
}

export interface TrainingStats {
  recordings: number;
  videos: number;
  audio: number;
  videoSeconds: number;
  audioSeconds: number;
  analyzed: number;
  approved: number;
  failed: number;
  segments: number;
  approvedSegments: number;
  mannerisms: number;
  approvedMannerisms: number;
  pendingMannerisms: number;
  collections: number;
  storageBytes: number;
  lastAnalyzedAt: string | null;
}

export interface TrainingIntegration {
  id: string;
  area: "extraction" | "retarget" | "voice" | "performance";
  title: string;
  status: "working" | "not-enabled" | "external";
  detail: string;
  requirement: string;
  reference: string | null;
}

export interface TrainingState {
  recordings: Recording[];
  segments: Segment[];
  mannerisms: Mannerism[];
  collections: Collection[];
  profiles: BehaviorProfile[];
  stats: TrainingStats;
  coverage: CoverageItem[];
  integrations: TrainingIntegration[];
  /** Last mining run's per-signal checks, or null before the first run. */
  miningAudit: MiningAudit | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const mean = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const quantile = (values: number[], q: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[index];
};
const round = (value: number, digits = 3) => Number(value.toFixed(digits));
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function summarizeAnalysis(derived: DerivedAnalysis): AnalysisSummary {
  return {
    analyzedAt: derived.analyzedAt,
    engine: derived.engine,
    duration: derived.duration,
    sampleStep: derived.sampleStep,
    framesAnalyzed: derived.frames.length,
    coverageSeconds: derived.coverageSeconds,
    hasFace: Boolean(derived.face),
    hasPose: Boolean(derived.pose),
    hasAudio: Boolean(derived.speech),
    smileMean: derived.face?.smileMean ?? 0,
    blinkPerMinute: derived.face?.blinkPerMinute ?? 0,
    gestureMean: derived.pose?.gestureMean ?? 0,
    headTiltMean: derived.face?.headTiltMean ?? 0,
    stepCadence: derived.pose?.stepCadence ?? null,
    expressionMix: derived.face?.expressionMix ?? {},
    speech: derived.speech
      ? {
          medianF0: derived.speech.medianF0,
          speechRate: derived.speech.speechRateSyllablesPerMinute,
          pauseRatio: derived.speech.pauseRatio,
          intonationRange: derived.speech.intonationRangeSemitones,
        }
      : null,
    events: derived.events.length,
    limitations: derived.limitations,
  };
}

export function segmentMetrics(analysis: DerivedAnalysis, start: number, end: number) {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(analysis.duration, Math.max(start, end));
  const frames = analysis.frames.filter((f) => f.t >= from && f.t <= to);
  if (!frames.length) {
    return { label: "No samples in this range", metrics: {}, summary: "The selected window contains no analysed samples." };
  }
  const faceFrames = frames.filter((f) => f.face);
  const poseFrames = frames.filter((f) => f.pose);
  const metrics: Record<string, number> = {
    durationSeconds: round(to - from, 2),
    samples: frames.length,
  };
  if (faceFrames.length) {
    metrics.smileMean = round(mean(faceFrames.map((f) => f.smile)));
    metrics.smilePeak = round(Math.max(...faceFrames.map((f) => f.smile)));
    metrics.jawMean = round(mean(faceFrames.map((f) => f.jaw)));
    metrics.browMean = round(mean(faceFrames.map((f) => f.brow)));
    metrics.headTiltDeg = round(mean(faceFrames.map((f) => f.roll)), 1);
    metrics.gazeOffShare = round(mean(faceFrames.map((f) => (Math.abs(f.gazeX) > 0.22 ? 1 : 0))));
  }
  if (poseFrames.length) {
    metrics.gestureMean = round(mean(poseFrames.map((f) => f.gesture)));
    metrics.gesturePeak = round(quantile(poseFrames.map((f) => f.gesture), 0.9));
    metrics.armMean = round(mean(poseFrames.map((f) => Math.max(f.armL, f.armR))));
  }
  const labelBits: string[] = [];
  if (metrics.smileMean !== undefined) labelBits.push(`smile ${metrics.smileMean.toFixed(2)}`);
  if (metrics.jawMean !== undefined) labelBits.push(`jaw openness ${metrics.jawMean.toFixed(2)}`);
  if (metrics.headTiltDeg !== undefined) labelBits.push(`head tilt ${metrics.headTiltDeg.toFixed(1)}°`);
  if (metrics.gestureMean !== undefined) labelBits.push(`gesture energy ${metrics.gestureMean.toFixed(2)}`);
  return {
    label: labelBits.slice(0, 3).join(" · ") || "Selected range",
    metrics,
    summary: `${(to - from).toFixed(1)} s · ${frames.length} sampled frames${labelBits.length ? ` · ${labelBits.join(" · ")}` : ""}`,
  };
}

/* ------------------------------------------------------------------ */
/* Mannerism mining                                                    */
/* ------------------------------------------------------------------ */

export interface MinedSource {
  recordingId: string;
  title: string;
  analysis: DerivedAnalysis;
}

const sourceSeconds = (source: MinedSource) => source.analysis.coverageSeconds;

interface CandidateSignal {
  source: MinedSource;
  /** The value this recording contributes, in the rule's unit. */
  value: number | null;
  /** Episodes counted in this recording (blinks, laughs, shifts…). */
  occurrences: number;
  /** Seconds worth watching in this recording, clearest first. */
  exemplars?: number[];
}

/**
 * Judge agreement across recordings. Quantity (two recordings, 20 s pooled) is
 * necessary but not sufficient: a pattern is only `consistent` when the measured
 * values also agree, by direction for signed measures and by tolerance for the
 * rest. Anything else stays `mixed` and cannot be approved.
 */
export function classifyAgreement(
  values: number[],
  rule: AgreementRule | null,
  totalSeconds: number,
): MannerismConfidence {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length < 2 || totalSeconds < 20) return "single-observation";
  if (!rule) return "unverified";
  if (rule.mode === "sign") {
    const positive = usable.filter((value) => value > 0).length;
    return positive === 0 || positive === usable.length ? "consistent" : "mixed";
  }
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  if (rule.mode === "absolute") return max - min <= rule.tolerance ? "consistent" : "mixed";
  const median = [...usable].sort((a, b) => a - b)[Math.floor((usable.length - 1) / 2)];
  const scale = Math.max(Math.abs(median), 1e-9);
  return (max - min) / scale <= rule.tolerance ? "consistent" : "mixed";
}

/** Per-recording values plus their range — what the mean was hiding. */
export function evidenceSpread(evidence: { value?: number | null; unit?: string }[]): EvidenceSpread {
  const values = evidence
    .map((item) => item.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) {
    return { values, count: 0, min: null, max: null, spread: null, median: null, unit: evidence[0]?.unit ?? "" };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    values,
    count: values.length,
    min: round(min, 2),
    max: round(max, 2),
    spread: round(max - min, 2),
    median: round(median, 2),
    unit: evidence.find((item) => item.unit)?.unit ?? "",
  };
}

const formatNumber = (value: number) => String(Number(value.toFixed(2)));
const unitText = (value: number, unit: string) => (unit.startsWith("%") ? `${formatNumber(value)}${unit}` : `${formatNumber(value)} ${unit}`.trim());
const rangeText = (spread: EvidenceSpread) => {
  if (spread.min === null || spread.max === null) return "no measured value";
  if (spread.count < 2 || spread.min === spread.max) return unitText(spread.min, spread.unit);
  return `${formatNumber(spread.min)}–${formatNumber(spread.max)} ${spread.unit}`.trim();
};
const recordingsText = (count: number) => `${count} recording${count === 1 ? "" : "s"}`;

const eventMoments = (analysis: DerivedAnalysis, type: MediaEvent["type"], count = 3): number[] =>
  analysis.events
    .filter((event) => event.type === type)
    .map((event) => round(event.start, 2))
    .sort((a, b) => a - b)
    .slice(0, count);

/** Pick a few well-separated seconds where a frame-level score peaks. */
function topMoments(frames: FrameSample[], score: (frame: FrameSample) => number, count = 3, minGap = 1.5): number[] {
  const ranked = frames
    .map((frame) => ({ t: round(frame.t, 2), score: score(frame) }))
    .filter((entry) => entry.score > 0.001)
    .sort((a, b) => b.score - a.score);
  const picked: number[] = [];
  for (const entry of ranked) {
    if (picked.every((time) => Math.abs(time - entry.t) >= minGap)) picked.push(entry.t);
    if (picked.length >= count) break;
  }
  return picked.sort((a, b) => a - b);
}

function buildCandidate(
  key: string,
  category: string,
  signals: CandidateSignal[],
  rule: AgreementRule,
  copy: (status: MannerismConfidence, spread: EvidenceSpread) => { title: string; description: string },
): MinedCandidate {
  const evidenceList: MannerismEvidence[] = signals.map((signal) => ({
    recordingId: signal.source.recordingId,
    recordingTitle: signal.source.title,
    occurrences: signal.occurrences,
    seconds: round(sourceSeconds(signal.source), 1),
    value: typeof signal.value === "number" && Number.isFinite(signal.value) ? round(signal.value, 2) : null,
    unit: rule.unit,
    ...(signal.exemplars?.length ? { exemplars: signal.exemplars.slice(0, 4) } : {}),
  }));
  const totalSeconds = signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0);
  const spread = evidenceSpread(evidenceList);
  const status = classifyAgreement(spread.values, rule, totalSeconds);
  const { title, description } = copy(status, spread);
  return {
    key,
    title,
    category,
    description,
    evidence: evidenceList,
    occurrences: signals.reduce((sum, signal) => sum + signal.occurrences, 0),
    confidence: status,
    rule,
  };
}

export function mineMannerisms(sources: MinedSource[]): MinedCandidate[] {
  return mineMannerismsWithAudit(sources).candidates;
}

/**
 * Mining plus a record of every signal it evaluated. The audit is produced by
 * the same pass, so it cannot drift from the candidates: an empty result shows
 * exactly which gates were missed instead of looking like a failure.
 */
export function mineMannerismsWithAudit(sources: MinedSource[]): { candidates: MinedCandidate[]; audit: MiningAudit } {
  const usable = sources.filter((s) => s.analysis.frames.length > 0);
  const candidates: MinedCandidate[] = [];
  const audit: MiningAuditRow[] = [];

  const withFace = usable.filter((s) => s.analysis.face && s.analysis.face.faceFrames > 5);
  const withPose = usable.filter((s) => s.analysis.pose && s.analysis.pose.poseFrames > 5);
  const withSpeech = usable.filter((s) => s.analysis.speech && s.analysis.speech.voicedRatio > 0.05);

  const context = {
    ranAt: new Date().toISOString(),
    recordingsConsidered: sources.length,
    usableRecordings: usable.length,
    faceRecordings: withFace.length,
    poseRecordings: withPose.length,
    speechRecordings: withSpeech.length,
    staleAt: null,
    staleReason: null,
  };
  const finish = () => ({ candidates, audit: { ...context, candidates: candidates.length, rows: audit } });

  const describeSignal = (input: {
    key: string;
    label: string;
    metric: string;
    unit: string;
    threshold: string;
    observed: (number | null)[];
    kept: (number | null)[];
    eligible: number;
    seconds: number;
    rule: AgreementRule;
    note?: string;
  }): MiningAuditRow => {
    const keptValues = input.kept.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const observedValues = input.observed.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const spread = evidenceSpread(observedValues.map((value) => ({ value, unit: input.unit })));
    const measured =
      !observedValues.length
        ? "not measured"
        : spread.count >= 2 && spread.min !== null && spread.max !== null
          ? `${formatNumber(spread.min)}–${formatNumber(spread.max)} ${input.unit}`.trim()
          : unitText(observedValues[0], input.unit);
    return {
      key: input.key,
      label: input.label,
      metric: input.metric,
      unit: input.unit,
      threshold: input.threshold,
      measured,
      recordings: observedValues.length,
      eligible: input.eligible,
      passed: keptValues.length > 0,
      status: keptValues.length ? classifyAgreement(keptValues, input.rule, input.seconds) : "no-data",
      note:
        keptValues.length > 0
          ? input.note ?? ""
          : input.note ??
            (input.eligible ? "No recording crossed the threshold." : "No recording has the channel this signal needs."),
    };
  };

  if (!usable.length) {
    return {
      candidates,
      audit: {
        ...context,
        candidates: 0,
        rows: [
          describeSignal({
            key: "source-footage",
            label: "Analysed footage",
            metric: "Recordings with an extracted timeline",
            unit: "recordings",
            threshold: "at least 1 analysed recording",
            observed: [],
            kept: [],
            eligible: sources.length,
            seconds: 0,
            rule: { mode: "sign", unit: "recordings" },
            note: "No recording has sampled video frames, so no signal could be compared. Upload video and run the analysis first.",
          }),
        ],
      },
    };
  }

  // 1. Smile asymmetry — the stronger side must agree across recordings.
  {
    const rule: AgreementRule = { mode: "sign", unit: "blendshape units" };
    const observed = withFace.map((s) => ({
      source: s,
      value: s.analysis.face!.smileAsymmetry,
      occurrences: 0,
      exemplars: topMoments(s.analysis.frames, (frame) =>
        Math.sign(frame.smileL - frame.smileR) === Math.sign(s.analysis.face!.smileAsymmetry)
          ? Math.abs(frame.smileL - frame.smileR)
          : 0,
      ),
    }));
    const signals = observed.filter((signal) => Math.abs(signal.value) > 0.02);
    audit.push(
      describeSignal({
        key: "smile-asymmetry",
        label: "Smile asymmetry",
        metric: "Mean left/right mouth-corner difference",
        unit: rule.unit,
        threshold: "|difference| > 0.02 in at least one recording",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: withFace.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      candidates.push(
        buildCandidate("smile-asymmetry", "Expression", signals, rule, (status, spread) => {
          const left = spread.values.filter((value) => value > 0).length;
          const right = spread.count - left;
          if (status === "mixed") {
            return {
              title: "Smiles asymmetrically, but not always on the same side",
              description: `${recordingsText(signals.length)} show asymmetry above 0.02 units, but the stronger side changes: ${left} left-leaning, ${right} right-leaning (${rangeText(spread)}). The recordings disagree, so this cannot be approved as a mannerism.`,
            };
          }
          const side = left >= right ? "left" : "right";
          return {
            title: `Smiles more strongly on the ${side} side`,
            description: `The ${side} mouth corner lifts more in ${recordingsText(spread.count)} (${rangeText(spread)}; median ${unitText(spread.median ?? 0, "blendshape units")}).`,
          };
        }),
      );
    }
  }

  // 2. Head tilt bias — direction must agree across recordings.
  {
    const rule: AgreementRule = { mode: "sign", unit: "°" };
    const observed = withFace.map((s) => ({
      source: s,
      value: s.analysis.face!.headTiltMean,
      occurrences: 0,
      exemplars: topMoments(s.analysis.frames, (frame) =>
        Math.sign(frame.roll) === Math.sign(s.analysis.face!.headTiltMean) ? Math.abs(frame.roll) : 0,
      ),
    }));
    const signals = observed.filter((signal) => Math.abs(signal.value) > 2.5);
    audit.push(
      describeSignal({
        key: "head-tilt",
        label: "Head tilt",
        metric: "Mean sustained head tilt",
        unit: rule.unit,
        threshold: "|tilt| > 2.5° in at least one recording",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: withFace.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      candidates.push(
        buildCandidate("head-tilt", "Head & neck", signals, rule, (status, spread) => {
          const first = spread.values.filter((value) => value > 0).length;
          const second = spread.count - first;
          if (status === "mixed") {
            return {
              title: "Head tilt changes direction between recordings",
              description: `Sustained tilt appears in ${recordingsText(signals.length)}, but ${first} lean one way and ${second} the other (${rangeText(spread)}). The recordings disagree, so this mixed result is listed for context only and cannot be approved.`,
            };
          }
          return {
            title: "Tilts the head the same way when engaged",
            description: `Sustained head tilt appears in ${recordingsText(spread.count)} (${rangeText(spread)}), and ${Math.max(first, second)} of ${spread.count} lean the same way.`,
          };
        }),
      );
    }
  }

  // 3. Blink rhythm.
  {
    const rule: AgreementRule = { mode: "relative", tolerance: 0.35, unit: "blinks/min" };
    const observed = withFace.map((s) => ({
      source: s,
      value: s.analysis.face!.blinkPerMinute,
      occurrences: s.analysis.face!.blinkCount,
      exemplars: topMoments(s.analysis.frames, (frame) => frame.blink, 3, 0.6),
    }));
    const signals = observed.filter((signal) => signal.value > 0);
    audit.push(
      describeSignal({
        key: "blink-rate",
        label: "Blink rate",
        metric: "Blinks per minute",
        unit: rule.unit,
        threshold: "blink rate > 0",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: withFace.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      candidates.push(
        buildCandidate("blink-rate", "Expression", signals, rule, (status, spread) => ({
          title: `Blinks about ${Math.round(spread.median ?? 0)} times a minute`,
          description:
            status === "mixed"
              ? `Blink rate ranges from ${rangeText(spread)} across ${recordingsText(spread.count)} — too wide to call a resting rhythm, so no single rate is claimed.`
              : `Blink rate is measured from eyelid blendshape rises: ${rangeText(spread)} across ${recordingsText(spread.count)}, median ${unitText(spread.median ?? 0, "blinks/min")}.`,
        })),
      );
    }
  }

  // 4. Gesture scale.
  {
    const rule: AgreementRule = { mode: "relative", tolerance: 0.5, unit: "shoulder-widths/s" };
    const observed = withPose.map((s) => ({
      source: s,
      value: s.analysis.pose!.gesturePeak,
      occurrences: 0,
      exemplars: topMoments(s.analysis.frames, (frame) => frame.gesture, 3, 2),
    }));
    const signals = observed.filter((signal) => signal.value > 0.01);
    audit.push(
      describeSignal({
        key: "gesture-scale",
        label: "Gesture scale",
        metric: "Peak wrist speed (90th percentile)",
        unit: rule.unit,
        threshold: "peak > 0.01 shoulder-widths/s",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: withPose.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      candidates.push(
        buildCandidate("gesture-scale", "Hands & arms", signals, rule, (status, spread) => {
          const peak = spread.median ?? 0;
          const scale = peak > 0.9 ? "expansive" : peak > 0.45 ? "moderate" : "contained";
          return {
            title: status === "mixed" ? "Gesture scale varies widely between recordings" : `Uses ${scale} hand gestures when talking`,
            description: `Peak wrist speed (90th percentile): ${rangeText(spread)} across ${recordingsText(spread.count)}${status === "mixed" ? ". The recordings disagree, so the widest is not treated as the norm" : ""}.`,
          };
        }),
      );
    }
  }

  // 5. Two-handed gesturing.
  {
    const rule: AgreementRule = { mode: "absolute", tolerance: 25, unit: "% of sampled frames" };
    const observed = withPose.map((s) => ({
      source: s,
      value: s.analysis.pose!.twoHandedShare * 100,
      occurrences: 0,
      exemplars: topMoments(s.analysis.frames, (frame) => Math.min(frame.armL, frame.armR), 3, 2),
    }));
    const signals = observed.filter((signal) => signal.value > 20);
    audit.push(
      describeSignal({
        key: "two-handed",
        label: "Two-handed gesturing",
        metric: "Sampled frames with both arms extended",
        unit: rule.unit,
        threshold: "> 20% of sampled frames",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: withPose.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      candidates.push(
        buildCandidate("two-handed", "Hands & arms", signals, rule, (status, spread) => ({
          title:
            status === "mixed"
              ? "Uses both hands in some recordings but not others"
              : "Gestures with both hands rather than one",
          description: `Both arms are extended away from the body in ${rangeText(spread)} of sampled frames across ${recordingsText(spread.count)}${status === "mixed" ? ". That range is too wide to call a habit" : ""}.`,
        })),
      );
    }
  }

  // 6. Shoulder carriage — the higher side must agree across recordings.
  {
    const rule: AgreementRule = { mode: "sign", unit: "shoulder widths" };
    const observed = withPose.map((s) => ({
      source: s,
      value: s.analysis.pose!.shoulderTiltMean,
      occurrences: 0,
      exemplars: topMoments(s.analysis.frames, (frame) =>
        Math.sign(frame.shoulderTilt) === Math.sign(s.analysis.pose!.shoulderTiltMean) ? Math.abs(frame.shoulderTilt) : 0,
      ),
    }));
    const signals = observed.filter((signal) => Math.abs(signal.value) > 0.012);
    audit.push(
      describeSignal({
        key: "shoulder-carriage",
        label: "Shoulder carriage",
        metric: "Signed shoulder height difference",
        unit: rule.unit,
        threshold: "|difference| > 0.012 shoulder widths",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: withPose.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      candidates.push(
        buildCandidate("shoulder-carriage", "Posture", signals, rule, (status, spread) => {
          const positive = spread.values.filter((value) => value > 0).length;
          const negative = spread.count - positive;
          if (status === "mixed") {
            return {
              title: "Shoulder height changes sides between recordings",
              description: `Signed shoulder height difference is ${rangeText(spread)} across ${recordingsText(signals.length)}, with ${positive} toward one side and ${negative} toward the other. The recordings disagree, so this mixed result is listed for context only and cannot be approved.`,
            };
          }
          const side = positive >= negative ? "left" : "right";
          return {
            title: `Carries the ${side} shoulder slightly higher`,
            description: `Signed shoulder height difference is ${rangeText(spread)} across ${recordingsText(spread.count)}, consistently toward the ${side}.`,
          };
        }),
      );
    }
  }

  // 7. Speech rate.
  {
    const rule: AgreementRule = { mode: "relative", tolerance: 0.35, unit: "syllable nuclei/min" };
    const observed = withSpeech.map((s) => ({ source: s, value: s.analysis.speech!.speechRateSyllablesPerMinute, occurrences: 0 }));
    const signals = observed.filter((signal) => typeof signal.value === "number" && signal.value > 40);
    audit.push(
      describeSignal({
        key: "speech-rate",
        label: "Speech rate",
        metric: "Energy-peak syllable estimate",
        unit: rule.unit,
        threshold: "> 40 syllable nuclei/min",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: withSpeech.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      candidates.push(
        buildCandidate("speech-rate", "Speech", signals, rule, (status, spread) => {
          const median = spread.median ?? 0;
          const pace = median > 320 ? "fast" : median > 230 ? "measured" : "unhurried";
          return {
            title:
              status === "mixed"
                ? "Speaking pace varies widely between recordings"
                : `Speaks at a ${pace} pace (~${Math.round(median)} syllable nuclei/min)`,
            description: `Energy-peak syllable estimate: ${rangeText(spread)} across ${recordingsText(spread.count)}. This is a pacing proxy, not a transcript${status === "mixed" ? "; the recordings disagree, so no single pace is claimed" : ""}.`,
          };
        }),
      );
    }
  }

  // 8. Pause habit.
  {
    const rule: AgreementRule = { mode: "relative", tolerance: 0.5, unit: "s" };
    const observed = withSpeech.map((s) => ({
      source: s,
      value: s.analysis.speech!.meanPauseSeconds ?? 0,
      occurrences: s.analysis.speech!.pauseCount,
    }));
    const signals = observed.filter((signal) => signal.value > 0.25);
    audit.push(
      describeSignal({
        key: "pause-habit",
        label: "Pause length",
        metric: "Mean silence between phrases",
        unit: rule.unit,
        threshold: "> 0.25 s mean pause",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: withSpeech.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      const ratio = mean(signals.map((signal) => signal.source.analysis.speech!.pauseRatio));
      candidates.push(
        buildCandidate("pause-habit", "Speech", signals, rule, (status, spread) => ({
          title:
            status === "mixed"
              ? "Pause length varies widely between recordings"
              : `Pauses about ${(spread.median ?? 0).toFixed(2)} s between phrases`,
          description: `Silence runs inside speech are ${rangeText(spread)} across ${recordingsText(spread.count)}, averaging ${(ratio * 100).toFixed(0)}% of speaking time${status === "mixed" ? ". That spread is too wide to call a habit" : ""}.`,
        })),
      );
    }
  }

  // 9. Intonation range.
  {
    const rule: AgreementRule = { mode: "relative", tolerance: 0.4, unit: "semitones" };
    const observed = withSpeech.map((s) => ({ source: s, value: s.analysis.speech!.intonationRangeSemitones ?? 0, occurrences: 0 }));
    const signals = observed.filter((signal) => signal.value > 6);
    audit.push(
      describeSignal({
        key: "intonation-range",
        label: "Intonation range",
        metric: "Pitch range between the 5th and 95th percentile",
        unit: rule.unit,
        threshold: "> 6 semitones",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: withSpeech.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      candidates.push(
        buildCandidate("intonation-range", "Speech", signals, rule, (status, spread) => ({
          title:
            status === "mixed"
              ? "Pitch range varies widely between recordings"
              : `Uses a wide ${(spread.median ?? 0).toFixed(1)}-semitone pitch range when speaking`,
          description: `Pitch range between the 5th and 95th percentile of voiced frames: ${rangeText(spread)} across ${recordingsText(spread.count)}${status === "mixed" ? ". That spread is too wide to describe one delivery" : ""}.`,
        })),
      );
    }
  }

  // 10. Gaze behaviour.
  {
    const rule: AgreementRule = { mode: "absolute", tolerance: 25, unit: "% of face samples" };
    const observed = withFace.map((s) => ({
      source: s,
      value: s.analysis.face!.gazeOffShare * 100,
      occurrences: 0,
      exemplars: topMoments(s.analysis.frames, (frame) => (Math.abs(frame.gazeX) > 0.22 ? Math.abs(frame.gazeX) : 0)),
    }));
    const signals = observed.filter((signal) => signal.value > 25);
    audit.push(
      describeSignal({
        key: "gaze-shift",
        label: "Gaze off-centre",
        metric: "Face samples with gaze outside the central band",
        unit: rule.unit,
        threshold: "> 25% of face samples",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: withFace.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      candidates.push(
        buildCandidate("gaze-shift", "Expression", signals, rule, (status, spread) => ({
          title: status === "mixed" ? "Gaze leaves the camera by very different amounts" : "Looks away briefly while thinking",
          description: `Iris position leaves the central band in ${rangeText(spread)} of face samples across ${recordingsText(spread.count)}${status === "mixed" ? ". That range is too wide to call a habit" : ""}.`,
        })),
      );
    }
  }

  // 11. Nodding.
  {
    const rule: AgreementRule = { mode: "relative", tolerance: 0.5, unit: "nods/min" };
    const observed = withFace.map((s) => ({
      source: s,
      value: s.analysis.face!.nodPerMinute,
      occurrences: 0,
      exemplars: topMoments(s.analysis.frames, (frame) => Math.abs(frame.pitch)),
    }));
    const signals = observed.filter((signal) => signal.value > 6);
    audit.push(
      describeSignal({
        key: "nodding",
        label: "Nodding",
        metric: "Pitch-direction reversals",
        unit: rule.unit,
        threshold: "> 6 nods/min",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: withFace.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      candidates.push(
        buildCandidate("nodding", "Head & neck", signals, rule, (status, spread) => ({
          title:
            status === "mixed"
              ? "Nodding rate varies widely between recordings"
              : `Nods about ${Math.round(spread.median ?? 0)} times a minute while talking`,
          description: `Pitch-direction reversals counted from head orientation: ${rangeText(spread)} across ${recordingsText(spread.count)}${status === "mixed" ? ". The recordings disagree, so no single rate is claimed" : ""}.`,
        })),
      );
    }
  }

  // 12. Laugh shape.
  {
    const rule: AgreementRule = { mode: "relative", tolerance: 0.5, unit: "laughs/min" };
    const observed = usable.map((s) => {
      const count = s.analysis.events.filter((e) => e.type === "laugh").length;
      const minutes = s.analysis.coverageSeconds / 60;
      return {
        source: s,
        value: minutes > 0 ? count / minutes : null,
        occurrences: count,
        exemplars: eventMoments(s.analysis, "laugh"),
      };
    });
    const signals = observed.filter((signal) => signal.occurrences > 0 && signal.value !== null);
    audit.push(
      describeSignal({
        key: "laugh-shape",
        label: "Laugh episodes",
        metric: "Detected laughs per minute",
        unit: rule.unit,
        threshold: "at least 1 laugh episode",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: usable.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      const total = signals.reduce((sum, signal) => sum + signal.occurrences, 0);
      candidates.push(
        buildCandidate("laugh-shape", "Expression", signals, rule, (status, spread) => ({
          title:
            status === "mixed"
              ? "Laughs openly, but at very different rates"
              : "Laughs openly, with a wide mouth and lifted cheeks",
          description: `${total} laugh episode${total === 1 ? "" : "s"} detected where a smile above 0.45 coincides with jaw opening above 0.25 for at least 0.4 s: ${rangeText(spread)} across ${recordingsText(spread.count)}${status === "mixed" ? ". The rate is too inconsistent to treat as a trait" : ""}.`,
        })),
      );
    }
  }

  // 13. Walking cadence.
  {
    const rule: AgreementRule = { mode: "relative", tolerance: 0.25, unit: "steps/min" };
    const observed = withPose.map((s) => ({
      source: s,
      value: s.analysis.pose!.stepCadence ?? 0,
      occurrences: 0,
      exemplars: eventMoments(s.analysis, "walking"),
    }));
    const signals = observed.filter((signal) => signal.value > 30);
    audit.push(
      describeSignal({
        key: "walk-cadence",
        label: "Walking cadence",
        metric: "Steps per minute from alternating ankle lift",
        unit: rule.unit,
        threshold: "> 30 steps/min",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: withPose.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      candidates.push(
        buildCandidate("walk-cadence", "Movement", signals, rule, (status, spread) => ({
          title:
            status === "mixed"
              ? "Walking cadence varies between recordings"
              : `Walks at about ${Math.round(spread.median ?? 0)} steps per minute`,
          description: `Step cadence estimated from alternating ankle lift: ${rangeText(spread)} across ${recordingsText(spread.count)}${status === "mixed" ? ". The recordings disagree, so no single cadence is claimed" : ""}.`,
        })),
      );
    }
  }

  // 14. Posture shifts.
  {
    const rule: AgreementRule = { mode: "relative", tolerance: 0.5, unit: "shifts/min" };
    const observed = usable.map((s) => {
      const count = s.analysis.events.filter((e) => e.type === "posture-shift").length;
      const minutes = s.analysis.coverageSeconds / 60;
      return {
        source: s,
        value: minutes > 0 ? count / minutes : null,
        occurrences: count,
        exemplars: eventMoments(s.analysis, "posture-shift"),
      };
    });
    const signals = observed.filter((signal) => signal.occurrences >= 3 && signal.value !== null);
    audit.push(
      describeSignal({
        key: "posture-shifts",
        label: "Posture shifts",
        metric: "Weight shifts per minute",
        unit: rule.unit,
        threshold: "at least 3 shifts",
        observed: observed.map((signal) => signal.value),
        kept: signals.map((signal) => signal.value),
        eligible: usable.length,
        seconds: signals.reduce((sum, signal) => sum + sourceSeconds(signal.source), 0),
        rule,
      }),
    );
    if (signals.length) {
      const total = signals.reduce((sum, signal) => sum + signal.occurrences, 0);
      candidates.push(
        buildCandidate("posture-shifts", "Posture", signals, rule, (status, spread) => ({
          title:
            status === "mixed"
              ? "Shifts weight a lot in some recordings and barely in others"
              : "Shifts weight and posture frequently while standing",
          description: `Hip-centre displacement events detected: ${rangeText(spread)} across ${recordingsText(spread.count)} (${total} shifts total)${status === "mixed" ? ". The rate is too inconsistent to treat as a habit" : ""}.`,
        })),
      );
    }
  }

  return finish();
}

/* ------------------------------------------------------------------ */
/* Coverage + speech profile                                           */
/* ------------------------------------------------------------------ */

export interface SpeechCategoryRow {
  category: string;
  label: string;
  recordings: number;
  seconds: number;
  medianF0: number | null;
  speechRate: number | null;
  pauseRatio: number;
  intonationRange: number | null;
}

export function speechProfile(recordings: Recording[]): { rows: SpeechCategoryRow[]; totalSeconds: number } {
  const rows: SpeechCategoryRow[] = [];
  for (const key of SPEECH_CATEGORY_KEYS) {
    const group = recordings.filter((r) => r.category === key && r.analysis?.speech);
    if (!group.length) continue;
    const metrics = group.map((r) => r.analysis!.speech!);
    const f0 = metrics.map((m) => m.medianF0).filter((v): v is number => v !== null);
    const rates = metrics.map((m) => m.speechRate).filter((v): v is number => v !== null);
    const intonation = metrics.map((m) => m.intonationRange).filter((v): v is number => v !== null);
    rows.push({
      category: key,
      label: CATEGORY_LABEL[key] ?? key,
      recordings: group.length,
      seconds: round(group.reduce((sum, r) => sum + r.duration, 0), 1),
      medianF0: f0.length ? round(mean(f0), 1) : null,
      speechRate: rates.length ? round(mean(rates), 0) : null,
      pauseRatio: round(mean(metrics.map((m) => m.pauseRatio)), 3),
      intonationRange: intonation.length ? round(mean(intonation), 1) : null,
    });
  }
  return { rows, totalSeconds: round(rows.reduce((sum, row) => sum + row.seconds, 0), 1) };
}

export function computeCoverage(
  recordings: Recording[],
  segments: Segment[],
  mannerisms: Mannerism[],
): CoverageItem[] {
  const analyzed = recordings.filter((r) => r.analysis);
  const speechRecordings = analyzed.filter((r) => r.analysis!.hasAudio && isSpeechCategory(r.category));
  const speechSeconds = speechRecordings.reduce((sum, r) => sum + r.duration, 0);
  const speechCategories = new Set(speechRecordings.map((r) => r.category));
  const singing = analyzed.filter((r) => r.category === "singing");
  const singingSeconds = singing.reduce((sum, r) => sum + r.duration, 0);
  const approved = segments.filter((s) => s.review === "approved");
  const expressionApproved = approved.filter((s) => s.category === "expression" || s.category === "singing");
  const expressionSeconds = expressionApproved.reduce((sum, s) => sum + (s.end - s.start), 0);
  const expressionLabels = new Set(expressionApproved.map((s) => s.emotion).filter(Boolean));
  const movementApproved = approved.filter((s) => s.category === "movement" || s.category === "gesture" || s.category === "posture");
  const movementSeconds = movementApproved.reduce((sum, s) => sum + (s.end - s.start), 0);
  const movementCategories = new Set(
    movementApproved
      .map((s) => recordings.find((r) => r.id === s.recordingId)?.category)
      .filter((v): v is RecordingCategory => Boolean(v)),
  );
  const approvedMannerisms = mannerisms.filter((m) => m.review === "approved");
  const strongMannerisms = approvedMannerisms.filter((m) => m.evidence.length >= 2);

  const item = (
    area: CoverageItem["area"],
    label: string,
    evidence: CoverageItem["evidence"],
    missing: string[],
  ): CoverageItem => ({ area, label, ready: evidence.every((e) => e.met), detail: missing.length ? missing.join(" ") : "Evidence targets met.", evidence, missing });

  return [
    item("speech", "Speech reference", [
      { label: "Speech recordings analysed", value: String(speechRecordings.length), target: "3", met: speechRecordings.length >= 3 },
      { label: "Speech footage", value: `${(speechSeconds / 60).toFixed(1)} min`, target: "10 min", met: speechSeconds >= 600 },
      { label: "Distinct speaking situations", value: String(speechCategories.size), target: "2", met: speechCategories.size >= 2 },
    ], [
      speechRecordings.length < 3 ? `Upload and analyse ${3 - speechRecordings.length} more speaking recording(s).` : "",
      speechSeconds < 600 ? `Add ${(10 - speechSeconds / 60).toFixed(1)} more minutes of speech.` : "",
      speechCategories.size < 2 ? "Add a second speaking situation (e.g. casual conversation and presentation)." : "",
    ].filter(Boolean)),
    item("expression", "Facial expression library", [
      { label: "Approved expression segments", value: String(expressionApproved.length), target: "3", met: expressionApproved.length >= 3 },
      { label: "Approved expression footage", value: `${expressionSeconds.toFixed(0)} s`, target: "60 s", met: expressionSeconds >= 60 },
      { label: "Distinct emotion labels", value: String(expressionLabels.size), target: "5", met: expressionLabels.size >= 5 },
    ], [
      expressionApproved.length < 3 ? "Approve at least three expression segments from your recordings." : "",
      expressionSeconds < 60 ? "Approve more expression footage (aim for 60 seconds total)." : "",
      expressionLabels.size < 5 ? "Label approved segments across at least five emotions." : "",
    ].filter(Boolean)),
    item("movement", "Movement & gesture reference", [
      { label: "Approved movement segments", value: String(movementApproved.length), target: "3", met: movementApproved.length >= 3 },
      { label: "Approved movement footage", value: `${movementSeconds.toFixed(0)} s`, target: "120 s", met: movementSeconds >= 120 },
      { label: "Distinct movement contexts", value: String(movementCategories.size), target: "3", met: movementCategories.size >= 3 },
    ], [
      movementApproved.length < 3 ? "Approve movement, posture or gesture segments." : "",
      movementSeconds < 120 ? "Approve more movement footage (aim for two minutes)." : "",
      movementCategories.size < 3 ? "Include walking, sitting/standing and gesture footage." : "",
    ].filter(Boolean)),
    item("singing", "Singing performance reference", [
      { label: "Singing recordings analysed", value: String(singing.length), target: "3", met: singing.length >= 3 },
      { label: "Singing footage", value: `${(singingSeconds / 60).toFixed(1)} min`, target: "6 min", met: singingSeconds >= 360 },
    ], [
      singing.length < 3 ? "Upload at least three sung takes." : "",
      singingSeconds < 360 ? "Add more singing footage (aim for six minutes across registers)." : "",
    ].filter(Boolean)),
    item("mannerisms", "Mannerism profile", [
      { label: "Approved mannerisms", value: String(approvedMannerisms.length), target: "3", met: approvedMannerisms.length >= 3 },
      { label: "Backed by 2+ recordings", value: String(strongMannerisms.length), target: "3", met: strongMannerisms.length >= 3 },
    ], [
      approvedMannerisms.length < 3 ? "Review and approve the mannerisms the studio proposes." : "",
      strongMannerisms.length < 3 ? "Record more footage so patterns recur across at least two recordings." : "",
    ].filter(Boolean)),
  ];
}

/* ------------------------------------------------------------------ */
/* Integration status                                                  */
/* ------------------------------------------------------------------ */

export const TRAINING_INTEGRATIONS: TrainingIntegration[] = [
  {
    id: "face-landmarks",
    area: "extraction",
    title: "Facial landmarks, blendshapes and head orientation",
    status: "working",
    detail:
      "478 facial landmarks and 52 ARKit-style blendshape scores are extracted on-device from sampled video frames, plus head orientation estimates from the face geometry.",
    requirement: "Nothing — runs locally in this browser.",
    reference: "MediaPipe Face Landmarker",
  },
  {
    id: "pose-landmarks",
    area: "extraction",
    title: "Body pose landmarks and movement timing",
    status: "working",
    detail:
      "33 body landmarks per sampled frame produce shoulder, arm, hip and ankle measurements: gesture energy, posture, stance, sway and step cadence.",
    requirement: "Nothing — runs locally in this browser.",
    reference: "MediaPipe Pose Landmarker",
  },
  {
    id: "hand-landmarks",
    area: "extraction",
    title: "Finger-level hand landmarks",
    status: "not-enabled",
    detail:
      "Arm and wrist motion is measured, but individual fingers are not tracked in this build. MediaPipe's Hand Landmarker (21 landmarks per hand) can be enabled for finger articulation.",
    requirement: "Enable the Hand Landmarker model and accept a higher per-frame analysis cost.",
    reference: "MediaPipe Hand Landmarker",
  },
  {
    id: "speech-analysis",
    area: "extraction",
    title: "Speech rhythm, pitch and pause measurement",
    status: "working",
    detail:
      "Pitch track, intonation range, pause structure, loudness dynamics and a syllable-nuclei pacing proxy are computed from the audio track on-device.",
    requirement: "Nothing for audio analysis; a browser-decodable audio codec is required.",
    reference: "Web Audio API",
  },
  {
    id: "retarget-blender",
    area: "retarget",
    title: "Retargeting extracted motion onto a 3D character",
    status: "external",
    detail:
      "Blendshape CSV and landmark JSON can be exported for Blender or Unreal. Mapping them onto your GLB's rig, correcting scale and solving feet/IK is artist work, not an automatic step.",
    requirement: "Blender or Unreal Engine with a rigged character; ARKit-style blendshape names on the mesh.",
    reference: "Blender · Unreal Live Link",
  },
  {
    id: "audio2face",
    area: "retarget",
    title: "Audio-driven facial animation",
    status: "external",
    detail:
      "NVIDIA Audio2Face can drive blendshapes from your vocal takes, but it runs in Omniverse/UE on an RTX machine — it cannot run in this browser and is not integrated.",
    requirement: "NVIDIA Omniverse Audio2Face + a rigged character with ARKit blendshapes.",
    reference: "NVIDIA Audio2Face",
  },
  {
    id: "lipsync-provider",
    area: "performance",
    title: "Singing lip-sync video",
    status: "external",
    detail:
      "Verified hosted endpoints exist (fal-ai/sync-lipsync/v3, minimax/h3-max/lip-sync/image-to-video) and take an image plus your audio. They are paid, and this studio does not call them yet.",
    requirement: "FAL_KEY plus explicit consent for the recording being sent.",
    reference: "fal.ai lip-sync endpoints",
  },
  {
    id: "voice-authorised",
    area: "voice",
    title: "Authorised voice cloning",
    status: "not-enabled",
    detail:
      "No cloning is performed. Your recordings are analysed as a reference only. Any cloning integration would require a provider you authorise in writing, explicit consent per voice, and a licence check.",
    requirement: "An authorised voice provider, written consent, and a paid plan.",
    reference: null,
  },
];

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export function behaviorMarkdown(state: TrainingState, identityName: string): string {
  const lines: string[] = [];
  const approved = state.mannerisms.filter((m) => m.review === "approved");
  const segments = state.segments.filter((s) => s.review === "approved");
  const speech = speechProfile(state.recordings);
  const usage = state.recordings.filter((r) => r.allowTraining);

  lines.push(`# Behaviour & Communication Reference — ${identityName}`);
  lines.push("");
  lines.push(`Generated ${new Date().toISOString()} · Destinie AI Twin Studio`);
  lines.push("");
  lines.push("> This document records measured observations from your own recordings. It is not a trained model, and nothing in it has been retargeted onto a 3D character.");
  lines.push("");

  lines.push("## Inventory");
  lines.push("");
  lines.push(`- Recordings: ${state.stats.recordings} (${state.stats.videos} video, ${state.stats.audio} audio)`);
  lines.push(`- Video duration: ${(state.stats.videoSeconds / 60).toFixed(1)} min · audio duration: ${(state.stats.audioSeconds / 60).toFixed(1)} min`);
  lines.push(`- Analysed: ${state.stats.analyzed} · approved references: ${state.stats.approved}`);
  lines.push(`- Clearance for training use: ${usage.length} of ${state.stats.recordings}`);
  lines.push(`- Approved mannerisms: ${approved.length} · approved segments: ${segments.length}`);
  lines.push("");

  lines.push("## Approved mannerisms");
  lines.push("");
  if (!approved.length) {
    lines.push("_No mannerisms approved yet._");
  } else {
    for (const mannerism of approved) {
      lines.push(`### ${mannerism.title}`);
      lines.push("");
      lines.push(mannerism.description);
      lines.push("");
      lines.push(
        `Evidence: ${mannerism.evidence
          .map((e) => {
            const unit = e.unit ?? "";
            const value =
              typeof e.value === "number" ? (unit.startsWith("%") ? `${e.value}${unit}` : `${e.value} ${unit}`.trim()) : "not measured";
            const count = e.occurrences > 0 ? `${e.occurrences} occurrences, ` : "";
            return `${e.recordingTitle} (${value}; ${count}${e.seconds}s)`;
          })
          .join("; ")}`,
      `Agreement: ${mannerism.confidence}${mannerism.confidence === "consistent" ? ` across ${mannerism.evidence.length} recordings` : ""}`,

      );
      lines.push("");
    }
  }

  lines.push("## Speech reference");
  lines.push("");
  if (!speech.rows.length) {
    lines.push("_No speech recordings analysed yet._");
  } else {
    lines.push("| Situation | Recordings | Minutes | Median F0 | Syllable nuclei/min (estimate) | Pause share | Pitch range (semitones) |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const row of speech.rows) {
      lines.push(
        `| ${row.label} | ${row.recordings} | ${(row.seconds / 60).toFixed(1)} | ${row.medianF0 ?? "—"} Hz | ${row.speechRate ?? "—"} | ${(row.pauseRatio * 100).toFixed(0)}% | ${row.intonationRange ?? "—"} |`,
      );
    }
    lines.push("");
    lines.push("_Pitch, pause and pacing are measured from your audio. They describe how you speak; they do not replace your voice._");
  }
  lines.push("");

  lines.push("## Approved reference segments");
  lines.push("");
  if (!segments.length) {
    lines.push("_No segments approved yet._");
  } else {
    lines.push("| Recording | Category | Emotion | Start | End | Measurement summary |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const segment of segments) {
      lines.push(
        `| ${segment.recordingTitle} | ${segment.category} | ${segment.emotion || "—"} | ${segment.start.toFixed(1)}s | ${segment.end.toFixed(1)}s | ${segment.summary} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Evidence coverage");
  lines.push("");
  lines.push("| Area | Status | Detail |");
  lines.push("| --- | --- | --- |");
  for (const area of state.coverage) {
    lines.push(`| ${area.label} | ${area.ready ? "targets met" : "more evidence needed"} | ${area.detail} |`);
  }
  lines.push("");

  lines.push("## Recording index");
  lines.push("");
  if (!state.recordings.length) {
    lines.push("_No recordings._");
  } else {
    lines.push("| Title | Category | Collection | Duration | Status | Training use |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const recording of state.recordings) {
      const collection = state.collections.find((c) => c.id === recording.collectionId);
      lines.push(
        `| ${recording.title} | ${CATEGORY_LABEL[recording.category] ?? recording.category} | ${collection ? `${collection.code} · ${collection.name}` : "—"} | ${recording.duration.toFixed(1)}s | ${recording.status} | ${recording.allowTraining ? "allowed" : "reference only"} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Assembly status");
  lines.push("");
  lines.push("- **Uploaded:** the original file is stored privately, unchanged.");
  lines.push("- **Analysed:** landmarks, blendshapes and audio metrics were extracted on-device.");
  lines.push("- **Features extracted:** numeric timelines exist and are exportable (CSV/JSON).");
  lines.push("- **Approved:** you reviewed the segments and mannerisms.");
  lines.push("- **Integrated into a model:** not done. No animation or generative model has been trained on these recordings.");
  lines.push("");

  return lines.join("\n");
}

/**
 * Identity preservation engine.
 *
 * Everything downstream of an approved master — portraits, appearance studies,
 * hairstyle previews, turnaround views, environment shots — is generated from
 * the same identity lock assembled here. Hairstyle and styling are merged into
 * the prompt as modifiers, but the identity lock is always emitted first and is
 * never overridden by a hairstyle or an environment.
 */
import {
  APPEARANCE_CONTROLS,
  FEATURES,
  MEASUREMENTS,
  VIEWS,
  type AppearanceSettings,
  type FeatureValue,
  type GenerationKind,
  type IdentityProfile,
  type IdentityReadiness,
  type Photo,
  type ReadinessFeature,
  type ViewKey,
} from "./types";
import { ENVIRONMENT_MAP, HAIR_STYLE_MAP, hairstyleSentence, TURNAROUND_VIEWS, defaultHairstyle } from "./catalog";

export function defaultProfile(displayName = "DESTINIE | MASTER DIGITAL IDENTITY"): IdentityProfile {
  const features: Record<string, FeatureValue> = {};
  for (const f of FEATURES) features[f.key] = { value: "", source: "missing" };
  return {
    displayName,
    summary: "",
    features,
    marks: [],
    measurements: {},
    skin: { hex: "", undertone: "unspecified", description: "", source: "missing" },
    smile: { description: "", source: "missing" },
    signatureHairstyleId: "long-soft-waves",
    hairstyle: defaultHairstyle(),
    appearance: Object.fromEntries(APPEARANCE_CONTROLS.map((c) => [c.key, c.defaultValue])),
    identityStrength: 88,
    notes: "",
  };
}

/** Clamp every appearance value into its identity-safe band. */
export function clampAppearance(input: Partial<AppearanceSettings> | undefined): AppearanceSettings {
  const out: AppearanceSettings = {};
  for (const c of APPEARANCE_CONTROLS) {
    const raw = Number(input?.[c.key]);
    const value = Number.isFinite(raw) ? raw : c.defaultValue;
    out[c.key] = Math.max(c.min, Math.min(c.safeMax, Math.round(value)));
  }
  return out;
}

function band(value: number): 0 | 1 | 2 {
  if (value <= 33) return 0;
  if (value <= 66) return 1;
  return 2;
}

export function appearancePhrases(settings: AppearanceSettings): string[] {
  const out: string[] = [];
  for (const c of APPEARANCE_CONTROLS) {
    if (c.key === "identityGuard") continue;
    const v = Number(settings[c.key] ?? c.defaultValue);
    out.push(c.phrases[band(v)]);
  }
  return out;
}

export function formatMeasurement(key: string, value: number | undefined): string | null {
  const def = MEASUREMENTS.find((m) => m.key === key);
  if (!def || value === undefined || value === null || !Number.isFinite(value)) return null;
  const digits = def.digits;
  const v = value.toFixed(digits);
  if (def.unit === "percent") return `${v}%`;
  if (def.unit === "degrees") return `${v}°`;
  return v;
}

/** Measurement-derived wording. Always labelled as measured, never as interpretation of identity. */
export function suggestedValueFor(key: string, profile: IdentityProfile): string | null {
  const m = profile.measurements ?? {};
  const f = (k: string) => formatMeasurement(k, m[k]);
  switch (key) {
    case "faceShape": {
      const ratio = m.faceLengthWidth;
      if (!Number.isFinite(ratio)) return null;
      const shape = ratio > 1.62 ? "a longer, oval-to-oblong silhouette" : ratio > 1.45 ? "an oval silhouette" : ratio > 1.3 ? "a balanced oval-to-round silhouette" : "a rounder, wider silhouette";
      return `Facial index ${ratio.toFixed(2)} (length ÷ width) → ${shape}. Confirm by eye.`;
    }
    case "proportions": {
      const parts = [f("upperThird") && `upper ${f("upperThird")}`, f("midThird") && `middle ${f("midThird")}`, f("lowerThird") && `lower ${f("lowerThird")}`].filter(Boolean);
      return parts.length ? `Measured thirds — ${parts.join(", ")}.` : null;
    }
    case "forehead":
      return f("foreheadHeight") ? `Forehead height measured at ${f("foreheadHeight")} of face height.` : null;
    case "eyes": {
      const bits = [f("eyeSpacing") && `inner-corner spacing ${f("eyeSpacing")} of face width`, f("eyeWidth") && `eye width ${f("eyeWidth")}`, f("canthalTilt") && `canthal tilt ${f("canthalTilt")}`].filter(Boolean);
      return bits.length ? `Measured — ${bits.join(", ")}.` : null;
    }
    case "brows":
      return f("browEyeGap") ? `Brow-to-eye gap measured at ${f("browEyeGap")} of face height.` : null;
    case "nose":
      return f("noseWidth") ? `Alar width measured at ${f("noseWidth")} of face width.` : null;
    case "lips": {
      const bits = [f("mouthWidth") && `mouth width ${f("mouthWidth")}`, f("upperLowerLip") && `upper ÷ lower lip ${f("upperLowerLip")}`].filter(Boolean);
      return bits.length ? `Measured — ${bits.join(", ")}.` : null;
    }
    case "jawline":
      return f("jawWidth") ? `Bigonial width measured at ${f("jawWidth")} of face width.` : null;
    case "chin":
      return f("chinProjection") ? `Lower lip to chin measured at ${f("chinProjection")} of face height.` : null;
    case "skin":
      return profile.skin.hex
        ? `Sampled skin ${profile.skin.hex}${profile.skin.undertone !== "unspecified" ? `, ${profile.skin.undertone} undertone` : ""}.`
        : null;
    case "smile":
      return null;
    default:
      return null;
  }
}

interface GroupedMeasurement {
  photoId: string;
  view: ViewKey;
  measurements: Record<string, number>;
}

/** Merge per-photo measurements into a profile, averaging and recording provenance. */
export function mergeMeasurements(
  profile: IdentityProfile,
  samples: GroupedMeasurement[],
): { measurements: IdentityProfile["measurements"]; sources: Record<string, string[]> } {
  const buckets: Record<string, number[]> = {};
  const sources: Record<string, string[]> = {};
  for (const sample of samples) {
    for (const [key, value] of Object.entries(sample.measurements ?? {})) {
      if (!Number.isFinite(value)) continue;
      (buckets[key] ??= []).push(value);
      (sources[key] ??= []).push(sample.photoId);
    }
  }
  const measurements: IdentityProfile["measurements"] = { ...profile.measurements };
  for (const [key, values] of Object.entries(buckets)) {
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    measurements[key] = Number(median.toFixed(3));
  }
  return { measurements, sources };
}

export function computeReadiness(photos: Photo[], profile: IdentityProfile): IdentityReadiness {
  const coverage = VIEWS.map((v) => ({ view: v.key, count: photos.filter((p) => p.view === v.key).length }));
  const has = (v: ViewKey) => (coverage.find((c) => c.view === v)?.count ?? 0) > 0;

  const features: ReadinessFeature[] = FEATURES.map((def) => {
    const stored = profile.features?.[def.key];
    const value = (stored?.value ?? "").trim();
    const missingGroups = def.requires.filter((group) => !group.some(has));
    const missingViews = missingGroups.flatMap((group) => group) as ViewKey[];
    const status: ReadinessFeature["status"] = value
      ? stored?.source === "measured"
        ? "measured"
        : "user"
      : "missing";
    return {
      key: def.key,
      label: def.label,
      help: def.help,
      status,
      value,
      missingViews,
      suggestedValue: suggestedValueFor(def.key, profile),
      measurements: (def.measurements ?? [])
        .map((m) => {
          const md = MEASUREMENTS.find((x) => x.key === m);
          const formatted = formatMeasurement(m, profile.measurements?.[m]);
          return md && formatted ? { key: m, label: md.label, value: formatted } : null;
        })
        .filter((x): x is { key: string; label: string; value: string } => Boolean(x)),
    };
  });

  const coreMissingViews: ViewKey[] = [];
  if (!has("front")) coreMissingViews.push("front");
  if (!has("neutral")) coreMissingViews.push("neutral");
  if (!has("smiling")) coreMissingViews.push("smiling");
  if (!has("leftProfile") && !has("rightProfile")) coreMissingViews.push("leftProfile");
  if (!has("threeQuarterLeft") && !has("threeQuarterRight")) coreMissingViews.push("threeQuarterLeft");

  const missingViews = coverage
    .filter((c) => c.view !== "other" && c.count === 0)
    .map((c) => c.view);

  const approvedCount = features.filter((f) => f.status !== "missing").length;
  const blocking: string[] = [];

  if (photos.length === 0) blocking.push("Upload at least the five core reference photographs before approving a master identity.");
  if (coreMissingViews.length) {
    const labels = coreMissingViews.map((v) => VIEWS.find((x) => x.key === v)?.label ?? v).join(", ");
    blocking.push(`Core reference views still missing: ${labels}.`);
  }
  const unresolved = features.filter((f) => f.status === "missing");
  if (unresolved.length) blocking.push(`${unresolved.length} facial feature${unresolved.length === 1 ? " is" : "s are"} not described yet — ${unresolved.slice(0, 3).map((f) => f.label).join(", ")}${unresolved.length > 3 ? "…" : ""}.`);

  const analyzedPhotos = photos.filter((p) => p.analysis?.faceDetected).length;
  const hasMasterPortrait = photos.some((p) => p.view === "front" && !p.analysis?.error);

  return {
    features,
    approvedCount,
    totalCount: features.length,
    coverage,
    missingViews,
    canApprove: blocking.length === 0,
    blocking,
    analyzedPhotos,
    totalPhotos: photos.length,
    hasMasterPortrait,
  };
}

/** The authoritative identity sentence. Emitted first in every generation prompt. */
export function buildIdentityLock(profile: IdentityProfile): string {
  const lines: string[] = [];
  for (const def of FEATURES) {
    const value = (profile.features?.[def.key]?.value ?? "").trim();
    if (value) lines.push(`${def.label}: ${value}.`);
  }
  if (profile.skin.hex) {
    lines.push(
      `Skin tone: ${profile.skin.description || profile.skin.hex}${profile.skin.undertone !== "unspecified" ? `, ${profile.skin.undertone} undertone` : ""} (sampled ${profile.skin.hex}).`,
    );
  }
  const measured = Object.entries(profile.measurements ?? {})
    .map(([k, v]) => {
      const def = MEASUREMENTS.find((m) => m.key === k);
      const formatted = formatMeasurement(k, v);
      return def && formatted ? `${def.label} ${formatted}` : null;
    })
    .filter(Boolean);
  if (measured.length) lines.push(`Measured facial proportions to preserve exactly: ${measured.join("; ")}.`);

  return [
    "IDENTITY LOCK — this is one specific real person, reproduced from her reference photographs.",
    lines.length ? lines.join(" ") : "Use the attached reference photographs as the only source of facial identity.",
    "The bone structure, face shape, eye shape and spacing, brow shape, nose structure, lip proportions, jawline, chin, ears and skin tone are fixed and must be identical to the reference. Do not beautify into a different face.",
  ].join("\n");
}

export interface ComposeInput {
  profile: IdentityProfile;
  kind: GenerationKind;
  appearance?: AppearanceSettings;
  hairstyle?: IdentityProfile["hairstyle"];
  viewKey?: string | null;
  environmentId?: string | null;
  framing?: "portrait" | "halfBody" | "fullBody";
  outfit?: string;
  extra?: string;
}

export function composeGeneration(input: ComposeInput): { prompt: string; negative: string } {
  const { profile } = input;
  const appearance = clampAppearance(input.appearance ?? profile.appearance);
  const hairstyle = input.hairstyle ?? profile.hairstyle;
  const view = TURNAROUND_VIEWS.find((v) => v.key === input.viewKey) ?? null;
  const env = input.environmentId ? ENVIRONMENT_MAP[input.environmentId] : null;
  const guard = Number(appearance.identityGuard ?? profile.identityStrength ?? 88) / 100;
  const styleName = HAIR_STYLE_MAP[hairstyle.styleId]?.name ?? "signature hairstyle";

  const framing =
    input.framing ?? (view ? (view.fullBody ? "fullBody" : "portrait") : "portrait");

  const blocks: string[] = [];
  blocks.push("Photorealistic editorial photograph of a real adult woman, natural photographic realism, shot on a full-frame camera with an 85mm lens.");

  blocks.push(buildIdentityLock(profile));

  if (profile.summary.trim()) blocks.push(`Artist styling brief: ${profile.summary.trim()}`);

  if (view) {
    blocks.push(`Camera: ${view.prompt}.`);
  } else if (input.kind === "turnaround") {
    blocks.push("Camera: straight-on front view, level with the eyes, neutral relaxed expression.");
  } else {
    blocks.push(
      framing === "fullBody"
        ? "Camera: full-body editorial framing, head to feet, natural standing posture."
        : framing === "halfBody"
          ? "Camera: waist-up editorial framing, camera at chest height."
          : "Camera: head-and-shoulders portrait, camera level with the eyes, calm natural expression.",
    );
  }

  blocks.push(`Hair: ${styleName} — ${hairstyleSentence(hairstyle)}. The hair changes freely, the face does not.`);
  blocks.push(`Skin, light and finish: ${appearancePhrases(appearance).join("; ")}.`);
  blocks.push(
    `Wardrobe: ${input.outfit?.trim() || "elegant, well-fitted neutral-toned clothing that does not obscure the face or neck"}.`,
  );
  if (env) blocks.push(`Environment: ${env.prompt}. Lighting: ${env.lighting}.`);
  else if (input.kind !== "turnaround") blocks.push("Environment: clean neutral studio background, soft separation from the subject.");

  if (input.extra?.trim()) blocks.push(`Additional direction: ${input.extra.trim()}`);

  blocks.push(
    guard >= 0.8
      ? "Identity fidelity: highest. Reproduce the reference face exactly — same person, same face at every angle, only the styling changes."
      : "Identity fidelity: high. Stay faithful to the reference face while applying the requested styling.",
  );
  blocks.push(
    "Finish: realistic skin texture with visible pores and fine lines, individual hair strands, true-to-life color, no plastic smoothing, no painted or illustrated look.",
  );

  const negative = [
    "a different person",
    "altered facial features",
    "changed nose shape",
    "changed eye shape or spacing",
    "changed lip shape",
    "different skin tone",
    "different face shape",
    "face swap",
    "generic model face",
    "beauty filter",
    "airbrushed plastic skin",
    "doll-like proportions",
    "exaggerated jaw or cheekbones",
    "cartoon",
    "illustration",
    "3d render",
    "cgi",
    "anime",
    "text",
    "watermark",
    "logo",
    "extra fingers",
    "deformed hands",
  ].join(", ");

  return { prompt: blocks.join("\n\n"), negative };
}

export function describeAppearance(a: AppearanceSettings): string {
  const parts = APPEARANCE_CONTROLS.filter((c) => c.key !== "identityGuard").map((c) => `${c.label} ${Math.round(Number(a[c.key] ?? c.defaultValue))}/100`);
  return `${parts.join(" · ")} · identity fidelity ${Math.round(Number(a.identityGuard ?? 88))}/100`;
}

export function profileCompletion(profile: IdentityProfile): number {
  const filled = FEATURES.filter((f) => (profile.features?.[f.key]?.value ?? "").trim()).length;
  return Math.round((filled / FEATURES.length) * 100);
}

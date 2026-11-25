/**
 * Identity reference document and prompt pack.
 * This is the reusable artefact the brief asks for: a portable record of the
 * approved identity that future image, 3D and animation workflows can consume.
 */
import { APPEARANCE_CONTROLS, FEATURES, MEASUREMENTS, VIEW_LABELS, type AppState } from "../shared/types";
import { ENVIRONMENTS, HAIR_STYLE_MAP, TURNAROUND_VIEWS, hairstyleSentence } from "../shared/catalog";
import { buildIdentityLock, composeGeneration } from "../shared/identity";

export function identityMarkdown(state: AppState): string {
  const master = state.masterVersion;
  const profile = master?.profile ?? state.draft.profile;
  const lines: string[] = [];

  lines.push(`# ${profile.displayName || state.identity.name}`);
  lines.push("");
  lines.push(`Generated ${new Date().toISOString()} · Destinie AI Twin Studio`);
  lines.push("");
  lines.push(
    master
      ? `**Approved master:** version ${master.number} — ${master.label} (approved ${master.approvedAt?.slice(0, 10) ?? "n/a"})`
      : "**Status:** no master identity has been approved yet. This document reflects a draft and must not be treated as a locked identity.",
  );
  lines.push("");

  if (profile.summary.trim()) {
    lines.push("## Styling brief");
    lines.push("");
    lines.push(profile.summary.trim());
    lines.push("");
  }

  lines.push("## Facial identity record");
  lines.push("");
  lines.push("| Feature | Description | Source |");
  lines.push("| --- | --- | --- |");
  for (const def of FEATURES) {
    const value = profile.features[def.key];
    const text = value?.value?.trim() ? value.value.replace(/\n/g, " ") : "— not established —";
    const source = value?.value?.trim() ? value.source : "missing";
    lines.push(`| ${def.label} | ${text} | ${source} |`);
  }
  lines.push("");

  lines.push("## Measured facial proportions");
  lines.push("");
  const measured = MEASUREMENTS.filter((m) => Number.isFinite(profile.measurements?.[m.key]));
  if (measured.length) {
    lines.push("| Measurement | Value | Definition |");
    lines.push("| --- | --- | --- |");
    for (const m of measured) {
      const raw = profile.measurements[m.key];
      const value = m.unit === "percent" ? `${raw.toFixed(m.digits)}%` : m.unit === "degrees" ? `${raw.toFixed(m.digits)}°` : raw.toFixed(m.digits);
      lines.push(`| ${m.label} | ${value} | ${m.meaning} |`);
    }
    lines.push("");
    lines.push("_Measured locally with MediaPipe Face Landmarker (478 landmarks). Ratios are normalised, so they are resolution independent._");
  } else {
    lines.push("_No measurements recorded yet. Upload a front-facing photograph and run facial measurement._");
  }
  lines.push("");

  lines.push("## Skin");
  lines.push("");
  if (profile.skin.hex) {
    lines.push(
      `- Sampled tone: **${profile.skin.hex}** · undertone: **${profile.skin.undertone}**${profile.skin.description ? ` · ${profile.skin.description}` : ""}`,
    );
  } else {
    lines.push("- Not measured yet.");
  }
  lines.push("");

  if (profile.marks.length) {
    lines.push("## Distinguishing marks");
    lines.push("");
    for (const mark of profile.marks) {
      lines.push(`- **${mark.label}** — ${mark.location}${mark.note ? `: ${mark.note}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Signature hairstyle");
  lines.push("");
  const style = HAIR_STYLE_MAP[profile.signatureHairstyleId];
  lines.push(`**${style?.name ?? "Unset"}** ${style ? `(${style.category})` : ""}`);
  lines.push("");
  lines.push(hairstyleSentence(profile.hairstyle));
  lines.push("");

  lines.push("## Appearance specification");
  lines.push("");
  lines.push("| Control | Value | Identity-safe ceiling |");
  lines.push("| --- | --- | --- |");
  for (const c of APPEARANCE_CONTROLS) {
    lines.push(`| ${c.label} | ${Math.round(Number(profile.appearance[c.key] ?? c.defaultValue))} | ${c.safeMax} |`);
  }
  lines.push("");

  lines.push("## Identity lock (authoritative prompt text)");
  lines.push("");
  lines.push("```text");
  lines.push(buildIdentityLock(profile));
  lines.push("```");
  lines.push("");

  lines.push("## Prompt pack");
  lines.push("");
  const base = composeGeneration({ profile, kind: "portrait" });
  const turnaround = TURNAROUND_VIEWS.map((view) => ({
    view,
    prompt: composeGeneration({ profile, kind: "turnaround", viewKey: view.key }).prompt,
  }));
  const environments = ENVIRONMENTS.slice(0, 4).map((env) => ({
    env,
    prompt: composeGeneration({ profile, kind: "environment", environmentId: env.id }).prompt,
  }));

  lines.push("### Master portrait");
  lines.push("");
  lines.push("```text");
  lines.push(base.prompt);
  lines.push("```");
  lines.push("");
  lines.push("### Negative prompt");
  lines.push("");
  lines.push("```text");
  lines.push(base.negative);
  lines.push("```");
  lines.push("");
  lines.push("### Turnaround views (separate images, not a 3D model)");
  for (const item of turnaround) {
    lines.push("");
    lines.push(`**${item.view.label}**`);
    lines.push("");
    lines.push("```text");
    lines.push(item.prompt);
    lines.push("```");
  }
  for (const item of environments) {
    lines.push("");
    lines.push(`### ${item.env.name}`);
    lines.push("");
    lines.push("```text");
    lines.push(item.prompt);
    lines.push("```");
  }

  lines.push("");
  lines.push("## Reference inventory");
  lines.push("");
  if (state.photos.length === 0) {
    lines.push("_No photographs uploaded._");
  } else {
    lines.push("| View | File | Expression | Hair | Dimensions | Analysed |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const photo of state.photos) {
      lines.push(
        `| ${VIEW_LABELS[photo.view]} | ${photo.originalName} | ${photo.expression || "—"} | ${photo.hairstyle || "—"} | ${photo.width ?? "?"}×${photo.height ?? "?"} | ${photo.analysis?.faceDetected ? "yes" : "no"} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Assembly status — honest technical scope");
  lines.push("");
  lines.push("- **2D references:** the photographs and any generated views are images.");
  lines.push("- **3D model:** only exists if a GLB/GLTF/FBX/OBJ appears in the 3D Character Studio. Reference images are not a model.");
  lines.push("- **Rigged character:** requires a skeleton plus skin weights; not present unless a model was rigged externally.");
  lines.push("- **Animated digital human:** requires rigging, facial blendshapes and an animation pipeline. Audio analysis in this studio does not itself animate a face.");
  lines.push("- **Voice:** only the real uploaded vocal performances are used; no synthetic voice is generated or substituted.");
  lines.push("");
  lines.push("## Privacy");
  lines.push("");
  lines.push("This document contains a written description of a face. It does not contain the source photographs.");
  lines.push("");

  return lines.join("\n");
}

export function promptPackText(state: AppState): string {
  const profile = state.masterVersion?.profile ?? state.draft.profile;
  const base = composeGeneration({ profile, kind: "portrait" });
  const chunks: string[] = [];
  chunks.push(`# PROMPT PACK — ${profile.displayName}`);
  chunks.push(`# Identity lock v${state.masterVersion?.number ?? "draft"}`);
  chunks.push("");
  chunks.push("## Identity lock");
  chunks.push(buildIdentityLock(profile));
  chunks.push("");
  chunks.push("## Negative prompt");
  chunks.push(base.negative);
  chunks.push("");
  chunks.push("## Portrait");
  chunks.push(base.prompt);
  chunks.push("");
  chunks.push("## Turnaround");
  for (const view of TURNAROUND_VIEWS) {
    chunks.push(`### ${view.label}`);
    chunks.push(composeGeneration({ profile, kind: "turnaround", viewKey: view.key }).prompt);
    chunks.push("");
  }
  chunks.push("## Environments");
  for (const env of ENVIRONMENTS) {
    chunks.push(`### ${env.name}`);
    chunks.push(composeGeneration({ profile, kind: "environment", environmentId: env.id }).prompt);
    chunks.push("");
  }
  chunks.push("## Hairstyles");
  for (const styleId of ["long-soft-waves", "curls-defined", "braids-knotless", "updo-sleek-chignon"]) {
    chunks.push(`### ${HAIR_STYLE_MAP[styleId]?.name ?? styleId}`);
    chunks.push(composeGeneration({ profile, kind: "hairstyle", hairstyle: { ...profile.hairstyle, styleId } }).prompt);
    chunks.push("");
  }
  return chunks.join("\n");
}

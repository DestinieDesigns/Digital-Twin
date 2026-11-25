import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useStudio } from "../store";
import { Card, Chip, CopyButton, Empty, Icon, Notice, PageHead, Progress } from "../components/ui";
import { GenerationBar } from "../components/GenerationBar";
import { GenerationTile } from "../components/pieces";
import { APPEARANCE_CONTROLS, type AppearanceSettings } from "../../shared/types";
import { clampAppearance, composeGeneration, defaultProfile } from "../../shared/identity";

const PRESETS: { name: string; note: string; values: Partial<AppearanceSettings> }[] = [
  {
    name: "Natural",
    note: "Barely retouched — the photograph, just better lit.",
    values: { skinClarity: 28, skinTexture: 92, lighting: 45, makeupBase: 12, makeupEyes: 15, makeupLips: 12, makeupBrows: 12, grooming: 28, colorGrade: 30, identityGuard: 95 },
  },
  {
    name: "Camera-ready",
    note: "Professional beauty polish that keeps every proportion.",
    values: { skinClarity: 52, skinTexture: 82, lighting: 68, makeupBase: 34, makeupEyes: 42, makeupLips: 36, makeupBrows: 30, grooming: 52, colorGrade: 46, identityGuard: 90 },
  },
  {
    name: "Editorial",
    note: "The most stylised setting that is still identity-safe.",
    values: { skinClarity: 68, skinTexture: 74, lighting: 84, makeupBase: 54, makeupEyes: 58, makeupLips: 54, makeupBrows: 50, grooming: 68, colorGrade: 62, identityGuard: 86 },
  },
];

export default function Appearance({ go }: { go: (route: string) => void }) {
  const { state, run, busy } = useStudio();
  const draft = state?.draft;
  const [appearance, setAppearance] = useState<AppearanceSettings | null>(null);
  const [outfit, setOutfit] = useState("");

  useEffect(() => {
    if (draft) setAppearance({ ...defaultProfile().appearance, ...draft.profile.appearance });
  }, [draft?.id]);

  if (!state || !draft || !appearance) return null;

  const profile = { ...draft.profile, appearance };
  const groups = ["Skin", "Light", "Makeup", "Finish"] as const;
  const clampedValues = APPEARANCE_CONTROLS.filter((control) => Number(appearance[control.key]) > control.safeMax);
  const appearanceGenerations = state.generations.filter((g) => g.kind === "appearance" || (g.kind === "portrait" && g.status === "completed"));

  const preview = composeGeneration({ profile, kind: "appearance", outfit });

  const save = () =>
    run(
      "Saving appearance",
      () =>
        api.saveProfile({
          appearance,
          identityStrength: appearance.identityGuard,
        }),
      "Appearance specification saved to the working draft",
    );

  const setValue = (key: string, value: number) => setAppearance((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <>
      <PageHead
        eyebrow="Idealised appearance engine"
        title="Appearance Studio"
        description="Refinement, not replacement. Every control is capped at an identity-safe ceiling; the server clamps anything above it."
        actions={
          <>
            <button className="btn ghost" onClick={() => setAppearance(clampAppearance(defaultProfile().appearance))}>
              Reset
            </button>
            <button className="btn primary" onClick={() => void save()} disabled={busy !== null}>
              Save to draft
            </button>
          </>
        }
      />

      <div className="split">
        <div className="stack">
          <Card title="Presets" subtitle="Starting points, not filters. Each one stays inside the safe band.">
            <div className="grid grid-3">
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  className="phase-card"
                  style={{ textAlign: "left", cursor: "pointer" }}
                  onClick={() => setAppearance(clampAppearance({ ...appearance, ...preset.values }))}
                >
                  <div className="phase-title">{preset.name}</div>
                  <div className="phase-body">{preset.note}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card
            title="Refinement controls"
            subtitle="Skin, light and styling. Nothing here touches face shape, eye spacing, nose structure or lip proportions."
            actions={<Chip tone="gold">identity guard {appearance.identityGuard}</Chip>}
          >
            {groups.map((group) => (
              <div key={group} style={{ marginBottom: 12 }}>
                <div className="h3" style={{ marginBottom: 4 }}>{group}</div>
                {APPEARANCE_CONTROLS.filter((control) => control.group === group).map((control) => (
                  <div className="slider-row" key={control.key}>
                    <div className="slider-head">
                      <span className="name">{control.label}</span>
                      <span className="value">{appearance[control.key] ?? control.defaultValue} / {control.safeMax}</span>
                    </div>
                    <input
                      type="range"
                      min={control.min}
                      max={control.safeMax}
                      value={appearance[control.key] ?? control.defaultValue}
                      onChange={(event) => setValue(control.key, Number(event.target.value))}
                      aria-label={control.label}
                    />
                    <div className="hint">{control.help}</div>
                    <div className="hint" style={{ color: "var(--gold)" }}>
                      {control.phrases[appearance[control.key] <= 33 ? 0 : appearance[control.key] <= 66 ? 1 : 2]}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {clampedValues.length > 0 && (
              <Notice tone="warn">
                {clampedValues.length} control{clampedValues.length === 1 ? "" : "s"} were above the safe ceiling and were clamped
                by the server on save.
              </Notice>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Identity guard" subtitle="How hard the generator is held to your approved face.">
            <div className="row-between">
              <span className="serif" style={{ fontSize: 34 }}>{appearance.identityGuard}</span>
              <Chip tone={appearance.identityGuard >= 80 ? "ok" : "warn"}>
                {appearance.identityGuard >= 80 ? "safe" : "reduced fidelity"}
              </Chip>
            </div>
            <Progress value={appearance.identityGuard} />
            <p className="small muted" style={{ marginTop: 8 }}>
              Below 80 the prompt still demands the same bone structure, but the provider has more freedom. It can never go
              below 55 — that limit is enforced on the server, not just in this slider.
            </p>
          </Card>

          <Card
            title="Exact prompt"
            subtitle="This is what will be sent, after the identity lock."
            actions={<CopyButton text={preview.prompt} label="Copy" />}
          >
            <div className="code-block" style={{ maxHeight: 260 }}>{preview.prompt}</div>
            <details style={{ marginTop: 8 }}>
              <summary className="tiny muted" style={{ cursor: "pointer" }}>Negative prompt</summary>
              <div className="code-block" style={{ marginTop: 6, maxHeight: 140 }}>{preview.negative}</div>
            </details>
          </Card>

          <Card title="Generate an appearance study" subtitle="The provider receives a downscaled reference, never the original file.">
            <div className="stack-sm">
              <input
                className="input"
                placeholder="Wardrobe direction (optional) — e.g. cream silk blouse, minimal gold jewellery"
                value={outfit}
                onChange={(event) => setOutfit(event.target.value)}
              />
              <GenerationBar
                state={state}
                kind="appearance"
                appearance={appearance}
                outfit={outfit}
                extra="Camera-ready beauty presentation, expression calm and natural."
                buttonLabel="Generate appearance study"
              />
            </div>
          </Card>

          <Card
            title="Appearance library"
            subtitle="Only provider-returned images appear here."
            actions={<button className="btn ghost sm" onClick={() => go("facial-lab")}>Open comparison</button>}
          >
            {appearanceGenerations.length ? (
              <div className="grid grid-2">
                {appearanceGenerations.slice(0, 4).map((generation) => (
                  <GenerationTile key={generation.id} generation={generation} />
                ))}
              </div>
            ) : (
              <Empty
                title="No appearance studies yet"
                body="Save the specification now; generate once a provider is connected."
                icon="sparkle"
                action={<button className="btn ghost sm" onClick={() => go("settings")}><Icon name="settings" size={12} /> Provider settings</button>}
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

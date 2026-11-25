import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useStudio } from "../store";
import { Card, Chip, CopyButton, Empty, Icon, Notice, PageHead, Tabs } from "../components/ui";
import { GenerationBar } from "../components/GenerationBar";
import { GenerationTile, MasterAvatar } from "../components/pieces";
import { HAIR_CATEGORIES, HAIR_OPTIONS, HAIR_STYLES, HAIR_STYLE_MAP, hairstyleSentence } from "../../shared/catalog";
import { composeGeneration, defaultProfile } from "../../shared/identity";
import type { HairstyleSelection } from "../../shared/types";

export default function Hairstyle({ go }: { go: (route: string) => void }) {
  const { state, run, busy } = useStudio();
  const draft = state?.draft;
  const [selection, setSelection] = useState<HairstyleSelection | null>(null);
  const [category, setCategory] = useState<string>("All");

  useEffect(() => {
    if (draft) setSelection({ ...defaultProfile().hairstyle, ...draft.profile.hairstyle, styleId: draft.profile.signatureHairstyleId || draft.profile.hairstyle.styleId });
  }, [draft?.id]);

  if (!state || !draft || !selection) return null;

  const signature = HAIR_STYLE_MAP[draft.profile.signatureHairstyleId];
  const active = HAIR_STYLE_MAP[selection.styleId];
  const profile = { ...draft.profile, hairstyle: selection };
  const prompt = composeGeneration({ profile, kind: "hairstyle" });
  const hairGenerations = state.generations.filter((g) => g.kind === "hairstyle");

  const styles = useMemo(() => (category === "All" ? HAIR_STYLES : HAIR_STYLES.filter((s) => s.category === category)), [category]);

  const chooseStyle = (styleId: string) => {
    const style = HAIR_STYLE_MAP[styleId];
    if (!style) return;
    setSelection((prev) =>
      prev
        ? {
            ...prev,
            styleId,
            ...Object.fromEntries(Object.entries(style.defaults).map(([key, value]) => [key, value ?? prev[key as keyof HairstyleSelection]])),
          }
        : prev,
    );
  };

  const save = (asSignature: boolean) =>
    run(
      asSignature ? "Setting signature hairstyle" : "Saving hairstyle",
      () =>
        api.saveProfile({
          hairstyle: selection,
          signatureHairstyleId: asSignature ? selection.styleId : draft.profile.signatureHairstyleId,
        }),
      asSignature ? "Signature hairstyle set — the face is untouched" : "Hairstyle saved to the working draft",
    );

  return (
    <>
      <PageHead
        eyebrow="Signature hairstyle studio"
        title="Hairstyle Studio"
        description="Hair is a styling layer, stored separately from the identity profile. Changing it never rewrites a facial feature."
        actions={
          <>
            <button className="btn ghost" onClick={() => void save(false)} disabled={busy !== null}>
              Save to draft
            </button>
            <button className="btn primary" onClick={() => void save(true)} disabled={busy !== null}>
              <Icon name="hair" size={14} /> Set as signature
            </button>
          </>
        }
      />

      <div className="stack">
        <div className="split">
          <Card className="gold">
            <div className="hero-master">
              <MasterAvatar state={state} />
              <div className="headline">
                <div className="row">
                  <Chip tone="gold"><Icon name="hair" size={11} /> signature</Chip>
                  <Chip>{signature?.category ?? "unset"}</Chip>
                  <Chip tone="ok"><Icon name="lock" size={10} /> face unchanged</Chip>
                </div>
                <div className="name">{signature?.name ?? "No signature set"}</div>
                <div className="small muted">{signature?.description ?? "Choose a style below and set it as your signature."}</div>
                <div className="divider" />
                <div className="row tiny muted">
                  <span>{selection.length}</span>·<span>{selection.texture}</span>·<span>{selection.volume}</span>·
                  <span>{selection.parting}</span>
                  {selection.bangs !== "None" && <>·<span>{selection.bangs}</span></>}
                </div>
              </div>
            </div>
          </Card>

          <Card title="Customisation" subtitle="These attributes are appended after the identity lock.">
            <div className="grid grid-2" style={{ gap: 10 }}>
              {HAIR_OPTIONS.map((option) => (
                <div className="field" key={option.key}>
                  <label className="label">{option.label}</label>
                  <select
                    className="select sm"
                    value={selection[option.key]}
                    onChange={(event) => setSelection({ ...selection, [option.key]: event.target.value })}
                  >
                    {option.options.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label className="label">Notes for the stylist</label>
              <textarea
                className="textarea"
                style={{ minHeight: 58 }}
                placeholder="e.g. keep a few soft tendrils at the temples; no heat-styled shine"
                value={selection.notes}
                onChange={(event) => setSelection({ ...selection, notes: event.target.value })}
              />
            </div>
          </Card>
        </div>

        <Card
          title="Hairstyle library"
          subtitle={`${HAIR_STYLES.length} styles across ${HAIR_CATEGORIES.length} categories. Selecting one loads its default attributes — you can then adjust every detail.`}
          actions={
            <Tabs
              items={[{ key: "All", label: "All" }, ...HAIR_CATEGORIES.map((c) => ({ key: c, label: c }))]}
              value={category}
              onChange={setCategory}
            />
          }
        >
          <div className="grid grid-auto">
            {styles.map((style) => {
              const isActive = selection.styleId === style.id;
              const isSignature = draft.profile.signatureHairstyleId === style.id;
              return (
                <button
                  key={style.id}
                  onClick={() => chooseStyle(style.id)}
                  className="phase-card"
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    borderColor: isActive ? "var(--gold)" : undefined,
                    background: isActive ? "var(--gold-wash)" : undefined,
                  }}
                >
                  <div className="row" style={{ gap: 6 }}>
                    <span className="phase-title">{style.name}</span>
                    {isSignature && <Chip tone="gold">signature</Chip>}
                    {isActive && !isSignature && <Chip tone="ok">selected</Chip>}
                  </div>
                  <div className="phase-body">{style.description}</div>
                  <div className="row" style={{ gap: 4 }}>
                    <Chip>{style.category}</Chip>
                    <Chip>{style.defaults.length ?? selection.length}</Chip>
                    <Chip>{style.defaults.texture ?? selection.texture}</Chip>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="split">
          <Card
            title="Exact prompt"
            subtitle={`Style: ${active?.name ?? "—"} — the face described above the hair is unchanged.`}
            actions={<CopyButton text={prompt.prompt} label="Copy" />}
          >
            <div className="code-block" style={{ maxHeight: 240 }}>{prompt.prompt}</div>
            <div className="hint" style={{ marginTop: 8 }}>{hairstyleSentence(selection)}</div>
          </Card>

          <Card title="Preview this hair" subtitle="A real render needs a provider key; the prompt is ready either way.">
            <div className="stack-sm">
              <GenerationBar
                state={state}
                kind="hairstyle"
                hairstyle={selection}
                appearance={profile.appearance}
                extra={`Signature hairstyle: ${active?.name ?? selection.styleId}. Keep the face, skin and expression exactly as the reference; only the hair and styling change.`}
                buttonLabel="Preview hairstyle"
                aspect="portrait"
              />
              <Notice tone="info" icon="info">
                Changing hairstyle must not change the face. If a preview alters your features, reject it in the Facial Identity
                Lab rather than saving it.
              </Notice>
              <button className="btn ghost sm" onClick={() => go("facial-lab")}>
                Open comparison workspace
              </button>
            </div>
          </Card>
        </div>

        <Card title="Hairstyle previews" subtitle="Each preview keeps the same approved face and swaps only the hair layer.">
          {hairGenerations.length ? (
            <div className="grid grid-4">
              {hairGenerations.slice(0, 8).map((generation) => (
                <GenerationTile key={generation.id} generation={generation} />
              ))}
            </div>
          ) : (
            <Empty title="No hairstyle previews yet" body="Select a style, set your signature, then generate previews once a provider is connected." icon="hair" />
          )}
        </Card>
      </div>
    </>
  );
}

import React, { useMemo, useState } from "react";
import { assetUrl } from "../api";
import { useStudio } from "../store";
import { Card, Chip, Icon, Notice, PageHead, Progress } from "../components/ui";
import { MasterAvatar, masterReference } from "../components/pieces";
import { TURNAROUND_VIEWS } from "../../shared/catalog";
import { runGeneration } from "../lib/generate";
import type { Generation } from "../../shared/types";

export default function Turnaround({ go }: { go: (route: string) => void }) {
  const { state, run, busy } = useStudio();
  const [activeView, setActiveView] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const provider = useMemo(
    () =>
      state?.providers.find((p) => p.configured && p.models.some((m) => m.supports.includes("turnaround"))) ??
      state?.providers.find((p) => p.models.some((m) => m.supports.includes("turnaround"))),
    [state?.providers],
  );
  const model = provider?.models.find((m) => m.supports.includes("turnaround"))?.id;

  if (!state) return null;

  const latestFor = (viewKey: string): Generation | undefined =>
    state.generations.find((g) => g.kind === "turnaround" && g.view === viewKey && g.status === "completed" && g.assetId);

  const readyCount = TURNAROUND_VIEWS.filter((v) => latestFor(v.key)).length;
  const reference = masterReference(state);
  const consentOk = state.settings.allowExternalReferenceUpload;
  const canGenerate = Boolean(provider?.configured) && consentOk && Boolean(reference);

  const generateView = async (viewKey: string) => {
    if (!provider || !model) return;
    setActiveView(viewKey);
    const view = TURNAROUND_VIEWS.find((v) => v.key === viewKey);
    try {
      await run(
        `Rendering ${view?.short ?? viewKey}`,
        () =>
          runGeneration(state, {
            kind: "turnaround",
            provider: provider.id,
            model,
            viewKey,
            aspect: view?.fullBody ? "portrait" : "square",
            extra:
              "Character reference sheet view. Neutral expression, even studio light, plain background. Keep the face, hairline, skin tone and body proportions identical across every view.",
          }),
        `${view?.label ?? viewKey} generated`,
      );
    } finally {
      setActiveView(null);
    }
  };

  const generateMissing = async () => {
    if (!provider || !model) return;
    const missing = TURNAROUND_VIEWS.filter((v) => !latestFor(v.key));
    setProgress({ done: 0, total: missing.length });
    for (let index = 0; index < missing.length; index++) {
      await generateView(missing[index].key);
      setProgress({ done: index + 1, total: missing.length });
    }
    window.setTimeout(() => setProgress(null), 1200);
  };

  return (
    <>
      <PageHead
        eyebrow="Multi-angle reference generator"
        title="Character Turnaround"
        description="Nine separate views of the same locked character. These are images for reference and modelling — not a 3D model."
        actions={
          <>
            <button className="btn ghost" onClick={() => setSheetMode((value) => !value)}>
              <Icon name="document" size={14} /> {sheetMode ? "Grid view" : "Reference sheet"}
            </button>
            <button className="btn ghost" onClick={() => window.print()}>
              Print sheet
            </button>
            <button className="btn primary" onClick={() => void generateMissing()} disabled={!canGenerate || busy !== null || readyCount === TURNAROUND_VIEWS.length}>
              {progress ? <span className="spinner light" /> : <Icon name="rotate" size={14} />}
              {progress ? `${progress.done}/${progress.total}` : "Generate missing views"}
            </button>
          </>
        }
      />

      <div className="stack">
        <Notice tone="warn" title="What this is — and what it is not">
          A turnaround is a set of <strong>2D reference images</strong>. It is not a mesh, a rig or an animation. Generating all
          nine views does not construct a 3D character; the 3D Character Studio is where a real GLB is produced or imported.
        </Notice>

        <div className="split">
          <Card title="Reference identity" subtitle="Every view is generated from this single approved face.">
            <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
              <div style={{ width: 130 }}>
                <MasterAvatar state={state} showLabel={false} />
              </div>
              <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                <div className="row">
                  <Chip tone={reference?.kind === "photo" ? "ok" : reference ? "gold" : "warn"}>
                    {reference ? reference.label : "no reference"}
                  </Chip>
                  <Chip>{state.draft.profile.hairstyle.length} hair</Chip>
                </div>
                <div className="small muted">{reference?.detail ?? "Upload a front photograph to begin."}</div>
                <div className="row-between">
                  <span className="label">Views generated</span>
                  <span className="tiny muted">{readyCount}/9</span>
                </div>
                <Progress value={readyCount} max={9} />
                {!canGenerate && (
                  <Notice tone="warn">
                    {!provider?.configured
                      ? `Connect ${provider?.envVar ?? "FAL_KEY"} in Settings to render views.`
                      : !consentOk
                        ? "Reference upload consent is off. Enable it in Settings."
                        : "Add a reference photograph first."}
                  </Notice>
                )}
              </div>
            </div>
          </Card>

          <Card title="Consistency rules" subtitle="Enforced by the prompt, checked by you.">
            <div className="stack-sm small muted">
              <div className="row" style={{ gap: 8 }}><Icon name="lock" size={13} /> Same identity lock in all nine prompts</div>
              <div className="row" style={{ gap: 8 }}><Icon name="hair" size={13} /> Signature hairstyle applied to every view</div>
              <div className="row" style={{ gap: 8 }}><Icon name="scan" size={13} /> Plain background, neutral light, no styling drift</div>
              <div className="row" style={{ gap: 8 }}><Icon name="eye" size={13} /> Compare each view with the master before approving</div>
              <button className="btn ghost sm" style={{ justifySelf: "start" }} onClick={() => go("facial-lab")}>
                Open comparison workspace
              </button>
            </div>
          </Card>
        </div>

        {sheetMode ? (
          <Card className="flush" title="Reference sheet" subtitle="Arranged for a modelling or rigging handover." actions={<Chip>{readyCount}/9 filled</Chip>}>
            <div style={{ padding: 20 }} className="turnaround-sheet">
              <div className="row-between">
                <div>
                  <div className="serif" style={{ fontSize: 22, letterSpacing: "0.06em" }}>DESTINIE · TURNAROUND</div>
                  <div className="tiny muted">Master v{state.masterVersion?.number ?? "draft"} · {new Date().toLocaleDateString()}</div>
                </div>
                <div className="tiny muted" style={{ textAlign: "right" }}>
                  2D reference views only<br />
                  Not a 3D model
                </div>
              </div>
              <div className="sheet-grid">
                {TURNAROUND_VIEWS.map((view) => {
                  const generation = latestFor(view.key);
                  return (
                    <div className="sheet-cell" key={view.key}>
                      <div className="frame">
                        {generation?.assetId ? (
                          <img src={assetUrl(generation.assetId)} alt={view.label} />
                        ) : (
                          <span className="view-chip missing">pending</span>
                        )}
                      </div>
                      <div className="cap">
                        <span>{view.label}</span>
                        <span>{view.key === "backHead" || view.key === "leftProfile" || view.key === "rightProfile" ? "profile" : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        ) : (
          <div className="grid grid-3">
            {TURNAROUND_VIEWS.map((view) => {
              const generation = latestFor(view.key);
              const isBusy = activeView === view.key;
              return (
                <div className="turn-cell" key={view.key}>
                  <div className="frame">
                    {generation?.assetId ? (
                      <img src={assetUrl(generation.assetId)} alt={view.label} />
                    ) : (
                      <div className="view-label">{view.short}</div>
                    )}
                  </div>
                  <div className="body">
                    <div className="row-between">
                      <span style={{ fontSize: 12.5 }}>{view.label}</span>
                      <Chip tone={generation ? "ok" : "warn"}>{generation ? "generated" : "missing"}</Chip>
                    </div>
                    <div className="tiny muted">{view.fullBody ? "Full body · portrait framing" : view.faceVisible ? "Face view · square framing" : "Back view · square framing"}</div>
                    <div className="row" style={{ gap: 5 }}>
                      <button className="btn sm ghost" onClick={() => void generateView(view.key)} disabled={!canGenerate || busy !== null}>
                        {isBusy ? <span className="spinner" /> : <Icon name="sparkle" size={12} />}
                        {generation ? "Regenerate" : "Generate"}
                      </button>
                      {generation?.assetId && (
                        <a className="btn sm ghost" href={assetUrl(generation.assetId)} download={`destinie-${view.key}.png`}>
                          <Icon name="export" size={12} /> Save
                        </a>
                      )}
                    </div>
                    {generation && <span className="tiny muted">{new Date(generation.createdAt).toLocaleString()}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

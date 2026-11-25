import React from "react";
import { useStudio } from "../store";
import { Badge, Card, Chip, Icon, Notice, PageHead, Progress, Stat } from "../components/ui";
import { GenerationTile, MasterAvatar, ProviderGate } from "../components/pieces";
import { VIEW_LABELS } from "../../shared/types";
import { formatBytes } from "../lib/util";
import { formatDuration, useTraining } from "../lib/training";
import { profileCompletion } from "../../shared/identity";

export default function Dashboard({ go }: { go: (route: string) => void }) {
  const { state } = useStudio();
  if (!state) return null;

  const master = state.masterVersion;
  const working = master ?? state.draft;
  const profile = working.profile;
  const readiness = state.readiness;
  const completion = profileCompletion(profile);
  const recent = state.generations.filter((g) => g.status === "completed" && g.assetId).slice(0, 4);
  const providerReady = state.providers.some((p) => p.configured);
  const generated3D = state.models.length > 0;
  const rigged = state.models.some((m) => m.rigged);

  const steps: { title: string; body: string; action: string; route: string; done?: boolean }[] = [];
  if (state.photos.length === 0) {
    steps.push({
      title: "Upload your first reference photographs",
      body: "Front, neutral, smiling, a three-quarter and a profile are the minimum for a trustworthy identity.",
      action: "Upload references",
      route: "uploads",
    });
  }
  if (readiness.missingViews.length && state.photos.length > 0) {
    steps.push({
      title: `Add ${readiness.missingViews.length} missing view${readiness.missingViews.length === 1 ? "" : "s"}`,
      body: readiness.missingViews.slice(0, 4).map((v) => VIEW_LABELS[v]).join(" · "),
      action: "Fill the gaps",
      route: "uploads",
    });
  }
  if (completion < 100) {
    steps.push({
      title: `Describe ${readiness.totalCount - readiness.approvedCount} facial feature${readiness.totalCount - readiness.approvedCount === 1 ? "" : "s"}`,
      body: "The studio asks for a written description rather than guessing an unseen nose or jawline.",
      action: "Open My Identity",
      route: "identity",
    });
  }
  if (!master && readiness.canApprove) {
    steps.push({
      title: "Approve your master identity",
      body: "Approval locks the reference. Later changes are drafts until you approve them explicitly.",
      action: "Review and approve",
      route: "identity",
    });
  }
  if (!providerReady) {
    steps.push({
      title: "Connect an image provider (optional)",
      body: "Needed for generated portraits, turnaround views, hairstyle previews and 3D reconstruction.",
      action: "Open Settings",
      route: "settings",
    });
  }
  if (master && state.stats.approvedGenerations === 0) {
    steps.push({
      title: "Create your first approved portrait",
      body: "Generate a candidate, compare it with the master reference, then approve what genuinely looks like you.",
      action: "Open Facial Identity Lab",
      route: "facial-lab",
    });
  }

  return (
    <>
      <PageHead
        eyebrow="Identity foundation · Phase 1"
        title="Your studio, one permanent face."
        description="Everything here is built around a single approved identity. Styling changes freely; the face does not."
        actions={
          <>
            <button className="btn ghost" onClick={() => go("uploads")}>
              <Icon name="upload" size={14} /> Upload references
            </button>
            <button className="btn primary" onClick={() => go("identity")}>
              Open My Identity <Icon name="arrow" size={14} />
            </button>
          </>
        }
      />

      <div className="stack">
        <Card className="gold">
          <div className="hero-master">
            <MasterAvatar state={state} />
            <div className="headline">
              <div className="row">
                <Badge tone={master ? "master" : "draft"}>{master ? `Master v${master.number}` : "Draft identity"}</Badge>
                <Chip>{state.photos.length} references</Chip>
                <Chip tone={providerReady ? "ok" : "warn"}>{providerReady ? "Provider connected" : "No provider key"}</Chip>
              </div>
              <div className="name">{profile.displayName || "DESTINIE | MASTER DIGITAL IDENTITY"}</div>
              <div className="muted small" style={{ maxWidth: 620 }}>
                {profile.summary ||
                  "Your styling brief appears here. Add a short description of how you want to be presented — the tone, the polish, the era — and every generation inherits it."}
              </div>
              <div style={{ display: "grid", gap: 7, marginTop: 4 }}>
                <div className="row-between">
                  <span className="label">Identity documentation</span>
                  <span className="tiny muted">
                    {readiness.approvedCount}/{readiness.totalCount} features · {completion}%
                  </span>
                </div>
                <Progress value={readiness.approvedCount} max={readiness.totalCount} />
              </div>
              <div className="row" style={{ marginTop: 2 }}>
                <button className="btn sm" onClick={() => go("facial-lab")}>
                  Facial Identity Lab
                </button>
                <button className="btn sm ghost" onClick={() => go(providerReady ? "appearance" : "settings")}>
                  {providerReady ? "Appearance Studio" : "Connect a provider"}
                </button>
                <button className="btn sm ghost" onClick={() => go("export")}>
                  Export identity document
                </button>
              </div>
              {!master && readiness.blocking.length > 0 && (
                <Notice tone="warn" title="The master identity is not approved yet">
                  {readiness.blocking[0]}
                </Notice>
              )}
            </div>
          </div>
        </Card>

        <div className="grid grid-4">
          <Card>
            <Stat label="Reference photographs" value={state.stats.photos} note={`${state.stats.analyzedPhotos} measured on-device`} />
          </Card>
          <Card>
            <Stat label="Identity versions" value={state.stats.versions} note={master ? `Master v${master.number} locked` : "No master yet"} />
          </Card>
          <Card>
            <Stat label="Generations" value={state.stats.generations} note={`${state.stats.approvedGenerations} approved`} />
          </Card>
          <Card>
            <Stat label="Private storage" value={formatBytes(state.stats.storageBytes)} note={`${state.stats.models} 3D · ${state.stats.audioTakes} audio`} />
          </Card>
        </div>

        <BehaviourCard go={go} />

        <div className="split">
          <div className="stack">
            <Card
              title="Recommended next"
              subtitle="The studio will ask for a reference instead of inventing a feature it cannot see."
              actions={<Chip tone="gold">{steps.length} step{steps.length === 1 ? "" : "s"}</Chip>}
            >
              {steps.length === 0 ? (
                <Notice tone="ok" title="Phase 1 foundation is complete">
                  Your identity is documented and approved. Move on to generating consistent portraits, turnaround views and 3D work.
                </Notice>
              ) : (
                <div className="stack-sm">
                  {steps.map((step) => (
                    <div
                      key={step.title}
                      className="row-between"
                      style={{
                        padding: "11px 12px",
                        border: "1px solid var(--line)",
                        borderRadius: 10,
                        background: "#fdfaf3",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 13 }}>{step.title}</span>
                        <span className="tiny muted">{step.body}</span>
                      </div>
                      <button className="btn sm ghost" onClick={() => go(step.route)}>
                        {step.action}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title="Recent creations"
              subtitle="Only images a provider actually returned are shown here."
              actions={
                <button className="btn ghost sm" onClick={() => go("creations")}>
                  View library
                </button>
              }
            >
              {recent.length ? (
                <div className="grid grid-4">
                  {recent.map((generation) => (
                    <GenerationTile key={generation.id} generation={generation} compact />
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <div className="mark">
                    <Icon name="sparkle" size={18} />
                  </div>
                  <div className="title">No creations yet</div>
                  <div className="small">
                    {providerReady
                      ? "Generate a portrait from your approved references to begin the visual library."
                      : "Prompts are ready to use. Connect a provider in Settings to create the first image."}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div className="stack">
            <Card title="Project phases" subtitle="Honest status, not a checklist of promises.">
              <div className="stack-sm">
                <Phase
                  title="Phase 1 · Identity foundation"
                  state={readiness.canApprove ? "Ready" : "In progress"}
                  tone={readiness.canApprove ? "ok" : "warn"}
                  body="Uploads, on-device measurement, the 14-feature identity profile, hairstyle and appearance studios, versioning and privacy controls."
                  ready={readiness.canApprove}
                />
                <Phase
                  title="Phase 2 · Character creation"
                  state={providerReady ? "Ready" : "Needs a key"}
                  tone={providerReady ? "ok" : "warn"}
                  body="Identity-locked portraits, hairstyle previews, environment shots, the nine-view turnaround and approval comparison."
                  ready={providerReady}
                />
                <Phase
                  title="Phase 3 · 3D development"
                  state={generated3D ? (rigged ? "Rigged model present" : "Base mesh present") : "Research + ready to call"}
                  tone={generated3D ? "ok" : ""}
                  body="Real GLB import and viewing, single-image reconstruction via Hunyuan 3D, and an honest distinction between mesh, rig and animation."
                  ready={generated3D}
                />
                <Phase
                  title="Phase 4 · Virtual performer"
                  state={state.audio.length ? "Audio analysed" : "Workspace ready"}
                  tone=""
                  body="Vocal upload and local pitch/energy analysis now; singing-grade lip sync needs Sync.so or a comparable paid provider."
                  ready={false}
                />
                <Phase
                  title="Phase 5 · Production"
                  state="Documented"
                  tone=""
                  body="Asset exports are real. Video rendering is not built: lip-sync video comes from the animation provider and is edited in your own editor."
                  ready={false}
                />
              </div>
            </Card>

            <Card title="Provider status" subtitle="Keys live in .env on this machine, never in the browser.">
              <div className="stack-sm">
                {state.providers.map((provider) => (
                  <div key={provider.id} className="row-between" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <span style={{ fontSize: 12.5 }}>{provider.name}</span>
                      <span className="tiny muted">{provider.models.length} verified model{provider.models.length === 1 ? "" : "s"}</span>
                    </div>
                    <Chip tone={provider.configured ? "ok" : "warn"}>{provider.configured ? "connected" : provider.envVar}</Chip>
                  </div>
                ))}
                {!providerReady && <ProviderGate state={state} />}
                <button className="btn ghost sm" onClick={() => go("settings")}>
                  Provider settings
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function BehaviourCard({ go }: { go: (route: string) => void }) {
  const { training } = useTraining();
  if (!training) return null;
  const readyAreas = training.coverage.filter((area) => area.ready).length;
  const pendingReview = training.stats.pendingMannerisms + training.segments.filter((s) => s.review === "pending").length;

  return (
    <Card
      eyebrow="Behaviour learning · core module"
      title="How you move, speak and react"
      subtitle="Your own recordings become measured reference data for the twin — never a generic motion set."
      actions={
        <Chip tone={training.stats.recordings ? "ok" : "warn"}>
          {training.stats.recordings} recording{training.stats.recordings === 1 ? "" : "s"}
        </Chip>
      }
    >
      <div className="grid grid-4" style={{ marginBottom: 12 }}>
        <Stat label="Training footage" value={formatDuration(training.stats.videoSeconds + training.stats.audioSeconds)} note={`${training.stats.analyzed} analysed · ${training.stats.failed} failed`} />
        <Stat label="Reference segments" value={training.stats.segments} note={`${training.stats.approvedSegments} approved`} />
        <Stat label="Mannerisms" value={training.stats.approvedMannerisms} note={`${training.stats.mannerisms} proposed`} />
        <Stat label="Evidence areas ready" value={`${readyAreas}/${training.coverage.length}`} note="speech, expression, movement, singing, mannerisms" />
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button className="btn primary sm" onClick={() => go("training-library")}>
          <Icon name="upload" size={13} /> Add recordings
        </button>
        <button className="btn sm" onClick={() => go("movement-lab")}>Analyse footage</button>
        <button className="btn ghost sm" onClick={() => go("mannerisms")}>Review mannerisms</button>
        <button className="btn ghost sm" onClick={() => go("training-dashboard")}>Training dashboard</button>
        {pendingReview > 0 && <Chip tone="gold">{pendingReview} awaiting review</Chip>}
      </div>
      <div className="hint" style={{ marginTop: 8 }}>
        Uploading stores a file. Analysing extracts landmarks and speech measurements. No behaviour model has been trained or
        retargeted yet — the dashboard separates those stages explicitly.
      </div>
    </Card>
  );
}

function Phase({
  title,
  state: phaseState,
  tone,
  body,
  ready,
}: {
  title: string;
  state: string;
  tone: "" | "ok" | "warn";
  body: string;
  ready: boolean;
}) {
  return (
    <div className="phase-card">
      <div className="phase-top">
        <span className="phase-title">{title}</span>
        <span style={{ marginLeft: "auto" }}>
          <Chip tone={tone}>{phaseState}</Chip>
        </span>
      </div>
      <div className="phase-body">{body}</div>
      <Progress value={ready ? 100 : 30} thin />
    </div>
  );
}

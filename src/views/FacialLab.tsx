import React, { useEffect, useMemo, useState } from "react";
import { api, assetUrl } from "../api";
import { useStudio } from "../store";
import { Badge, Card, Chip, CompareStage, Empty, Icon, Notice, PageHead, Progress, Spinner } from "../components/ui";
import { GenerationBar } from "../components/GenerationBar";
import { GenerationTile, MasterAvatar, masterReference } from "../components/pieces";
import { formatDate, formatTime } from "../lib/util";

export default function FacialLab({ go }: { go: (route: string) => void }) {
  const { state, run, busy } = useStudio();
  const [candidateId, setCandidateId] = useState("");
  const [split, setSplit] = useState(52);
  const [note, setNote] = useState("");
  const [extra, setExtra] = useState("");

  const completed = useMemo(
    () => (state ? state.generations.filter((g) => g.status === "completed" && g.assetId) : []),
    [state?.generations],
  );

  useEffect(() => {
    if (!completed.length) {
      setCandidateId("");
      return;
    }
    if (!completed.some((g) => g.id === candidateId)) {
      const preferred = completed.find((g) => g.review === "approved") ?? completed[0];
      setCandidateId(preferred.id);
    }
  }, [completed.length, candidateId]);

  if (!state) return null;

  const master = state.masterVersion;
  const readiness = state.readiness;
  const reference = masterReference(state);
  const candidate = completed.find((g) => g.id === candidateId) ?? null;
  const pendingCount = completed.filter((g) => g.review === "pending").length;

  const review = async (reviewState: "approved" | "rejected") => {
    if (!candidate) return;
    await run(
      reviewState === "approved" ? "Approving candidate" : "Rejecting candidate",
      () => api.review(candidate.id, reviewState, note),
      reviewState === "approved"
        ? "Candidate approved — your master identity is unchanged"
        : "Candidate rejected with your note",
    );
    setNote("");
  };

  const approveMaster = async () => {
    if (!state) return;
    await run("Approving identity", () => api.approveVersion(state.draft.id), "Master identity approved");
  };

  return (
    <>
      <PageHead
        eyebrow="Facial identity consistency"
        title="Facial Identity Lab"
        description="Compare every candidate against the approved master before it means anything. Nothing replaces your identity automatically."
        actions={
          <>
            <Chip tone={pendingCount ? "warn" : "ok"}>{pendingCount} awaiting review</Chip>
            <button className="btn ghost" onClick={() => go("identity")}>
              Edit identity record
            </button>
          </>
        }
      />

      <div className="stack">
        <div className="split">
          <Card
            title="Comparison workspace"
            subtitle="Drag the slider to sweep between your approved master and the selected candidate."
            actions={
              candidate && (
                <Chip tone={candidate.review === "approved" ? "ok" : candidate.review === "rejected" ? "danger" : "warn"}>
                  {candidate.review}
                </Chip>
              )
            }
          >
            {completed.length === 0 ? (
              <Empty
                title="No candidates to compare yet"
                body="Generate a portrait below (or in any studio). Approval always starts with a side-by-side against the master reference."
                icon="scan"
                action={<button className="btn gold sm" onClick={() => go("uploads")}>Add references</button>}
              />
            ) : (
              <div className="stack-sm">
                <div className="compare">
                  <CompareStage
                    leftSrc={reference?.url ?? null}
                    rightSrc={candidate?.assetId ? assetUrl(candidate.assetId) : null}
                    leftLabel="Master"
                    rightLabel={candidate?.label ?? "Candidate"}
                    split={split}
                  />
                  <div className="compare-legend">
                    <span>{reference?.label ?? "No master reference"}</span>
                    <span>{candidate ? formatTime(candidate.createdAt) : "—"}</span>
                  </div>
                  <input type="range" min={0} max={100} value={split} onChange={(event) => setSplit(Number(event.target.value))} aria-label="Comparison split" />
                </div>

                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8 }}>
                  {completed.slice(0, 12).map((generation) => (
                    <button
                      key={generation.id}
                      onClick={() => setCandidateId(generation.id)}
                      style={{
                        padding: 0,
                        border: generation.id === candidateId ? "2px solid var(--gold)" : "1px solid var(--line)",
                        borderRadius: 8,
                        overflow: "hidden",
                        cursor: "pointer",
                        background: "none",
                        aspectRatio: "1 / 1",
                      }}
                      title={generation.label}
                    >
                      <img src={assetUrl(generation.assetId!)} alt={generation.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </button>
                  ))}
                </div>

                {candidate && (
                  <div className="stack-sm">
                    <div className="row-between">
                      <div style={{ display: "grid", gap: 2 }}>
                        <span style={{ fontSize: 12.5 }}>{candidate.label}</span>
                        <span className="tiny muted">
                          {candidate.view ? `${candidate.view} · ` : ""}
                          {candidate.provider} · {candidate.model}
                        </span>
                      </div>
                      <Badge tone={candidate.review === "approved" ? "approved" : candidate.review === "rejected" ? "rejected" : "pending"}>
                        {candidate.review}
                      </Badge>
                    </div>
                    <input
                      className="input sm"
                      placeholder="Review note — what specifically differs, if anything"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                    <div className="row">
                      <button className="btn primary sm" onClick={() => void review("approved")} disabled={busy !== null}>
                        <Icon name="check" size={12} /> Approve candidate
                      </button>
                      <button className="btn danger sm" onClick={() => void review("rejected")} disabled={busy !== null}>
                        <Icon name="close" size={12} /> Reject
                      </button>
                      <button
                        className="btn ghost sm"
                        onClick={() => void run("Deleting candidate", () => api.deleteGeneration(candidate.id), "Candidate deleted")}
                        disabled={busy !== null}
                      >
                        <Icon name="trash" size={12} /> Delete
                      </button>
                    </div>
                    <details>
                      <summary className="tiny muted" style={{ cursor: "pointer" }}>Exact prompt used for this candidate</summary>
                      <div className="code-block" style={{ marginTop: 6, maxHeight: 180 }}>{candidate.prompt}</div>
                    </details>
                  </div>
                )}

                <Notice tone="info" icon="lock">
                  Approving a candidate records it as an approved portrait. It never edits or replaces the approved master
                  identity profile — that only happens through an explicit version approval.
                </Notice>
              </div>
            )}
          </Card>

          <div className="stack">
            <Card
              title="Master identity"
              subtitle="The permanent lock every generation is measured against."
              actions={<Badge tone={master ? "master" : "draft"}>{master ? "locked" : "not approved"}</Badge>}
            >
              <div className="stack-sm">
                <MasterAvatar state={state} showLabel={false} />
                <div style={{ display: "grid", gap: 3 }}>
                  <span className="small">{master ? `Version ${master.number} — ${master.label}` : `Working draft ${state.draft.number}`}</span>
                  <span className="tiny muted">
                    {master ? `Approved ${formatDate(master.approvedAt ?? master.createdAt)}` : "Approve the identity once its references and descriptions are complete."}
                  </span>
                </div>
                <div>
                  <div className="row-between" style={{ marginBottom: 4 }}>
                    <span className="label">Documentation</span>
                    <span className="tiny muted">{readiness.approvedCount}/{readiness.totalCount}</span>
                  </div>
                  <Progress value={readiness.approvedCount} max={readiness.totalCount} />
                </div>
                {!readiness.canApprove ? (
                  <Notice tone="warn" title="Approval blocked">
                    <ul style={{ margin: "3px 0 0", paddingLeft: 18, display: "grid", gap: 2 }}>
                      {readiness.blocking.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </Notice>
                ) : (
                  <button className="btn primary block" onClick={() => void approveMaster()} disabled={busy !== null || master?.id === state.draft.id}>
                    <Icon name="lock" size={13} /> Approve the working draft as master
                  </button>
                )}
                <button className="btn ghost sm block" onClick={() => go("identity")}>Open the identity record</button>
              </div>
            </Card>

            <Card title="Generate a candidate" subtitle="A fresh portrait from the same locked identity.">
              <div className="stack-sm">
                <textarea
                  className="textarea"
                  style={{ minHeight: 62 }}
                  placeholder="Direction for this candidate — expression, framing, mood (never a different face)"
                  value={extra}
                  onChange={(event) => setExtra(event.target.value)}
                />
                <GenerationBar
                  state={state}
                  kind="portrait"
                  extra={extra}
                  appearance={state.draft.profile.appearance}
                  hairstyle={state.draft.profile.hairstyle}
                  buttonLabel="Generate identity portrait"
                />
              </div>
            </Card>

            <Card title="Ingredient checks" subtitle="What makes a generation trustworthy.">
              <div className="stack-sm">
                <Check ok={readiness.features.every((f) => f.status !== "missing")} label="Every facial feature described" />
                <Check ok={state.stats.analyzedPhotos > 0} label="At least one photograph measured" />
                <Check ok={!!state.identity.masterPhotoId} label="Master reference photograph nominated" />
                <Check ok={!!master} label="Master identity approved" />
                <Check ok={state.settings.allowExternalReferenceUpload} label="Reference upload consent enabled" />
                <Check ok={state.providers.some((p) => p.configured)} label="Image provider connected" />
              </div>
            </Card>
          </div>
        </div>

        <Card title="Version history" subtitle="Approved versions are immutable; restoring one creates a new draft.">
          <div className="timeline">
            {state.versions.map((version) => (
              <div key={version.id} className={`tl-item ${version.status}`}>
                <span className="tl-dot" />
                <div className="tl-body">
                  <div className="row" style={{ gap: 7 }}>
                    <span style={{ fontSize: 12.5 }}>v{version.number}</span>
                    <Badge tone={version.status === "approved" ? "approved" : version.status === "draft" ? "draft" : version.status === "rejected" ? "rejected" : "pending"}>
                      {version.status}
                    </Badge>
                    <span className="tiny muted">{version.label}</span>
                  </div>
                  <div className="tiny muted">
                    {formatTime(version.createdAt)}
                    {version.changeSummary ? ` · ${version.changeSummary}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {completed.length > 0 && (
          <Card title="All candidates" subtitle="Approve what looks like you. Reject what drifted.">
            <div className="grid grid-4">
              {completed.slice(0, 12).map((generation) => (
                <GenerationTile key={generation.id} generation={generation} onReview={() => setCandidateId(generation.id)} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <span style={{ width: 16, height: 16, borderRadius: 4, display: "grid", placeItems: "center", background: ok ? "#eef1e6" : "#fdf5e6", border: `1px solid ${ok ? "#cdd8bf" : "#ecd6ae"}`, color: ok ? "#4a5c3f" : "#a97a22" }}>
        {ok ? <Icon name="check" size={10} /> : <span style={{ fontSize: 10 }}>–</span>}
      </span>
      <span className="small" style={{ color: ok ? "var(--ink)" : "var(--muted)" }}>{label}</span>
    </div>
  );
}

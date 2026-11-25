import React from "react";
import { useStudio } from "../store";
import { Badge, Card, Chip, Empty, Icon, Notice, PageHead, Stat } from "../components/ui";
import { CATEGORY_LABEL } from "../../shared/behavior";
import { formatBytes, formatDate } from "../lib/util";
import { formatDuration, formatMinutes, useTraining } from "../lib/training";

export default function TrainingDashboard({ go }: { go: (route: string) => void }) {
  const { state } = useStudio();
  const { training, loading, error } = useTraining();

  if (loading && !training) {
    return <PageHead eyebrow="Behaviour learning" title="Interactive Training Dashboard" description="Reading your private training state…" />;
  }
  if (error || !training) {
    return (
      <>
        <PageHead eyebrow="Behaviour learning" title="Interactive Training Dashboard" description="Your measured progress, without invented numbers." />
        <Notice tone="danger" title="The training state could not be loaded">{error ?? "Unknown error."}</Notice>
      </>
    );
  }

  const recordings = training.recordings;
  const stats = training.stats;
  const totalSeconds = stats.videoSeconds + stats.audioSeconds;
  const speechSamples = recordings.filter((recording) => recording.analysis?.hasAudio).length;
  const movementSamples = recordings.filter((recording) => recording.analysis?.hasPose).length;
  const expressionRefs = training.segments.filter(
    (segment) => segment.review === "approved" && (segment.category === "expression" || segment.category === "singing"),
  ).length;
  const movementRefs = training.segments.filter(
    (segment) => segment.review === "approved" && ["movement", "gesture", "posture"].includes(segment.category),
  ).length;
  const unprocessed = recordings.filter((recording) => recording.status === "uploaded").length;
  const latestProfile = training.profiles[0] ?? null;
  const latestApproved = training.profiles.find((profile) => profile.status === "approved") ?? null;

  const pipeline = [
    {
      key: "uploaded",
      label: "Uploaded",
      value: stats.recordings,
      detail: "Original files stored privately and unchanged.",
      tone: stats.recordings > 0 ? ("ok" as const) : ("" as const),
    },
    {
      key: "analyzed",
      label: "Analyzed",
      value: stats.analyzed,
      detail: "Landmarks, blendshapes and audio metrics extracted on this device.",
      tone: stats.analyzed > 0 ? ("ok" as const) : ("" as const),
    },
    {
      key: "features",
      label: "Features extracted",
      value: training.segments.length,
      detail: "Reference segments with numeric measurements, exportable as CSV/JSON.",
      tone: training.segments.length > 0 ? ("ok" as const) : ("" as const),
    },
    {
      key: "approved",
      label: "Approved",
      value: stats.approvedMannerisms + stats.approvedSegments,
      detail: "Patterns and segments you personally reviewed.",
      tone: stats.approvedMannerisms + stats.approvedSegments > 0 ? ("ok" as const) : ("" as const),
    },
    {
      key: "integrated",
      label: "Integrated into a model",
      value: 0,
      detail: "Not started. No animation, voice or generative model has been trained on these recordings.",
      tone: "warn" as const,
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="Behaviour learning · honest progress"
        title="Interactive Training Dashboard"
        description="What you have uploaded, what has actually been measured, and what still needs evidence. No invented percentages."
        actions={
          <div className="row">
            <button className="btn ghost" onClick={() => go("training-library")}>
              <Icon name="upload" size={14} /> Training library
            </button>
            <button className="btn primary" onClick={() => go("mannerisms")}>
              Review mannerisms <Icon name="arrow" size={14} />
            </button>
          </div>
        }
      />

      <div className="stack">
        <div className="grid grid-4">
          <Card><Stat label="Uploaded recordings" value={stats.recordings} note={`${stats.videos} video · ${stats.audio} audio`} /></Card>
          <Card><Stat label="Total duration" value={formatDuration(totalSeconds)} note={`${formatMinutes(stats.videoSeconds)} video · ${formatMinutes(stats.audioSeconds)} audio`} /></Card>
          <Card><Stat label="Speech samples processed" value={speechSamples} note="recordings with measured audio" /></Card>
          <Card><Stat label="Movement samples processed" value={movementSamples} note="recordings with body pose" /></Card>
          <Card><Stat label="Facial expression references" value={expressionRefs} note="approved segments" /></Card>
          <Card><Stat label="Approved behaviour references" value={stats.approvedMannerisms} note={`${stats.mannerisms} proposed in total`} /></Card>
          <Card><Stat label="Unprocessed" value={unprocessed} note={unprocessed ? "uploaded, not analysed" : "nothing waiting"} /></Card>
          <Card><Stat label="Failed uploads / analyses" value={stats.failed} note={stats.failed ? "see errors in the library" : "none"} /></Card>
        </div>

        <Card title="Assembly status" subtitle="Five distinct states. Nothing is collapsed into a single misleading percentage.">
          <div className="pipeline">
            {pipeline.map((stage, index) => (
              <div key={stage.key} className={`pipeline-stage ${stage.tone === "ok" ? "done" : stage.tone === "warn" ? "blocked" : ""}`}>
                <div className="row-between">
                  <span className="pipeline-label">{index + 1}. {stage.label}</span>
                  <span className="pipeline-value">{stage.value}</span>
                </div>
                <div className="tiny muted">{stage.detail}</div>
              </div>
            ))}
          </div>
          <Notice tone="warn" title="Integration is zero — deliberately">
            Extracting features is not training. Retargeting these timelines onto your GLB, driving blendshapes in Blender or
            Unreal, or building a voice model are external steps with real requirements. The studio will not display a training
            percentage it cannot substantiate.
          </Notice>
        </Card>

        <div className="split">
          <Card title="Evidence coverage" subtitle="Targets chosen to make a reference usable, not arbitrary completion scores.">
            <div className="stack-sm">
              {training.coverage.map((area) => (
                <div key={area.area} className="coverage-block">
                  <div className="row-between">
                    <span className="small"><strong>{area.label}</strong></span>
                    <Chip tone={area.ready ? "ok" : "warn"}>{area.ready ? "targets met" : "more evidence needed"}</Chip>
                  </div>
                  <table className="table" style={{ marginTop: 6 }}>
                    <tbody>
                      {area.evidence.map((item) => (
                        <tr key={item.label}>
                          <td>{item.label}</td>
                          <td className="mono tiny">{item.value}</td>
                          <td className="tiny muted">target {item.target}</td>
                          <td style={{ width: 30, textAlign: "right" }}>
                            <Icon name={item.met ? "check" : "close"} size={13} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {area.missing.length > 0 && (
                    <div className="tiny muted">{area.missing.join(" ")}</div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <div className="stack">
            <Card title="Model & integration status" subtitle="Measured locally vs. what needs external tools.">
              <div className="stack-sm">
                {training.integrations.map((integration) => (
                  <div key={integration.id} className="integration-row">
                    <div className="row-between" style={{ gap: 8 }}>
                      <span className="small">{integration.title}</span>
                      <Chip tone={integration.status === "working" ? "ok" : integration.status === "external" ? "warn" : ""}>
                        {integration.status === "working" ? "on-device" : integration.status === "external" ? "external" : "not enabled"}
                      </Chip>
                    </div>
                    <div className="tiny muted">{integration.detail}</div>
                    <div className="tiny"><strong>Requires:</strong> {integration.requirement}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Reference profile" subtitle="Versioned; your facial identity is never overwritten.">
              <div className="stack-sm">
                <div className="row-between">
                  <span className="small">Latest version</span>
                  <span className="mono tiny">{latestProfile ? `v${latestProfile.number} · ${latestProfile.status}` : "none"}</span>
                </div>
                <div className="row-between">
                  <span className="small">Currently approved</span>
                  <span className="mono tiny">{latestApproved ? `v${latestApproved.number}` : "none"}</span>
                </div>
                <div className="row-between">
                  <span className="small">Expression labels</span>
                  <span className="mono tiny">
                    {Array.from(new Set(training.segments.filter((s) => s.review === "approved" && s.emotion).map((s) => s.emotion))).length}
                  </span>
                </div>
                <div className="row-between">
                  <span className="small">Movement references</span>
                  <span className="mono tiny">{movementRefs}</span>
                </div>
                <button className="btn ghost sm" onClick={() => go("mannerisms")}>Open mannerism profile</button>
                <button className="btn ghost sm" onClick={() => go("export")}>Export behaviour reference</button>
              </div>
            </Card>
          </div>
        </div>

        <Card
          title="Training history"
          subtitle="Most recent recordings and where each one currently sits."
          actions={
            <button className="btn ghost sm" onClick={() => go("training-library")}>
              Open full library
            </button>
          }
        >
          {recordings.length === 0 ? (
            <Empty
              title="Nothing uploaded yet"
              body="Begin with a few minutes of ordinary talking, then add movement, expressions and singing. Multiple recordings are what make a pattern trustworthy."
              icon="waveform"
              action={<button className="btn primary" onClick={() => go("training-library")}>Upload the first recording</button>}
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Recording</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Analysis</th>
                  <th>Training use</th>
                </tr>
              </thead>
              <tbody>
                {recordings.slice(0, 12).map((recording) => (
                  <tr key={recording.id}>
                    <td>{recording.title}</td>
                    <td className="tiny">{CATEGORY_LABEL[recording.category] ?? recording.category}</td>
                    <td className="tiny muted">{formatDate(recording.recordedAt)}</td>
                    <td className="tiny">{formatDuration(recording.duration)}</td>
                    <td><Badge tone={recording.status === "analyzed" ? "approved" : recording.status === "failed" ? "rejected" : "pending"}>{recording.status}</Badge></td>
                    <td className="tiny muted">
                      {recording.analysis
                        ? `${recording.analysis.framesAnalyzed} frames · ${recording.analysis.events} events`
                        : "—"}
                    </td>
                    <td className="tiny">{recording.allowTraining ? "allowed" : "reference only"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {state && (
            <div className="hint" style={{ marginTop: 10 }}>
              Private storage total: {formatBytes(state.stats.storageBytes)}. Training media alone: {formatBytes(stats.storageBytes)}.
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

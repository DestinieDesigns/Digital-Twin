import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, recordingUrl } from "../api";
import { useStudio } from "../store";
import { Badge, Card, Chip, Empty, Field, Icon, Notice, PageHead, Progress, Stat } from "../components/ui";
import {
  EXPRESSION_LABELS,
  SEGMENT_CATEGORIES,
  segmentMetrics,
  type DerivedAnalysis,
  type Recording,
  type SegmentCategory,
} from "../../shared/behavior";
import {
  analyseStoredRecording,
  buildTimelineCsv,
  downloadTextFile,
  formatDuration,
  formatTimestamp,
  recordingFileName,
  useTraining,
} from "../lib/training";
import { isAnalysisCancelled } from "../lib/media";
import { formatDate } from "../lib/util";

function readPendingSeek(): number | null {
  const raw = window.sessionStorage.getItem("studio:recording-time");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export default function MovementLab({ go }: { go: (route: string) => void }) {
  const { toast } = useStudio();
  const { training, refresh, mutate } = useTraining();
  const [selectedId, setSelectedId] = useState(() => window.sessionStorage.getItem("studio:recording") ?? "");
  const [derived, setDerived] = useState<DerivedAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; percent: number; cancellable: boolean } | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(5);
  const [label, setLabel] = useState("How I laugh");
  const [category, setCategory] = useState<SegmentCategory>("expression");
  const [emotion, setEmotion] = useState<string>("laughing");
  const [tab, setTab] = useState<"workspace" | "segments" | "export">("workspace");
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const analysisController = useRef<AbortController | null>(null);
  const pendingSeek = useRef<number | null>(useMemo(readPendingSeek, []));
  const activeMedia = () => videoRef.current ?? audioRef.current;

  const analyzed = useMemo(
    () => (training?.recordings ?? []).filter((recording) => recording.status === "analyzed"),
    [training],
  );
  const recording = training?.recordings.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && analyzed.length) setSelectedId(analyzed[0].id);
  }, [selectedId, analyzed]);

  useEffect(() => {
    if (!selectedId) {
      setDerived(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDerived(null);
    api
      .recordingAnalysis(selectedId)
      .then((response) => {
        if (!cancelled) {
          setDerived(response.derived);
          setStart(0);
          setEnd(Math.min(5, response.derived.duration));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          // A pending exemplar jump is meaningless without a stored timeline.
          window.sessionStorage.removeItem("studio:recording-time");
          pendingSeek.current = null;
          toast(err instanceof Error ? err.message : "The analysis could not be loaded.", "error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, toast]);

  // Arriving from a mannerism's exemplar timestamp: seek once the media metadata
  // is available, then clear the request so later visits start from the beginning.
  useEffect(() => {
    if (!derived) return;
    const target = pendingSeek.current;
    if (target === null) return;
    const element = videoRef.current ?? audioRef.current;
    if (!element) return;
    const apply = () => {
      element.currentTime = Math.max(0, Math.min(target, derived.duration));
      pendingSeek.current = null;
      window.sessionStorage.removeItem("studio:recording-time");
      void element.play().catch(() => undefined);
    };
    if (element.readyState >= 1) {
      apply();
      return;
    }
    element.addEventListener("loadedmetadata", apply, { once: true });
    return () => element.removeEventListener("loadedmetadata", apply);
  }, [derived]);

  const seek = (time: number) => {
    const element = activeMedia();
    if (element) {
      element.currentTime = Math.max(0, Math.min(time, derived?.duration ?? time));
      void element.play().catch(() => undefined);
    }
  };

  const playhead = () => activeMedia()?.currentTime ?? 0;

  const analyse = async () => {
    if (!recording) return;
    const controller = new AbortController();
    analysisController.current = controller;
    setProgress({ stage: "Reading the stored file", percent: 1, cancellable: true });
    try {
      const result = await analyseStoredRecording(recording, {
        onProgress: (step) => setProgress({ ...step, cancellable: true }),
        signal: controller.signal,
      });
      setProgress({ stage: "Saving the extracted features", percent: 98, cancellable: false });
      const saved = await mutate("Saving analysis", () => api.saveRecordingAnalysis(recording.id, result, result.duration), "Analysis stored");
      if (saved.ok) {
        const response = await api.recordingAnalysis(recording.id);
        setDerived(response.derived);
        void refresh();
      } else {
        // The server discarded the stored analysis, so this workspace must not keep showing it.
        await api.failRecordingAnalysis(recording.id, saved.error ?? "Saving the analysis failed.");
        setDerived(null);
        void refresh();
      }
    } catch (err) {
      if (isAnalysisCancelled(err)) {
        toast("Analysis cancelled — nothing was saved and any earlier analysis is unchanged.");
        return;
      }
      const message = err instanceof Error ? err.message : "The analysis failed.";
      await mutate("Marking failure", () => api.failRecordingAnalysis(recording.id, message));
      setDerived(null);
      toast(message, "error");
    } finally {
      analysisController.current = null;
      setProgress(null);
    }
  };

  const cancelAnalysis = () => {
    analysisController.current?.abort();
    setProgress((current) =>
      current ? { ...current, stage: "Cancelling — the partial run will be discarded", cancellable: false } : current,
    );
  };

  const segments = (training?.segments ?? []).filter((segment) => segment.recordingId === selectedId);
  const preview = derived ? segmentMetrics(derived, start, end) : null;

  return (
    <>
      <PageHead
        eyebrow="Behaviour learning · video analysis"
        title="Video Analysis Workspace"
        description="Review the extracted timeline, choose the exact seconds worth keeping, and approve only what you recognise as yourself."
        actions={
          <div className="row">
            <Chip tone="ok">{analyzed.length} analysed</Chip>
            <button className="btn ghost" onClick={() => go("training-library")}>
              <Icon name="upload" size={14} /> Training library
            </button>
          </div>
        }
      />

      <div className="stack">
        <Card>
          <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
            <Field label="Recording">
              <select
                className="select"
                style={{ minWidth: 320 }}
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                <option value="">Select an analysed recording…</option>
                {analyzed.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {formatDuration(item.duration)}
                  </option>
                ))}
              </select>
            </Field>
            {recording && (
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <Chip>{recording.category}</Chip>
                <Chip>{formatDate(recording.recordedAt)}</Chip>
                <Chip tone={recording.allowTraining ? "ok" : "warn"}>
                  {recording.allowTraining ? "training use allowed" : "reference only"}
                </Chip>
                <button className="btn sm ghost" onClick={() => void analyse()} disabled={progress !== null}>
                  <Icon name="rotate" size={12} /> Re-analyse
                </button>
              </div>
            )}
          </div>
          {progress && (
            <div style={{ marginTop: 10, display: "grid", gap: 5 }}>
              <div className="row-between" style={{ gap: 8 }}>
                <div className="tiny muted">{progress.stage}</div>
                {progress.cancellable && (
                  <button className="btn ghost sm" onClick={cancelAnalysis}>
                    Cancel
                  </button>
                )}
              </div>
              <Progress value={progress.percent} />
            </div>
          )}
        </Card>

        {!training ? (
          <Card><Empty title="Loading your recordings" body="Reading the private training state." /></Card>
        ) : analyzed.length === 0 ? (
          <Card>
            <Empty
              title="No analysed recordings yet"
              body="Upload a recording first, then run the on-device analysis. This workspace only shows measurements that actually exist."
              icon="scan"
              action={<button className="btn primary" onClick={() => go("training-library")}>Open the training library</button>}
            />
          </Card>
        ) : !recording ? (
          <Card><Empty title="Choose a recording" body="Pick an analysed recording above to open its timeline." icon="eye" /></Card>
        ) : (
          <>
            <div className="tabs">
              <button className={`tab ${tab === "workspace" ? "active" : ""}`} onClick={() => setTab("workspace")}>
                Analysis
              </button>
              <button className={`tab ${tab === "segments" ? "active" : ""}`} onClick={() => setTab("segments")}>
                Reference segments <span style={{ opacity: 0.6, marginLeft: 6 }}>{segments.length}</span>
              </button>
              <button className={`tab ${tab === "export" ? "active" : ""}`} onClick={() => setTab("export")}>
                Export features
              </button>
            </div>

            {loading ? (
              <Card><div className="row tiny muted"><Icon name="scan" size={14} /> Loading the stored analysis…</div></Card>
            ) : !derived ? (
              <Card>
                <Empty
                  title="No stored analysis for this recording"
                  body="This recording is marked analysed but its feature file is missing. Re-run the analysis to rebuild it."
                  icon="warn"
                  action={<button className="btn primary" onClick={() => void analyse()}>Analyse now</button>}
                />
              </Card>
            ) : tab === "workspace" ? (
              <>
                <div className="split" style={{ gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 0.65fr)" }}>
                  <div className="stack">
                    <Card title={recording.title} subtitle={`${formatDuration(derived.duration)} · sampled ${derived.frames.length} frames every ${derived.sampleStep}s · coverage ${derived.coverageSeconds.toFixed(1)}s`}>
                      {recording.kind === "video" ? (
                        <video
                          ref={videoRef}
                          className="analysis-video"
                          src={recordingUrl(recording.id)}
                          controls
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <div className="stack-sm">
                          <audio
                            ref={audioRef}
                            src={recordingUrl(recording.id)}
                            controls
                            style={{ width: "100%" }}
                          />
                          <Notice tone="info" title="Audio-only recording">
                            Speech metrics are available, but there are no visual samples to segment. Upload video for facial
                            and body references.
                          </Notice>
                        </div>
                      )}
                      {derived.frames.length > 0 && (
                        <>
                          <TimelineChart analysis={derived} onSeek={seek} />
                          <div className="row tiny muted" style={{ gap: 12 }}>
                            <span><span style={{ color: "var(--gold)" }}>■</span> smile</span>
                            <span><span style={{ color: "var(--sage)" }}>■</span> gesture energy</span>
                            <span><span style={{ color: "var(--plum)" }}>■</span> head turn</span>
                            <span style={{ marginLeft: "auto" }}>Click the chart to seek</span>
                          </div>
                        </>
                      )}
                    </Card>

                    <Card title="Detected reference moments" subtitle="Heuristic candidates measured from the timeline — not highlights chosen by a model.">
                      {derived.events.length === 0 ? (
                        <div className="hint">No events crossed the measurement thresholds in this recording.</div>
                      ) : (
                        <div className="event-grid">
                          {derived.events.map((event, index) => (
                            <button
                              key={`${event.type}-${index}`}
                              className="event-card"
                              onClick={() => {
                                setStart(event.start);
                                setEnd(event.end);
                                seek(event.start);
                              }}
                            >
                              <div className="row-between">
                                <span className="tiny" style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}>{event.type.replace("-", " ")}</span>
                                <span className="mono tiny">{formatTimestamp(event.start)}</span>
                              </div>
                              <span className="small">{event.label}</span>
                              <span className="tiny muted">{formatTimestamp(event.start)} → {formatTimestamp(event.end)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </Card>

                    {derived.frames.length > 0 && (
                      <Card title="Create a reference segment" subtitle="Keep ten seconds of how you laugh — not the entire video.">
                        <div className="stack-sm">
                          <div className="grid grid-4">
                            <Field label="Start (s)">
                              <input
                                className="input"
                                type="number"
                                min={0}
                                max={derived.duration}
                                step={0.1}
                                value={start}
                                onChange={(event) => setStart(Number(event.target.value))}
                              />
                            </Field>
                            <Field label="End (s)">
                              <input
                                className="input"
                                type="number"
                                min={0}
                                max={derived.duration}
                                step={0.1}
                                value={end}
                                onChange={(event) => setEnd(Number(event.target.value))}
                              />
                            </Field>
                            <div className="field">
                              <label className="label">From the player</label>
                              <div className="row" style={{ gap: 5 }}>
                                <button className="btn ghost sm" onClick={() => setStart(Number(playhead().toFixed(1)))}>Start</button>
                                <button className="btn ghost sm" onClick={() => setEnd(Number(playhead().toFixed(1)))}>End</button>
                              </div>
                            </div>
                            <div className="field">
                              <label className="label">Seek</label>
                              <button className="btn ghost sm" onClick={() => seek(start)}>Play from {start.toFixed(1)}s</button>
                            </div>
                          </div>
                          <div className="grid grid-2">
                            <Field label="Label">
                              <input className="input" value={label} onChange={(event) => setLabel(event.target.value)} />
                            </Field>
                            <Field label="Segment type">
                              <select className="select" value={category} onChange={(event) => setCategory(event.target.value as SegmentCategory)}>
                                {SEGMENT_CATEGORIES.map((option) => (
                                  <option key={option.key} value={option.key}>{option.label}</option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Emotion / descriptor" hint="Used for the expression library coverage.">
                              <select className="select" value={emotion} onChange={(event) => setEmotion(event.target.value)}>
                                <option value="">— none —</option>
                                {EXPRESSION_LABELS.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            </Field>
                            <div className="field">
                              <label className="label">Measured in this range</label>
                              <div className="tiny muted">{preview?.summary ?? "Select a range."}</div>
                            </div>
                          </div>
                          <div className="row">
                            <button
                              className="btn primary"
                              disabled={progress !== null}
                              onClick={async () => {
                                const result = await mutate(
                                  "Creating segment",
                                  () => api.createSegment({ recordingId: recording.id, label, category, emotion, start, end }),
                                  "Segment saved for review",
                                );
                                if (result.ok) setTab("segments");
                              }}
                            >
                              <Icon name="plus" size={14} /> Add segment
                            </button>
                            <span className="hint">Segments stay separate from the original recording and can be deleted at any time.</span>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>

                  <div className="stack">
                    <Card title="Facial measurements" subtitle="From 478 landmarks and 52 blendshapes.">
                      {derived.face ? (
                        <div className="stack-sm">
                          <div className="grid grid-2">
                            <Stat label="Face samples" value={derived.face.faceFrames} />
                            <Stat label="Smile mean" value={derived.face.smileMean.toFixed(2)} note={derived.face.smileAsymmetry > 0 ? "left corner stronger" : derived.face.smileAsymmetry < 0 ? "right corner stronger" : "even"} />
                            <Stat label="Blink rate" value={`${derived.face.blinkPerMinute.toFixed(1)}/min`} note={`${derived.face.blinkCount} blinks`} />
                            <Stat label="Head tilt" value={`${derived.face.headTiltMean.toFixed(1)}°`} note={derived.face.headTiltDominant === "none" ? "centred" : `toward ${derived.face.headTiltDominant}`} />
                            <Stat label="Nods" value={`${derived.face.nodPerMinute.toFixed(0)}/min`} />
                            <Stat label="Gaze off-centre" value={`${Math.round(derived.face.gazeOffShare * 100)}%`} />
                          </div>
                          <div className="divider" />
                          <div className="h3">Expression mix</div>
                          {Object.entries(derived.face.expressionMix).map(([name, share]) => (
                            <div key={name} style={{ display: "grid", gap: 3 }}>
                              <div className="row-between tiny"><span>{name}</span><span className="mono">{Math.round(share * 100)}%</span></div>
                              <Progress value={share} max={1} thin />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="hint">No face was detected in the sampled frames.</div>
                      )}
                    </Card>

                    <Card title="Body measurements" subtitle="33 pose landmarks per sample.">
                      {derived.pose ? (
                        <div className="stack-sm">
                          <div className="grid grid-2">
                            <Stat label="Pose samples" value={derived.pose.poseFrames} />
                            <Stat label="Gesture energy" value={derived.pose.gestureMean.toFixed(2)} note="shoulder-widths/s" />
                            <Stat label="Two-handed" value={`${Math.round(derived.pose.twoHandedShare * 100)}%`} />
                            <Stat label="Shoulders" value={derived.pose.shoulderHigher === "even" ? "level" : `${derived.pose.shoulderHigher} higher`} />
                            <Stat label="Step cadence" value={derived.pose.stepCadence ? `${derived.pose.stepCadence}/min` : "—"} />
                            <Stat label="Walking share" value={`${Math.round(derived.pose.walkingShare * 100)}%`} />
                          </div>
                          <div className="hint">
                            Arm and wrist motion only — finger articulation is not tracked in this build.
                          </div>
                        </div>
                      ) : (
                        <div className="hint">No full-body pose was detected. Frame your whole body for movement footage.</div>
                      )}
                    </Card>

                    <Card title="Speech measurements" subtitle="On-device signal analysis, no transcription.">
                      {derived.speech ? (
                        <div className="stack-sm">
                          <div className="grid grid-2">
                            <Stat label="Median pitch" value={derived.speech.medianF0 ? `${derived.speech.medianF0} Hz` : "—"} />
                            <Stat label="Pitch range" value={derived.speech.intonationRangeSemitones ? `${derived.speech.intonationRangeSemitones} st` : "—"} />
                            <Stat label="Pacing proxy" value={derived.speech.speechRateSyllablesPerMinute ? `${derived.speech.speechRateSyllablesPerMinute}/min` : "—"} note="syllable nuclei" />
                            <Stat label="Pause share" value={`${Math.round(derived.speech.pauseRatio * 100)}%`} note={`${derived.speech.pauseCount} pauses`} />
                          </div>
                          {derived.speech.warnings.map((warning) => (
                            <div key={warning} className="tiny" style={{ color: "var(--danger)" }}>{warning}</div>
                          ))}
                        </div>
                      ) : (
                        <div className="hint">No speech metrics for this recording (no decodable audio track).</div>
                      )}
                    </Card>
                  </div>
                </div>

                <Notice tone="warn" title="What these numbers are">
                  {derived.limitations.map((line) => (
                    <div key={line} className="tiny" style={{ marginTop: 2 }}>• {line}</div>
                  ))}
                </Notice>
              </>
            ) : tab === "segments" ? (
              <Card
                title="Reference segments"
                subtitle="Approve only segments you have watched and recognise as your natural behaviour."
              >
                {segments.length === 0 ? (
                  <Empty
                    title="No segments from this recording"
                    body="Choose a range in the Analysis tab and add it here. You do not have to use the whole recording."
                    icon="scan"
                    action={<button className="btn primary" onClick={() => setTab("workspace")}>Choose a range</button>}
                  />
                ) : (
                  <div className="stack-sm">
                    {segments.map((segment) => (
                      <div key={segment.id} className="segment-row">
                        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                          <div className="row" style={{ gap: 6 }}>
                            <span className="small">{segment.label}</span>
                            <Badge tone={segment.review === "approved" ? "approved" : segment.review === "rejected" ? "rejected" : "pending"}>
                              {segment.review}
                            </Badge>
                            <Chip>{segment.category}</Chip>
                            {segment.emotion && <Chip tone="gold">{segment.emotion}</Chip>}
                          </div>
                          <span className="tiny muted">
                            {formatTimestamp(segment.start)} → {formatTimestamp(segment.end)} · {segment.summary}
                          </span>
                        </div>
                        <div className="row" style={{ gap: 4 }}>
                          <button className="btn ghost sm" onClick={() => seek(segment.start)}>Play</button>
                          <button
                            className="btn sm"
                            onClick={() => void mutate("Approving segment", () => api.patchSegment(segment.id, { review: "approved" }), "Segment approved")}
                          >
                            Approve
                          </button>
                          <button
                            className="btn ghost sm"
                            onClick={() => void mutate("Rejecting segment", () => api.patchSegment(segment.id, { review: "rejected" }), "Segment rejected")}
                          >
                            Reject
                          </button>
                          <button
                            className="btn ghost sm"
                            onClick={() => void mutate("Deleting segment", () => api.deleteSegment(segment.id), "Segment deleted")}
                          >
                            <Icon name="trash" size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ) : (
              <div className="split">
                <Card title="Export extracted features" subtitle="Real numeric timelines — not an animation.">
                  <div className="stack-sm">
                    <div className="hint">
                      CSV includes {derived.frames.length} samples and {Object.keys(derived.blends.channels).length} blendshape
                      channels. Use it for review, spreadsheets or as an input to a retargeting workflow in Blender or Unreal.
                    </div>
                    <a className="btn block" href={recordingUrl(recording.id)} download={`${recording.title}.${recording.mime.split("/").pop() ?? "mp4"}`}>
                      <Icon name="export" size={14} /> Download original recording
                    </a>
                    <button
                      className="btn primary block"
                      onClick={() => downloadTextFile(recordingFileName(recording.title, "csv"), buildTimelineCsv(derived, recording.title), "text/csv")}
                    >
                      <Icon name="export" size={14} /> Download timeline CSV
                    </button>
                    <button
                      className="btn block"
                      onClick={() => downloadTextFile(recordingFileName(recording.title, "json"), JSON.stringify(derived, null, 2), "application/json")}
                    >
                      <Icon name="document" size={14} /> Download analysis JSON
                    </button>
                    <Notice tone="warn" title="Not a motion-capture solve">
                      These are per-frame 2D landmark measurements. A production skeletal solve, finger tracking and retargeting
                      are separate steps that this studio does not perform.
                    </Notice>
                  </div>
                </Card>
                <Card title="Engine and coverage" subtitle="Exactly what produced this analysis.">
                  <div className="stack-sm small muted">
                    <div><strong>Engine:</strong> {derived.engine}</div>
                    <div><strong>Analysed:</strong> {new Date(derived.analyzedAt).toLocaleString()}</div>
                    <div><strong>Samples:</strong> {derived.frames.length} every {derived.sampleStep}s over {derived.coverageSeconds.toFixed(1)}s</div>
                    <div><strong>Events:</strong> {derived.events.length}</div>
                    {derived.notes.map((note) => (
                      <div key={note} className="tiny">{note}</div>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function TimelineChart({ analysis, onSeek }: { analysis: DerivedAnalysis; onSeek: (time: number) => void }) {
  const width = 1000;
  const height = 130;
  const duration = Math.max(0.1, analysis.duration);
  const line = (get: (frame: DerivedAnalysis["frames"][number]) => number, max: number) =>
    analysis.frames
      .map((frame, index) => `${index ? "L" : "M"}${((frame.t / duration) * width).toFixed(1)},${(height - Math.max(0, Math.min(1, get(frame) / max)) * height).toFixed(1)}`)
      .join(" ");

  return (
    <div className="timeline-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Timeline of smile, gesture energy and head turn"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          onSeek(ratio * duration);
        }}
      >
        <rect x={0} y={0} width={width} height={height} fill="rgba(23,21,15,0.03)" />
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line key={ratio} x1={ratio * width} x2={ratio * width} y1={0} y2={height} stroke="rgba(23,21,15,0.08)" strokeWidth={1} />
        ))}
        <path d={line((frame) => frame.gesture, 3)} fill="none" stroke="var(--sage)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        <path d={line((frame) => Math.abs(frame.yaw), 0.4)} fill="none" stroke="var(--plum)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" opacity={0.7} />
        <path d={line((frame) => frame.smile, 1)} fill="none" stroke="var(--gold)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="timeline-axis tiny muted">
        <span>0:00</span>
        <span>{formatDuration(duration / 2)}</span>
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
  );
}

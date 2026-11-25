import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useStudio } from "../store";
import { Badge, Card, Chip, Empty, Icon, Notice, PageHead, Stat } from "../components/ui";
import { speechProfile, type DerivedAnalysis, type SpeechMetrics } from "../../shared/behavior";
import { formatDuration, formatMinutes, useTraining } from "../lib/training";
import { formatDate } from "../lib/util";

export default function SpeechLab({ go }: { go: (route: string) => void }) {
  const { toast } = useStudio();
  const { training } = useTraining();
  const [selectedId, setSelectedId] = useState("");
  const [derived, setDerived] = useState<DerivedAnalysis | null>(null);

  const speechRecordings = useMemo(
    () => (training?.recordings ?? []).filter((recording) => recording.analysis?.hasAudio),
    [training],
  );
  const profile = useMemo(() => speechProfile(training?.recordings ?? []), [training]);
  const speechCoverage = training?.coverage.find((item) => item.area === "speech") ?? null;

  useEffect(() => {
    if (!selectedId && speechRecordings.length) setSelectedId(speechRecordings[0].id);
  }, [selectedId, speechRecordings]);

  useEffect(() => {
    if (!selectedId) {
      setDerived(null);
      return;
    }
    let cancelled = false;
    api
      .recordingAnalysis(selectedId)
      .then((response) => {
        if (!cancelled) setDerived(response.derived);
      })
      .catch((err) => {
        if (!cancelled) toast(err instanceof Error ? err.message : "The analysis could not be loaded.", "error");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, toast]);

  const recording = training?.recordings.find((item) => item.id === selectedId) ?? null;
  const speech = derived?.speech ?? null;

  return (
    <>
      <PageHead
        eyebrow="Behaviour learning · voice"
        title="Speech & Communication Learning"
        description="Measured pitch, pacing, pauses and dynamics from your own speaking. Your recognisable voice is never replaced by a generic AI voice."
        actions={
          <button className="btn ghost" onClick={() => go("training-library")}>
            <Icon name="upload" size={14} /> Add speech recordings
          </button>
        }
      />

      <div className="stack">
        <div className="grid grid-4">
          <Card><Stat label="Speech recordings" value={speechRecordings.length} note="decoded audio track" /></Card>
          <Card><Stat label="Speaking time" value={formatMinutes(profile.totalSeconds)} note="analysed recordings only" /></Card>
          <Card><Stat label="Situations covered" value={profile.rows.length} note="of 8 speech categories" /></Card>
          <Card><Stat label="Voice cloning" value="Not enabled" note="no provider authorised" /></Card>
        </div>

        <div className="split">
          <Card
            title="Speech reference profile"
            subtitle="Each row is measured from your audio: pitch, pacing, pause habit, intonation."
          >
            {profile.rows.length === 0 ? (
              <Empty
                title="No analysed speech yet"
                body="Upload a conversation, a presentation or a sung take, then run the analysis. Metrics appear only after the audio has actually been measured."
                icon="waveform"
                action={<button className="btn primary" onClick={() => go("training-library")}>Open training library</button>}
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Situation</th>
                    <th>Recordings</th>
                    <th>Median pitch</th>
                    <th>Pacing estimate</th>
                    <th>Pause share</th>
                    <th>Pitch range</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.rows.map((row) => (
                    <tr key={row.category}>
                      <td>{row.label}</td>
                      <td>{row.recordings}</td>
                      <td>{row.medianF0 ? `${row.medianF0} Hz` : "—"}</td>
                      <td>{row.speechRate ? `${row.speechRate}/min` : "—"}</td>
                      <td>{Math.round(row.pauseRatio * 100)}%</td>
                      <td>{row.intonationRange ? `${row.intonationRange} st` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="hint" style={{ marginTop: 10 }}>
              Pacing uses syllable-nuclei peaks in the energy envelope — a rhythm proxy, not a transcript. No speech recognition
              or voice embedding is created in this build.
            </div>
          </Card>

          <Card title="Evidence targets" subtitle="What would make this reference usable for a voice workflow.">
            {speechCoverage ? (
              <div className="stack-sm">
                {speechCoverage.evidence.map((item) => (
                  <div key={item.label} className="row-between" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 7 }}>
                    <div style={{ display: "grid", gap: 1 }}>
                      <span className="small">{item.label}</span>
                      <span className="tiny muted">target {item.target}</span>
                    </div>
                    <Chip tone={item.met ? "ok" : "warn"}>{item.value}</Chip>
                  </div>
                ))}
                {speechCoverage.missing.length > 0 ? (
                  <Notice tone="warn" title="More evidence needed">
                    {speechCoverage.missing.map((line) => (
                      <div key={line} className="tiny">• {line}</div>
                    ))}
                  </Notice>
                ) : (
                  <Notice tone="ok" title="Targets met">The measured speech reference has enough coverage for review.</Notice>
                )}
              </div>
            ) : (
              <div className="hint">No speech coverage data yet.</div>
            )}
            <div className="divider" />
            <div className="stack-sm small muted">
              <div className="h3">Integration status</div>
              <div><strong>Measured locally:</strong> pitch track, intonation, pauses, loudness, vibrato.</div>
              <div><strong>Not built:</strong> speech-to-text, accent classification, voice conversion, cloning.</div>
              <div>
                <strong>Authorised cloning:</strong> requires a provider you approve in writing, explicit consent per voice, and a
                paid plan. Nothing is sent anywhere today.
              </div>
            </div>
          </Card>
        </div>

        <Card
          title="Recording detail"
          subtitle="Energy and pitch contours are computed from the decoded waveform on this device."
          actions={
            recording ? (
              <button
                className="btn ghost sm"
                onClick={() => {
                  window.sessionStorage.setItem("studio:recording", recording.id);
                  window.sessionStorage.removeItem("studio:recording-time");
                  go("movement-lab");
                }}
              >
                Open analysis workspace
              </button>
            ) : undefined
          }
        >
          {speechRecordings.length === 0 ? (
            <Empty title="Nothing to inspect yet" body="Speech detail appears after a recording has been analysed." icon="waveform" />
          ) : (
            <div className="stack-sm">
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <select className="select" style={{ minWidth: 320 }} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                  {speechRecordings.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} · {formatDuration(item.duration)}
                    </option>
                  ))}
                </select>
                {recording && (
                  <>
                    <Chip>{recording.category}</Chip>
                    <Chip>{formatDate(recording.recordedAt)}</Chip>
                    <Badge tone={recording.approved ? "approved" : "pending"}>{recording.approved ? "approved reference" : "not approved"}</Badge>
                  </>
                )}
              </div>

              {speech ? (
                <>
                  <div className="grid grid-4">
                    <Stat label="Median F0" value={speech.medianF0 ? `${speech.medianF0} Hz` : "—"} note={speech.f0Min && speech.f0Max ? `${speech.f0Min}–${speech.f0Max} Hz voiced range` : undefined} />
                    <Stat label="Intonation" value={speech.intonationRangeSemitones ? `${speech.intonationRangeSemitones} st` : "—"} note="5th–95th percentile" />
                    <Stat label="Pauses" value={speech.pauseCount} note={speech.meanPauseSeconds ? `mean ${speech.meanPauseSeconds}s` : undefined} />
                    <Stat label="Loudness range" value={`${speech.loudnessRangeDb} dB`} note={`peak ${speech.peakDb} dBFS`} />
                  </div>

                  <div className="grid grid-2">
                    <div className="contour-card">
                      <div className="row-between">
                        <span className="label">Energy envelope</span>
                        <span className="tiny muted">voiced share {Math.round(speech.voicedRatio * 100)}%</span>
                      </div>
                      <EnergyContour values={speech.energyContour} />
                    </div>
                    <div className="contour-card">
                      <div className="row-between">
                        <span className="label">Pitch contour</span>
                        <span className="tiny muted">{speech.method.split("·")[0].trim()}</span>
                      </div>
                      <PitchContour values={speech.pitchContour} />
                    </div>
                  </div>

                  <div className="grid grid-2">
                    <div className="stack-sm">
                      <div className="h3">Delivery measurements</div>
                      <table className="table">
                        <tbody>
                          <tr><td>Pacing proxy</td><td>{speech.speechRateSyllablesPerMinute ? `${speech.speechRateSyllablesPerMinute} syllable nuclei/min` : "insufficient voiced audio"}</td></tr>
                          <tr><td>Pause share</td><td>{Math.round(speech.pauseRatio * 100)}% of speaking time</td></tr>
                          <tr><td>Longest pause</td><td>{speech.longestPauseSeconds !== null ? `${speech.longestPauseSeconds}s` : "—"}</td></tr>
                          <tr><td>RMS level</td><td>{speech.rmsDb} dBFS</td></tr>
                          <tr><td>Vibrato</td><td>{speech.vibratoRateHz ? `${speech.vibratoRateHz} Hz · ${speech.vibratoExtentCents} cents` : "not sustained enough to measure"}</td></tr>
                          <tr><td>Sample rate</td><td>{speech.sampleRate} Hz</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="stack-sm">
                      <div className="h3">What this supports — and what it does not</div>
                      {speech.warnings.length > 0 && (
                        <Notice tone="warn" title="Recording warnings">
                          {speech.warnings.map((warning) => <div key={warning} className="tiny">• {warning}</div>)}
                        </Notice>
                      )}
                      <Notice tone="info" title="Reference, not a clone">
                        These numbers describe how you sound: your median pitch, your pause habit, your expressive range. They do
                        not synthesise speech, and the studio will not substitute a generic AI voice for yours.
                      </Notice>
                      <div className="tiny muted">
                        To create a voice model, an authorised voice-cloning provider would need your explicit consent for each
                        voice and a paid plan. That integration is not enabled here.
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="hint">Loading the speech analysis…</div>
              )}
            </div>
          )}
        </Card>

        <Card title="Recordings with speech" subtitle="Every analysed recording that contains decodable audio.">
          {speechRecordings.length === 0 ? (
            <div className="hint">No speech recordings yet.</div>
          ) : (
            <div className="stack-sm">
              {speechRecordings.map((item) => (
                <div key={item.id} className="row-between" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8, gap: 12 }}>
                  <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                    <span className="small">{item.title}</span>
                    <span className="tiny muted">
                      {formatDuration(item.duration)} · {item.category} · {formatDate(item.recordedAt)}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 5 }}>
                    {item.analysis?.speech?.medianF0 && <Chip>{item.analysis.speech.medianF0} Hz</Chip>}
                    {item.analysis?.speech?.speechRate && <Chip>{item.analysis.speech.speechRate}/min</Chip>}
                    <button className="btn ghost sm" onClick={() => setSelectedId(item.id)}>Inspect</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function EnergyContour({ values }: { values: number[] }) {
  if (!values.length) return <div className="hint">No energy contour.</div>;
  return (
    <div className="contour">
      {values.map((value, index) => (
        <span key={index} style={{ height: `${Math.max(2, value * 100)}%` }} />
      ))}
    </div>
  );
}

function PitchContour({ values }: { values: (number | null)[] }) {
  const points = values.filter((value): value is number => value !== null);
  if (points.length < 2) return <div className="hint">Not enough voiced frames to draw a pitch track.</div>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const width = 600;
  const height = 90;
  const path = values
    .map((value, index) => {
      if (value === null) return null;
      const x = (index / values.length) * width;
      const y = height - ((value - min) / Math.max(1, max - min)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((point): point is string => Boolean(point));
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="pitch-svg" role="img" aria-label="Pitch contour">
        <polyline points={path.join(" ")} fill="none" stroke="var(--gold)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="row-between tiny muted">
        <span>{Math.round(min)} Hz</span>
        <span>{Math.round(max)} Hz</span>
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { api, audioUrl } from "../api";
import { useStudio } from "../store";
import { Card, Chip, CopyButton, Empty, Field, Icon, Notice, PageHead, Tabs } from "../components/ui";
import { analyzeAudioBlob, pitchRangeSemitones } from "../lib/audio";
import { formatBytes, formatTime } from "../lib/util";
import { VIEW_LABELS } from "../../shared/types";
import type { AudioAnalysis, AudioTake } from "../../shared/types";

export default function Voice({ go }: { go: (route: string) => void }) {
  const { state, run, busy } = useStudio();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<AudioTake["kind"]>("vocal");
  const [name, setName] = useState("");
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<"takes" | "performance" | "pipeline">("takes");
  const [direction, setDirection] = useState("");

  useEffect(() => {
    if (!state) return;
    if (!state.audio.some((a) => a.id === selectedId)) setSelectedId(state.audio[0]?.id ?? "");
  }, [state?.audio.length, selectedId]);

  if (!state) return null;

  const selected = state.audio.find((a) => a.id === selectedId) ?? null;
  const analysis = selected?.analysis ?? null;
  const animationIntegrations = state.integrations.filter((i) => i.area === "animation");

  const upload = async (file: File) => {
    const outcome = await run(
      "Uploading audio",
      () => api.uploadAudio(file, { name: name.trim() || file.name, kind, notes: "" }),
      "Audio stored privately — run analysis to map the performance",
    );
    if (outcome.ok) setName("");
  };

  const analyze = async (take: AudioTake) => {
    setAnalyzing(take.id);
    try {
      const res = await fetch(audioUrl(take.id), { credentials: "same-origin" });
      if (!res.ok) throw new Error("Could not read the audio file.");
      const blob = await res.blob();
      const result = await analyzeAudioBlob(blob);
      await run("Mapping the performance", () => api.saveAudioAnalysis(take.id, result, result.durationSeconds), "Pitch, energy and vibrato mapped");
    } catch (error) {
      await run("Audio analysis", async () => {
        throw error instanceof Error ? error : new Error("Audio analysis failed.");
      });
    } finally {
      setAnalyzing(null);
    }
  };

  const brief = buildBrief(state, selected, analysis, direction);

  return (
    <>
      <PageHead
        eyebrow="Virtual singer · voice animation workspace"
        title="Voice & Singing Studio"
        description="Your recordings stay your vocal identity. This workspace maps the performance and states exactly what the animation step still needs."
        actions={
          <>
            <select className="select sm" style={{ width: "auto" }} value={kind} onChange={(event) => setKind(event.target.value as AudioTake["kind"])}>
              <option value="vocal">Lead vocal</option>
              <option value="instrumental">Instrumental</option>
              <option value="mix">Finished mix</option>
              <option value="reference">Reference performance</option>
            </select>
            <button className="btn primary" onClick={() => inputRef.current?.click()}>
              <Icon name="upload" size={14} /> Add audio
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/flac,audio/webm,.mp3,.wav,.m4a,.ogg,.flac"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
          </>
        }
      />

      <div className="stack">
        <Notice tone="ok" icon="lock" title="Your real voice remains the vocal identity">
          No synthetic voice is generated, cloned or substituted anywhere in this studio. Analysis happens on this device; the
          audio file is not sent to any provider by this workspace.
        </Notice>

        <Tabs
          items={[
            { key: "takes" as const, label: "Takes & analysis", count: state.audio.length },
            { key: "performance" as const, label: "Performance brief" },
            { key: "pipeline" as const, label: "Animation pipeline" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "takes" && (
          <div className="split">
            <Card title="Audio takes" subtitle="Uploaded privately. Analysis is local and repeatable.">
              {state.audio.length === 0 ? (
                <Empty
                  title="No takes yet"
                  body="Add a recorded vocal, an instrumental or a finished mix. WAV or high-bitrate MP3 gives the cleanest pitch mapping."
                  icon="voice"
                  action={<button className="btn gold sm" onClick={() => inputRef.current?.click()}>Add your first take</button>}
                />
              ) : (
                <div className="stack-sm">
                  {state.audio.map((take) => (
                    <div
                      key={take.id}
                      style={{
                        border: `1px solid ${selectedId === take.id ? "var(--gold)" : "var(--line)"}`,
                        borderRadius: 11,
                        padding: 13,
                        background: selectedId === take.id ? "var(--gold-wash)" : "#fffdf9",
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div className="row-between">
                        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 13 }}>{take.name}</span>
                          <span className="tiny muted">
                            {take.kind} · {formatBytes(take.bytes)} · {formatTime(take.createdAt)}
                          </span>
                        </div>
                        <div className="row" style={{ gap: 5 }}>
                          <Chip tone={take.analysis ? "ok" : "warn"}>{take.analysis ? "mapped" : "not mapped"}</Chip>
                          <button className="btn sm ghost" onClick={() => setSelectedId(take.id)}>Select</button>
                          <button className="btn sm ghost" onClick={() => void analyze(take)} disabled={analyzing !== null || busy !== null}>
                            {analyzing === take.id ? <span className="spinner" /> : <Icon name="waveform" size={12} />}
                            {take.analysis ? "Re-map" : "Map"}
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => void run("Deleting take", () => api.deleteAudio(take.id), "Take deleted")}
                            aria-label="Delete take"
                          >
                            <Icon name="trash" size={12} />
                          </button>
                        </div>
                      </div>
                      <audio controls src={audioUrl(take.id)} style={{ width: "100%", height: 34 }} preload="none" />
                      {take.analysis && <Waveform values={take.analysis.energyContour} />}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div className="stack">
              <Card title={selected ? selected.name : "Performance map"} subtitle="Signal measurements, not guesses.">
                {analysis ? (
                  <div className="stack-sm">
                    <div className="grid grid-2" style={{ gap: 12 }}>
                      <Metric label="Duration" value={`${analysis.durationSeconds.toFixed(1)} s`} />
                      <Metric label="Median pitch" value={analysis.medianF0 ? `${analysis.medianF0.toFixed(1)} Hz` : "—"} />
                      <Metric label="Range" value={analysis.f0Min && analysis.f0Max ? `${analysis.f0Min.toFixed(0)}–${analysis.f0Max.toFixed(0)} Hz` : "—"} />
                      <Metric label="Pitch span" value={pitchRangeSemitones(analysis) ? `${pitchRangeSemitones(analysis)} st` : "—"} />
                      <Metric label="Voiced frames" value={`${(analysis.voicedRatio * 100).toFixed(0)}%`} />
                      <Metric label="Vibrato" value={analysis.vibratoRateHz ? `${analysis.vibratoRateHz} Hz · ${analysis.vibratoExtentCents} cents` : "not detected"} />
                      <Metric label="Peak / RMS" value={`${analysis.peakDb} / ${analysis.rmsDb} dB`} />
                      <Metric label="Sample rate" value={`${(analysis.sampleRate / 1000).toFixed(1)} kHz`} />
                    </div>
                    <PitchChart values={analysis.pitchContour} />
                    <div className="hint">{analysis.method}</div>
                    <div className="hint">
                      This is a performance map for timing and sustain. It does not animate a face by itself, and it is not a
                      transcription — vowel shapes and jaw motion are produced by the animation step.
                    </div>
                  </div>
                ) : (
                  <Empty title="Select a take and map it" body="Pitch, energy and vibrato are computed in the browser from the waveform." icon="waveform" />
                )}
              </Card>

              <Card title="Voice identity" subtitle="Why the vocals you upload are the only vocals used.">
                <div className="stack-sm">
                  <div className="row-between"><span className="small">Synthetic vocal generation</span><Chip tone="warn">not used</Chip></div>
                  <div className="row-between"><span className="small">Voice cloning</span><Chip tone="warn">not used</Chip></div>
                  <div className="row-between"><span className="small">Your recording as source</span><Chip tone="ok">required</Chip></div>
                  <div className="hint">
                    The studio never sends your audio to an image provider. When a lip-sync provider is added later, your vocal
                    file is the audio track it animates — nothing is re-sung.
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {tab === "performance" && (
          <div className="split">
            <Card
              title="Performance brief"
              subtitle="A precise handover document for a lip-sync or animation stage."
              actions={<CopyButton text={brief} label="Copy brief" />}
            >
              <div className="stack-sm">
                <Field label="Direction" hint="How the performance should read: restraint, intensity, eye line, gestures.">
                  <textarea
                    className="textarea"
                    value={direction}
                    placeholder="e.g. Close, intimate take. Eyes mostly on camera, minimal head movement on the verses, one controlled gesture into the chorus."
                    onChange={(event) => setDirection(event.target.value)}
                  />
                </Field>
                <div className="code-block" style={{ maxHeight: 420 }}>{brief}</div>
              </div>
            </Card>
            <div className="stack">
              <Card title="Singing-specific requirements" subtitle="What a convincing performance needs beyond speaking lip sync.">
                <div className="stack-sm small muted">
                  {[
                    "Sustained vowel shapes held through long notes",
                    "Jaw opening tied to loudness, not to syllables alone",
                    "Consonant closures that do not close the mouth on held notes",
                    "Breath intake before phrases, visible in the shoulders",
                    "Eye movement and blink rhythm independent of speech",
                    "Head and torso movement following the melodic contour",
                  ].map((item) => (
                    <div className="row" style={{ gap: 8 }} key={item}>
                      <Icon name="check" size={12} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Ready-to-use take" subtitle="The source audio for an animation request.">
                {selected ? (
                  <div className="stack-sm">
                    <div className="row-between"><span className="small">{selected.name}</span><Chip tone="ok">{selected.kind}</Chip></div>
                    <audio controls src={audioUrl(selected.id)} style={{ width: "100%" }} preload="none" />
                    <div className="hint">
                      {analysis
                        ? `${analysis.durationSeconds.toFixed(1)} s · ${analysis.medianF0?.toFixed(1)} Hz median · ${(analysis.voicedRatio * 100).toFixed(0)}% voiced`
                        : "Map this take to include its timing and pitch data in the brief."}
                    </div>
                  </div>
                ) : (
                  <div className="hint">Select a take first.</div>
                )}
              </Card>
            </div>
          </div>
        )}

        {tab === "pipeline" && (
          <div className="stack">
            <Card title="Animation pipeline" subtitle="Verified options, stated honestly.">
              <div className="stack-sm">
                {animationIntegrations.map((integration) => (
                  <div key={integration.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", display: "grid", gap: 5 }}>
                    <div className="row-between">
                      <span style={{ fontSize: 13 }}>{integration.title}</span>
                      <Chip tone={integration.covered ? "ok" : "warn"}>{integration.covered ? "available" : integration.needs}</Chip>
                    </div>
                    <div className="small muted">{integration.honestStatus}</div>
                    {integration.endpoint && <div className="mono tiny">{integration.endpoint}</div>}
                  </div>
                ))}
              </div>
            </Card>
            <Card title="What happens when a provider is connected" subtitle="A realistic workflow, not a fabricated button.">
              <ol className="small muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                <li>Choose an approved portrait or a turnaround front view as the performance frame.</li>
                <li>Attach the vocal take from this studio as the driving audio.</li>
                <li>The provider returns a video with the mouth movement matched to the vocal — the singing audio stays yours.</li>
                <li>Review the clip, then bring it into your editor for the music video or YouTube cut.</li>
              </ol>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn ghost sm" onClick={() => go("settings")}>Provider settings</button>
                <button className="btn ghost sm" onClick={() => go("turnaround")}>Choose the performance frame</button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="value" style={{ fontSize: 19 }}>{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function Waveform({ values }: { values: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth || 420;
    const height = 56;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const barWidth = Math.max(1, width / Math.max(1, values.length) - 1);
    values.forEach((value, index) => {
      const x = (index / Math.max(1, values.length)) * width;
      const amplitude = Math.max(1, value * (height - 6));
      ctx.fillStyle = index % 7 === 0 ? "#b99253" : "rgba(90, 78, 58, 0.55)";
      ctx.fillRect(x, (height - amplitude) / 2, barWidth, amplitude);
    });
  }, [values]);
  return <canvas ref={ref} className="waveform" style={{ height: 56 }} />;
}

function PitchChart({ values }: { values: (number | null)[] }) {
  const width = 520;
  const height = 90;
  const voiced = values.filter((v): v is number => v !== null);
  if (!voiced.length) return null;
  const min = Math.min(...voiced) * 0.95;
  const max = Math.max(...voiced) * 1.05;
  const points: string[] = [];
  values.forEach((value, index) => {
    if (value === null) return;
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - ((value - min) / Math.max(1, max - min)) * height;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="pitch-line" preserveAspectRatio="none" role="img" aria-label="Pitch contour">
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="#e5dac8" strokeWidth="1" />
      <polyline points={points.join(" ")} fill="none" stroke="#b99253" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function buildBrief(state: ReturnType<typeof useStudio>["state"], take: AudioTake | null, analysis: AudioAnalysis | null, direction: string): string {
  if (!state) return "";
  const profile = state.masterVersion?.profile ?? state.draft.profile;
  const lines = [
    `PERFORMANCE BRIEF — ${profile.displayName}`,
    `Master identity: ${state.masterVersion ? `v${state.masterVersion.number}` : "not approved"}`,
    "",
    "SUBJECT",
    `Face: ${profile.features.eyes?.value || "see identity document"}`,
    `Skin: ${profile.skin.description || profile.skin.hex || "see identity document"}`,
    `Hair: ${profile.signatureHairstyleId} · ${profile.hairstyle.length} · ${profile.hairstyle.texture}`,
    "",
    "VOCAL SOURCE",
    take ? `${take.name} (${take.kind})` : "No take selected",
    analysis
      ? `${analysis.durationSeconds.toFixed(2)} s · median ${analysis.medianF0 ?? "—"} Hz · range ${analysis.f0Min ?? "—"}–${analysis.f0Max ?? "—"} Hz · ${(analysis.voicedRatio * 100).toFixed(0)}% voiced`
      : "Unmapped audio",
    analysis?.vibratoRateHz ? `Vibrato ≈ ${analysis.vibratoRateHz} Hz, ${analysis.vibratoExtentCents} cents` : "Vibrato: not detected",
    "",
    "PERFORMANCE DIRECTION",
    direction.trim() || "Natural, restrained delivery with clear eye contact.",
    "",
    "ANIMATION REQUIREMENTS",
    "- Singing lip sync (sustained vowels), not speech lip sync",
    "- Jaw opening follows loudness as well as syllables",
    "- Breath intakes before phrases; blink and eye movement independent of speech",
    "- Head and torso follow the melodic contour; no full-body drift",
    "- Face must match the approved identity lock exactly",
    "",
    "AUDIO POLICY",
    "The uploaded vocal is the only vocal used. No synthetic or cloned voice is permitted in this production.",
  ];
  return lines.join("\n");
}

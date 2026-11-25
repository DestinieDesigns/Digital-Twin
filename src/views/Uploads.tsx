import React, { useMemo, useRef, useState } from "react";
import { api, photoUrl } from "../api";
import { useStudio } from "../store";
import { Card, Chip, Empty, Icon, Modal, Notice, PageHead, Progress, Tabs } from "../components/ui";
import { VIEWS, VIEW_LABELS, type FaceAnalysis, type Photo, type ViewKey } from "../../shared/types";
import { analyzeFace, type AnalysisOutput } from "../lib/face";
import { formatBytes } from "../lib/util";

export default function Uploads({ go }: { go: (route: string) => void }) {
  const { state, run, busy } = useStudio();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [view, setView] = useState<ViewKey>("front");
  const [filter, setFilter] = useState<"all" | "unanalysed" | ViewKey>("all");
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [result, setResult] = useState<{ photo: Photo; output: AnalysisOutput } | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [applySuggestions, setApplySuggestions] = useState(true);

  const photos = state?.photos ?? [];
  const measured = photos.filter((p) => p.analysis?.faceDetected);
  const showing = useMemo(() => {
    if (filter === "all") return photos;
    if (filter === "unanalysed") return photos.filter((p) => !p.analysis);
    return photos.filter((p) => p.view === filter);
  }, [photos, filter]);

  if (!state) return null;

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setRejected([]);
    const outcome = await run("Uploading references", () => api.uploadPhotos(list, view), `Uploaded ${list.length === 1 ? "photograph" : "photographs"}`);
    if (outcome.ok) {
      const rejectedList = (outcome.data as any)?.rejected ?? [];
      setRejected(rejectedList);
    }
  };

  const analyze = async (photo: Photo) => {
    setAnalyzing(photo.id);
    try {
      const res = await fetch(photoUrl(photo.id), { credentials: "same-origin" });
      if (!res.ok) throw new Error("Could not read the photograph for analysis.");
      const blob = await res.blob();
      const output = await analyzeFace(blob);
      const saved = await run("Saving measurement", () => api.saveAnalysis(photo.id, output.analysis));
      if (saved.ok) setResult({ photo, output });
    } catch (err) {
      await run("Facial measurement", async () => {
        throw err instanceof Error ? err : new Error("Facial measurement failed.");
      });
    } finally {
      setAnalyzing(null);
    }
  };

  const analyzeAll = async () => {
    const pending = photos.filter((p) => !p.analysis);
    for (const photo of pending) {
      // Sequential so the WASM runtime is not asked to run many inferences at once.
      await analyze(photo);
    }
  };

  const mergeMeasurements = async () => {
    const samples = measured.map((p) => ({ photoId: p.id, measurements: p.analysis!.measurements }));
    if (!samples.length) return;
    const outcome = await run(
      "Merging measurements",
      () => api.saveMeasurements(samples, applySuggestions),
      `Measurements from ${samples.length} photograph${samples.length === 1 ? "" : "s"} merged into your draft identity`,
    );
    if (outcome.ok) go("identity");
  };

  const setPhotoView = async (photo: Photo, next: ViewKey) => {
    await run("Updating view", () => api.patchPhoto(photo.id, { view: next }));
  };

  return (
    <>
      <PageHead
        eyebrow="Reference library"
        title="Upload References"
        description="The identity is only as good as these photographs. Upload the views you have; the studio names the ones it still needs."
        actions={
          <>
            <button className="btn ghost" onClick={() => void analyzeAll()} disabled={busy !== null || photos.every((p) => p.analysis)}>
              Measure all
            </button>
            <button className="btn primary" onClick={() => inputRef.current?.click()}>
              <Icon name="plus" size={14} /> Add photographs
            </button>
          </>
        }
      />

      <div className="stack">
        <Notice tone="ok" icon="lock" title="Private by design">
          Files are validated by their actual bytes, stored under <code>./data/uploads</code> with random names, and served only
          through the local API. Facial measurement runs in this browser with a local model — analysis never uploads anything.
        </Notice>

        <Card>
          <div
            className={`dropzone ${over ? "over" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setOver(false);
              void upload(event.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
            }}
          >
            <Icon name="upload" size={22} />
            <div className="big">Drop your reference photographs here</div>
            <div className="small muted">JPEG, PNG, WebP or GIF · up to 25 MB each · up to 12 at once</div>
            <div className="row" onClick={(event) => event.stopPropagation()} style={{ marginTop: 4 }}>
              <span className="label">Tag this batch as</span>
              <select className="select sm" style={{ width: "auto" }} value={view} onChange={(event) => setView(event.target.value as ViewKey)}>
                {VIEWS.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label}
                  </option>
                ))}
              </select>
              <button className="btn gold sm" onClick={() => inputRef.current?.click()}>
                Choose files
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={(event) => {
                if (event.target.files) void upload(event.target.files);
                event.target.value = "";
              }}
            />
          </div>

          {rejected.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Notice tone="warn" title="Some files were not accepted">
                <ul style={{ margin: "3px 0 0", paddingLeft: 18 }}>
                  {rejected.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </Notice>
            </div>
          )}
        </Card>

        <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <Card
            title="Coverage checklist"
            subtitle="Five core views are required before a master can be approved."
            actions={
              <Chip tone={measured.length ? "ok" : "warn"}>
                {measured.length}/{photos.length} measured
              </Chip>
            }
          >
            <div className="grid grid-3">
              {VIEWS.filter((v) => v.key !== "other").map((item) => {
                const count = photos.filter((p) => p.view === item.key).length;
                return (
                  <div
                    key={item.key}
                    style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", display: "grid", gap: 3, background: count ? "#fbfdf8" : "#fdfaf2" }}
                  >
                    <div className="row-between">
                      <span style={{ fontSize: 12.5 }}>{item.label}</span>
                      <Chip tone={count ? "ok" : "warn"}>{count ? `${count}` : "missing"}</Chip>
                    </div>
                    <span className="tiny muted">{item.hint}</span>
                  </div>
                );
              })}
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <label className="check">
                <input type="checkbox" checked={applySuggestions} onChange={(event) => setApplySuggestions(event.target.checked)} />
                Also fill still-empty features with measured suggestions
              </label>
              <span className="spacer" />
              <button className="btn primary sm" onClick={() => void mergeMeasurements()} disabled={!measured.length || busy !== null}>
                Merge measurements into identity
              </button>
            </div>
          </Card>
        </div>

        <Card
          title="Your references"
          subtitle={`${photos.length} stored privately`}
          actions={
            <Tabs
              items={[
                { key: "all" as const, label: "All", count: photos.length },
                { key: "unanalysed" as const, label: "Not measured", count: photos.filter((p) => !p.analysis).length },
                ...VIEWS.filter((v) => v.key !== "other").map((v) => ({ key: v.key, label: v.label, count: photos.filter((p) => p.view === v.key).length })),
              ]}
              value={filter}
              onChange={setFilter}
            />
          }
        >
          {photos.length === 0 ? (
            <Empty
              title="No reference photographs yet"
              body="Start with a straight-on front photograph in even light. Then add a profile, a three-quarter, a neutral expression and a genuine smile."
              icon="upload"
              action={<button className="btn gold sm" onClick={() => inputRef.current?.click()}>Choose files</button>}
            />
          ) : showing.length === 0 ? (
            <Empty title="Nothing in this view yet" body="Upload a photograph tagged with this view to fill the gap." icon="upload" />
          ) : (
            <div className="grid grid-thumbs">
              {showing.map((photo) => (
                <div className="photo-card" key={photo.id}>
                  <div className="thumb">
                    <img src={photoUrl(photo.id)} alt={VIEW_LABELS[photo.view]} loading="lazy" />
                  </div>
                  <div className="row" style={{ gap: 5 }}>
                    <Chip tone={photo.analysis?.faceDetected ? "ok" : photo.analysis ? "warn" : ""}>
                      {photo.analysis?.faceDetected ? "measured" : photo.analysis ? "no face" : "unmeasured"}
                    </Chip>
                    {state.identity.masterPhotoId === photo.id && <Chip tone="gold">master</Chip>}
                    <Chip>{photo.width && photo.height ? `${photo.width}×${photo.height}` : formatBytes(photo.bytes)}</Chip>
                  </div>
                  <select className="select sm" value={photo.view} onChange={(event) => void setPhotoView(photo, event.target.value as ViewKey)} aria-label="Reference view">
                    {VIEWS.map((v) => (
                      <option key={v.key} value={v.key}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input sm"
                    placeholder="Expression (optional)"
                    defaultValue={photo.expression}
                    onBlur={(event) => event.target.value !== photo.expression && void run("Updating", () => api.patchPhoto(photo.id, { expression: event.target.value }))}
                  />
                  <div className="row" style={{ gap: 5 }}>
                    <button className="btn sm ghost" onClick={() => void analyze(photo)} disabled={analyzing !== null || busy !== null}>
                      {analyzing === photo.id ? <span className="spinner" /> : <Icon name="scan" size={12} />}
                      {photo.analysis ? "Re-measure" : "Measure"}
                    </button>
                    <button
                      className="btn sm ghost"
                      onClick={() => void run("Deleting photograph", () => api.deletePhoto(photo.id), "Photograph deleted")}
                      disabled={state.identity.masterPhotoId === photo.id || busy !== null}
                      title={state.identity.masterPhotoId === photo.id ? "Choose another master reference before deleting this one" : "Delete photograph"}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                  {photo.analysis?.warnings?.length ? (
                    <div className="tiny" style={{ color: "#8a6420" }}>{photo.analysis.warnings[0]}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(result)}
        title={result ? "Facial measurement result" : ""}
        onClose={() => setResult(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setResult(null)}>
              Close
            </button>
            <button className="btn primary" onClick={() => void mergeMeasurements()} disabled={busy !== null}>
              Merge into identity
            </button>
          </>
        }
      >
        {result && (
          <div className="stack-sm">
            {result.output.overlay && (
              <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--line)" }}>
                <img src={result.output.overlay} alt="Detected facial landmarks" />
              </div>
            )}
            {result.output.analysis.error ? (
              <Notice tone="danger">{result.output.analysis.error}</Notice>
            ) : (
              <>
                <div className="row">
                  <Chip tone="ok">{result.output.analysis.landmarks} landmarks</Chip>
                  <Chip>{result.output.analysis.method}</Chip>
                  {result.output.analysis.skinTone && (
                    <Chip tone="gold">
                      <span className="swatch" style={{ width: 12, height: 12, background: result.output.analysis.skinTone.hex, borderRadius: 3 }} />
                      {result.output.analysis.skinTone.hex} · {result.output.analysis.skinTone.undertone}
                    </Chip>
                  )}
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Measurement</th>
                      <th>Value</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.output.metrics.map((metric) => (
                      <tr key={metric.label}>
                        <td>{metric.label}</td>
                        <td className="mono">{metric.value}</td>
                        <td className="tiny muted">{metric.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.output.analysis.warnings.length > 0 && (
                  <Notice tone="warn" title="Reference quality notes">
                    <ul style={{ margin: "3px 0 0", paddingLeft: 18 }}>
                      {result.output.analysis.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </Notice>
                )}
                <div className="hint">
                  Ratios are computed from 2D landmarks and averaged across photographs when merged. They describe proportions;
                  they are not a face-shape verdict, so confirm the written description yourself.
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

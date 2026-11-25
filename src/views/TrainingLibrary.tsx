import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useStudio } from "../store";
import { Badge, Card, Chip, Empty, Field, Icon, Modal, Notice, PageHead, Progress, Stat } from "../components/ui";
import {
  ALL_CATEGORIES,
  CATEGORY_GROUPS,
  CATEGORY_LABEL,
  type Recording,
  type RecordingCategory,
} from "../../shared/behavior";
import { analyseStoredRecording, formatDuration, useTraining } from "../lib/training";
import { isAnalysisCancelled, probeMediaFile } from "../lib/media";
import { formatBytes, formatDate, formatTime } from "../lib/util";

const STATUS_TONE: Record<Recording["status"], "approved" | "pending" | "rejected"> = {
  analyzed: "approved",
  uploaded: "pending",
  failed: "rejected",
};

export default function TrainingLibrary({ go }: { go: (route: string) => void }) {
  const { toast } = useStudio();
  const { training, loading, error, refresh, mutate } = useTraining();
  const [filter, setFilter] = useState("all");
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<RecordingCategory>("casual");
  const [collectionId, setCollectionId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState<{ done: number; total: number; name: string } | null>(null);
  const [analysis, setAnalysis] = useState<{
    id: string;
    stage: string;
    percent: number;
    cancellable: boolean;
  } | null>(null);
  const [editing, setEditing] = useState<Recording | null>(null);
  const [deleting, setDeleting] = useState<Recording | null>(null);
  const [newCollection, setNewCollection] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const analysisController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (training && !collectionId && training.collections.length) setCollectionId(training.collections[0].id);
  }, [training, collectionId]);

  const filtered = useMemo(() => {
    if (!training) return [];
    return filter === "all" ? training.recordings : training.recordings.filter((r) => r.collectionId === filter);
  }, [training, filter]);

  const upload = async () => {
    if (!files.length) return;
    const total = files.length;
    for (let index = 0; index < total; index++) {
      const file = files[index];
      setUploading({ done: index, total, name: file.name });
      let probe;
      try {
        probe = await probeMediaFile(file);
      } catch (err) {
        toast(err instanceof Error ? err.message : `${file.name} could not be read.`, "error");
        continue;
      }
      const cleanTitle =
        total === 1 && title.trim() ? title.trim() : file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
      const result = await mutate(
        `Uploading ${index + 1}/${total}`,
        () =>
          api.uploadRecording(file, {
            title: cleanTitle || "Recording",
            category,
            collectionId,
            recordedAt: new Date(date).toISOString(),
            description,
            tags: tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            duration: probe.duration,
            width: probe.width,
            height: probe.height,
          }),
        `${file.name} stored privately`,
      );
      if (!result.ok) break;
    }
    setUploading(null);
    setFiles([]);
    setTitle("");
    setDescription("");
    setTags("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const analyse = async (recording: Recording) => {
    const controller = new AbortController();
    analysisController.current = controller;
    setAnalysis({ id: recording.id, stage: "Reading the stored file", percent: 1, cancellable: true });
    try {
      const derived = await analyseStoredRecording(recording, {
        onProgress: (progress) =>
          setAnalysis({ id: recording.id, stage: progress.stage, percent: progress.percent, cancellable: true }),
        signal: controller.signal,
      });
      // From here on the run is complete; cancelling would only discard a finished result.
      setAnalysis({ id: recording.id, stage: "Saving the extracted features", percent: 98, cancellable: false });
      const saved = await mutate(
        "Saving analysis",
        () => api.saveRecordingAnalysis(recording.id, derived, derived.duration),
        "Analysis stored — landmarks, blendshapes and speech metrics are ready",
      );
      if (!saved.ok) await api.failRecordingAnalysis(recording.id, saved.error ?? "Saving the analysis failed.");
    } catch (err) {
      if (isAnalysisCancelled(err)) {
        toast("Analysis cancelled — nothing was saved and any earlier analysis is unchanged.");
        return;
      }
      const message = err instanceof Error ? err.message : "The on-device analysis failed.";
      await mutate("Marking failure", () => api.failRecordingAnalysis(recording.id, message));
      toast(message, "error");
    } finally {
      analysisController.current = null;
      setAnalysis(null);
      void refresh();
    }
  };

  const cancelAnalysis = () => {
    analysisController.current?.abort();
    setAnalysis((current) =>
      current ? { ...current, stage: "Cancelling — the partial run will be discarded", cancellable: false } : current,
    );
  };

  const openWorkspace = (recording: Recording) => {
    window.sessionStorage.setItem("studio:recording", recording.id);
    window.sessionStorage.removeItem("studio:recording-time");
    go("movement-lab");
  };

  if (loading && !training) {
    return (
      <PageHead
        eyebrow="Behaviour learning"
        title="My Digital Twin Training Library"
        description="Loading your private recording library…"
      />
    );
  }

  if (error || !training) {
    return (
      <>
        <PageHead eyebrow="Behaviour learning" title="My Digital Twin Training Library" description="Your private audiovisual learning workspace." />
        <Notice tone="danger" title="The training library could not be loaded">
          {error ?? "Unknown error."} Start the studio with <code>bun run dev</code> and try again.
        </Notice>
      </>
    );
  }

  const stats = training.stats;

  return (
    <>
      <PageHead
        eyebrow="Behaviour learning · private media"
        title="My Digital Twin Training Library"
        description="Every recording stays on this computer. Analysis extracts numeric features; it does not train or animate anything by itself."
        actions={
          <div className="row">
            <Chip tone="ok">{formatBytes(stats.storageBytes)} stored</Chip>
            <button className="btn ghost" onClick={() => go("training-dashboard")}>
              <Icon name="dashboard" size={14} /> Training dashboard
            </button>
          </div>
        }
      />

      <div className="stack">
        <div className="grid grid-4">
          <Card><Stat label="Recordings" value={stats.recordings} note={`${stats.videos} video · ${stats.audio} audio`} /></Card>
          <Card><Stat label="Total footage" value={formatDuration(stats.videoSeconds + stats.audioSeconds)} note={`${formatDuration(stats.videoSeconds)} video · ${formatDuration(stats.audioSeconds)} audio`} /></Card>
          <Card><Stat label="Analysed" value={stats.analyzed} note={`${stats.segments} reference segments`} /></Card>
          <Card><Stat label="Approved references" value={stats.approved} note={`${stats.approvedSegments} segments · ${stats.approvedMannerisms} mannerisms`} /></Card>
        </div>

        <div className="split" style={{ gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)" }}>
          <Card title="Upload recordings" subtitle="Video MP4/MOV/WebM · audio MP3/WAV/M4A/OGG/FLAC · up to 400 MB each.">
            <div className="stack-sm">
              <label className="upload-drop" style={{ cursor: uploading ? "wait" : "pointer" }}>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept="video/*,audio/*,.mp4,.mov,.webm,.mp3,.wav,.m4a,.ogg,.flac"
                  style={{ display: "none" }}
                  disabled={uploading !== null}
                  onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                />
                <Icon name="upload" size={20} />
                <span>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : "Choose recordings"}</span>
                <span className="tiny muted">
                  {files.length
                    ? files.map((file) => `${file.name} · ${formatBytes(file.size)}`).join("  ·  ")
                    : "You can select several files; each becomes its own recording."}
                </span>
              </label>

              {uploading && (
                <Notice tone="info" title={`Uploading ${uploading.done + 1} of ${uploading.total}`}>
                  {uploading.name}
                </Notice>
              )}

              <div className="grid grid-2">
                <Field label={files.length > 1 ? "Title (applies to single files only)" : "Title"}>
                  <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Auto from filename if empty" />
                </Field>
                <Field label="Recording date">
                  <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                </Field>
                <Field label="Category">
                  <select className="select" value={category} onChange={(event) => setCategory(event.target.value as RecordingCategory)}>
                    {CATEGORY_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                <Field label="Collection">
                  <select className="select" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
                    {training.collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.code} · {collection.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Description" hint="What is happening in this recording? Context helps you review the analysis honestly.">
                <textarea className="textarea" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
              </Field>
              <Field label="Tags" hint="Comma separated, e.g. laughing, kitchen, close-up.">
                <input className="input" value={tags} onChange={(event) => setTags(event.target.value)} />
              </Field>
              <button className="btn primary block" onClick={() => void upload()} disabled={!files.length || uploading !== null}>
                <Icon name="upload" size={14} /> {uploading ? "Uploading…" : "Store in training library"}
              </button>
              <div className="hint">
                Originals are stored unchanged under <code>./data/media</code>. Extracted features live in a separate table, so
                deleting a recording never leaves a hidden copy of it behind.
              </div>
            </div>
          </Card>

          <Card title="Collections" subtitle="Seven starter collections plus your own.">
            <div className="stack-sm">
              {training.collections.map((collection) => {
                const count = training.recordings.filter((r) => r.collectionId === collection.id).length;
                return (
                  <div
                    key={collection.id}
                    className="row-between"
                    style={{ padding: "9px 0", borderBottom: "1px solid var(--line)", gap: 10 }}
                  >
                    <div style={{ display: "grid", gap: 1, minWidth: 0 }}>
                      <span className="small">
                        <strong>{collection.code}</strong> · {collection.name}
                      </span>
                      <span className="tiny muted">{collection.description || "Custom collection"}</span>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <Chip>{count}</Chip>
                      {!collection.preset && (
                        <button
                          className="icon-btn"
                          title="Delete this collection (recordings move to collection A)"
                          onClick={() =>
                            void mutate("Deleting collection", () => api.deleteCollection(collection.id), "Collection removed")
                          }
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <Field label="New collection">
                <div className="row">
                  <input
                    className="input"
                    value={newCollection}
                    onChange={(event) => setNewCollection(event.target.value)}
                    placeholder="e.g. Late-night voice notes"
                  />
                  <button
                    className="btn sm"
                    disabled={!newCollection.trim()}
                    onClick={async () => {
                      const result = await mutate(
                        "Creating collection",
                        () => api.createCollection({ name: newCollection.trim(), description: "" }),
                        "Collection created",
                      );
                      if (result.ok) setNewCollection("");
                    }}
                  >
                    Add
                  </button>
                </div>
              </Field>
            </div>
          </Card>
        </div>

        <Card
          title="Recording library"
          subtitle={`${stats.recordings} recording${stats.recordings === 1 ? "" : "s"} · ${stats.analyzed} analysed · ${stats.failed} failed`}
          actions={
            <button className="btn ghost sm" onClick={() => void refresh()} disabled={analysis !== null}>
              <Icon name="rotate" size={12} /> Refresh
            </button>
          }
        >
          <div className="tabs" role="tablist">
            <button className={`tab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
              All <span style={{ opacity: 0.6, marginLeft: 6 }}>{stats.recordings}</span>
            </button>
            {training.collections.map((collection) => (
              <button
                key={collection.id}
                className={`tab ${filter === collection.id ? "active" : ""}`}
                onClick={() => setFilter(collection.id)}
              >
                {collection.code} <span style={{ opacity: 0.6, marginLeft: 6 }}>
                  {training.recordings.filter((r) => r.collectionId === collection.id).length}
                </span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <Empty
              title="No recordings in this collection yet"
              body="Upload footage of yourself talking, moving, laughing or singing. The studio will not invent behaviour without evidence."
              icon="waveform"
            />
          ) : (
            <div className="grid grid-3" style={{ marginTop: 14 }}>
              {filtered.map((recording) => (
                <div key={recording.id} className="recording-card">
                  <div className="recording-head">
                    <div className="recording-kind">
                      <Icon name={recording.kind === "video" ? "eye" : "waveform"} size={15} />
                    </div>
                    <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                      <span className="recording-title" title={recording.title}>{recording.title}</span>
                      <span className="tiny muted">
                        {CATEGORY_LABEL[recording.category] ?? recording.category} · {formatDate(recording.recordedAt)}
                      </span>
                    </div>
                    <span style={{ marginLeft: "auto" }}>
                      <Badge tone={STATUS_TONE[recording.status]}>{recording.status}</Badge>
                    </span>
                  </div>
                  <div className="row" style={{ gap: 5 }}>
                    <Chip>{formatDuration(recording.duration)}</Chip>
                    <Chip>{formatBytes(recording.bytes)}</Chip>
                    {recording.analysis?.hasFace && <Chip tone="ok">face</Chip>}
                    {recording.analysis?.hasPose && <Chip tone="ok">pose</Chip>}
                    {recording.analysis?.hasAudio && <Chip tone="ok">audio</Chip>}
                    {recording.approved && <Chip tone="gold">approved</Chip>}
                  </div>
                  {recording.description && <div className="tiny muted recording-desc">{recording.description}</div>}
                  {recording.tags.length > 0 && (
                    <div className="row" style={{ gap: 4 }}>
                      {recording.tags.slice(0, 5).map((tag) => (
                        <Chip key={tag}>{tag}</Chip>
                      ))}
                    </div>
                  )}
                  {recording.error && <div className="tiny" style={{ color: "var(--danger)" }}>{recording.error}</div>}

                  {analysis?.id === recording.id ? (
                    <div style={{ display: "grid", gap: 5 }}>
                      <div className="row-between" style={{ gap: 8 }}>
                        <div className="tiny muted">{analysis.stage}</div>
                        {analysis.cancellable && (
                          <button className="btn ghost sm" onClick={cancelAnalysis}>
                            Cancel
                          </button>
                        )}
                      </div>
                      <Progress value={analysis.percent} thin />
                    </div>
                  ) : (
                    <div className="recording-actions">
                      <button className="btn sm" onClick={() => void analyse(recording)} disabled={analysis !== null || uploading !== null}>
                        <Icon name="scan" size={12} /> {recording.status === "analyzed" ? "Re-analyse" : "Analyse"}
                      </button>
                      <button className="btn ghost sm" onClick={() => openWorkspace(recording)}>
                        Workspace
                      </button>
                      <button className="btn ghost sm" onClick={() => setEditing(recording)}>
                        Edit
                      </button>
                      <button className="btn ghost sm" onClick={() => setDeleting(recording)} title="Delete recording">
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                  )}
                  <div className="tiny muted">Stored {formatTime(recording.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Notice tone="info" title="What a recording does and does not mean">
          Uploading stores the file. Analysing extracts measurements. Neither trains a model, clones a voice or animates your
          character — those stages are listed separately on the training dashboard with their real requirements.
        </Notice>
      </div>

      {editing && (
        <EditRecording
          recording={editing}
          collections={training.collections}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            const result = await mutate("Saving recording", () => api.patchRecording(editing.id, patch), "Recording updated");
            if (result.ok) {
              const withdrawal = result.data?.withdrawal;
              if (withdrawal && (withdrawal.profilesFlagged || withdrawal.mannerismsRemoved || withdrawal.mannerismsUpdated)) {
                const bits = [
                  withdrawal.mannerismsRemoved
                    ? `${withdrawal.mannerismsRemoved} suggested pattern${withdrawal.mannerismsRemoved === 1 ? "" : "s"} removed`
                    : "",
                  withdrawal.mannerismsUpdated
                    ? `${withdrawal.mannerismsUpdated} pattern${withdrawal.mannerismsUpdated === 1 ? "" : "s"} lost this evidence`
                    : "",
                  withdrawal.profilesFlagged
                    ? `${withdrawal.profilesFlagged} profile${withdrawal.profilesFlagged === 1 ? "" : "s"} flagged`
                    : "",
                ].filter(Boolean);
                toast(`Training use withdrawn — ${bits.join(", ")}.`, "info");
              }
              setEditing(null);
            }
          }}
        />
      )}

      <Modal
        open={deleting !== null}
        title="Delete recording"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setDeleting(null)}>Cancel</button>
            <button
              className="btn danger"
              onClick={async () => {
                if (!deleting) return;
                const result = await mutate(
                  "Deleting recording",
                  () => api.deleteRecording(deleting.id),
                  "Recording and its extracted data deleted from disk",
                );
                if (result.ok) setDeleting(null);
              }}
            >
              Delete permanently
            </button>
          </>
        }
      >
        {deleting && (
          <div className="stack-sm">
            <p className="small">
              This removes <strong>{deleting.title}</strong>, its analysis, and every segment extracted from it.
            </p>
            <Notice tone="warn" title="Mannerisms may lose evidence">
              If an approved mannerism relied on this recording, it drops back to a pending single observation. Temporary
              behaviour is never kept as a permanent trait without recurring evidence.
            </Notice>
          </div>
        )}
      </Modal>
    </>
  );
}

function EditRecording({
  recording,
  collections,
  onClose,
  onSave,
}: {
  recording: Recording;
  collections: { id: string; code: string; name: string }[];
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState(recording.title);
  const [category, setCategory] = useState(recording.category);
  const [collectionId, setCollectionId] = useState(recording.collectionId);
  const [recordedAt, setRecordedAt] = useState(recording.recordedAt.slice(0, 10));
  const [description, setDescription] = useState(recording.description);
  const [tags, setTags] = useState(recording.tags.join(", "));
  const [allowTraining, setAllowTraining] = useState(recording.allowTraining);
  const [approved, setApproved] = useState(recording.approved);

  return (
    <Modal
      open
      title="Edit recording"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            onClick={() =>
              void onSave({
                title: title.trim() || recording.title,
                category,
                collectionId,
                recordedAt: new Date(recordedAt).toISOString(),
                description,
                tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                allowTraining,
                approved,
              })
            }
          >
            Save changes
          </button>
        </>
      }
    >
      <div className="stack-sm">
        <Field label="Title">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <div className="grid grid-2">
          <Field label="Category">
            <select className="select" value={category} onChange={(event) => setCategory(event.target.value as RecordingCategory)}>
              {ALL_CATEGORIES.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Collection">
            <select className="select" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>{collection.code} · {collection.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Recording date">
            <input className="input" type="date" value={recordedAt} onChange={(event) => setRecordedAt(event.target.value)} />
          </Field>
        </div>
        <Field label="Description">
          <textarea className="textarea" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <Field label="Tags">
          <input className="input" value={tags} onChange={(event) => setTags(event.target.value)} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={allowTraining} onChange={(event) => setAllowTraining(event.target.checked)} />
          <span>Allow this recording to be used for model training or external processing</span>
        </label>
        {recording.allowTraining && !allowTraining && (
          <div className="hint">
            Saving withdraws this recording from the evidence behind suggested mannerisms and flags any behaviour profile
            that cited it. The file and the segments you reviewed stay where they are.
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
          <span>Mark as an approved behaviour reference</span>
        </label>
        <div className="hint">
          Approval here records that you reviewed the footage. It does not mean a model has learned from it.
        </div>
      </div>
    </Modal>
  );
}

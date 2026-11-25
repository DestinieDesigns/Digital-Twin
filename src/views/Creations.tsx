import React, { useMemo, useState } from "react";
import { api, assetUrl } from "../api";
import { useStudio } from "../store";
import { Card, Chip, Empty, Field, Icon, Modal, PageHead, Tabs } from "../components/ui";
import { GenerationTile, ReviewBadge } from "../components/pieces";
import { formatTime } from "../lib/util";
import type { Generation } from "../../shared/types";

export default function Creations({ go }: { go: (route: string) => void }) {
  const { state, run, busy } = useStudio();
  const [tab, setTab] = useState<"all" | "approved" | "generations" | "saved">("all");
  const [saving, setSaving] = useState<Generation | null>(null);
  const [title, setTitle] = useState("");
  const [collection, setCollection] = useState("");
  const [notes, setNotes] = useState("");
  const [reviewing, setReviewing] = useState<Generation | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const generations = useMemo(() => (state ? state.generations.filter((g) => g.status === "completed" && g.assetId) : []), [state?.generations]);

  if (!state) return null;

  const saved = state.creations;
  const shown = tab === "approved" ? generations.filter((g) => g.review === "approved") : generations;
  const collections = Array.from(new Set(saved.map((c) => c.collection).filter(Boolean)));

  const openSave = (generation: Generation) => {
    setSaving(generation);
    setTitle(generation.label);
    setCollection(collections[0] ?? "");
    setNotes("");
  };

  return (
    <>
      <PageHead
        eyebrow="Library"
        title="Saved Creations"
        description="Every generation the studio actually produced, with its review state, plus the looks you chose to keep."
        actions={
          <button className="btn ghost" onClick={() => go("export")}>
            <Icon name="export" size={14} /> Export center
          </button>
        }
      />

      <div className="stack">
        <div className="grid grid-4">
          <Card><div className="stat"><div className="value">{generations.length}</div><div className="label">Images</div><div className="note">Provider-returned</div></div></Card>
          <Card><div className="stat"><div className="value">{generations.filter((g) => g.review === "approved").length}</div><div className="label">Approved</div><div className="note">Reviewed by you</div></div></Card>
          <Card><div className="stat"><div className="value">{saved.length}</div><div className="label">Saved looks</div><div className="note">{collections.length} collections</div></div></Card>
          <Card><div className="stat"><div className="value">{state.generations.filter((g) => g.status === "failed").length}</div><div className="label">Failed attempts</div><div className="note">Kept for honesty</div></div></Card>
        </div>

        <Card
          title="The library"
          subtitle="Nothing here is a mock-up. A tile with no image is a generation that failed and says why."
          actions={
            <Tabs
              items={[
                { key: "all" as const, label: "All", count: generations.length },
                { key: "approved" as const, label: "Approved", count: generations.filter((g) => g.review === "approved").length },
                { key: "generations" as const, label: "By studio" },
                { key: "saved" as const, label: "Saved looks", count: saved.length },
              ]}
              value={tab}
              onChange={setTab}
            />
          }
        >
          {tab === "saved" ? (
            saved.length ? (
              <div className="stack-sm">
                {saved.map((creation) => {
                  const generation = state.generations.find((g) => g.id === creation.generationId);
                  return (
                    <div key={creation.id} className="row-between" style={{ border: "1px solid var(--line)", borderRadius: 11, padding: 12, gap: 12 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                        <div style={{ width: 58, height: 58, borderRadius: 8, overflow: "hidden", background: "#efe6d6", flex: "none" }}>
                          {generation?.assetId && <img src={assetUrl(generation.assetId)} alt={creation.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                        </div>
                        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 13 }}>{creation.title}</span>
                          <span className="tiny muted">
                            {creation.collection || "unsorted"} · {formatTime(creation.createdAt)}
                          </span>
                          {creation.notes && <span className="tiny muted">{creation.notes}</span>}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        {generation && <ReviewBadge generation={generation} />}
                        <button className="btn ghost sm" onClick={() => void run("Removing look", () => api.deleteCreation(creation.id), "Saved look removed")} disabled={busy !== null}>
                          <Icon name="trash" size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty title="No saved looks yet" body="Use Save on any approved image to keep it with a title and collection for a specific song or video." icon="gallery" />
            )
          ) : shown.length === 0 ? (
            <Empty
              title="Nothing generated yet"
              body="Images appear here only after a provider returns them. Prompts and references are ready in the studios."
              icon="sparkle"
              action={<button className="btn gold sm" onClick={() => go("facial-lab")}>Generate a portrait</button>}
            />
          ) : (
            <div className="grid grid-4">
              {shown.map((generation) => (
                <GenerationTile
                  key={generation.id}
                  generation={generation}
                  onReview={setReviewing}
                  onSave={openSave}
                  onDelete={async (item) => {
                    if (item.assetId === null || window.confirm("Delete this generation permanently?")) {
                      await run("Deleting", () => api.deleteGeneration(item.id), "Generation deleted");
                    }
                  }}
                />
              ))}
            </div>
          )}
        </Card>

        <Card title="Failed attempts" subtitle="Kept visible so the record is truthful about what worked.">
          {state.generations.filter((g) => g.status === "failed").length === 0 ? (
            <div className="hint">No failed attempts recorded.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Kind</th>
                  <th>Provider</th>
                  <th>Why it failed</th>
                </tr>
              </thead>
              <tbody>
                {state.generations
                  .filter((g) => g.status === "failed")
                  .slice(0, 8)
                  .map((generation) => (
                    <tr key={generation.id}>
                      <td className="tiny">{formatTime(generation.createdAt)}</td>
                      <td className="tiny">{generation.kind}</td>
                      <td className="tiny">{generation.provider}</td>
                      <td className="tiny" style={{ color: "var(--danger)" }}>{generation.error ?? "Unknown provider error"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(saving)}
        title="Save this look"
        onClose={() => setSaving(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setSaving(null)}>Cancel</button>
            <button
              className="btn primary"
              disabled={!title.trim() || busy !== null}
              onClick={async () => {
                if (!saving) return;
                const outcome = await run(
                  "Saving look",
                  () =>
                    api.saveCreation({
                      title: title.trim(),
                      kind: saving.kind,
                      collection: collection.trim(),
                      generationId: saving.id,
                      notes: notes.trim(),
                    }),
                  "Look saved to the library",
                );
                if (outcome.ok) setSaving(null);
              }}
            >
              Save look
            </button>
          </>
        }
      >
        <Field label="Title">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Collection" hint="A song, a video, a campaign — free text.">
          <input className="input" value={collection} onChange={(event) => setCollection(event.target.value)} placeholder="e.g. Single 01 — artwork" />
        </Field>
        <Field label="Notes">
          <textarea className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={Boolean(reviewing)}
        title="Review this image"
        onClose={() => setReviewing(null)}
      >
        {reviewing && reviewing.assetId && (
          <div className="stack-sm">
            <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--line)" }}>
              <img src={assetUrl(reviewing.assetId)} alt={reviewing.label} />
            </div>
            <div className="row">
              <ReviewBadge generation={reviewing} />
              <Chip>{reviewing.provider}</Chip>
              <Chip>{reviewing.label}</Chip>
            </div>
            <input className="input" placeholder="Review note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
            <div className="row">
              <button
                className="btn primary sm"
                onClick={async () => {
                  const outcome = await run("Approving", () => api.review(reviewing.id, "approved", reviewNote), "Marked approved");
                  if (outcome.ok) setReviewing(null);
                }}
              >
                Approve
              </button>
              <button
                className="btn danger sm"
                onClick={async () => {
                  const outcome = await run("Rejecting", () => api.review(reviewing.id, "rejected", reviewNote), "Marked rejected");
                  if (outcome.ok) setReviewing(null);
                }}
              >
                Reject
              </button>
              <button
                className="btn ghost sm"
                onClick={async () => {
                  const outcome = await run("Saving", () => api.review(reviewing.id, "pending", reviewNote));
                  if (outcome.ok) setReviewing(null);
                }}
              >
                Clear review
              </button>
            </div>
            <details>
              <summary className="tiny muted" style={{ cursor: "pointer" }}>Prompt used</summary>
              <div className="code-block" style={{ marginTop: 6, maxHeight: 220 }}>{reviewing.prompt}</div>
            </details>
          </div>
        )}
      </Modal>
    </>
  );
}

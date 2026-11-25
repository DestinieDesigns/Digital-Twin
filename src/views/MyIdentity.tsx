import React, { useEffect, useMemo, useState } from "react";
import { api, photoUrl } from "../api";
import { useStudio } from "../store";
import { Badge, Card, Chip, CopyButton, Empty, Field, Icon, Notice, PageHead, Progress, Tabs } from "../components/ui";
import { MasterAvatar } from "../components/pieces";
import { FEATURES, VIEWS, VIEW_LABELS, type IdentityProfile, type ViewKey } from "../../shared/types";
import { buildIdentityLock, profileCompletion } from "../../shared/identity";
import { formatDate } from "../lib/util";

export default function MyIdentity({ go }: { go: (route: string) => void }) {
  const { state, run, busy } = useStudio();
  const [profile, setProfile] = useState<IdentityProfile | null>(null);
  const [draftNotes, setDraftNotes] = useState("");
  const [tab, setTab] = useState<"features" | "skin" | "marks" | "lock">("features");
  const [label, setLabel] = useState("");
  const [blocking, setBlocking] = useState<string[]>([]);

  const draft = state?.draft;

  useEffect(() => {
    if (draft) {
      setProfile(draft.profile);
      setDraftNotes(draft.notes);
    }
    // Reset only when the working draft itself changes (approval, restore, snapshot).
  }, [draft?.id]);

  const readiness = state?.readiness;

  if (!state || !profile || !draft || !readiness) {
    return (
      <PageHead eyebrow="Identity" title="My Identity" description="Loading the identity profile…" />
    );
  }

  const completion = profileCompletion(profile);
  const coverageMap = new Map(readiness.coverage.map((c) => [c.view, c.count]));

  const setFeature = (key: string, value: string, source?: "user" | "measured") => {
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            features: {
              ...prev.features,
              [key]: {
                value,
                source: source ?? (value.trim() ? "user" : "missing"),
              },
            },
          }
        : prev,
    );
  };

  const save = async () => {
    const result = await run("Saving identity", () => api.saveProfile(profile, draftNotes), "Identity draft saved");
    if (result.ok) setBlocking([]);
  };

  const approve = async () => {
    const result = await run("Approving master identity", () => api.approveVersion(draft.id), "Master identity approved and locked");
    if (!result.ok) setBlocking(result.payload?.blocking ?? []);
  };

  const markMaster = async (photoId: string) => {
    await run("Setting master reference", () => api.updateIdentity({ masterPhotoId: photoId }), "Master reference photograph set");
  };

  const lockText = buildIdentityLock(profile);

  return (
    <>
      <PageHead
        eyebrow="Identity foundation"
        title="My Identity"
        description="One permanent record of your face. Written by you where the camera cannot prove it, measured where it can."
        actions={
          <>
            <button className="btn ghost" onClick={save} disabled={busy !== null}>
              Save draft
            </button>
            <button className="btn primary" onClick={approve} disabled={busy !== null || !!state.masterVersion?.id && state.masterVersion.id === draft.id}>
              <Icon name="lock" size={14} /> Approve master
            </button>
          </>
        }
      />

      <div className="stack">
        <div className="split">
          <Card className="gold">
            <div className="hero-master">
              <MasterAvatar state={state} />
              <div className="headline">
                <div className="row">
                  <Badge tone={state.masterVersion ? "master" : "draft"}>
                    {state.masterVersion ? `Master v${state.masterVersion.number}` : "Working draft"}
                  </Badge>
                  <Chip>{completion}% documented</Chip>
                  {state.masterVersion && <Chip tone="ok"><Icon name="lock" size={10} /> locked</Chip>}
                </div>
                <input
                  className="input"
                  value={profile.displayName}
                  onChange={(event) => setProfile({ ...profile, displayName: event.target.value })}
                  aria-label="Identity name"
                  style={{ fontFamily: "var(--serif)", fontSize: 20, letterSpacing: "0.02em" }}
                />
                <Field label="Styling brief" hint="Tone, era, polish — the intent behind every generation. This never overrides facial structure.">
                  <textarea
                    className="textarea"
                    value={profile.summary}
                    placeholder="e.g. Warm, cinematic, quietly confident. Polished but never over-filtered — she should look like the best-lit version of me, not a new person."
                    onChange={(event) => setProfile({ ...profile, summary: event.target.value })}
                  />
                </Field>
                <div className="row-between">
                  <span className="label">Feature documentation</span>
                  <span className="tiny muted">{readiness.approvedCount}/{readiness.totalCount}</span>
                </div>
                <Progress value={readiness.approvedCount} max={readiness.totalCount} />
                <div className="row">
                  <span className="tiny muted">
                    {state.photos.length} photographs · {state.stats.analyzedPhotos} measured · {state.versions.length} versions
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Reference coverage" subtitle="Each feature asks for the views that make it visible.">
            <div className="stack-sm">
              {VIEWS.filter((v) => v.key !== "other").map((view) => {
                const count = coverageMap.get(view.key) ?? 0;
                return (
                  <div className="row-between" key={view.key} style={{ gap: 8 }}>
                    <span className="small">{view.label}</span>
                    <Chip tone={count ? "ok" : "warn"}>{count ? `${count} uploaded` : "missing"}</Chip>
                  </div>
                );
              })}
              <button className="btn ghost sm block" onClick={() => go("uploads")}>
                <Icon name="upload" size={13} /> Add reference photographs
              </button>
            </div>
          </Card>
        </div>

        {readiness.blocking.length > 0 && (
          <Notice tone="warn" title="Before this identity can be approved">
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, display: "grid", gap: 3 }}>
              {readiness.blocking.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Notice>
        )}
        {blocking.length > 0 && (
          <Notice tone="danger" title="Approval blocked by the server">
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, display: "grid", gap: 3 }}>
              {blocking.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Notice>
        )}

        <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <Card
            title="Facial identity record"
            subtitle="Fourteen features. Nothing is filled in for you — measurements are offered as suggestions you must accept."
            actions={
              <Chip tone={readiness.features.every((f) => f.status !== "missing") ? "ok" : "warn"}>
                {readiness.features.filter((f) => f.status !== "missing").length} described
              </Chip>
            }
          >
            <Tabs
              items={[
                { key: "features" as const, label: "Features", count: readiness.totalCount },
                { key: "skin" as const, label: "Skin tone" },
                { key: "marks" as const, label: "Marks", count: profile.marks.length },
                { key: "lock" as const, label: "Identity lock" },
              ]}
              value={tab}
              onChange={setTab}
            />

            <div style={{ paddingTop: 10 }}>
              {tab === "features" && (
                <div>
                  {FEATURES.map((def) => {
                    const feature = readiness.features.find((f) => f.key === def.key)!;
                    const stored = profile.features[def.key] ?? { value: "", source: "missing" as const };
                    const requiredViews = Array.from(new Set(def.requires.flat()));
                    return (
                      <div className="feature-row" key={def.key}>
                        <div className="feature-head">
                          <span className="name">{def.label}</span>
                          {stored.value.trim() ? (
                            <Chip tone={stored.source === "measured" ? "gold" : "ok"}>
                              {stored.source === "measured" ? "measured" : "your description"}
                            </Chip>
                          ) : (
                            <Chip tone="warn">not established</Chip>
                          )}
                          <span className="spacer" />
                          {feature.missingViews.length > 0 && (
                            <Chip tone="warn" title="Upload these views before describing this feature">
                              needs {feature.missingViews.map((v) => VIEW_LABELS[v]).join(", ")}
                            </Chip>
                          )}
                        </div>
                        <div className="feature-hint">{def.help}</div>
                        <div className="row" style={{ gap: 5 }}>
                          {requiredViews.map((view) => (
                            <span
                              key={view}
                              className={`view-chip ${(coverageMap.get(view) ?? 0) > 0 ? "present" : "missing"}`}
                            >
                              <Icon name={(coverageMap.get(view) ?? 0) > 0 ? "check" : "warn"} size={10} />
                              {VIEW_LABELS[view]}
                            </span>
                          ))}
                        </div>
                        {feature.measurements.length > 0 && (
                          <div className="measure-pills">
                            {feature.measurements.map((m) => (
                              <Chip key={m.key} tone="plum">
                                {m.label}: {m.value}
                              </Chip>
                            ))}
                          </div>
                        )}
                        {feature.suggestedValue && !stored.value.trim() && (
                          <Notice icon="info" tone="ok">
                            Measured suggestion: {feature.suggestedValue}{" "}
                            <button
                              className="btn link sm"
                              onClick={() => setFeature(def.key, feature.suggestedValue!, "measured")}
                            >
                              Use measurement
                            </button>
                          </Notice>
                        )}
                        <textarea
                          className="textarea"
                          style={{ minHeight: 62 }}
                          placeholder={def.placeholder}
                          value={stored.value}
                          onChange={(event) => setFeature(def.key, event.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === "skin" && (
                <div className="stack">
                  <Notice>
                    Skin tone is sampled from cheek pixels on a measured front photograph. If no measurement exists, describe
                    it yourself — the studio will not choose a tone for you.
                  </Notice>
                  <div className="grid grid-2">
                    <Field label="Tone swatch">
                      <div className="row">
                        <span className="swatch" style={{ background: profile.skin.hex || "#e8d5c2" }} />
                        <input
                          className="input"
                          value={profile.skin.hex}
                          placeholder="#a4714f"
                          onChange={(event) => setProfile({ ...profile, skin: { ...profile.skin, hex: event.target.value, source: "user" } })}
                        />
                      </div>
                    </Field>
                    <Field label="Undertone">
                      <select
                        className="select"
                        value={profile.skin.undertone}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            skin: { ...profile.skin, undertone: event.target.value as IdentityProfile["skin"]["undertone"], source: "user" },
                          })
                        }
                      >
                        <option value="unspecified">Not specified</option>
                        <option value="warm">Warm</option>
                        <option value="cool">Cool</option>
                        <option value="neutral">Neutral</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Description" hint="e.g. medium-deep with golden undertones, natural sheen, slightly deeper around the hairline.">
                    <textarea
                      className="textarea"
                      value={profile.skin.description}
                      onChange={(event) =>
                        setProfile({ ...profile, skin: { ...profile.skin, description: event.target.value, source: "user" } })
                      }
                    />
                  </Field>
                  <div className="row">
                    <Chip tone={profile.skin.source === "measured" ? "gold" : profile.skin.source === "user" ? "ok" : "warn"}>
                      source: {profile.skin.source}
                    </Chip>
                    {state.stats.analyzedPhotos > 0 && (
                      <span className="tiny muted">Measured values can be merged from Upload References.</span>
                    )}
                  </div>
                </div>
              )}

              {tab === "marks" && (
                <div className="stack">
                  <Notice>
                    Only add marks you can actually see in the references: moles, freckles, dimples, scars, a chipped tooth, a
                    crooked smile line. Distinctive details are what make a face recognisable.
                  </Notice>
                  {profile.marks.length === 0 && <Empty title="No distinctive marks recorded" body="Optional, but a small mole or asymmetry is often what makes a twin read as the same person." />}
                  {profile.marks.map((mark, index) => (
                    <div key={mark.id} className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr) auto", gap: 8, alignItems: "end" }}>
                      <Field label="What">
                        <input
                          className="input"
                          value={mark.label}
                          onChange={(event) => {
                            const marks = [...profile.marks];
                            marks[index] = { ...mark, label: event.target.value };
                            setProfile({ ...profile, marks });
                          }}
                        />
                      </Field>
                      <Field label="Where">
                        <input
                          className="input"
                          value={mark.location}
                          onChange={(event) => {
                            const marks = [...profile.marks];
                            marks[index] = { ...mark, location: event.target.value };
                            setProfile({ ...profile, marks });
                          }}
                        />
                      </Field>
                      <Field label="Note">
                        <input
                          className="input"
                          value={mark.note}
                          onChange={(event) => {
                            const marks = [...profile.marks];
                            marks[index] = { ...mark, note: event.target.value };
                            setProfile({ ...profile, marks });
                          }}
                        />
                      </Field>
                      <button
                        className="icon-btn"
                        aria-label="Remove mark"
                        onClick={() => setProfile({ ...profile, marks: profile.marks.filter((m) => m.id !== mark.id) })}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn ghost sm"
                    onClick={() =>
                      setProfile({
                        ...profile,
                        marks: [
                          ...profile.marks,
                          { id: crypto.randomUUID(), label: "", location: "", note: "" },
                        ],
                      })
                    }
                  >
                    <Icon name="plus" size={13} /> Add a mark
                  </button>
                </div>
              )}

              {tab === "lock" && (
                <div className="stack">
                  <Notice>
                    This is the authoritative text sent first in every generation prompt. Styles are appended after it and can
                    never rewrite it.
                  </Notice>
                  <div className="code-block">{lockText}</div>
                  <div className="row">
                    <CopyButton text={lockText} label="Copy identity lock" />
                    <button className="btn ghost sm" onClick={() => go("export")}>
                      Export full reference document
                    </button>
                  </div>
                  <Field label="Working notes" hint="Private notes about this draft. Included in version history, not in prompts.">
                    <textarea className="textarea" value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} />
                  </Field>
                </div>
              )}
            </div>

            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => go("uploads")}>
                Add references
              </button>
              <button className="btn primary" onClick={save} disabled={busy !== null}>
                Save draft
              </button>
            </div>
          </Card>
        </div>

        <div className="split">
          <Card
            title="Master reference photograph"
            subtitle="The single image the generators are anchored to. Changing it is explicit and never automatic."
          >
            {state.photos.length === 0 ? (
              <Empty
                title="No photographs yet"
                body="Upload a clear, straight-on front photograph to nominate a master reference."
                action={<button className="btn gold sm" onClick={() => go("uploads")}>Upload references</button>}
                icon="upload"
              />
            ) : (
              <div className="grid grid-thumbs">
                {state.photos.map((photo) => {
                  const isMaster = state.identity.masterPhotoId === photo.id;
                  return (
                    <div key={photo.id} className="photo-card">
                      <div
                        className="thumb"
                        style={{ outline: isMaster ? "2px solid var(--gold)" : "none", outlineOffset: 2 }}
                      >
                        <img src={photoUrl(photo.id)} alt={VIEW_LABELS[photo.view]} loading="lazy" />
                      </div>
                      <div className="meta">
                        <Chip tone={isMaster ? "gold" : ""}>{isMaster ? "master" : VIEW_LABELS[photo.view]}</Chip>
                      </div>
                      <button
                        className={`btn ${isMaster ? "ghost" : "sm"} sm`}
                        disabled={isMaster || busy !== null}
                        onClick={() => void markMaster(photo.id)}
                      >
                        {isMaster ? "Current master" : "Use as master"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Version history" subtitle="Approved masters are immutable. Restoring an older profile creates a new draft.">
            <div className="row" style={{ marginBottom: 12 }}>
              <input
                className="input sm"
                placeholder="Snapshot label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
              <button
                className="btn sm ghost"
                disabled={busy !== null}
                onClick={async () => {
                  const result = await run(
                    "Saving version",
                    () => api.createVersion(label.trim() || `Snapshot ${new Date().toLocaleDateString()}`, draftNotes),
                    "Version snapshot saved",
                  );
                  if (result.ok) setLabel("");
                }}
              >
                Snapshot
              </button>
            </div>
            <div className="timeline">
              {state.versions.map((version) => {
                const isCurrentDraft = version.id === draft.id;
                return (
                  <div key={version.id} className={`tl-item ${version.status}`}>
                    <span className="tl-dot" />
                    <div className="tl-body">
                      <div className="row" style={{ gap: 7 }}>
                        <span style={{ fontSize: 12.5 }}>v{version.number}</span>
                        <Badge tone={version.status === "approved" ? "approved" : version.status === "draft" ? "draft" : version.status === "rejected" ? "rejected" : "pending"}>
                          {version.status}
                        </Badge>
                        {isCurrentDraft && <Chip tone="gold">editing</Chip>}
                      </div>
                      <div className="tiny muted">
                        {version.label} · {formatDate(version.createdAt)}
                        {version.approvedAt ? ` · approved ${formatDate(version.approvedAt)}` : ""}
                      </div>
                      {version.changeSummary && <div className="tiny muted">{version.changeSummary}</div>}
                      {!isCurrentDraft && (
                        <div className="row" style={{ gap: 5 }}>
                          <button
                            className="btn ghost sm"
                            disabled={busy !== null}
                            onClick={() => void run("Opening version", () => api.restoreVersion(version.id), `Restored the profile of v${version.number} as a new draft`)}
                          >
                            Restore as draft
                          </button>
                          {version.status === "draft" && (
                            <button className="btn ghost sm" onClick={() => void run("Rejecting draft", () => api.rejectVersion(version.id), "Draft rejected")}>
                              Reject
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

import React from "react";
import type { AppState, Generation, Photo } from "../../shared/types";
import { VIEW_LABELS } from "../../shared/types";
import { assetUrl, photoUrl } from "../api";
import { Badge, Chip, Icon, Notice, Spinner } from "./ui";
import { formatTime } from "../lib/util";

export interface ReferenceOption {
  id: string;
  label: string;
  detail: string;
  url: string;
  kind: "photo" | "generation";
}

/**
 * The face the studio is allowed to generate from.
 * Order of preference: explicitly approved master photograph → approved
 * generation → most recent front photograph. Nothing is ever invented.
 */
export function masterReference(state: AppState): ReferenceOption | null {
  const photoById = (id: string) => state.photos.find((p) => p.id === id) ?? null;
  if (state.identity.masterPhotoId) {
    const photo = photoById(state.identity.masterPhotoId);
    if (photo) {
      return {
        id: photo.id,
        label: "Approved master photograph",
        detail: `${VIEW_LABELS[photo.view]} · ${photo.originalName}`,
        url: photoUrl(photo.id),
        kind: "photo",
      };
    }
  }
  const approvedGeneration = state.generations.find((g) => g.status === "completed" && g.assetId && g.review === "approved");
  if (approvedGeneration) {
    return {
      id: approvedGeneration.id,
      label: "Approved portrait",
      detail: `${approvedGeneration.label} · approved`,
      url: assetUrl(approvedGeneration.assetId!),
      kind: "generation",
    };
  }
  const front = state.photos.find((p) => p.view === "front") ?? state.photos[0];
  if (front) {
    return {
      id: front.id,
      label: state.identity.masterPhotoId ? "Front photograph" : "Front photograph (unapproved)",
      detail: `${VIEW_LABELS[front.view]} · ${front.originalName}`,
      url: photoUrl(front.id),
      kind: "photo",
    };
  }
  return null;
}

export function referenceCandidates(state: AppState): ReferenceOption[] {
  const photos: ReferenceOption[] = state.photos.map((photo) => ({
    id: photo.id,
    label: `${VIEW_LABELS[photo.view]}${photo.expression ? ` · ${photo.expression}` : ""}`,
    detail: photo.originalName,
    url: photoUrl(photo.id),
    kind: "photo",
  }));
  const generations: ReferenceOption[] = state.generations
    .filter((g) => g.status === "completed" && g.assetId)
    .slice(0, 12)
    .map((g) => ({
      id: g.id,
      label: g.label,
      detail: g.review === "approved" ? "Approved portrait" : "Generated candidate",
      url: assetUrl(g.assetId!),
      kind: "generation",
    }));
  return [...photos, ...generations];
}

export function MasterAvatar({ state, showLabel = true }: { state: AppState; showLabel?: boolean }) {
  const reference = masterReference(state);
  return (
    <div className="avatar-master">
      {reference ? (
        <img src={reference.url} alt="Master identity reference" />
      ) : (
        <div className="placeholder">
          <div className="monogram">D</div>
          <div className="tiny" style={{ maxWidth: 160 }}>
            Upload a front-facing photograph to begin the identity
          </div>
        </div>
      )}
      {showLabel && reference && (
        <div className="stamp">
          <Icon name="lock" size={10} />
          {reference.kind === "photo" ? "Master reference" : "Approved portrait"}
        </div>
      )}
    </div>
  );
}

export function ReviewBadge({ generation }: { generation: Generation }) {
  if (generation.status === "failed") return <Badge tone="rejected">Failed</Badge>;
  if (generation.review === "approved") return <Badge tone="approved">Approved</Badge>;
  if (generation.review === "rejected") return <Badge tone="rejected">Rejected</Badge>;
  return <Badge tone="pending">Needs review</Badge>;
}

export function GenerationTile({
  generation,
  onReview,
  onDelete,
  onSave,
  compact = false,
}: {
  generation: Generation;
  onReview?: (generation: Generation) => void;
  onDelete?: (generation: Generation) => void;
  onSave?: (generation: Generation) => void;
  compact?: boolean;
}) {
  return (
    <div className="gallery-card">
      <div className="thumb">
        {generation.assetId ? (
          <img src={assetUrl(generation.assetId)} alt={generation.label} loading="lazy" />
        ) : (
          <div className="placeholder">
            <Icon name="warn" size={18} />
            <span className="tiny" style={{ maxWidth: 150 }}>
              {generation.error ?? "No image was produced"}
            </span>
          </div>
        )}
      </div>
      <div className="foot">
        <div className="row" style={{ gap: 6 }}>
          <ReviewBadge generation={generation} />
          {generation.provider && <Chip>{generation.provider}</Chip>}
        </div>
        <div className="title" title={generation.label}>
          {generation.label}
        </div>
        <div className="sub">
          {formatTime(generation.createdAt)}
          {generation.view ? ` · ${generation.view}` : ""}
        </div>
        {generation.error && <div className="tiny" style={{ color: "var(--danger)" }}>{generation.error}</div>}
        {!compact && (
          <div className="row" style={{ gap: 5, marginTop: 2 }}>
            {onReview && generation.assetId && (
              <button className="btn ghost sm" onClick={() => onReview(generation)}>
                Review
              </button>
            )}
            {onSave && generation.assetId && (
              <button className="btn ghost sm" onClick={() => onSave(generation)}>
                Save
              </button>
            )}
            {onDelete && (
              <button className="btn ghost sm" onClick={() => onDelete(generation)} title="Delete this generation">
                <Icon name="trash" size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function PhotoTile({
  photo,
  selected,
  onSelect,
  footer,
  badge,
}: {
  photo: Photo;
  selected?: boolean;
  onSelect?: () => void;
  footer?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="photo-card">
      <div
        className="thumb"
        onClick={onSelect}
        style={onSelect ? { cursor: "pointer", outline: selected ? "2px solid var(--gold)" : "none", outlineOffset: 2 } : undefined}
      >
        <img src={photoUrl(photo.id)} alt={`${VIEW_LABELS[photo.view]} reference`} loading="lazy" />
      </div>
      <div className="meta">
        <Chip tone={photo.analysis?.faceDetected ? "ok" : photo.analysis ? "warn" : ""}>
          {photo.analysis?.faceDetected ? "measured" : photo.analysis ? "no face" : "not analysed"}
        </Chip>
        <Chip>{VIEW_LABELS[photo.view]}</Chip>
        {badge}
      </div>
      <div className="filename" title={photo.originalName}>
        {photo.originalName}
      </div>
      {footer}
    </div>
  );
}

export function ProviderGate({ state, action = "generate images" }: { state: AppState; action?: string }) {
  const configured = state.providers.filter((p) => p.configured);
  if (configured.length) {
    return (
      <Chip tone="ok">
        <span className="dot" /> {configured.map((p) => p.name).join(" · ")} connected
      </Chip>
    );
  }
  return (
    <Notice tone="warn" title={`A provider key is needed to ${action}`}>
      The studio prepares the exact prompt and reference locally, but it will not display an image it did not generate.
      Add <code>FAL_KEY</code> or <code>OPENAI_API_KEY</code> to <code>.env</code>, then restart. Nothing is charged until
      you press Generate. See Settings for the verified models and their costs.
    </Notice>
  );
}

export function ModelPreviewFrame({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div style={{ position: "relative", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "#efe6d6", minHeight: 260 }}>
      {children}
      {label && (
        <div style={{ position: "absolute", left: 10, bottom: 10, padding: "3px 8px", borderRadius: 5, background: "rgba(23,21,15,0.8)", color: "#e0cba4", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          {label}
        </div>
      )}
    </div>
  );
}

export function InlineLoading({ label }: { label: string }) {
  return (
    <div className="row tiny muted" style={{ marginTop: 6 }}>
      <Spinner /> {label}
    </div>
  );
}

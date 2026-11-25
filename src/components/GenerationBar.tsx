import React, { useEffect, useMemo, useState } from "react";
import { useStudio } from "../store";
import { api } from "../api";
import type { AppState } from "../../shared/types";
import { Chip, Icon, Notice, Spinner } from "./ui";
import { masterReference, referenceCandidates } from "./pieces";
import { defaultModelFor, runGeneration } from "../lib/generate";

/**
 * The single generation control used by every studio. It refuses to run
 * without a key, without consent, or without a reference — and it always shows
 * which reference is about to leave the machine.
 */
export function GenerationBar({
  state,
  kind,
  appearance,
  hairstyle,
  viewKey,
  environmentId,
  extra,
  outfit,
  aspect = "square",
  buttonLabel = "Generate",
  useExtras = true,
}: {
  state: AppState;
  kind: string;
  appearance?: Record<string, number>;
  hairstyle?: unknown;
  viewKey?: string;
  environmentId?: string;
  extra?: string;
  outfit?: string;
  aspect?: "square" | "portrait" | "landscape";
  buttonLabel?: string;
  useExtras?: boolean;
}) {
  const { run } = useStudio();
  const choices = useMemo(
    () =>
      state.providers.filter((provider) =>
        provider.models.some((model) => model.supports.includes(kind as any)),
      ),
    [state.providers, kind],
  );
  const configured = choices.filter((p) => p.configured);
  const [providerId, setProviderId] = useState<string>(() => (configured[0] ?? choices[0])?.id ?? "fal");
  const provider = choices.find((p) => p.id === providerId) ?? choices[0];
  const models = provider?.models.filter((m) => m.supports.includes(kind as any)) ?? [];
  const [model, setModel] = useState<string>("");
  const [referenceChoice, setReferenceChoice] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!models.some((m) => m.id === model)) setModel(models[0]?.id ?? defaultModelFor((provider?.id as "fal" | "openai") ?? "fal"));
  }, [provider?.id, kind]);

  const candidates = referenceCandidates(state);
  const master = masterReference(state);
  const selectedReference = candidates.find((c) => c.id === referenceChoice) ?? master;

  const canGenerate = Boolean(provider?.configured) && state.settings.allowExternalReferenceUpload && Boolean(selectedReference) && !busy;

  const generate = async () => {
    setBusy(true);
    try {
      const extras =
        useExtras && provider?.id === "fal"
          ? state.photos
              .filter((p) => p.view === "front" || p.view === "neutral" || p.view === "smiling")
              .slice(0, 2)
              .map((p) => `/api/photos/${p.id}/file`)
              .filter((url) => url !== selectedReference?.url)
          : [];
      await run(
        "Generating",
        () =>
          runGeneration(state, {
            kind,
            provider: provider?.id as "fal" | "openai",
            model,
            referenceUrl: selectedReference?.url,
            extraReferenceUrls: extras,
            appearance,
            hairstyle,
            viewKey,
            environmentId,
            extra,
            outfit,
            aspect,
          }),
        "Generation complete — review it in the Facial Identity Lab",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!choices.length) {
    return <Notice tone="warn">No provider model is registered for this generation type.</Notice>;
  }

  return (
    <div className="stack-sm">
      <div className="row" style={{ gap: 8 }}>
        <select className="select sm" style={{ width: "auto" }} value={providerId} onChange={(event) => setProviderId(event.target.value as "fal" | "openai")} aria-label="Provider">
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.name}
              {choice.configured ? "" : ` (needs ${choice.envVar})`}
            </option>
          ))}
        </select>
        <select className="select sm" style={{ width: "auto" }} value={model} onChange={(event) => setModel(event.target.value)} aria-label="Model">
          {models.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="select sm"
          style={{ width: "auto", maxWidth: 220 }}
          value={selectedReference?.id ?? ""}
          onChange={(event) => setReferenceChoice(event.target.value)}
          aria-label="Reference photograph"
        >
          {!selectedReference && <option value="">No reference</option>}
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
      </div>

      {provider && (
        <div className="tiny muted">
          {provider.models.find((m) => m.id === model)?.note} · {provider.models.find((m) => m.id === model)?.costHint}
        </div>
      )}

      {!provider?.configured && (
        <Notice tone="warn" title={`${provider?.name ?? "The provider"} is not connected`}>
          Add <code>{provider?.envVar}</code> to <code>.env</code> and restart the studio. The prompt below is complete and
          ready to use the moment a key exists.
        </Notice>
      )}

      {provider?.configured && !state.settings.allowExternalReferenceUpload && (
        <Notice tone="warn" title="Reference upload is switched off">
          Generating sends a downscaled copy of your reference portrait to {provider.name}.{" "}
          <button
            className="btn link sm"
            onClick={() => void run("Enabling reference upload", () => api.saveSettings({ allowExternalReferenceUpload: true }), "Reference upload enabled")}
          >
            Enable it now
          </button>{" "}
          or manage it in Settings.
        </Notice>
      )}

      {!selectedReference && (
        <Notice tone="warn" title="No reference photograph">
          Upload a front photograph first — the studio will not generate a face it has not been given.
        </Notice>
      )}

      <div className="row">
        <button className="btn primary" onClick={() => void generate()} disabled={!canGenerate}>
          {busy ? <Spinner light /> : <Icon name="sparkle" size={14} />}
          {busy ? "Generating…" : buttonLabel}
        </button>
        {selectedReference && (
          <Chip tone="plum">
            <Icon name="lock" size={10} /> {selectedReference.label}
          </Chip>
        )}
        {useExtras && provider?.id === "fal" && state.photos.length > 1 && (
          <span className="tiny muted">up to 3 references are sent for a stronger identity lock</span>
        )}
      </div>
    </div>
  );
}

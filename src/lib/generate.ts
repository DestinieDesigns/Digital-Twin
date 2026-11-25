import { api } from "../api";
import type { AppState } from "../../shared/types";
import { masterReference } from "../components/pieces";
import { prepareReferenceDataUrl } from "./util";

export interface GenerateOptions {
  kind: string;
  provider?: "fal" | "openai";
  model?: string;
  referenceUrl?: string | null;
  extraReferenceUrls?: string[];
  viewKey?: string | null;
  environmentId?: string | null;
  hairstyle?: unknown;
  appearance?: Record<string, number>;
  outfit?: string;
  extra?: string;
  framing?: "portrait" | "halfBody" | "fullBody";
  aspect?: "square" | "portrait" | "landscape";
}

/**
 * Prepare reference images locally (downscaled JPEG), then call the server.
 * A full-resolution photograph is never handed to a provider.
 */
export async function runGeneration(state: AppState, options: GenerateOptions) {
  const primary = options.referenceUrl ?? masterReference(state)?.url ?? null;
  if (!primary) {
    throw new Error("No reference portrait is available. Upload a front photograph and nominate a master reference first.");
  }
  const prepared = await prepareReferenceDataUrl(primary, 1200);
  const extras: string[] = [];
  for (const url of (options.extraReferenceUrls ?? []).slice(0, 2)) {
    if (url === primary) continue;
    try {
      const extra = await prepareReferenceDataUrl(url, 1000);
      extras.push(extra.dataUrl);
    } catch {
      /* skip unreadable extra references rather than failing the request */
    }
  }
  return api.generate({
    kind: options.kind,
    provider: options.provider,
    model: options.model,
    viewKey: options.viewKey ?? undefined,
    environmentId: options.environmentId ?? undefined,
    hairstyle: options.hairstyle,
    appearance: options.appearance,
    outfit: options.outfit,
    extra: options.extra,
    framing: options.framing,
    aspect: options.aspect,
    reference: prepared.dataUrl,
    referenceSet: extras,
  });
}

export function defaultModelFor(provider: "fal" | "openai") {
  return provider === "fal" ? "fal-ai/flux-pulid" : "gpt-image-1";
}

export function providerChoices(state: AppState) {
  return state.providers.filter((p) => p.models.some((m) => m.supports.includes("portrait")));
}

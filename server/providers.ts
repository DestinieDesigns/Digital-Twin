/**
 * Real provider clients. Every endpoint below was verified against the
 * provider's published API schema; none of them are invented.
 *
 *   fal.ai queue API   POST https://queue.fal.run/{endpoint_id}
 *   fal.ai keys        https://fal.ai/dashboard/keys
 *   OpenAI-compatible  POST {OPENAI_BASE_URL}/images/edits
 *
 * Reference photographs are sent only when the caller has enabled external
 * reference upload in Settings, and only as base64 data URIs in that request.
 */

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export interface ProviderReference {
  mime: string;
  bytes: Uint8Array;
}

export interface ImageRequest {
  provider: "fal" | "openai";
  model: string;
  prompt: string;
  negative: string;
  references: ProviderReference[];
  aspect: "square" | "portrait" | "landscape";
  identityStrength: number;
}

export interface ImageResult {
  bytes: Uint8Array;
  mime: string;
  meta: Record<string, unknown>;
}

const dataUri = (ref: ProviderReference) =>
  `data:${ref.mime};base64,${Buffer.from(ref.bytes).toString("base64")}`;

function falKey() {
  const key = (Bun.env.FAL_KEY ?? "").trim();
  if (!key) throw new ProviderError("FAL_KEY is not set on the server. Add it to .env and restart the studio.", 412);
  return key;
}

export function openAiKey() {
  const key = (Bun.env.OPENAI_API_KEY ?? "").trim();
  if (!key) throw new ProviderError("OPENAI_API_KEY is not set on the server. Add it to .env and restart the studio.", 412);
  return key;
}

function falImageSize(aspect: ImageRequest["aspect"]) {
  return aspect === "portrait" ? "portrait_4_3" : aspect === "landscape" ? "landscape_4_3" : "square_hd";
}

function openAiSize(aspect: ImageRequest["aspect"]) {
  return aspect === "portrait" ? "1024x1536" : aspect === "landscape" ? "1536x1024" : "1024x1024";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Submit to the fal queue, poll until completion, return the parsed result. */
async function falRun(endpoint: string, input: Record<string, unknown>, timeoutMs = 240_000): Promise<any> {
  const key = falKey();
  const headers = { Authorization: `Key ${key}`, "content-type": "application/json" };

  const submit = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(60_000),
  }).catch((err) => {
    throw new ProviderError(`Could not reach fal.ai: ${err instanceof Error ? err.message : String(err)}`);
  });

  if (!submit.ok) {
    const text = await submit.text().catch(() => "");
    throw new ProviderError(`fal.ai rejected the request (${submit.status}): ${text.slice(0, 400)}`, submit.status === 401 || submit.status === 403 ? 401 : 502);
  }

  const job = (await submit.json()) as { request_id?: string; status_url?: string; response_url?: string };
  if (!job.status_url || !job.response_url) throw new ProviderError("fal.ai returned an unexpected queue response.");

  const deadline = Date.now() + timeoutMs;
  let lastStatus = "IN_QUEUE";
  while (Date.now() < deadline) {
    await sleep(1800);
    const poll = await fetch(job.status_url, { headers: { Authorization: `Key ${key}` }, signal: AbortSignal.timeout(30_000) });
    if (!poll.ok) {
      const text = await poll.text().catch(() => "");
      throw new ProviderError(`fal.ai status check failed (${poll.status}): ${text.slice(0, 300)}`);
    }
    const status = (await poll.json()) as { status?: string };
    lastStatus = status.status ?? lastStatus;
    if (lastStatus === "COMPLETED") {
      const result = await fetch(job.response_url, { headers: { Authorization: `Key ${key}` }, signal: AbortSignal.timeout(60_000) });
      if (!result.ok) {
        const text = await result.text().catch(() => "");
        throw new ProviderError(`fal.ai result download failed (${result.status}): ${text.slice(0, 300)}`);
      }
      return await result.json();
    }
    if (lastStatus === "FAILED" || lastStatus === "ERROR") {
      throw new ProviderError(`fal.ai reported a failed generation (${lastStatus}). Check your fal balance and model access.`);
    }
  }
  throw new ProviderError(`fal.ai did not finish within ${Math.round(timeoutMs / 1000)}s (last status: ${lastStatus}). The job may still complete and be billed.`);
}

async function download(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new ProviderError(`Could not download the generated file (${res.status}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, mime: res.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream" };
}

function pickFirstImage(output: any): { url?: string; b64?: string; mime?: string } {
  const images = output?.images ?? output?.data ?? output?.output;
  const first = Array.isArray(images) ? images[0] : images;
  if (first?.url) return { url: String(first.url).startsWith("http") ? first.url : `https://fal.media/${String(first.url).replace(/^\/+/, "")}`, mime: first.content_type };
  if (first?.b64_json) return { b64: first.b64_json, mime: first.content_type };
  return {};
}

/* ------------------------------------------------------------------ */
/* Image generation                                                    */
/* ------------------------------------------------------------------ */

export async function generateImage(req: ImageRequest): Promise<ImageResult> {
  if (!req.references.length) throw new ProviderError("A reference portrait is required for identity-preserving generation.", 400);

  if (req.provider === "openai") {
    const key = openAiKey();
    const base = (Bun.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const form = new FormData();
    form.append("model", req.model || "gpt-image-1");
    form.append("prompt", `${req.prompt}\n\nAvoid: ${req.negative}`);
    form.append("n", "1");
    form.append("size", openAiSize(req.aspect));
    req.references.slice(0, 4).forEach((ref, index) => {
      const copy = new Uint8Array(new ArrayBuffer(ref.bytes.byteLength));
      copy.set(ref.bytes);
      form.append("image[]", new Blob([copy], { type: ref.mime }), `reference-${index + 1}.${ref.mime.includes("png") ? "png" : "jpg"}`);
    });

    const res = await fetch(`${base}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(240_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderError(`Image provider rejected the edit request (${res.status}): ${text.slice(0, 400)}`, res.status === 401 ? 401 : 502);
    }

    const payload = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const first = payload.data?.[0];
    if (first?.b64_json) {
      return { bytes: new Uint8Array(Buffer.from(first.b64_json, "base64")), mime: "image/png", meta: { model: req.model } };
    }
    if (first?.url) {
      const file = await download(first.url);
      return { bytes: file.bytes, mime: file.mime, meta: { model: req.model } };
    }
    throw new ProviderError("The image provider returned no image data.");
  }

  const input: Record<string, unknown> = { prompt: req.prompt };
  if (req.model === "fal-ai/pulid") {
    input.reference_images = req.references.slice(0, 4).map((ref) => ({ image_url: dataUri(ref) }));
    input.negative_prompt = req.negative;
    input.image_size = falImageSize(req.aspect);
  } else if (req.model === "fal-ai/gpt-image-1/edit-image") {
    input.image_urls = req.references.slice(0, 4).map(dataUri);
    input.image_size = openAiSize(req.aspect);
    input.num_images = 1;
  } else {
    input.reference_image_url = dataUri(req.references[0]);
    input.image_size = falImageSize(req.aspect);
    input.negative_prompt = req.negative;
    input.id_weight = Math.max(0.4, Math.min(1, req.identityStrength / 100));
  }

  const output = await falRun(req.model, input);
  const picked = pickFirstImage(output);
  if (picked.b64) {
    return { bytes: new Uint8Array(Buffer.from(picked.b64, "base64")), mime: picked.mime ?? "image/png", meta: { model: req.model, raw: summarizeFal(output) } };
  }
  if (picked.url) {
    const file = await download(picked.url);
    return { bytes: file.bytes, mime: file.mime.startsWith("image/") ? file.mime : "image/png", meta: { model: req.model, raw: summarizeFal(output) } };
  }
  throw new ProviderError("fal.ai returned no images for this request.");
}

function summarizeFal(output: any) {
  return {
    seed: output?.seed ?? null,
    timings: output?.timings ?? null,
    hasNsfwConcepts: output?.has_nsfw_concepts ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Image → 3D                                                          */
/* ------------------------------------------------------------------ */

export async function generate3D(reference: ProviderReference): Promise<{ glb: Uint8Array; thumbnail: Uint8Array | null; meta: Record<string, unknown> }> {
  const endpoint = "fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d";
  const output = await falRun(
    endpoint,
    {
      input_image_url: dataUri(reference),
      enable_pbr: true,
    },
    600_000,
  );

  const glbUrl = output?.model_glb?.url ?? output?.model_mesh?.url ?? null;
  if (!glbUrl) {
    throw new ProviderError("The 3D model finished but no GLB file was returned. Check the provider output format.");
  }
  const glb = await download(glbUrl);
  let thumbnail: Uint8Array | null = null;
  if (output?.thumbnail?.url) {
    try {
      thumbnail = (await download(output.thumbnail.url)).bytes;
    } catch {
      thumbnail = null;
    }
  }
  return {
    glb: glb.bytes,
    thumbnail,
    meta: { endpoint, pbr: true, seed: output?.seed ?? null, thumbnailIncluded: Boolean(thumbnail) },
  };
}

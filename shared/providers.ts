/**
 * Provider capability registry.
 *
 * Only endpoints that were checked against live provider documentation are
 * listed here. Nothing in this file fabricates a result: an integration is
 * either configured (key present) and callable, or it is shown as a missing
 * dependency with the exact requirement.
 */
import type { IntegrationRequirement, ProviderStatus, Settings } from "./types";

export const PROVIDERS: ProviderStatus[] = [
  {
    id: "fal",
    name: "fal.ai",
    envVar: "FAL_KEY",
    configured: false,
    docsUrl: "https://fal.ai/dashboard/keys",
    purpose:
      "Identity-conditioned image generation, single-image 3D reconstruction and audio-driven lip sync. Billed per image, model or second of output by fal.",
    models: [
      {
        id: "fal-ai/flux-pulid",
        label: "FLUX PuLID — identity portrait",
        note: "Single reference photo, strong identity conditioning. Best for portraits, hairstyle previews and environment shots.",
        costHint: "≈ $0.033 per megapixel (1024×1024 ≈ $0.035)",
        supports: ["portrait", "appearance", "hairstyle", "environment", "turnaround"],
        requiresKey: "FAL_KEY",
      },
      {
        id: "fal-ai/pulid",
        label: "PuLID — multi-reference face",
        note: "Accepts up to four reference faces for a more stable identity across angles.",
        costHint: "Billed per generation by fal",
        supports: ["portrait", "appearance", "hairstyle", "turnaround"],
        requiresKey: "FAL_KEY",
      },
      {
        id: "fal-ai/gpt-image-1/edit-image",
        label: "GPT Image 1 — reference edit",
        note: "Multiple reference images, instruction-following edits. Good for turnaround views and restyling.",
        costHint: "Billed per image by fal",
        supports: ["portrait", "appearance", "hairstyle", "environment", "turnaround"],
        requiresKey: "FAL_KEY",
      },
      {
        id: "fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d",
        label: "Hunyuan 3D Rapid — image to GLB",
        note: "Produces a real GLB mesh from one front image. Geometry approximation, not a rigged character.",
        costHint: "Billed per 3D generation by fal",
        supports: ["model3d"],
        requiresKey: "FAL_KEY",
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI-compatible image API",
    envVar: "OPENAI_API_KEY",
    configured: false,
    docsUrl: "https://platform.openai.com/docs/guides/image-generation",
    purpose:
      "Image edits with reference photos through the /images/edits endpoint. Works with OpenAI or any compatible gateway you configure with OPENAI_BASE_URL.",
    models: [
      {
        id: "gpt-image-1",
        label: "gpt-image-1 — reference edit",
        note: "Sends your approved front portrait plus instruction to keep the face unchanged.",
        costHint: "Billed per image by your provider",
        supports: ["portrait", "appearance", "hairstyle", "environment", "turnaround"],
        requiresKey: "OPENAI_API_KEY",
      },
    ],
  },
];

export const INTEGRATIONS: IntegrationRequirement[] = [
  {
    id: "image-identity",
    area: "images",
    title: "Identity-preserving image generation",
    honestStatus:
      "Callable today with a key. Without a key the studio builds and previews prompts, but does not display any image it did not generate.",
    endpoint: "fal-ai/flux-pulid · fal-ai/pulid · OpenAI /images/edits",
    needs: "FAL_KEY or OPENAI_API_KEY",
    covered: false,
  },
  {
    id: "turnaround",
    area: "images",
    title: "Multi-angle turnaround views",
    honestStatus:
      "Each view is generated separately from the same identity lock. Nine views are separate reference images, not a 3D model.",
    endpoint: "Same image providers",
    needs: "A configured image provider",
    covered: false,
  },
  {
    id: "image-3d",
    area: "3d",
    title: "Image → 3D mesh reconstruction",
    honestStatus:
      "Real GLB output is possible from a single front image. Single-image reconstruction approximates unseen geometry, so hair and back-of-head detail will be invented by the model — treat the result as a base mesh to refine.",
    endpoint: "fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d",
    needs: "FAL_KEY",
    covered: false,
  },
  {
    id: "rigging",
    area: "3d",
    title: "Rigging, blendshapes and topology",
    honestStatus:
      "Not available in the browser. Automatic humanoid rigging exists as a paid service; production-grade facial topology and ARKit-style blendshapes still need a 3D artist or Blender/Unreal/Unity work.",
    endpoint: "fal-ai/meshy/rigging (basic humanoid rig)",
    needs: "FAL_KEY plus manual refinement in Blender",
    covered: false,
  },
  {
    id: "lipsync",
    area: "animation",
    title: "Audio-driven singing animation",
    honestStatus:
      "Singing-grade lip sync is not something this studio computes locally. Real options: Sync.so lipsync v3, MiniMax H3 Max lip sync, or LivePortrait expression transfer — all paid, and all produce video from an image plus audio.",
    endpoint: "fal-ai/sync-lipsync/v3 · minimax/h3-max/lip-sync/image-to-video · fal-ai/live-portrait",
    needs: "FAL_KEY and a performance-length audio file",
    covered: false,
  },
  {
    id: "voice",
    area: "voice",
    title: "Your real voice as the vocal identity",
    honestStatus:
      "Uploaded vocals are analysed locally (pitch, energy, vibrato). No synthetic voice is ever substituted — generated singing is only ever driven by your own recording.",
    endpoint: null,
    needs: "Nothing — local analysis",
    covered: true,
  },
  {
    id: "video-export",
    area: "animation",
    title: "Video render export",
    honestStatus:
      "The studio has no video renderer. Lip-sync output is produced by the animation provider and downloaded from there; composition and editing happen in your editor.",
    endpoint: null,
    needs: "A configured animation provider or an external editor",
    covered: false,
  },
];

export function providerStatuses(env: NodeJS.ProcessEnv): ProviderStatus[] {
  return PROVIDERS.map((p) => ({ ...p, configured: Boolean((env[p.envVar] ?? "").trim()) }));
}

export function integrationList(providers: ProviderStatus[]): IntegrationRequirement[] {
  const hasKey = providers.some((p) => p.configured);
  const hasFal = providers.find((p) => p.id === "fal")?.configured ?? false;
  return INTEGRATIONS.map((i) => ({
    ...i,
    covered: i.area === "voice" ? true : i.id === "rigging" || i.id === "lipsync" || i.id === "video-export" ? false : hasKey && (hasFal || i.area === "images"),
  }));
}

export const DEFAULT_SETTINGS: Settings = {
  allowExternalReferenceUpload: false,
  defaultIdentityStrength: 88,
  preferredImageProvider: "fal",
  defaultEnvironmentId: "photo-studio",
  requireReviewBeforeMaster: true,
  theme: "cream",
  studioName: "Destinie AI Twin Studio",
};

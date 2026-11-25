# Destinie AI Twin Studio

A local-first studio for building and maintaining a digital human of a specific person. It keeps an identity profile, reference photographs, versioned drafts with an explicit approval step, facial and movement measurements, speech and mannerism analysis, and a behaviour-learning module that mines consistent mannerisms from your own recordings.

Everything runs on your computer. There is no account, no cloud project and no hosted storage.

## What it does

- **Identity profile** — appearance, proportions, style and personality, edited through versioned drafts. A draft only becomes the master when you approve it; generations never silently overwrite it.
- **Reference photos** — private uploads with lighting/angle checks and readiness scoring.
- **Facial, movement and speech labs** — on-device measurement (MediaPipe vision and Web Audio) plus optional 3D model and audio imports.
- **Behaviour learning** — a training library of recordings; per-recording analysis of posture, gesture, speech and mannerisms; agreement-aware mining that labels patterns `consistent`, `mixed`, `single-observation` or `unverified`, with per-recording values, spread and timestamped exemplars. Only `consistent` patterns with at least two supporting recordings can be approved.
- **Profiles and exports** — identity documents and prompt packs generated from approved data.

Phase 1 is complete without any paid service. Image generation, 3D reconstruction and lip-sync need a provider key you add yourself, and nothing is charged until you press Generate.

## Privacy model

- All data lives in `./data` (SQLite database plus `uploads/`, `generated/`, `models/`, `audio/`, `media/`, `exports/`). Set `DESTINIE_DATA_DIR` to put it elsewhere.
- The API binds to `127.0.0.1` only, and `data/` is never served as static files. It is git-ignored, along with `.env`.
- Face, movement and audio analysis runs locally in the browser; the MediaPipe runtime is served from `public/mediapipe-wasm`, not a CDN.
- Reference photos are sent to a provider only when **Settings → reference upload consent** is on, and only inside a generation request you trigger. Provider keys stay server-side in `.env` and are never exposed to the browser.
- If a provider key is missing, the app says exactly which variable is missing instead of showing placeholder output. A result exists only if a provider returned one.

## Requirements

- [Bun](https://bun.sh) (runs the API, the dev launcher and the scripts)
- Node.js is not required

## Setup and run

```bash
bun install        # install dependencies
bun run setup      # copy the MediaPipe vision runtime into public/mediapipe-wasm
bun run dev        # API on http://127.0.0.1:8787, studio on http://127.0.0.1:5173
```

Open **http://127.0.0.1:5173**.

If `public/models/face_landmarker.task` is missing, facial measurement falls back to manual entry; everything else still works.

### Production build

```bash
bun run build      # runs setup, then builds the interface into dist/
bun run start      # serves the built interface and the API on http://127.0.0.1:8787
```

### Optional provider keys

Local features need no keys. To enable generation, copy the template and fill in only what you choose to use:

```bash
cp .env.example .env
```

- `FAL_KEY` — fal.ai, used for identity-preserving images, 3D and lip-sync
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` — alternative OpenAI-compatible image provider
- `DESTINIE_DATA_DIR` — private data location (default `./data`)
- `PORT` — API port (default `8787`)

Restart the server after changing `.env`.

## Checks

```bash
bun run typecheck
```

## Repository layout

| Path | Contents |
| --- | --- |
| `src/` | React studio interface |
| `server/` | Bun HTTP API, SQLite persistence, provider calls, exports |
| `shared/` | Types, identity maths, behaviour analysis and catalogs shared by both |
| `scripts/` | Dev launcher and MediaPipe asset setup |
| `public/` | Static assets, local models and the MediaPipe WASM runtime |

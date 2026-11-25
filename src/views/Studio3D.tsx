import React, { useEffect, useRef, useState } from "react";
import { api, modelUrl } from "../api";
import { useStudio } from "../store";
import { Card, Chip, Empty, Field, Icon, Notice, PageHead } from "../components/ui";
import { masterReference, ModelPreviewFrame } from "../components/pieces";
import { formatBytes, formatTime, prepareReferenceDataUrl } from "../lib/util";
import type { AppState, Generation, ModelAsset } from "../../shared/types";

interface ModelStats {
  meshes: number;
  vertices: number;
  triangles: number;
  bones: number;
}

export default function Studio3D({ go }: { go: (route: string) => void }) {
  const { state, run, busy } = useStudio();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState("");
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [lod, setLod] = useState("");
  const [rigged, setRigged] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!state) return;
    if (!state.models.some((m) => m.id === selectedId)) {
      setSelectedId(state.models[0]?.id ?? "");
    }
  }, [state?.models.length, selectedId]);

  if (!state) return null;

  const selected = state.models.find((m) => m.id === selectedId) ?? null;
  const fal = state.providers.find((p) => p.id === "fal");
  const reference = masterReference(state);
  const lastReconstruction = state.generations.find((g) => g.kind === "model3d");
  const canReconstruct = Boolean(fal?.configured) && state.settings.allowExternalReferenceUpload && Boolean(reference);
  const threeDIntegrations = state.integrations.filter((i) => i.area === "3d" || i.id === "video-export");

  const upload = async (file: File) => {
    await run(
      "Importing model",
      () =>
        api.uploadModel(file, {
          name: uploadName.trim() || file.name,
          notes: "",
          lod: lod.trim(),
          rigged,
        }),
      "Model imported",
    );
    setUploadName("");
    setLod("");
    setRigged(false);
  };

  const reconstruct = async () => {
    if (!reference) return;
    setGenerating(true);
    try {
      const prepared = await prepareReferenceDataUrl(reference.url, 1200);
      await run(
        "Reconstructing 3D geometry",
        () =>
          api.generate({
            kind: "model3d",
            provider: "fal",
            model: "fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d",
            reference: prepared.dataUrl,
            dryRun: false,
          }),
        "3D reconstruction finished — open the new model below",
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Realistic 3D digital human development"
        title="3D Character Studio"
        description="A real mesh viewer, real GLB imports and real single-image reconstruction. Reference images are never presented as a model."
        actions={
          <>
            <button className="btn ghost" onClick={() => inputRef.current?.click()}>
              <Icon name="plus" size={14} /> Import model
            </button>
            <button className="btn primary" onClick={() => void reconstruct()} disabled={!canReconstruct || busy !== null || generating}>
              {generating ? <span className="spinner light" /> : <Icon name="cube" size={14} />}
              Reconstruct from portrait
            </button>
          </>
        }
      />

      <div className="stack">
        <div className="grid grid-4">
          <StatusCard step="01 · 2D reference" label={state.photos.length ? `${state.photos.length} photographs` : "Not started"} done={state.photos.length > 0} body="Identity references and turnaround views. Images only." />
          <StatusCard step="02 · 3D model" label={state.models.length ? `${state.models.length} asset${state.models.length === 1 ? "" : "s"}` : "None"} done={state.models.length > 0} body="A GLB/GLTF/FBX/OBJ mesh with geometry and materials." />
          <StatusCard step="03 · Rigged" label={state.models.some((m) => m.rigged) ? "Rig marked" : "Not rigged"} done={state.models.some((m) => m.rigged)} body="A skeleton plus skin weights. Meshy rigging or Blender work." />
          <StatusCard step="04 · Animated human" label="Not built" done={false} body="Facial blendshapes and audio-driven performance. Requires a production pipeline." />
        </div>

        <div className="split">
          <Card
            title={selected ? selected.name : "Model viewer"}
            subtitle={selected ? `${selected.format.toUpperCase()} · ${formatBytes(selected.bytes)} · ${selected.source}` : "Import a GLB to inspect it here."}
            actions={
              selected && (
                <>
                  <a className="btn ghost sm" href={modelUrl(selected.id)} download>
                    <Icon name="export" size={12} /> Download
                  </a>
                  <button
                    className="btn ghost sm"
                    onClick={() => void run("Deleting model", () => api.deleteModel(selected.id), "Model deleted")}
                    disabled={busy !== null}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </>
              )
            }
          >
            {selected ? (
              selected.format === "glb" || selected.format === "gltf" ? (
                <ModelPreviewFrame label="Real mesh · orbit to inspect">
                  <ModelViewer
                    url={modelUrl(selected.id)}
                    onStats={(next) => setStats(next)}
                    onError={(message) => setLoadError(message)}
                  />
                </ModelPreviewFrame>
              ) : (
                <ModelPreviewFrame label={`${selected.format.toUpperCase()} import`}>
                  <div className="placeholder" style={{ minHeight: 300 }}>
                    <Icon name="cube" size={22} />
                    <div className="small" style={{ maxWidth: 320 }}>
                      {selected.format.toUpperCase()} is stored and exportable, but in-browser preview supports GLB/GLTF.
                      Open this file in Blender, then export GLB for preview.
                    </div>
                    <a className="btn sm ghost" href={modelUrl(selected.id)} download>
                      Download {selected.format.toUpperCase()}
                    </a>
                  </div>
                </ModelPreviewFrame>
              )
            ) : (
              <Empty
                title="No 3D models yet"
                body="Import a GLB you already made, or reconstruct a base mesh from your approved portrait."
                icon="cube"
                action={<button className="btn gold sm" onClick={() => inputRef.current?.click()}>Import a model</button>}
              />
            )}

            {loadError && <Notice tone="danger" title="This file could not be previewed">{loadError}</Notice>}

            {stats && selected && (
              <div className="grid grid-4" style={{ marginTop: 14 }}>
                <div className="stat"><div className="value" style={{ fontSize: 19 }}>{stats.meshes}</div><div className="label">Meshes</div></div>
                <div className="stat"><div className="value" style={{ fontSize: 19 }}>{stats.vertices.toLocaleString()}</div><div className="label">Vertices</div></div>
                <div className="stat"><div className="value" style={{ fontSize: 19 }}>{stats.triangles.toLocaleString()}</div><div className="label">Triangles</div></div>
                <div className="stat"><div className="value" style={{ fontSize: 19 }}>{stats.bones || "0"}</div><div className="label">Bones</div></div>
              </div>
            )}
            {selected && (
              <div className="row" style={{ marginTop: 14, gap: 10 }}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={selected.rigged}
                    onChange={(event) => void run("Updating model", () => api.patchModel(selected.id, { rigged: event.target.checked }))}
                  />
                  This asset is rigged (skeleton + weights)
                </label>
                <input
                  className="input sm"
                  style={{ maxWidth: 200 }}
                  placeholder="LOD / topology note"
                  defaultValue={selected.lod}
                  onBlur={(event) => event.target.value !== selected.lod && void run("Updating model", () => api.patchModel(selected.id, { lod: event.target.value }))}
                />
              </div>
            )}
            {selected && (
              <div className="hint" style={{ marginTop: 8 }}>
                Imported {formatTime(selected.createdAt)} · provider: {selected.provider}
              </div>
            )}
          </Card>

          <div className="stack">
            <Card title="Reconstruct a base mesh" subtitle="One front image becomes a real GLB mesh.">
              <div className="stack-sm">
                <Notice tone="info" icon="info">
                  Verified endpoint: <code>fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d</code>. Single-image reconstruction invents
                  the geometry it cannot see — the back of the head, ears and body will be approximations. Treat the result as a
                  starting mesh for an artist, not a finished digital human.
                </Notice>
                <div className="row-between">
                  <span className="tiny muted">Reference</span>
                  <Chip tone={reference ? "plum" : "warn"}>{reference?.label ?? "none"}</Chip>
                </div>
                <div className="row-between">
                  <span className="tiny muted">Provider key</span>
                  <Chip tone={fal?.configured ? "ok" : "warn"}>{fal?.configured ? "FAL_KEY connected" : "FAL_KEY missing"}</Chip>
                </div>
                <div className="row-between">
                  <span className="tiny muted">Reference consent</span>
                  <Chip tone={state.settings.allowExternalReferenceUpload ? "ok" : "warn"}>
                    {state.settings.allowExternalReferenceUpload ? "enabled" : "off"}
                  </Chip>
                </div>
                <button className="btn primary block" onClick={() => void reconstruct()} disabled={!canReconstruct || busy !== null || generating}>
                  {generating ? <span className="spinner light" /> : <Icon name="cube" size={13} />}
                  {generating ? "Reconstructing…" : "Generate GLB from approved portrait"}
                </button>
                {!fal?.configured && (
                  <button className="btn ghost sm block" onClick={() => go("settings")}>
                    Connect fal.ai in Settings
                  </button>
                )}
                {lastReconstruction && (
                  <div className="tiny muted">
                    Last attempt: {lastReconstruction.status} · {formatTime(lastReconstruction.createdAt)}
                    {lastReconstruction.error ? ` · ${lastReconstruction.error}` : ""}
                  </div>
                )}
              </div>
            </Card>

            <Card title="Import a model" subtitle="GLB, GLTF, FBX or OBJ up to 250 MB.">
              <div
                className="dropzone"
                style={{ padding: "20px 14px" }}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && inputRef.current?.click()}
              >
                <Icon name="upload" size={18} />
                <div className="small">Choose a model file</div>
                <div className="tiny muted">Validated by its actual header, stored privately</div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".glb,.gltf,.fbx,.obj,model/gltf-binary,model/gltf+json"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                    event.target.value = "";
                  }}
                />
              </div>
              <div className="stack-sm" style={{ marginTop: 10 }}>
                <input className="input sm" placeholder="Display name (optional)" value={uploadName} onChange={(event) => setUploadName(event.target.value)} />
                <input className="input sm" placeholder="LOD / topology note (optional)" value={lod} onChange={(event) => setLod(event.target.value)} />
                <label className="check">
                  <input type="checkbox" checked={rigged} onChange={(event) => setRigged(event.target.checked)} />
                  The imported asset already has a skeleton and weights
                </label>
              </div>
            </Card>
          </div>
        </div>

        <Card title="Asset library" subtitle="Everything stored, with honest labelling.">
          {state.models.length === 0 ? (
            <Empty title="No character assets" body="Import a model or reconstruct one from your approved portrait." icon="cube" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Format</th>
                  <th>Source</th>
                  <th>Size</th>
                  <th>State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.models.map((model) => (
                  <tr key={model.id}>
                    <td>{model.name}</td>
                    <td className="mono">{model.format.toUpperCase()}</td>
                    <td>{model.source === "generated" ? "reconstructed" : "imported"}</td>
                    <td>{formatBytes(model.bytes)}</td>
                    <td>
                      <Chip tone={model.rigged ? "ok" : ""}>{model.rigged ? "rigged" : model.format === "glb" ? "mesh only" : "mesh only"}</Chip>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 5, justifyContent: "flex-end" }}>
                        <button className="btn ghost sm" onClick={() => setSelectedId(model.id)}>View</button>
                        <a className="btn ghost sm" href={modelUrl(model.id)} download>Export</a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Pipeline requirements" subtitle="What a production-grade digital human needs beyond a mesh.">
          <div className="stack-sm">
            {threeDIntegrations.map((requirement) => (
              <div key={requirement.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "11px 13px", display: "grid", gap: 4 }}>
                <div className="row-between">
                  <span style={{ fontSize: 12.5 }}>{requirement.title}</span>
                  <Chip tone={requirement.covered ? "ok" : "warn"}>{requirement.covered ? "connected" : requirement.needs}</Chip>
                </div>
                <div className="tiny muted">{requirement.honestStatus}</div>
                {requirement.endpoint && <div className="mono tiny">{requirement.endpoint}</div>}
              </div>
            ))}
            <div className="hint">
              Export formats: GLB is produced and stored directly. GLTF, FBX and OBJ can be imported and exported. FBX from a
              generated mesh needs an external conversion step (Blender) — the studio will not mislabel a GLB as FBX.
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

function StatusCard({ step, label, body, done }: { step: string; label: string; body: string; done: boolean }) {
  return (
    <div className="card" style={{ padding: 14, background: done ? "#fbfdf8" : "#fffdf9" }}>
      <div className="row-between" style={{ marginBottom: 4 }}>
        <span className="tiny muted" style={{ letterSpacing: "0.12em" }}>{step}</span>
        <Chip tone={done ? "ok" : "warn"}>{done ? "ready" : "pending"}</Chip>
      </div>
      <div className="serif" style={{ fontSize: 17 }}>{label}</div>
      <div className="tiny muted" style={{ marginTop: 3 }}>{body}</div>
    </div>
  );
}

function ModelViewer({ url, onStats, onError }: { url: string; onStats: (stats: ModelStats | null) => void; onError: (message: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let renderer: any = null;
    let controls: any = null;
    let observer: ResizeObserver | null = null;
    const host = hostRef.current;
    if (!host) return;

    (async () => {
      try {
        setLoading(true);
        onError("");
        const THREE = await import("three");
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        if (disposed) return;

        const width = host.clientWidth || 640;
        const height = 420;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#efe6d6");
        const camera = new THREE.PerspectiveCamera(35, width / height, 0.01, 1000);
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(width, height);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        host.appendChild(renderer.domElement);

        scene.add(new THREE.HemisphereLight(0xfff6e6, 0x3b352c, 1.3));
        const key = new THREE.DirectionalLight(0xffffff, 2.1);
        key.position.set(2, 3, 3);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xffe2b0, 1.2);
        rim.position.set(-2.5, 1.4, -2);
        scene.add(rim);

        const gltf = await new GLTFLoader().loadAsync(url);
        if (disposed) return;
        const model = gltf.scene;
        scene.add(model);

        let meshes = 0;
        let vertices = 0;
        let triangles = 0;
        let bones = 0;
        model.traverse((object: any) => {
          if (object.isMesh) {
            meshes += 1;
            const geometry = object.geometry;
            const count = geometry?.attributes?.position?.count ?? 0;
            vertices += count;
            triangles += geometry?.index ? geometry.index.count / 3 : count / 3;
          }
          if (object.isSkinnedMesh && object.skeleton?.bones?.length) {
            bones = Math.max(bones, object.skeleton.bones.length);
          }
        });
        onStats({ meshes, vertices, triangles: Math.round(triangles), bones });

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        camera.position.set(0, maxDim * 0.05, maxDim * 1.85);
        camera.near = maxDim / 200;
        camera.far = maxDim * 40;
        camera.updateProjectionMatrix();

        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = maxDim * 0.6;
        controls.maxDistance = maxDim * 6;
        controls.update();

        const animate = () => {
          frame = requestAnimationFrame(animate);
          controls?.update();
          renderer?.render(scene, camera);
        };
        animate();
        setLoading(false);

        observer = new ResizeObserver(() => {
          const nextWidth = host.clientWidth || width;
          camera.aspect = nextWidth / height;
          camera.updateProjectionMatrix();
          renderer?.setSize(nextWidth, height);
        });
        observer.observe(host);
      } catch (err) {
        if (disposed) return;
        setLoading(false);
        onStats(null);
        onError(err instanceof Error ? err.message : "The GLB could not be loaded in the viewer.");
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      controls?.dispose();
      renderer?.dispose?.();
      const element = renderer?.domElement;
      if (element?.parentNode) element.parentNode.removeChild(element);
    };
  }, [url]);

  return (
    <div style={{ position: "relative", minHeight: 420 }}>
      <div ref={hostRef} style={{ width: "100%", minHeight: 420 }} />
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", gap: 10, background: "rgba(239,230,214,0.7)" }}>
          <span className="spinner" />
        </div>
      )}
    </div>
  );
}

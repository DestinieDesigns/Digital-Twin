import React, { useState } from "react";
import { api, assetUrl, audioUrl, modelUrl } from "../api";
import { useStudio } from "../store";
import { Card, Chip, CopyButton, Empty, Icon, Notice, PageHead } from "../components/ui";
import { formatBytes, formatTime } from "../lib/util";

export default function ExportCenter() {
  const { state, run, busy } = useStudio();
  const [lastExport, setLastExport] = useState<{ name: string; assetId: string; content: string } | null>(null);

  if (!state) return null;

  const generate = async (type: "markdown" | "json" | "prompts") => {
    const outcome = await run(
      "Building export",
      () => api.exportDocument(type),
      "Export generated and stored privately",
    );
    if (outcome.ok && outcome.data) {
      const data = outcome.data as { name: string; assetId: string; content: string };
      setLastExport(data);
    }
  };

  const generateBehaviour = async () => {
    const outcome = await run(
      "Building behaviour reference",
      () => api.exportBehavior("markdown"),
      "Behaviour reference generated and stored privately",
    );
    if (outcome.ok && outcome.data?.assetId) {
      setLastExport({
        name: outcome.data.name ?? "behaviour-reference.md",
        assetId: outcome.data.assetId,
        content: outcome.data.content ?? "",
      });
    }
  };

  const exportsList = state.exports;

  return (
    <>
      <PageHead
        eyebrow="Portability"
        title="Export Center"
        description="Take the identity with you. Documents, prompt packs and real assets — no lock-in, no hidden formats."
        actions={
          <Chip tone={state.masterVersion ? "ok" : "warn"}>
            {state.masterVersion ? `Master v${state.masterVersion.number}` : "Draft identity"}
          </Chip>
        }
      />

      <div className="stack">
        <Notice tone="info" icon="lock">
          Exports are written to <code>./data/exports</code> and downloaded through the local API. Documents contain a written
          description of the face, never the photographs themselves.
        </Notice>

        <div className="grid grid-3">
          <Card title="Identity reference document" subtitle="Markdown. The reusable profile for future workflows.">
            <div className="stack-sm">
              <div className="hint">
                Fourteen features with provenance, measured proportions, skin, signature hairstyle, appearance spec, identity
                lock, full prompt pack and reference inventory.
              </div>
              <button className="btn primary block" onClick={() => void generate("markdown")} disabled={busy !== null}>
                <Icon name="document" size={14} /> Generate document
              </button>
            </div>
          </Card>

          <Card title="Structured profile" subtitle="JSON. For your own tooling and future integrations.">
            <div className="stack-sm">
              <div className="hint">Identity, master version, draft profile and provider capability map in a machine-readable file.</div>
              <button className="btn block" onClick={() => void generate("json")} disabled={busy !== null}>
                <Icon name="document" size={14} /> Export JSON
              </button>
            </div>
          </Card>

          <Card title="Prompt pack" subtitle="Plain text. Every view, environment and hairstyle prompt.">
            <div className="stack-sm">
              <div className="hint">Portrait, nine turnaround views, twelve environments and four hairstyle variants, plus the negative prompt.</div>
              <button className="btn block" onClick={() => void generate("prompts")} disabled={busy !== null}>
                <Icon name="document" size={14} /> Export prompt pack
              </button>
            </div>
          </Card>

          <Card title="Behaviour reference" subtitle="Markdown. Approved mannerisms, speech measurements and segment index.">
            <div className="stack-sm">
              <div className="hint">
                A portable record of how you speak and move: approved patterns with their evidence, measured speech categories,
                approved segments and the honest assembly status.
              </div>
              <button className="btn block" onClick={() => void generateBehaviour()} disabled={busy !== null}>
                <Icon name="waveform" size={14} /> Export behaviour reference
              </button>
            </div>
          </Card>
        </div>

        {lastExport && (
          <Card
            title={lastExport.name}
            subtitle="Generated just now and stored privately."
            actions={
              <>
                <a className="btn gold sm" href={assetUrl(lastExport.assetId)} download>
                  <Icon name="export" size={12} /> Download
                </a>
                <CopyButton text={lastExport.content} label="Copy contents" />
              </>
            }
          >
            <div className="code-block" style={{ maxHeight: 320 }}>{lastExport.content.slice(0, 6000)}</div>
            {lastExport.content.length > 6000 && <div className="hint">Preview truncated — the downloaded file is complete.</div>}
          </Card>
        )}

        <Card title="Export history" subtitle="Every document generated on this machine.">
          {exportsList.length === 0 ? (
            <Empty title="No exports yet" body="Generate the identity document to start a portable record." icon="export" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Created</th>
                  <th>Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {exportsList.map((asset) => (
                  <tr key={asset.id}>
                    <td>{asset.originalName}</td>
                    <td className="tiny muted">{formatTime(asset.createdAt)}</td>
                    <td className="tiny">{formatBytes(asset.bytes)}</td>
                    <td style={{ textAlign: "right" }}>
                      <a className="btn ghost sm" href={assetUrl(asset.id)} download>
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="split">
          <Card title="Character assets" subtitle="Real files, downloadable now.">
            <div className="stack-sm">
              <div className="h3">3D models</div>
              {state.models.length === 0 ? (
                <div className="hint">No models yet. Import a GLB or reconstruct one in the 3D Character Studio.</div>
              ) : (
                state.models.map((model) => (
                  <div key={model.id} className="row-between" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 7 }}>
                    <div style={{ display: "grid", gap: 1 }}>
                      <span className="small">{model.name}</span>
                      <span className="tiny muted">
                        {model.format.toUpperCase()} · {formatBytes(model.bytes)} · {model.rigged ? "rigged" : "mesh only"}
                      </span>
                    </div>
                    <a className="btn ghost sm" href={modelUrl(model.id)} download>
                      Export
                    </a>
                  </div>
                ))
              )}
              <div className="h3" style={{ marginTop: 8 }}>Audio takes</div>
              {state.audio.length === 0 ? (
                <div className="hint">No audio uploaded.</div>
              ) : (
                state.audio.map((take) => (
                  <div key={take.id} className="row-between" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 7 }}>
                    <div style={{ display: "grid", gap: 1 }}>
                      <span className="small">{take.name}</span>
                      <span className="tiny muted">{take.kind} · {formatBytes(take.bytes)}</span>
                    </div>
                    <a className="btn ghost sm" href={audioUrl(take.id)} download>
                      Export
                    </a>
                  </div>
                ))
              )}
              <div className="h3" style={{ marginTop: 8 }}>Images</div>
              <div className="hint">
                Individual images download from the library. A bundled contact sheet is available from Character Turnaround →
                Reference sheet → Print sheet (print to PDF).
              </div>
            </div>
          </Card>

          <Card title="Format support" subtitle="What is genuinely available.">
            <table className="table">
              <thead>
                <tr>
                  <th>Format</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Identity document (.md)</td><td><Chip tone="ok">native</Chip></td></tr>
                <tr><td>Profile (.json)</td><td><Chip tone="ok">native</Chip></td></tr>
                <tr><td>Prompt pack (.txt)</td><td><Chip tone="ok">native</Chip></td></tr>
                <tr><td>Behaviour reference (.md)</td><td><Chip tone="ok">native</Chip></td></tr>
                <tr><td>Landmark timeline (.csv / .json)</td><td><Chip tone="ok">per recording</Chip></td></tr>
                <tr><td>Portraits / turnaround (.png)</td><td><Chip tone="ok">native</Chip></td></tr>
                <tr><td>3D model (.glb)</td><td><Chip tone="ok">native</Chip></td></tr>
                <tr><td>3D import (.gltf, .fbx, .obj)</td><td><Chip tone="ok">stored + exportable</Chip></td></tr>
                <tr><td>FBX conversion</td><td><Chip tone="warn">needs Blender</Chip></td></tr>
                <tr><td>Rigged / animated FBX</td><td><Chip tone="warn">external pipeline</Chip></td></tr>
                <tr><td>Video (MP4)</td><td><Chip tone="warn">no renderer</Chip></td></tr>
              </tbody>
            </table>
            <div className="hint" style={{ marginTop: 10 }}>
              This studio has no video renderer. Lip-sync video is produced by an animation provider and downloaded from that
              provider; the studio will not pretend to export a performance it did not render.
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

import React, { useState } from "react";
import { api } from "../api";
import { useStudio } from "../store";
import { Card, Chip, CopyButton, Field, Icon, Modal, Notice, PageHead } from "../components/ui";
import { ENVIRONMENTS } from "../../shared/catalog";
import { formatBytes, formatDate } from "../lib/util";
import { useTraining } from "../lib/training";

export default function SettingsView({ go }: { go: (route: string) => void }) {
  const { state, run, busy, refresh } = useStudio();
  const { training } = useTraining();
  const [confirmText, setConfirmText] = useState("");
  const [modal, setModal] = useState<null | "photos" | "generations" | "recordings" | "all">(null);
  const [studioName, setStudioName] = useState("");

  if (!state) return null;

  const settings = state.settings;

  return (
    <>
      <PageHead
        eyebrow="System"
        title="Settings"
        description="Provider keys, consent, privacy controls and the honest limits of this build."
        actions={
          <button className="btn ghost" onClick={() => void refresh()} disabled={busy !== null}>
            <Icon name="rotate" size={13} /> Recheck connection
          </button>
        }
      />

      <div className="stack">
        <Card title="Providers" subtitle="Keys are read server-side from .env. They are never stored in the browser or the database.">
          <div className="stack-sm">
            {state.providers.map((provider) => (
              <div key={provider.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 15, display: "grid", gap: 9 }}>
                <div className="row-between">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="serif" style={{ fontSize: 19 }}>{provider.name}</span>
                    <Chip tone={provider.configured ? "ok" : "warn"}>{provider.configured ? "connected" : "not configured"}</Chip>
                  </div>
                  <a className="link-out tiny" href={provider.docsUrl} target="_blank" rel="noreferrer">
                    Get a key
                  </a>
                </div>
                <div className="small muted">{provider.purpose}</div>
                <div className="row">
                  <span className="mono tiny">{provider.envVar}</span>
                  <CopyButton text={`${provider.envVar}=`} label="Copy name" className="btn ghost sm" />
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Used for</th>
                      <th>Cost note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provider.models.map((model) => (
                      <tr key={model.id}>
                        <td>
                          <div style={{ display: "grid", gap: 1 }}>
                            <span>{model.label}</span>
                            <span className="mono tiny muted">{model.id}</span>
                          </div>
                        </td>
                        <td className="tiny">{model.supports.join(", ")}</td>
                        <td className="tiny muted">{model.costHint}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <div className="stack-sm">
              <div className="h3">Add a key</div>
              <div className="code-block">
{`# .env in the project root, then restart the studio
FAL_KEY=your_fal_key_here
# optional alternative image provider
OPENAI_API_KEY=your_openai_key_here
OPENAI_BASE_URL=https://api.openai.com/v1`}
              </div>
              <div className="hint">
                Keep keys out of git — <code>.env</code> is ignored. Never paste a key into chat. Costs are charged by the
                provider per image, model or second; nothing is spent until you press Generate.
              </div>
            </div>
          </div>
        </Card>

        <div className="split">
          <div className="stack">
            <Card title="Generation safety" subtitle="Consent and defaults for every studio.">
              <div className="stack-sm">
                <label className="check" style={{ alignItems: "flex-start", padding: 12, border: "1px solid var(--line)", borderRadius: 10 }}>
                  <input
                    type="checkbox"
                    checked={settings.allowExternalReferenceUpload}
                    onChange={(event) =>
                      void run(
                        "Updating consent",
                        () => api.saveSettings({ allowExternalReferenceUpload: event.target.checked }),
                        event.target.checked ? "Reference upload enabled" : "Reference upload disabled",
                      )
                    }
                  />
                  <span>
                    <strong>Allow sending a downscaled reference portrait to a provider</strong>
                    <span className="tiny muted" style={{ display: "block", marginTop: 3 }}>
                      When off, generation requests are refused before any image leaves this machine. The studio never uploads
                      photos in the background, and analysis is always local.
                    </span>
                  </span>
                </label>

                <Field label="Default image provider">
                  <select
                    className="select"
                    value={settings.preferredImageProvider}
                    onChange={(event) =>
                      void run("Updating provider", () => api.saveSettings({ preferredImageProvider: event.target.value as "fal" | "openai" }), "Default provider updated")
                    }
                  >
                    {state.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Default identity strength" hint="Applied to new identity profiles. Existing profiles keep their own value until you change it in the Appearance Studio.">
                  <div className="row">
                    <input
                      type="range"
                      min={55}
                      max={100}
                      value={settings.defaultIdentityStrength}
                      onChange={(event) => void run("Updating default", () => api.saveSettings({ defaultIdentityStrength: Number(event.target.value) }))}
                    />
                    <span className="mono tiny">{settings.defaultIdentityStrength}</span>
                  </div>
                </Field>

                <Field label="Default environment">
                  <select
                    className="select"
                    value={settings.defaultEnvironmentId}
                    onChange={(event) => void run("Updating default", () => api.saveSettings({ defaultEnvironmentId: event.target.value }), "Default environment updated")}
                  >
                    {ENVIRONMENTS.map((env) => (
                      <option key={env.id} value={env.id}>
                        {env.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Studio name">
                  <div className="row">
                    <input
                      className="input"
                      defaultValue={settings.studioName}
                      onChange={(event) => setStudioName(event.target.value)}
                      placeholder="Destinie AI Twin Studio"
                    />
                    <button
                      className="btn sm"
                      disabled={!studioName.trim() || busy !== null}
                      onClick={() => void run("Saving studio name", () => api.saveSettings({ studioName: studioName.trim() }), "Studio name saved")}
                    >
                      Save
                    </button>
                  </div>
                </Field>

                <Notice tone="info" icon="lock">
                  Master replacement is always explicit. There is no setting that lets a generation or an analysis overwrite the
                  approved identity — approval is a separate action with a readiness check on the server.
                </Notice>
              </div>
            </Card>

            <Card title="Privacy & deletion" subtitle="Your photographs, your machine.">
              <div className="stack-sm">
                <dl className="kv">
                  <dt>Data directory</dt>
                  <dd className="mono tiny">{state.dataDir}</dd>
                  <dt>Stored size</dt>
                  <dd>{formatBytes(state.stats.storageBytes)}</dd>
                  <dt>Photographs</dt>
                  <dd>{state.stats.photos}</dd>
                  <dt>Generated images</dt>
                  <dd>{state.stats.generations}</dd>
                  <dt>Audio takes</dt>
                  <dd>{state.stats.audioTakes}</dd>
                  <dt>Training recordings</dt>
                  <dd>{training ? training.stats.recordings : "—"}</dd>
                  <dt>3D models</dt>
                  <dd>{state.stats.models}</dd>
                </dl>
                <div className="divider" />
                <button className="btn danger block" onClick={() => setModal("photos")} disabled={busy !== null}>
                  <Icon name="trash" size={13} /> Delete all reference photographs
                </button>
                <button className="btn danger block" onClick={() => setModal("generations")} disabled={busy !== null}>
                  <Icon name="trash" size={13} /> Delete all generated images
                </button>
                <button className="btn danger block" onClick={() => setModal("recordings")} disabled={busy !== null}>
                  <Icon name="trash" size={13} /> Delete all training recordings
                </button>
                <button className="btn danger block" onClick={() => setModal("all")} disabled={busy !== null}>
                  <Icon name="warn" size={13} /> Delete everything and start over
                </button>
                <div className="hint">
                  Deletion removes files from disk, not just database rows. Exports you already downloaded stay wherever you saved
                  them — the studio cannot reach those.
                </div>
              </div>
            </Card>
          </div>

          <div className="stack">
            <Card title="What is real in this build" subtitle="No inflated claims.">
              <div className="stack-sm small muted">
                {[
                  ["Uploads, private storage, deletion", true],
                  ["On-device facial measurement", true],
                  ["Identity profile + versioning + approval", true],
                  ["Hairstyle and appearance specification", true],
                  ["Prompt composition with identity lock", true],
                  ["Identity-locked image generation", state.providers.some((p) => p.configured)],
                  ["GLB import and 3D viewing", true],
                  ["Image → GLB reconstruction", state.providers.find((p) => p.id === "fal")?.configured ?? false],
                  ["Rigging and blendshapes", false],
                  ["Singing lip-sync video", false],
                  ["Video editing / export", false],
                  ["On-device face + pose + speech analysis", true],
                  ["Reference segments and mannerism review", true],
                  ["Motion retargeting onto your 3D character", false],
                  ["Trained behaviour or voice model", false],
                ].map(([label, ready]) => (
                  <div className="row" key={String(label)} style={{ gap: 8 }}>
                    <span style={{ color: ready ? "var(--sage)" : "var(--muted-soft)" }}>
                      <Icon name={ready ? "check" : "close"} size={12} />
                    </span>
                    <span style={{ color: ready ? "var(--ink)" : "var(--muted)" }}>{label}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Provider requirements" subtitle="What each advanced stage still needs.">
              <div className="stack-sm">
                {state.integrations.map((integration) => (
                  <div key={integration.id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8, display: "grid", gap: 3 }}>
                    <div className="row-between">
                      <span className="small">{integration.title}</span>
                      <Chip tone={integration.covered ? "ok" : "warn"}>{integration.covered ? "works locally" : integration.needs}</Chip>
                    </div>
                    <span className="tiny muted">{integration.honestStatus}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Project" subtitle="Identity foundation details.">
              <div className="stack-sm">
                <dl className="kv">
                  <dt>Identity</dt>
                  <dd>{state.identity.name}</dd>
                  <dt>Created</dt>
                  <dd>{formatDate(state.identity.createdAt)}</dd>
                  <dt>Versions</dt>
                  <dd>{state.versions.length}</dd>
                  <dt>Master</dt>
                  <dd>{state.masterVersion ? `v${state.masterVersion.number}` : "not approved"}</dd>
                </dl>
                <button className="btn ghost sm" onClick={() => go("export")}>
                  Export the identity record
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Modal
        open={modal !== null}
        title={
          modal === "all"
            ? "Delete everything"
            : modal === "photos"
              ? "Delete all photographs"
              : modal === "recordings"
                ? "Delete all training recordings"
                : "Delete all generated images"
        }
        onClose={() => {
          setModal(null);
          setConfirmText("");
        }}
        footer={
          <>
            <button
              className="btn ghost"
              onClick={() => {
                setModal(null);
                setConfirmText("");
              }}
            >
              Cancel
            </button>
            <button
              className="btn danger"
              disabled={busy !== null || (modal === "all" && confirmText !== "DELETE EVERYTHING")}
              onClick={async () => {
                if (modal === "photos") {
                  await run("Deleting photographs", () => api.deleteAllPhotos(), "All reference photographs deleted from disk");
                  setModal(null);
                } else if (modal === "generations") {
                  await run("Deleting generations", () => api.deleteAllGenerations(), "All generated images deleted from disk");
                  setModal(null);
                } else if (modal === "recordings") {
                  await run("Deleting recordings", () => api.deleteAllRecordings(), "All training recordings and derived data deleted from disk");
                  setModal(null);
                } else {
                  await run("Deleting everything", () => api.deleteEverything(confirmText), "Project data deleted and the studio reset");
                  setModal(null);
                  setConfirmText("");
                }
              }}
            >
              {modal === "all" ? "Delete everything" : "Delete"}
            </button>
          </>
        }
      >
        {modal === "photos" && (
          <p className="small">
            This removes every reference photograph and clears the master reference. The written identity profile and its
            measurements stay, but it can no longer be verified against photographs.
          </p>
        )}
        {modal === "generations" && (
          <p className="small">This removes every generated image and its history. Approved portraits and appearance studies are included.</p>
        )}
        {modal === "recordings" && (
          <div className="stack-sm">
            <p className="small">
              This removes every uploaded training recording, its extracted landmarks and speech measurements, all reference
              segments, and every proposed mannerism. Behaviour profile versions remain as written history but lose their
              evidence links.
            </p>
            <Notice tone="warn" title="Extracted data goes too">
              Deleting only the video would leave a hidden copy of the measurements behind. Both are removed together.
            </Notice>
          </div>
        )}
        {modal === "all" && (
          <div className="stack-sm">
            <Notice tone="danger" title="This cannot be undone">
              The identity, versions, photographs, generations, 3D models, audio, training recordings and exports are deleted
              from this computer.
            </Notice>
            <Field label='Type "DELETE EVERYTHING" to confirm'>
              <input className="input" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="DELETE EVERYTHING" />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}

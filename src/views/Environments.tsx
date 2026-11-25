import React, { useEffect, useState } from "react";
import { assetUrl } from "../api";
import { useStudio } from "../store";
import { Card, Chip, Empty, Icon, Notice, PageHead } from "../components/ui";
import { GenerationBar } from "../components/GenerationBar";
import { GenerationTile, masterReference } from "../components/pieces";
import { ENVIRONMENTS, ENVIRONMENT_MAP } from "../../shared/catalog";
import { VIEW_LABELS } from "../../shared/types";

export default function Environments({ go }: { go: (route: string) => void }) {
  const { state } = useStudio();
  const [selectedId, setSelectedId] = useState<string>("photo-studio");
  const [outfit, setOutfit] = useState("");
  const [framing, setFraming] = useState<"portrait" | "halfBody" | "fullBody">("portrait");
  const [category, setCategory] = useState("All");

  useEffect(() => {
    if (state?.settings.defaultEnvironmentId) setSelectedId(state.settings.defaultEnvironmentId);
  }, [state?.settings.defaultEnvironmentId]);

  if (!state) return null;

  const environment = ENVIRONMENT_MAP[selectedId] ?? ENVIRONMENTS[0];
  const reference = masterReference(state);
  const environments = category === "All" ? ENVIRONMENTS : ENVIRONMENTS.filter((env) => env.category === category);
  const categories = ["All", ...Array.from(new Set(ENVIRONMENTS.map((env) => env.category)))];
  const generations = state.generations.filter((g) => g.kind === "environment" && g.status === "completed");

  return (
    <>
      <PageHead
        eyebrow="Future environment studio"
        title="Virtual Environments"
        description="The same face, a different world. Wardrobe and scene change freely — the identity lock does not."
        actions={
          <>
            <Chip tone={state.settings.allowExternalReferenceUpload ? "ok" : "warn"}>
              {state.settings.allowExternalReferenceUpload ? "reference consent on" : "reference consent off"}
            </Chip>
            <button className="btn ghost" onClick={() => go("appearance")}>
              Refine appearance
            </button>
          </>
        }
      />

      <div className="stack">
        <Notice tone="info" icon="info">
          The gradient frames below are <strong>style references</strong>, drawn by this interface — they are not generated
          images. A real environment render appears only after a provider returns it, and it is labelled as such in the library.
        </Notice>

        <div className="row" style={{ gap: 6 }}>
          {categories.map((item) => (
            <button key={item} className={`chip ${category === item ? "gold" : ""}`} onClick={() => setCategory(item)} style={{ cursor: "pointer" }}>
              {item}
            </button>
          ))}
        </div>

        <div className="grid grid-auto">
          {environments.map((env) => {
            const active = env.id === selectedId;
            return (
              <button
                key={env.id}
                onClick={() => setSelectedId(env.id)}
                style={{
                  textAlign: "left",
                  padding: 0,
                  border: `1px solid ${active ? "var(--gold)" : "var(--line)"}`,
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "#fffdf9",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    aspectRatio: "16 / 9",
                    background: `linear-gradient(135deg, ${env.palette[0]} 0%, ${env.palette[1]} 55%, ${env.palette[2]} 100%)`,
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-end",
                    padding: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "#f4ecdd",
                      background: "rgba(23,21,15,0.5)",
                      padding: "3px 7px",
                      borderRadius: 4,
                    }}
                  >
                    {env.sceneTag} · style frame
                  </span>
                  {active && (
                    <span style={{ position: "absolute", top: 9, right: 9, background: "#f6efe2", borderRadius: 20, padding: 4 }}>
                      <Icon name="check" size={11} />
                    </span>
                  )}
                </div>
                <div style={{ padding: "10px 12px 12px", display: "grid", gap: 3 }}>
                  <span style={{ fontSize: 12.5 }}>{env.name}</span>
                  <span className="tiny muted">{env.category} · {env.lighting}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="split">
          <Card
            title={environment.name}
            subtitle={environment.description}
            actions={<Chip tone="gold">{environment.sceneTag}</Chip>}
          >
            <div className="stack-sm">
              <div
                style={{
                  position: "relative",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "1px solid var(--line)",
                  aspectRatio: "4 / 5",
                  background: `linear-gradient(160deg, ${environment.palette[0]}, ${environment.palette[1]} 60%, ${environment.palette[2]})`,
                }}
              >
                {reference ? (
                  <img
                    src={reference.url}
                    alt="Identity reference in the style frame"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      opacity: 0.72,
                      mixBlendMode: "luminosity",
                      maskImage: "linear-gradient(to top, black 35%, rgba(0,0,0,0.35) 70%, transparent 100%)",
                      WebkitMaskImage: "linear-gradient(to top, black 35%, rgba(0,0,0,0.35) 70%, transparent 100%)",
                    }}
                  />
                ) : (
                  <div className="placeholder" style={{ background: "transparent", color: "#f4ecdd" }}>
                    <Icon name="eye" size={20} />
                    <span className="small">No reference photograph yet</span>
                  </div>
                )}
                <div style={{ position: "absolute", left: 12, bottom: 12, right: 12 }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(244,236,221,0.85)" }}>
                    Style frame · not a render
                  </div>
                  <div className="serif" style={{ fontSize: 20, color: "#f8f2e6" }}>{environment.sceneTag}</div>
                </div>
              </div>
              <div className="grid grid-2" style={{ gap: 10 }}>
                <div className="field">
                  <label className="label">Framing</label>
                  <select className="select sm" value={framing} onChange={(event) => setFraming(event.target.value as typeof framing)}>
                    <option value="portrait">Portrait · head and shoulders</option>
                    <option value="halfBody">Half body</option>
                    <option value="fullBody">Full body</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">Reference</label>
                  <select className="select sm" disabled>
                    <option>{reference?.label ?? "none"}</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="label">Wardrobe & accessories</label>
                <textarea
                  className="textarea"
                  style={{ minHeight: 58 }}
                  placeholder="e.g. charcoal tailored shirt, thin gold chain, no earrings — keep the face and hair unchanged"
                  value={outfit}
                  onChange={(event) => setOutfit(event.target.value)}
                />
                <div className="hint">Clothing is independent of facial identity and is stored with the scene, not the profile.</div>
              </div>
              <GenerationBar
                state={state}
                kind="environment"
                environmentId={environment.id}
                outfit={outfit}
                aspect={framing === "fullBody" ? "portrait" : "square"}
                buttonLabel={`Render in ${environment.sceneTag.toLowerCase()}`}
              />
              {reference && (
                <div className="tiny muted">
                  Reference: {reference.label} · {reference.kind === "photo" ? VIEW_LABELS.front : "approved portrait"}
                </div>
              )}
            </div>
          </Card>

          <div className="stack">
            <Card title="Scene library" subtitle="Renders created in these environments." actions={<Chip>{generations.length}</Chip>}>
              {generations.length ? (
                <div className="grid grid-2">
                  {generations.slice(0, 6).map((generation) => (
                    <GenerationTile key={generation.id} generation={generation} />
                  ))}
                </div>
              ) : (
                <Empty title="No environment renders yet" body="Choose a scene, set the wardrobe, then render once a provider is connected." icon="mountain" />
              )}
            </Card>

            <Card title="Independent styling" subtitle="How looks stay separate from identity.">
              <div className="stack-sm small muted">
                <div className="row" style={{ gap: 8 }}><Icon name="lock" size={13} /> Identity lock is emitted before the scene</div>
                <div className="row" style={{ gap: 8 }}><Icon name="hair" size={13} /> Hair comes from the signature hairstyle</div>
                <div className="row" style={{ gap: 8 }}><Icon name="sparkle" size={13} /> Makeup comes from the appearance spec</div>
                <div className="row" style={{ gap: 8 }}><Icon name="identity" size={13} /> Wardrobe is supplied per scene</div>
                <div className="hint" style={{ marginTop: 4 }}>
                  A different look for a different song never requires a different face. If a render drifts, reject it — do not
                  re-describe your features to compensate.
                </div>
              </div>
            </Card>
          </div>
        </div>

        <Card title="Scenes available" subtitle="Nine production settings plus three additional looks.">
          <div className="grid grid-3">
            {ENVIRONMENTS.map((env) => (
              <div key={env.id} style={{ display: "grid", gap: 4, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10 }}>
                <div className="row-between">
                  <span style={{ fontSize: 12.5 }}>{env.name}</span>
                  <Chip>{env.category}</Chip>
                </div>
                <span className="tiny muted">{env.lighting}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

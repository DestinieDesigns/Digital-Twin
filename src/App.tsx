import React, { useEffect, useState } from "react";
import { StudioProvider, useHashRoute, useStudio } from "./store";
import { Icon, Spinner } from "./components/ui";
import Dashboard from "./views/Dashboard";
import MyIdentity from "./views/MyIdentity";
import Uploads from "./views/Uploads";
import Appearance from "./views/Appearance";
import Hairstyle from "./views/Hairstyle";
import FacialLab from "./views/FacialLab";
import Turnaround from "./views/Turnaround";
import Studio3D from "./views/Studio3D";
import Voice from "./views/Voice";
import Environments from "./views/Environments";
import Creations from "./views/Creations";
import ExportCenter from "./views/ExportCenter";
import TrainingLibrary from "./views/TrainingLibrary";
import TrainingDashboard from "./views/TrainingDashboard";
import MovementLab from "./views/MovementLab";
import SpeechLab from "./views/SpeechLab";
import Mannerisms from "./views/Mannerisms";
import SettingsView from "./views/Settings";

const NAV = [
  {
    label: "Studio",
    items: [
      { key: "dashboard", label: "Dashboard", icon: "dashboard" },
      { key: "identity", label: "My Identity", icon: "identity" },
      { key: "uploads", label: "Upload References", icon: "upload" },
    ],
  },
  {
    label: "Create",
    items: [
      { key: "appearance", label: "Appearance Studio", icon: "sparkle" },
      { key: "hairstyle", label: "Hairstyle Studio", icon: "hair" },
      { key: "facial-lab", label: "Facial Identity Lab", icon: "scan" },
      { key: "turnaround", label: "Character Turnaround", icon: "rotate" },
      { key: "studio-3d", label: "3D Character Studio", icon: "cube" },
    ],
  },
  {
    label: "Perform",
    items: [
      { key: "voice", label: "Voice & Singing", icon: "voice" },
      { key: "environments", label: "Virtual Environments", icon: "mountain" },
    ],
  },
  {
    label: "Learn",
    items: [
      { key: "training-dashboard", label: "Training Dashboard", icon: "dashboard" },
      { key: "training-library", label: "Training Library", icon: "gallery" },
      { key: "movement-lab", label: "Movement & Video Lab", icon: "scan" },
      { key: "speech-lab", label: "Speech Learning", icon: "waveform" },
      { key: "mannerisms", label: "My Personal Mannerisms", icon: "identity" },
    ],
  },
  {
    label: "Library",
    items: [
      { key: "creations", label: "Saved Creations", icon: "gallery" },
      { key: "export", label: "Export Center", icon: "export" },
    ],
  },
  {
    label: "System",
    items: [{ key: "settings", label: "Settings", icon: "settings" }],
  },
];

const TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  identity: "My Identity",
  uploads: "Upload References",
  appearance: "Appearance Studio",
  hairstyle: "Hairstyle Studio",
  "facial-lab": "Facial Identity Lab",
  turnaround: "Character Turnaround",
  "studio-3d": "3D Character Studio",
  voice: "Voice & Singing Studio",
  environments: "Virtual Environments",
  creations: "Saved Creations",
  "training-dashboard": "Training Dashboard",
  "training-library": "My Digital Twin Training Library",
  "movement-lab": "Movement & Video Analysis Lab",
  "speech-lab": "Speech & Communication Learning",
  mannerisms: "My Personal Mannerisms",
  export: "Export Center",
  settings: "Settings",
};

type PageProps = { go: (route: string) => void };

const VIEWS: Record<string, React.ComponentType<PageProps>> = {
  dashboard: Dashboard,
  identity: MyIdentity,
  uploads: Uploads,
  appearance: Appearance,
  hairstyle: Hairstyle,
  "facial-lab": FacialLab,
  turnaround: Turnaround,
  "studio-3d": Studio3D,
  voice: Voice,
  environments: Environments,
  creations: Creations,
  "training-dashboard": TrainingDashboard,
  "training-library": TrainingLibrary,
  "movement-lab": MovementLab,
  "speech-lab": SpeechLab,
  mannerisms: Mannerisms,
  export: ExportCenter,
  settings: SettingsView,
};

export default function App() {
  return (
    <StudioProvider>
      <Shell />
    </StudioProvider>
  );
}

function Shell() {
  const { state, loading, fatal, refresh, toasts, dismissToast, busy } = useStudio();
  const [route, navigate] = useHashRoute();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [route]);

  useEffect(() => {
    document.title = `${TITLES[route] ?? "Studio"} · Destinie AI Twin Studio`;
  }, [route]);

  if (loading) {
    return (
      <div className="splash">
        <div className="inner">
          <div className="mark">DESTINIE</div>
          <div className="sub">AI Twin Studio</div>
          <Spinner />
        </div>
      </div>
    );
  }

  if (fatal || !state) {
    return (
      <div className="splash">
        <div className="inner" style={{ maxWidth: 520 }}>
          <div className="mark" style={{ fontSize: 30 }}>DESTINIE</div>
          <div className="sub">AI Twin Studio</div>
          <div className="notice danger" style={{ textAlign: "left" }}>
            <Icon name="warn" size={16} />
            <div className="body">
              <strong>The studio could not reach its local API.</strong>
              <div>{fatal ?? "Unknown connection error."}</div>
              <div className="small" style={{ marginTop: 6 }}>
                Start everything with <code>bun run dev</code> from the project folder. If only the interface is open,
                run <code>bun run dev:api</code> in another terminal.
              </div>
            </div>
          </div>
          <button className="btn primary" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const View = VIEWS[route] ?? Dashboard;
  const master = state.masterVersion;
  const identityLabel = master ? `Master v${master.number}` : "Master not approved";

  return (
    <div className="app">
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">DESTINIE</div>
          <div className="brand-sub">AI Twin Studio</div>
        </div>

        <div className="identity-chip">
          <div className="name">DESTINIE</div>
          <div className="meta">{identityLabel}</div>
        </div>

        <nav>
          {NAV.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`nav-item ${route === item.key ? "active" : ""}`}
                  onClick={() => navigate(item.key)}
                >
                  <Icon name={item.icon} className="nav-icon" />
                  <span>{item.label}</span>
                  {item.key === "uploads" && state.photos.length > 0 && <span className="nav-count">{state.photos.length}</span>}
                  {item.key === "creations" && state.generations.length > 0 && <span className="nav-count">{state.generations.length}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="privacy-note">
            <Icon name="lock" size={13} />
            <span>
              Local-first. Photographs are stored privately in <code>./data</code> and never published.
            </span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open navigation">
            <Icon name="menu" size={16} />
          </button>
          <div style={{ display: "grid", gap: 1 }}>
            <div className="crumb">Destinie AI Twin Studio</div>
            <div className="title">{TITLES[route] ?? "Dashboard"}</div>
          </div>
          <div className="topbar-right">
            {busy && (
              <span className="chip gold">
                <Spinner /> {busy}
              </span>
            )}
            <span className="status-dot" />
            <span className="chip">
              {state.readiness.approvedCount}/{state.readiness.totalCount} features
            </span>
          </div>
        </header>

        <main className="content">
          <View go={navigate} />
        </main>
      </div>

      <div className="toast-wrap">
        {toasts.map((toast) => (
          <div className={`toast ${toast.tone}`} key={toast.id} role="status">
            <Icon name={toast.tone === "error" ? "warn" : toast.tone === "ok" ? "check" : "info"} size={15} />
            <span>{toast.message}</span>
            <button onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Film,
  FolderOpen,
  LayoutGrid,
  LoaderCircle,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  ChartNoAxesCombined,
  SlidersHorizontal,
  TriangleAlert,
  Scissors,
} from "lucide-react";
import type {
  Dataset,
  Episode,
  Job,
  Promo,
  Review,
  Weights,
} from "../../backend/src/types";
import { defaultWeights, criteria } from "../../backend/src/types";
import "./style.css";
import "./mobile.css";
import PromoRow from "./components/PromoRow";
import EvaluationView from "./components/EvaluationView";
import Detail from "./components/Detail";
import { titles } from "./presentation";
import type { Result } from "./view-types";
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, options);
  const data = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(data.error?.message ?? "Request failed"), {
      status: r.status,
      job: data.job,
    });
  return data as T;
}
const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Kuku-Client": "local" },
  body: JSON.stringify(body),
});
type DatasetSummary = Omit<Dataset, "episodes"> & {
  episodeCount: number;
  episodeNumbers: number[];
};
type Health = {
  hosted?: boolean;
  preferredModel?: string;
  fallbackActive?: boolean;
  groqBudgets?: {
    model: string;
    used: number;
    limit: number;
    remaining: number;
    blocked: boolean;
    resetsAt: string;
  }[];
  groqBudget?: {
    model: string;
    used: number;
    limit: number;
    remaining: number;
    blocked: boolean;
    resetsAt: string;
  };
  providers: { gemini: boolean; groq: boolean };
  defaultModel: string;
  defaultProvider: "groq" | "gemini";
};
function App() {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]),
    [dsId, setDsId] = useState(
      () => localStorage.getItem("kuku.dataset") ?? "",
    ),
    [tab, setTab] = useState("library"),
    [health, setHealth] = useState<Health | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [loading, setLoading] = useState(true),
    [job, setJob] = useState<Job | null>(null),
    [selected, setSelected] = useState<Promo | null>(null),
    [episode, setEpisode] = useState<Episode | null>(null);
  const [search, setSearch] = useState(""),
    [epFilter, setEpFilter] = useState("all"),
    [reviewFilter, setReviewFilter] = useState("all"),
    [minScore, setMinScore] = useState(0),
    [maxDuration, setMaxDuration] = useState(60),
    [sort, setSort] = useState("rank"),
    [count, setCount] = useState(12),
    [filters, setFilters] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [downloadingRaw, setDownloadingRaw] = useState(false);
  const [mode, setMode] = useState<"offline" | "ai">("ai"),
    [provider, setProvider] = useState<"gemini" | "groq">("gemini"),
    [model, setModel] = useState("gemini-2.5-flash"),
    [limit, setLimit] = useState(1),
    [weights, setWeights] = useState<Weights>(defaultWeights),
    [uploading, setUploading] = useState(false),
    [starting, setStarting] = useState(false);
  const [evaluation, setEvaluation] = useState<{
    metrics: Record<string, unknown>;
    manifest: Record<string, unknown>;
    baseline: Promo[];
    failures: Record<string, unknown>[];
    reviews: Review[];
  } | null>(null);
  const dsRef = useRef(dsId),
    resultsRequest = useRef(0),
    exportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportOpen) return;
    const dismiss = (e: PointerEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExportOpen(false);
        exportRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [exportOpen]);
  const selectedBudget =
    health?.groqBudgets?.find((b) => b.model === model) ??
    (health?.groqBudget?.model === model ? health.groqBudget : undefined);
  const budgetBlocked = provider === "groq" && selectedBudget?.blocked;
  const ds = datasets.find((d) => d.id === dsId),
    query = `datasetId=${dsId}`;
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 4000);
  };
  function navigate(next: string) {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  function chooseDataset(id: string) {
    dsRef.current = id;
    setDsId(id);
    localStorage.setItem("kuku.dataset", id);
  }
  async function refreshDatasets() {
    const list = await api<DatasetSummary[]>("/api/datasets");
    setDatasets(list);
    setDsId((id) => (list.some((d) => d.id === id) ? id : (list[0]?.id ?? "")));
  }
  useEffect(() => {
    void Promise.all([
      refreshDatasets(),
      api<Health>("/api/health").then((h) => {
        setHealth(h);
        setModel(h.defaultModel);
        setProvider(h.defaultProvider);
      }),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const update = () => {
      void api<Health>("/api/health")
        .then(setHealth)
        .catch(() => {});
    };
    const timer = setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  async function refreshResults(target = dsRef.current) {
    if (!target) return;
    const request = ++resultsRequest.current;
    const r = await api<Result>(`/api/promos?datasetId=${target}`);
    const ev = r.manifest
      ? await api<NonNullable<typeof evaluation>>(
          `/api/evaluation?datasetId=${target}`,
        )
      : null;
    if (dsRef.current !== target || request !== resultsRequest.current) return;
    setResult(r);
    setEvaluation(ev);
  }
  useEffect(() => {
    dsRef.current = dsId;
    resultsRequest.current++;
    setResult(null);
    setEvaluation(null);
    setSelected(null);
    setError("");
    setEpFilter("all");
    setReviewFilter("all");
    setSearch("");
    setMinScore(0);
    setMaxDuration(60);
    setCount(12);
    setExportOpen(false);
    setJob((j) => (j?.datasetId === dsId ? j : null));
    if (!dsId) return;
    localStorage.setItem("kuku.dataset", dsId);
    void refreshResults(dsId).catch((e) => {
      if (dsRef.current === dsId) setError(e.message);
    });
    void api<Job | null>(`/api/analysis/active?datasetId=${dsId}`)
      .then((j) => {
        if (dsRef.current === dsId)
          setJob(
            (current) => j ?? (current?.datasetId === dsId ? current : null),
          );
      })
      .catch((e) => {
        if (dsRef.current === dsId) setError(e.message);
      });
  }, [dsId]);
  useEffect(() => {
    if (
      !job ||
      job.datasetId !== dsId ||
      !["queued", "running"].includes(job.status)
    )
      return;
    const target = dsId;
    let stopped = false,
      stepping = false,
      failures = 0,
      nextAttemptAt = 0;
    const interval = setInterval(() => {
      if (
        stepping ||
        Date.now() < nextAttemptAt ||
        (job.retryAt && Date.parse(job.retryAt) > Date.now())
      )
        return;
      stepping = true;
      void (
        health?.hosted
          ? api<Job>(`/api/analysis/${job.id}/step`, post({}))
          : api<Job>(`/api/analysis/${job.id}`)
      )
        .then((j) => {
          if (stopped || dsRef.current !== target) return;
          setJob(j);
          failures = 0;
          nextAttemptAt = 0;
          setError((e) => (e.startsWith("Connection interrupted.") ? "" : e));
          if (j.status === "running" && j.progress > 0)
            void refreshResults(target).catch((e) => setError(e.message));
          if (j.status === "complete") {
            void refreshResults(target).catch((e) => setError(e.message));
            notify("Analysis finished. Your shortlist is ready.");
          }
          if (j.status === "failed" || j.status === "interrupted")
            setError(j.error ?? "Analysis stopped. You can run it again.");
        })
        .catch(() => {
          if (!stopped && dsRef.current === target) {
            failures++;
            nextAttemptAt = Date.now() + Math.min(30000, 1500 * 2 ** failures);
            if (failures >= 3)
              setError(
                "Connection interrupted. Retrying automatically; saved progress will be restored.",
              );
          }
        })
        .finally(() => {
          stepping = false;
        });
    }, 1200);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [job?.id, job?.status, dsId, health?.hosted, job?.retryAt]);
  useEffect(() => {
    if (!selected) {
      setEpisode(null);
      return;
    }
    setEpisode(null);
    const controller = new AbortController();
    void api<Episode>(
      `/api/episodes/${selected.segments[0].episode}?${query}`,
      { signal: controller.signal },
    )
      .then(setEpisode)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [selected?.id, dsId]);
  async function upload(file: File) {
    if (uploading) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Choose a .zip archive with timestamped .txt screenplays.");
      return;
    }
    if (file.size > 15_000_000) {
      setError(
        "This ZIP exceeds the 15 MB upload limit. Please upload a smaller pack.",
      );
      return;
    }
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      type UploadResult = {
        id: string;
        job: Job | null;
        resultReady: boolean;
        reused: boolean;
      };
      let r: UploadResult;
      if (health?.hosted) {
        const pending = await api<{ uploadId: string; chunkSize: number }>(
          "/api/datasets/upload-url",
          post({ name: file.name, size: file.size }),
        );
        for (
          let start = 0, index = 0;
          start < file.size;
          start += pending.chunkSize, index++
        ) {
          await api(`/api/datasets/uploads/${pending.uploadId}/${index}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-Kuku-Client": "local",
            },
            body: file.slice(start, start + pending.chunkSize),
          });
        }
        r = await api<UploadResult>(
          "/api/datasets/upload-complete",
          post({ uploadId: pending.uploadId }),
        );
      } else
        r = await api<UploadResult>("/api/datasets/upload", {
          method: "POST",
          headers: { "X-Kuku-Client": "local" },
          body: form,
        });
      await refreshDatasets();
      chooseDataset(r.id);
      setJob(r.job);
      setMode("ai");
      setLimit(1);
      navigate("library");
      notify(
        r.reused
          ? "This pack is already analyzed. Showing saved results."
          : "ZIP imported. Creating a shortlist without AI calls.",
      );
      await refreshResults(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function start() {
    if (starting) return;
    setStarting(true);
    setError("");
    try {
      setHealth(await api<Health>("/api/health"));
      const j = await api<Job>(
        "/api/analysis/start",
        post({ datasetId: dsId, mode, provider, model, limit, weights }),
      );
      setJob(j);
      navigate("library");
      notify(
        mode === "offline"
          ? "Creating your shortlist locally. No API calls."
          : "AI analysis started. Cached results will be reused.",
      );
    } catch (e) {
      const err = e as Error & { job?: Job };
      if (err.job?.datasetId === dsId) {
        setJob(err.job);
        navigate("library");
        notify("This screenplay is already being analyzed. Showing progress.");
      } else setError(err.message);
    } finally {
      setStarting(false);
    }
  }
  async function resume() {
    if (!job || starting) return;
    setStarting(true);
    setError("");
    try {
      setJob(await api<Job>(`/api/analysis/${job.id}/resume`, post({})));
      notify("Resuming saved progress.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }
  const reviewed = new Set(result?.reviews.map((r) => r.promoId));
  const filtered = (result?.promos ?? [])
    .filter(
      (p) =>
        (epFilter === "all" || p.segments[0].episode === +epFilter) &&
        (reviewFilter === "all" ||
          (reviewFilter === "reviewed"
            ? reviewed.has(p.id)
            : !reviewed.has(p.id))) &&
        p.score >= minScore &&
        p.durationMs <= maxDuration * 1000 &&
        JSON.stringify([
          p.evaluation.reason,
          p.evaluation.evidence,
          p.segments[0].episode,
        ])
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "duration"
        ? a.durationMs - b.durationMs
        : sort === "episode"
          ? a.segments[0].episode - b.segments[0].episode
          : sort === "score"
            ? b.score - a.score
            : a.rank - b.rank,
    );
  const m = result?.metrics;
  async function downloadRaw() {
    if (!result?.runId || downloadingRaw) return;
    setDownloadingRaw(true);
    setExportOpen(false);
    setError("");
    try {
      const response = await fetch(
        `/api/export/raw-output.zip?datasetId=${dsId}&runId=${result.runId}`,
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.message ?? "Raw output download failed");
      }
      if (response.headers.get("content-type")?.includes("application/json")) {
        const { downloadUrl } = await response.json();
        window.location.assign(downloadUrl);
        notify("Private raw output download is ready.");
        return;
      }
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `kuku-raw-output-${result.runId}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      notify("Raw output ZIP downloaded. It contains private evidence.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloadingRaw(false);
    }
  }
  function exportFile(file: string) {
    window.location.assign(`/api/export/${file}?${query}`);
    setExportOpen(false);
  }
  function resetFilters() {
    setMinScore(0);
    setMaxDuration(60);
    setReviewFilter("all");
    setEpFilter("all");
    setSearch("");
    setCount(12);
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("library");
          }}
        >
          <span className="brandmark">k</span>
          <span>
            kuku<span className="branddot">.</span>
            <small>PROMO INTELLIGENCE</small>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          {[
            ["library", LayoutGrid, "Promo library"],
            ["evaluation", ChartNoAxesCombined, "Evaluation"],
            ["processing", FolderOpen, "Import & analyze"],
          ].map(([id, Icon, label]) => {
            const I = Icon as typeof LayoutGrid;
            return (
              <button
                key={String(id)}
                aria-label={String(label)}
                aria-current={tab === id ? "page" : undefined}
                className={tab === id ? "nav active" : "nav"}
                onClick={() => navigate(String(id))}
              >
                <I size={18} />
                <span>{String(label)}</span>
                {id === "library" && (
                  <span className="nav-count">
                    {result?.promos.length ?? 0}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <button onClick={() => navigate("processing")}>
            <Upload size={16} /> Import screenplay
          </button>
          <p>ZIP / timestamped .txt</p>
        </div>
        <div className="private">
          <span className="status-dot" />
          <span>
            {health?.hosted ? "Shared workspace" : "Local workspace"}
            <small>
              {health?.hosted
                ? "Shared workspace / no sign-in"
                : "Saved on this computer"}
            </small>
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <a
            className="mobile-brand"
            href="#"
            aria-label="Kuku promo library"
            onClick={(e) => {
              e.preventDefault();
              navigate("library");
            }}
          >
            <span className="mobile-brandmark">k</span>kuku
            <span className="branddot">.</span>
          </a>
          <div className="breadcrumbs">
            <span className="crumb">Workspace</span>
            <ChevronRight size={13} />
            <span>
              {tab === "library"
                ? "Promo library"
                : tab === "evaluation"
                  ? "Evaluation"
                  : "Import & analyze"}
            </span>
          </div>
          <div className="topright">
            <span className="status-dot" />
            {health?.hosted ? "Shared workspace" : "Local workspace"}
          </div>
        </header>
        <main>
          {error && (
            <div className="error" role="alert">
              <TriangleAlert size={17} />
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">SCREENPLAY / EDITORIAL</div>
              <h1>
                {tab === "library" ? (
                  <>
                    Promo <em>Library</em>
                  </>
                ) : tab === "evaluation" ? (
                  <>
                    Analysis <em>Report</em>
                  </>
                ) : (
                  <>
                    Import <em>& analyze</em>
                  </>
                )}
              </h1>
              <p>
                {tab === "library"
                  ? "Compare source cuts and build your shortlist."
                  : tab === "evaluation"
                    ? "Coverage, scoring and results that need attention."
                    : "Upload a ZIP of timestamped scripts to get started."}
              </p>
            </div>
            <div className="heading-actions">
              <div className="export-wrap" ref={exportRef}>
                <button
                  className="button"
                  disabled={!result?.runId || downloadingRaw}
                  aria-expanded={exportOpen}
                  aria-controls="export-options"
                  onClick={() => setExportOpen(!exportOpen)}
                >
                  {downloadingRaw ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Download size={16} />
                  )}{" "}
                  {downloadingRaw ? "Preparing ZIP..." : "Export"}{" "}
                  <ChevronDown size={13} />
                </button>
                {exportOpen && (
                  <div className="dropdown" id="export-options">
                    <button onClick={() => void downloadRaw()}>
                      <Download
                        size={13}
                        style={{ display: "inline", marginRight: 6 }}
                      />
                      Download raw output (.zip)
                    </button>
                    {[
                      "promos.csv",
                      "promos.json",
                      "evaluation.json",
                      "run_manifest.json",
                      "reviews.json",
                    ].map((f) => (
                      <button key={f} onClick={() => exportFile(f)}>
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {tab !== "processing" && (
                <button
                  className="button primary"
                  onClick={() => navigate("processing")}
                >
                  <Upload size={16} /> Import scripts
                </button>
              )}
            </div>
          </div>
          {loading ? (
            <div className="empty">
              <LoaderCircle className="spin" />
              Loading your workspace…
            </div>
          ) : (
            <>
              <section className="showbar">
                <div className="show-icon">
                  <Film size={22} />
                </div>
                <div className="show-text">
                  <div className="tiny-label">Selected screenplay</div>
                  <select
                    aria-label="Current screenplay"
                    value={dsId}
                    onChange={(e) => chooseDataset(e.target.value)}
                  >
                    {!datasets.length && (
                      <option value="">No screenplay loaded</option>
                    )}
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name.replace(/-scripts.*$/, "").replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="badge neutral">
                  {ds?.episodeCount ?? 0} episodes
                </span>
                <span className="show-divider" />
                <span className="badge success">
                  <ShieldCheck size={13} />
                  {ds ? "Parsed & traceable" : "Ready to import"}
                </span>
              </section>
              <section
                className="engine-status"
                aria-label="Analysis service status"
              >
                <div className="engine-identity">
                  <span
                    className={
                      "engine-dot " +
                      (health?.providers.groq && !health.groqBudget?.blocked
                        ? "ready"
                        : "")
                    }
                  />
                  <div>
                    <strong>
                      {health?.providers.groq ? "Groq AI" : "Local engine"}
                    </strong>
                    <span>
                      {job?.retryAt
                        ? "AI cooldown / progress saved"
                        : health?.groqBudget?.blocked
                          ? "Daily app budget reached"
                          : "Cache enabled"}
                    </span>
                  </div>
                </div>
                <div className="engine-budget">
                  <div>
                    <span>App token budget</span>
                    <strong>
                      {Math.round((health?.groqBudget?.remaining ?? 0) / 1000)}k{" "}
                      <small>remaining</small>
                    </strong>
                  </div>
                  <meter
                    min={0}
                    max={health?.groqBudget?.limit ?? 190000}
                    value={health?.groqBudget?.remaining ?? 0}
                    aria-label="Remaining app token budget"
                  />
                  <span className="budget-caption">
                    App estimate / Groq account limits also apply
                  </span>
                </div>
              </section>
              {job &&
                job.datasetId === dsId &&
                ["running", "queued"].includes(job.status) && (
                  <div className="job">
                    <LoaderCircle size={17} className="spin" />
                    <span>
                      {job.stage}
                      {job.retryAt && (
                        <small className="retry-time">
                          Next attempt after{" "}
                          {new Date(job.retryAt).toLocaleTimeString()}
                        </small>
                      )}
                    </span>
                    <progress
                      aria-label="Analysis progress"
                      value={job.progress}
                      max={1}
                    />
                    <span>{Math.round(job.progress * 100)}%</span>
                  </div>
                )}
              {job &&
                job.datasetId === dsId &&
                ["failed", "interrupted"].includes(job.status) && (
                  <div className="recovery-banner">
                    <TriangleAlert size={18} />
                    <div>
                      <strong>
                        Analysis paused. Your saved results are available.
                      </strong>
                      <p>
                        {job.error ?? "Resume from the last saved episode."}
                      </p>
                    </div>
                    {health?.hosted ? (
                      <button
                        className="button"
                        disabled={starting}
                        onClick={() => void resume()}
                      >
                        Resume analysis <ArrowRight size={15} />
                      </button>
                    ) : (
                      <button
                        className="button"
                        onClick={() => navigate("processing")}
                      >
                        Continue in processing
                      </button>
                    )}
                  </div>
                )}
              {health?.groqBudget?.blocked && (
                <div className="notice">
                  <TriangleAlert size={18} />
                  <div>
                    <strong>
                      {health.fallbackActive
                        ? "Groq AI is available using GPT-OSS 20B"
                        : "The preferred model has reached its local budget"}
                    </strong>
                    <p>
                      {health.fallbackActive
                        ? "GPT-OSS 120B is paused. The verified 20B fallback is selected for new AI runs; existing results keep their original model labels."
                        : "Saved results remain usable. AI availability is checked automatically every 30 seconds."}{" "}
                      Preferred-model local budget refresh:{" "}
                      {new Date(health.groqBudget.resetsAt).toLocaleString(
                        "en-IN",
                        {
                          timeZone: "Asia/Kolkata",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}{" "}
                      IST. Groq account limits still apply.
                    </p>
                  </div>
                </div>
              )}
              {result?.manifest?.status === "partial" && (
                <div className="notice">
                  <TriangleAlert size={18} />
                  <div>
                    <strong>AI analysis finished with limitations.</strong>
                    <p>
                      Showing saved results. Review coverage and failures in
                      Evaluation. Deterministic analysis is available without
                      API calls.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("evaluation")}
                  >
                    Open evaluation <ArrowRight size={15} />
                  </button>
                </div>
              )}
              {tab === "library" && (
                <>
                  <section className="stats">
                    {[
                      [
                        "Episodes analyzed",
                        (result?.manifest?.mode === "ai"
                          ? (m?.aiEpisodeSuccesses ?? m?.episodesAttempted)
                          : m?.episodesAttempted) ?? 0,
                        `${ds?.report.events.toLocaleString() ?? 0} timestamped events`,
                      ],
                      [
                        "Intervals discovered",
                        Number(m?.enumeratedCandidates ?? 0).toLocaleString(),
                        "20–60 seconds · real event boundaries",
                      ],
                      [
                        "Selected cuts",
                        result?.promos.length ?? 0,
                        result?.manifest?.mode === "ai"
                          ? "AI-scored · evidence validated"
                          : "Heuristic shortlist · needs editorial review",
                      ],
                      [
                        "Reviewed",
                        result?.reviews.length ?? 0,
                        `${(result?.promos.length ?? 0) - (result?.reviews.length ?? 0)} awaiting your judgment`,
                      ],
                    ].map(([label, value, note], index) => {
                      const StatIcon = [Film, Scissors, LayoutGrid, Check][
                        index
                      ];
                      return (
                        <div className="stat" key={String(label)}>
                          <StatIcon
                            className="stat-symbol"
                            size={24}
                            aria-hidden="true"
                          />
                          <div className="stat-label">{String(label)}</div>
                          <strong>{String(value)}</strong>
                          <small>{String(note)}</small>
                        </div>
                      );
                    })}
                  </section>
                  <div className="shortlist-controls">
                    <div className="section-heading">
                      <div>
                        <h2>
                          Shortlist{" "}
                          <span className="pill">{filtered.length}</span>
                        </h2>
                        <p>
                          Compare the opening, the ending and the exact source
                          range.
                        </p>
                      </div>
                      <span className="badge warm">
                        {result?.manifest?.mode === "ai"
                          ? "AI judgments · not calibrated"
                          : "Heuristic mode · AI evaluation pending"}
                      </span>
                    </div>
                    <div className="toolbar">
                      <div className="search">
                        <Search size={16} />
                        <input
                          aria-label="Search promos"
                          placeholder="Search dialogue, moments, or characters…"
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setCount(12);
                          }}
                        />
                      </div>

                      <label className="sort-control">
                        Sort by{" "}
                        <select
                          aria-label="Sort promos"
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="rank">Global rank</option>
                          <option value="score">Score</option>
                          <option value="episode">Episode</option>
                          <option value="duration">Duration</option>
                        </select>
                      </label>
                      <button
                        aria-expanded={filters}
                        aria-controls="shortlist-filters"
                        className={
                          "button filter-button " + (filters ? "pressed" : "")
                        }
                        onClick={() => setFilters(!filters)}
                      >
                        <SlidersHorizontal size={15} />
                        Filters
                      </button>
                    </div>
                  </div>
                  {filters && (
                    <div className="filter-row" id="shortlist-filters">
                      <select
                        aria-label="Filter episode"
                        value={epFilter}
                        onChange={(e) => {
                          setEpFilter(e.target.value);
                          setCount(12);
                        }}
                      >
                        <option value="all">All episodes</option>
                        {(ds?.episodeNumbers ?? []).map((n) => (
                          <option key={n} value={n}>
                            Episode {n}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Review status"
                        value={reviewFilter}
                        onChange={(e) => setReviewFilter(e.target.value)}
                      >
                        <option value="all">All review statuses</option>
                        <option value="unreviewed">Unreviewed</option>
                        <option value="reviewed">Reviewed</option>
                      </select>
                      <label>
                        Minimum score{" "}
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="0.5"
                          value={minScore}
                          onChange={(e) => setMinScore(+e.target.value)}
                        />
                        {minScore.toFixed(1)}
                      </label>
                      <label>
                        Maximum duration{" "}
                        <input
                          type="range"
                          min="20"
                          max="60"
                          value={maxDuration}
                          onChange={(e) => setMaxDuration(+e.target.value)}
                        />
                        {maxDuration}s
                      </label>
                      <button className="text-button" onClick={resetFilters}>
                        Reset filters
                      </button>
                    </div>
                  )}
                  <div className="list-meta">
                    <span>
                      Showing {Math.min(count, filtered.length)} of{" "}
                      {filtered.length} suggestions
                    </span>
                  </div>
                  <div className="ledger-heading" aria-hidden="true">
                    <span>#</span>
                    <span>Cut / editorial rationale</span>
                    <span>Source range</span>
                    <span>Duration</span>
                    <span>Score</span>
                    <span>Evidence</span>
                    <span>Review</span>
                    <span />
                  </div>
                  <section
                    className="promo-list"
                    aria-label="Ranked promo cuts"
                  >
                    {filtered.slice(0, count).map((p) => (
                      <PromoRow
                        key={p.id}
                        promo={p}
                        reviewed={reviewed.has(p.id)}
                        onOpen={() => setSelected(p)}
                      />
                    ))}
                  </section>
                  {!filtered.length && (
                    <div className="empty">
                      <Scissors size={28} />
                      <h3>
                        {job && ["queued", "running"].includes(job.status)
                          ? "Preparing your shortlist..."
                          : result?.manifest
                            ? "No matching suggestions"
                            : "Ready for your first analysis"}
                      </h3>
                      <p>
                        {job && ["queued", "running"].includes(job.status)
                          ? "Your results will appear here automatically."
                          : result?.manifest
                            ? "Try changing your filters. Clips need a complete 20-60 second interval."
                            : "Upload a screenplay ZIP to create your local shortlist automatically."}
                      </p>
                      <button
                        className="button"
                        onClick={() =>
                          result?.promos.length
                            ? resetFilters()
                            : navigate("processing")
                        }
                      >
                        {result?.promos.length
                          ? "Clear filters"
                          : "Import / analyze"}
                      </button>
                    </div>
                  )}
                  {filtered.length > count && (
                    <div className="load-more">
                      <button
                        className="button"
                        onClick={() => setCount(count + 12)}
                      >
                        Show 12 more suggestions <ChevronDown size={15} />
                      </button>
                    </div>
                  )}
                  <div className="footnote">
                    <FileText size={13} />
                    {health?.hosted
                      ? "Scripts, saved cuts and reviews are shared in this workspace."
                      : "Source files and reviews are saved on this computer."}
                  </div>
                </>
              )}
              {tab === "processing" && (
                <div className="processing-grid">
                  <section className="panel">
                    <div className="panel-title">
                      <span className="step-number">01</span>
                      <h2>Source files</h2>
                    </div>
                    <label
                      className="dropzone"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files[0])
                          void upload(e.dataTransfer.files[0]);
                      }}
                    >
                      <div className="upload-circle">
                        {uploading ? (
                          <LoaderCircle className="spin" />
                        ) : (
                          <FolderOpen size={29} />
                        )}
                      </div>
                      <h3>
                        {uploading
                          ? "Parsing your pack…"
                          : "Drop your screenplay ZIP here"}
                      </h3>
                      <p>
                        Upload a ZIP of timestamped .txt screenplays. A local
                        shortlist is created automatically.
                      </p>
                      <span className="button">
                        Choose screenplay ZIP <ArrowUpRight size={15} />
                      </span>
                      <small>15 MB compressed · 30 MB expanded</small>
                      <input
                        aria-label="Upload screenplay ZIP"
                        type="file"
                        accept=".zip,application/zip,application/x-zip-compressed"
                        disabled={uploading}
                        onChange={(e) => {
                          if (e.target.files?.[0])
                            void upload(e.target.files[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {ds && (
                      <div className="parse-summary">
                        <h3>Parsing report</h3>
                        <dl>
                          <dt>Files discovered / parsed</dt>
                          <dd>
                            {ds.report.discovered} / {ds.report.parsed}
                          </dd>
                          <dt>Scenes / timed events</dt>
                          <dd>
                            {ds.report.scenes} /{" "}
                            {ds.report.events.toLocaleString()}
                          </dd>
                          <dt>Legitimate overlapping pairs</dt>
                          <dd>{ds.report.overlapPairs.toLocaleString()}</dd>
                          <dt>Invalid timed records</dt>
                          <dd>{ds.report.invalidRecords}</dd>
                          <dt>Warnings / files to inspect</dt>
                          <dd>
                            {ds.report.warnings.length} /{" "}
                            {ds.report.manualReviewFiles.length}
                          </dd>
                        </dl>
                        {ds.report.warnings.map((w, i) => (
                          <p className="warning-text" key={i}>
                            {w.code}: {w.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </section>
                  <section className="panel">
                    <div className="panel-title">
                      <span className="step-number">02</span>
                      <h2>Analysis settings</h2>
                    </div>
                    <label className="field">
                      Selection engine
                      <select
                        value={mode}
                        onChange={(e) => {
                          setMode(e.target.value as typeof mode);
                          setLimit(e.target.value === "ai" ? 1 : 6);
                        }}
                      >
                        <option value="offline">
                          Deterministic shortlist (no API)
                        </option>
                        <option value="ai">
                          AI evaluation + independent baseline
                        </option>
                      </select>
                    </label>
                    <p className="help">
                      {mode === "offline"
                        ? "Runs on all episodes. Lexical scores discover promising cuts; narrative quality remains unverified."
                        : "Evaluates real candidates, compares nearby cuts, and independently asks the same model to select baseline clips."}
                    </p>
                    {mode === "ai" && (
                      <>
                        <label className="field">
                          Provider
                          <select
                            value={provider}
                            onChange={(e) => {
                              const p = e.target.value as typeof provider;
                              setProvider(p);
                              setModel(
                                p === "groq"
                                  ? "openai/gpt-oss-120b"
                                  : "gemini-2.5-flash",
                              );
                            }}
                          >
                            <option value="gemini">Google Gemini</option>
                            <option value="groq">Groq</option>
                          </select>
                        </label>
                        <label className="field">
                          Model ID
                          <input
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                          />
                        </label>
                        {provider === "groq" &&
                          health?.fallbackActive &&
                          model === "openai/gpt-oss-20b" && (
                            <p className="help">
                              Free-tier fallback: GPT-OSS 20B. Connection
                              verified. Scores are recorded with this model ID;
                              this is not a paid-provider switch.
                            </p>
                          )}
                        <div
                          className={
                            "credential " +
                            (health?.providers[provider] ? "configured" : "")
                          }
                        >
                          <Settings2 size={15} />
                          {health?.providers[provider]
                            ? "Server credential configured"
                            : health?.hosted
                              ? "Key missing. Add it in Vercel environment settings and redeploy."
                              : "Key missing. Add it to .env and restart the backend."}
                        </div>
                      </>
                    )}
                    {mode === "ai" && budgetBlocked && (
                      <p className="credential">
                        The local daily token budget cannot fit another request.
                        Choose deterministic analysis for immediate results
                        without API calls.
                      </p>
                    )}
                    <label className="field">
                      Candidates per episode
                      <input
                        type="number"
                        min="1"
                        max={health?.hosted && mode === "ai" ? 1 : 20}
                        value={limit}
                        onChange={(e) =>
                          setLimit(
                            Math.max(
                              1,
                              Math.min(
                                health?.hosted && mode === "ai" ? 1 : 20,
                                Number(e.target.value) || 1,
                              ),
                            ),
                          )
                        }
                      />
                    </label>
                    <details className="weight-settings">
                      <summary>
                        Ranking weights <ChevronDown size={14} />
                      </summary>
                      <p className="help">
                        Weights are normalized. A diversity deduction of up to
                        0.30 affects display order; the raw score stays visible.
                      </p>
                      {criteria.map((k) => (
                        <label className="weight" key={k}>
                          {titles[k]}
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step=".05"
                            value={weights[k]}
                            onChange={(e) =>
                              setWeights({ ...weights, [k]: +e.target.value })
                            }
                          />
                        </label>
                      ))}
                    </details>
                    <button
                      className="button primary wide"
                      disabled={
                        !dsId ||
                        starting ||
                        uploading ||
                        (!!job &&
                          job.datasetId === dsId &&
                          ["running", "queued"].includes(job.status)) ||
                        (mode === "ai" &&
                          (!health?.providers[provider] || budgetBlocked))
                      }
                      onClick={() => void start()}
                    >
                      <Sparkles size={17} />
                      Run {mode === "ai" ? "AI" : "deterministic"} analysis
                      <ArrowRight size={16} />
                    </button>
                    <p className="help">
                      Settings and source hashes are saved with every run. Cuts
                      are continuous, 20-60 seconds.
                    </p>
                  </section>
                </div>
              )}
              {tab === "evaluation" && (
                <EvaluationView
                  data={evaluation}
                  result={result}
                  onOpen={setSelected}
                />
              )}
            </>
          )}
        </main>
        <footer>
          Kuku Promo Intelligence <span>Script analysis workspace</span>
          <span className="footer-right">KUKU / PROMO TOOLS</span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {selected && (
        <Detail
          promo={selected}
          episode={episode}
          review={result?.reviews.find((r) => r.promoId === selected.id)}
          onClose={() => setSelected(null)}
          onSave={async (body) => {
            const review = await api<Review>(
              `/api/promos/${selected.id}/review`,
              post({ ...body, datasetId: dsId, runId: result?.runId }),
            );
            setResult((r) =>
              r
                ? {
                    ...r,
                    reviews: [
                      ...r.reviews.filter((x) => x.promoId !== review.promoId),
                      review,
                    ],
                  }
                : r,
            );
            notify("Editorial review saved.");
          }}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

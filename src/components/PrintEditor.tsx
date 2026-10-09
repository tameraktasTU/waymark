import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  ArrowUpRight,
  Check,
  Download,
  FileCheck2,
  FileUp,
  Info,
  Layers3,
  LoaderCircle,
  Map,
  Maximize2,
  Mountain,
  Palette,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Type,
} from "lucide-react";
import PosterPreview from "./PosterPreview";
import InfoDialog from "./InfoDialog";
import FormatControls from "./FormatControls";
import { ColorFields, PalettePicker, TemplatePicker } from "./DesignControls";
import {
  ErrorNotice,
  FieldGroup,
  PrimaryButton,
  SectionHeading,
  SegmentedControl,
  SelectControl,
  StepButton,
  TextButton,
  TextField,
  Toggle,
} from "./StudioControls";
import { createDemoTrack, formatTrackStats, readGpxFile } from "../lib/gpx";
import {
  DEFAULT_SETTINGS,
  exportPixelDimensions,
  paperDimensions,
  shareDimensions,
} from "../lib/presets";
import type {
  MapView,
  PosterColors,
  PosterSettings,
  TimeBasis,
  Units,
} from "../lib/types";

type EditorTab = "route" | "design" | "details";
type ExportFormat = "pdf" | "png";

function initialProject() {
  const track = createDemoTrack();
  return {
    track,
    settings: {
      ...DEFAULT_SETTINGS,
      colors: { ...DEFAULT_SETTINGS.colors },
      ...formatTrackStats(track, "metric", DEFAULT_SETTINGS.timeBasis),
    },
  };
}

export default function PrintEditor() {
  const [project, setProject] = useState(initialProject);
  const { track, settings } = project;
  const [activeTab, setActiveTab] = useState<EditorTab>("route");
  const [isDemo, setIsDemo] = useState(true);
  const [fileName, setFileName] = useState("Lietzensee example.gpx");
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [errorSource, setErrorSource] = useState<"import" | "export">("import");
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [mapRetry, setMapRetry] = useState(0);
  const [fitRequest, setFitRequest] = useState(0);
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [dpi, setDpi] = useState<150 | 300>(300);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const infoDialog = useRef<HTMLDialogElement>(null);
  const mapView = useRef<MapView | undefined>(undefined);
  const importSequence = useRef(0);
  const dimensions = paperDimensions(settings);
  const { width: pixelWidth, height: pixelHeight } = exportPixelDimensions(
    settings,
    dpi,
  );
  const sharing = settings.outputMode === "share";
  const shareSize = shareDimensions(settings);
  const timingAvailable =
    (settings.timeBasis === "moving"
      ? track.movingSeconds
      : track.elapsedSeconds) !== undefined;

  const updateSettings = useCallback((patch: Partial<PosterSettings>) => {
    setProject((previous) => ({
      ...previous,
      settings: { ...previous.settings, ...patch },
    }));
    setDownloaded(false);
  }, []);

  const updateColor = (key: keyof PosterColors, value: string) => {
    setProject((previous) => ({
      ...previous,
      settings: {
        ...previous.settings,
        colors: { ...previous.settings.colors, [key]: value },
      },
    }));
    setDownloaded(false);
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    const sequence = ++importSequence.current;
    setImporting(true);
    setError("");
    setErrorSource("import");
    try {
      const nextTrack = await readGpxFile(file);
      if (sequence !== importSequence.current) return;
      setProject((previous) => ({
        track: nextTrack,
        settings: {
          ...previous.settings,
          ...formatTrackStats(
            nextTrack,
            previous.settings.units,
            previous.settings.timeBasis,
            previous.settings.paceLabel,
          ),
          title: nextTrack.name || file.name.replace(/\.gpx$/i, ""),
          location: "",
        },
      }));
      mapView.current = undefined;
      setIsDemo(false);
      setFileName(file.name);
      setFitRequest((value) => value + 1);
      setDownloaded(false);
    } catch (caught) {
      if (sequence === importSequence.current)
        setError(
          caught instanceof Error
            ? caught.message
            : "This file could not be opened. Please choose a valid GPX file.",
        );
    } finally {
      if (sequence === importSequence.current) setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const fileChanged = (event: ChangeEvent<HTMLInputElement>) =>
    void importFile(event.target.files?.[0]);
  const fileDropped = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 1) {
      setErrorSource("import");
      setError("Choose one GPX file at a time.");
      return;
    }
    void importFile(event.dataTransfer.files[0]);
  };

  const useExample = () => {
    ++importSequence.current;
    setProject(initialProject());
    setIsDemo(true);
    setFileName("Lietzensee example.gpx");
    setError("");
    setImporting(false);
    setDownloaded(false);
    mapView.current = undefined;
    setFitRequest((value) => value + 1);
  };

  const changeUnits = (units: Units) => {
    const { distance, duration, pace } = formatTrackStats(
      track,
      units,
      settings.timeBasis,
      settings.paceLabel,
    );
    updateSettings({ units, distance, duration, pace });
  };
  const changeStatistic = (paceLabel: PosterSettings["paceLabel"]) =>
    updateSettings({
      paceLabel,
      pace: formatTrackStats(
        track,
        settings.units,
        settings.timeBasis,
        paceLabel,
      ).pace,
    });
  const changeTimeBasis = (timeBasis: TimeBasis) => {
    if (timeBasis === settings.timeBasis) return;
    const { duration, pace } = formatTrackStats(
      track,
      settings.units,
      timeBasis,
      settings.paceLabel,
    );
    updateSettings({ timeBasis, duration, pace });
  };
  const viewChanged = useCallback((view: MapView) => {
    mapView.current = view;
  }, []);
  const statusChanged = useCallback(
    (status: "loading" | "ready" | "error") => setMapStatus(status),
    [],
  );

  const download = async () => {
    setError("");
    setErrorSource("export");
    setExporting(true);
    setDownloaded(false);
    setExportProgress(
      sharing ? "Preparing your image…" : "Preparing your print…",
    );
    try {
      const { exportPoster } = await import("../lib/export");
      await exportPoster({
        track,
        settings,
        view: mapView.current,
        format: sharing ? "png" : format,
        dpi,
        onProgress: setExportProgress,
      });
      setDownloaded(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : sharing
            ? "Your image could not be exported. Try again."
            : "Your print could not be exported. Try again at 150 DPI.",
      );
    } finally {
      setExporting(false);
      setExportProgress("");
    }
  };

  return (
    <>
      <a
        className="skip-link absolute top-2 left-3 z-100 translate-y-[-160%] rounded-lg border border-evergreen bg-white px-4 py-2.5 focus:translate-y-0"
        href="#print-studio"
      >
        Skip to the print studio
      </a>
      <header className="site-header border-b border-[#e6ebeb] bg-white">
        <div className="header-inner mx-auto flex min-h-25 max-w-7xl items-center justify-between gap-6 px-10 py-4 wide:max-w-345 tablet:px-6.25 mobile:gap-4 mobile:px-5 narrow:flex-col narrow:items-stretch narrow:gap-3 small:px-3.5">
          <a
            href="/"
            className="wordmark flex shrink-0 items-center gap-2.5 font-display text-[30px] font-semibold tracking-[-1.4px] no-underline mobile:gap-2 mobile:text-[27px] mobile:[&>img]:size-7.5 small:text-[25px] small:[&>img]:size-7"
            aria-label="Waymark home"
          >
            <img src="/favicon.svg" width="34" height="34" alt="" />
            <span>
              waymark<span className="wordmark-dot text-[#e3694b]">.</span>
            </span>
          </a>
          <div className="intro-copy min-w-0 text-right">
            <h1
              id="studio-title"
              className="m-0 font-display text-[clamp(18px,2vw,26px)] leading-[1.2] font-medium tracking-[-.65px] text-balance"
            >
              Every journey deserves a place on your wall.
            </h1>
            <p className="mt-1.5 text-control leading-normal text-muted">
              Turn your route into a print worth keeping.
            </p>
          </div>
        </div>
      </header>

      <main className="main-shell mx-auto max-w-7xl px-10 pt-6 wide:max-w-345 tablet:px-6.25 mobile:px-5 mobile:pt-5 small:px-3.5">
        <section
          id="print-studio"
          className="studio-grid grid grid-cols-[340px_minmax(0,1fr)] items-start gap-6.25 wide:grid-cols-[365px_minmax(0,1fr)] wide:gap-8 tablet:grid-cols-[310px_minmax(0,1fr)] tablet:gap-4.5 mobile:flex mobile:flex-col"
          aria-label="Print studio"
          aria-busy={exporting}
        >
          <div className="mobile-upload-bar hidden mobile:-order-2 mobile:flex mobile:w-full mobile:flex-wrap mobile:items-center mobile:justify-between mobile:gap-2.5 mobile:rounded-lg mobile:border mobile:border-[#e0e7e2] mobile:bg-white mobile:px-3 mobile:py-2.5 [&>div]:flex [&>div]:items-center [&>div]:gap-1.75 [&>div]:text-label [&>div]:text-[#517160]">
            <div>
              <FileUp size={18} />
              <span>
                {isDemo ? "Bring your own route" : "Your route is ready"}
              </span>
            </div>
            <PrimaryButton
              compact
              onClick={() => fileInput.current?.click()}
              disabled={importing || exporting}
            >
              {importing ? "Opening…" : isDemo ? "Choose GPX" : "Change file"}
            </PrimaryButton>
          </div>
          <aside className="editor-panel min-w-0 overflow-hidden rounded-xl border border-[#e1e7e7] bg-white mobile:w-full">
            <nav
              className="editor-tabs grid grid-cols-3 border-b border-[#e7ecea] px-3.75"
              aria-label="Editor sections"
            >
              {(
                [
                  { id: "route", label: "Route", icon: Route },
                  { id: "design", label: "Design", icon: Palette },
                  { id: "details", label: "Details", icon: Type },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className="editor-tab flex min-h-11 items-center justify-center gap-1.75 border-0 border-b-2 border-transparent bg-white pt-3.25 pb-2.75 text-control font-medium text-muted hover:text-evergreen aria-pressed:border-evergreen aria-pressed:text-evergreen"
                  aria-pressed={activeTab === id}
                  onClick={() => setActiveTab(id)}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            {error && errorSource === "import" && (
              <div className="editor-error px-4.5 pt-4">
                <ErrorNotice onDismiss={() => setError("")}>
                  {error}
                </ErrorNotice>
              </div>
            )}

            <div className="editor-body px-6 py-4 tablet:px-5 mobile:px-5.5 small:px-4.5">
              {activeTab === "route" && (
                <div className="tab-content flex flex-col gap-3">
                  <SectionHeading title="Start with your story">
                    Bring the route. We’ll make it a keepsake.
                  </SectionHeading>
                  <div
                    className="upload-zone flex flex-col items-center rounded-[9px] border-[1.5px] border-dashed border-[#b8d1c8] bg-[#f7faf8] px-3.75 pt-4 pb-3.5 transition-colors duration-150 data-[dragging=true]:border-evergreen data-[dragging=true]:bg-[#e4f3e9] [&>p]:mt-2 [&>p]:mb-1 [&>p]:text-label [&>p]:text-muted"
                    data-dragging={dragging}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node,
                        )
                      )
                        setDragging(false);
                    }}
                    onDrop={fileDropped}
                  >
                    <span className="upload-icon mb-3 grid size-10 place-items-center rounded-xl bg-[#e7f0e9] text-[#488772]">
                      {importing ? (
                        <LoaderCircle size={26} className="animate-spin" />
                      ) : (
                        <FileUp size={26} strokeWidth={1.5} />
                      )}
                    </span>
                    <PrimaryButton
                      className="upload-button"
                      onClick={() => fileInput.current?.click()}
                      disabled={importing || exporting}
                    >
                      {importing ? "Opening your route…" : "Choose GPX file"}
                      {!importing && <ArrowUpRight size={16} />}
                    </PrimaryButton>
                    <p>or drop your file here</p>
                    <span className="upload-limit text-caption text-[#657c72]">
                      .gpx files, up to 20 MB
                    </span>
                  </div>
                  <div className="local-note -mt-1.75 flex items-center justify-center gap-1.5 text-caption text-muted">
                    <ShieldCheck size={14} />
                    <span>Your file is read locally in your browser.</span>
                  </div>
                  <div className="loaded-route flex items-center gap-2.5 rounded-[7px] bg-[#f5f8f7] p-2.75">
                    <div className="loaded-route-icon flex text-[#4b7a67]">
                      <FileCheck2 size={20} />
                    </div>
                    <div className="loaded-route-name min-w-0 flex-1 [&>strong]:block [&>strong]:truncate [&>strong]:text-label [&>strong]:font-medium [&>span]:mt-1 [&>span]:block [&>span]:text-caption [&>span]:text-muted">
                      <strong title={fileName}>{fileName}</strong>
                      <span>
                        {isDemo
                          ? "Example route · try the controls"
                          : `${track.pointCount.toLocaleString()} GPS points · ready to design`}
                      </span>
                    </div>
                    <Check size={16} className="loaded-check text-[#3f8771]" />
                  </div>
                  <div className="route-summary -mt-1 grid grid-cols-2 [&>div]:grid [&>div]:grid-cols-[18px_1fr] [&>div]:gap-x-1.25 [&>div]:gap-y-1 [&>div]:py-1.75 [&>div+div]:border-l [&>div+div]:border-[#e3e9e5] [&>div+div]:pl-5 [&_svg]:self-center [&_svg]:text-[#81988c] [&_strong]:text-control [&_strong]:font-medium [&_span]:col-start-2 [&_span]:text-caption [&_span]:text-muted">
                    <div>
                      <Route size={16} />
                      <strong>
                        {formatTrackStats(track, settings.units).distance}
                      </strong>
                      <span>Distance</span>
                    </div>
                    <div>
                      <Mountain size={16} />
                      <strong>
                        {track.elevationGainM !== undefined
                          ? `${Math.round(track.elevationGainM * (settings.units === "imperial" ? 3.28084 : 1))} ${settings.units === "imperial" ? "ft" : "m"}`
                          : "—"}
                      </strong>
                      <span>Elevation gain</span>
                    </div>
                  </div>
                  <FieldGroup label="Measurement units">
                    <SegmentedControl<Units>
                      value={settings.units}
                      options={[
                        { value: "metric", label: "Kilometers" },
                        { value: "imperial", label: "Miles" },
                      ]}
                      onChange={changeUnits}
                    />
                  </FieldGroup>
                  <p className="small-help -mt-2 text-caption leading-[1.6] text-muted">
                    Change units before editing your statistics; switching units
                    restores the calculated values.
                  </p>
                  {!isDemo && (
                    <TextButton
                      className="example-button justify-center"
                      onClick={useExample}
                    >
                      Try the example route
                    </TextButton>
                  )}
                  <StepButton onClick={() => setActiveTab("design")}>
                    Make it yours
                    <Palette size={16} />
                  </StepButton>
                </div>
              )}

              {activeTab === "design" && (
                <div className="tab-content flex flex-col gap-3">
                  <SectionHeading title="Find your look">
                    A little color. A whole lot of you.
                  </SectionHeading>
                  <TemplatePicker
                    value={settings.template}
                    onChange={(template) => updateSettings({ template })}
                  />
                  <PalettePicker
                    value={settings.palette}
                    onChange={(palette, colors) =>
                      updateSettings({ palette, colors })
                    }
                  />
                  <div className="field-group flex min-w-0 flex-col gap-1.5 [&>label]:text-label [&>label]:font-medium [&>label]:text-[#55665d] mobile:[&>label]:text-control">
                    <div className="field-label-row flex items-center justify-between gap-2 [&_label]:text-label [&_label]:font-medium [&_label]:text-[#55665d] mobile:[&_label]:text-control [&>svg]:text-label [&>svg]:text-[#8a9890]">
                      <label>Make it your own</label>
                      <SlidersHorizontal size={14} />
                    </div>
                    <ColorFields
                      colors={settings.colors}
                      onChange={updateColor}
                    />
                  </div>
                  <div className="field-group flex min-w-0 flex-col gap-1.5 [&>label]:text-label [&>label]:font-medium [&>label]:text-[#55665d] mobile:[&>label]:text-control">
                    <div className="field-label-row flex items-center justify-between gap-2 [&_label]:text-label [&_label]:font-medium [&_label]:text-[#55665d] mobile:[&_label]:text-control [&>svg]:text-label [&>svg]:text-[#8a9890]">
                      <label htmlFor="route-width">Route thickness</label>
                      <span className="field-value text-label text-muted">
                        {settings.routeWidth}
                      </span>
                    </div>
                    <input
                      className="mt-2 mb-1 h-1 w-full accent-[#3d8871]"
                      id="route-width"
                      type="range"
                      min="1"
                      max="7"
                      step="0.5"
                      value={settings.routeWidth}
                      onChange={(event) =>
                        updateSettings({
                          routeWidth: Number(event.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="toggle-group flex flex-col gap-2.5">
                    <Toggle
                      label="Start & finish markers"
                      checked={settings.showMarkers}
                      onChange={(value) =>
                        updateSettings({ showMarkers: value })
                      }
                    />
                    <Toggle
                      label="Map labels"
                      checked={settings.showMapLabels}
                      onChange={(value) =>
                        updateSettings({ showMapLabels: value })
                      }
                    />
                  </div>
                  <StepButton onClick={() => setActiveTab("details")}>
                    Add the little details
                    <Type size={16} />
                  </StepButton>
                </div>
              )}

              {activeTab === "details" && (
                <div className="tab-content flex flex-col gap-3">
                  <SectionHeading title="More than a line on a map">
                    Put the memory into words.
                  </SectionHeading>
                  <TextField
                    label="Title"
                    value={settings.title}
                    onChange={(title) => updateSettings({ title })}
                    placeholder="A day to remember"
                    maxLength={65}
                  />
                  <TextField
                    label="Location"
                    value={settings.location}
                    onChange={(location) => updateSettings({ location })}
                    placeholder="Where did your journey take you?"
                    maxLength={65}
                  />
                  <TextField
                    label="Date"
                    value={settings.date === "—" ? "" : settings.date}
                    onChange={(date) => updateSettings({ date })}
                    placeholder="Add the date"
                    maxLength={45}
                  />
                  <div className="details-rule -my-px h-px bg-[#e7ece8]" />
                  <div className="toggle-group flex flex-col gap-2.5">
                    <Toggle
                      label="Show date"
                      checked={settings.showDate}
                      onChange={(value) => updateSettings({ showDate: value })}
                    />
                    <Toggle
                      label="Show statistics"
                      checked={settings.showStats}
                      onChange={(value) => updateSettings({ showStats: value })}
                    />
                  </div>
                  {settings.showStats && (
                    <>
                      <FieldGroup label="Time basis">
                        <SegmentedControl<TimeBasis>
                          label="Time basis"
                          value={settings.timeBasis}
                          options={[
                            { value: "moving", label: "Moving" },
                            { value: "elapsed", label: "Elapsed" },
                          ]}
                          onChange={changeTimeBasis}
                        />
                      </FieldGroup>
                      <TextField
                        label="Distance"
                        value={settings.distance}
                        onChange={(distance) => updateSettings({ distance })}
                        maxLength={25}
                      />
                      <TextField
                        label="Duration"
                        value={
                          settings.duration === "—" ? "" : settings.duration
                        }
                        onChange={(duration) => updateSettings({ duration })}
                        placeholder="Add your time"
                        maxLength={25}
                      />
                      <FieldGroup
                        label="Third statistic"
                        htmlFor="statistic-type"
                      >
                        <SelectControl
                          id="statistic-type"
                          value={settings.paceLabel}
                          onChange={(event) =>
                            changeStatistic(
                              event.target.value as PosterSettings["paceLabel"],
                            )
                          }
                        >
                          <option value="Pace">Average pace</option>
                          <option value="Avg. speed">Average speed</option>
                        </SelectControl>
                      </FieldGroup>
                      <TextField
                        label={
                          settings.paceLabel === "Pace"
                            ? "Pace"
                            : "Average speed"
                        }
                        value={settings.pace === "—" ? "" : settings.pace}
                        onChange={(pace) => updateSettings({ pace })}
                        placeholder={
                          settings.paceLabel === "Pace"
                            ? "e.g. 5:30 /km"
                            : "e.g. 12.5 km/h"
                        }
                        maxLength={25}
                      />
                      <p className="small-help -mt-2 text-caption leading-[1.6] text-muted">
                        {!timingAvailable
                          ? "This GPX has missing or invalid timestamps. Enter your own duration and pace or speed."
                          : settings.timeBasis === "moving"
                            ? "Estimated moving time excludes pauses and gaps."
                            : "Elapsed time includes stops and recording gaps."}{" "}
                        Switching time basis restores the calculated duration
                        and pace or speed.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="download-panel border-t border-[#e7ede8] bg-[#fcfdfc] px-6 pt-4 pb-3.5 tablet:px-5 mobile:px-5.5 small:px-4.5">
              <div className="download-heading mb-3 flex items-center gap-2 [&>svg]:text-[#5c8871] [&>h2]:m-0 [&>h2]:font-display [&>h2]:text-[17px] [&>h2]:font-medium">
                <Download size={18} />
                <h2>{sharing ? "Ready to share" : "Ready for your wall"}</h2>
              </div>
              {!sharing && (
                <div className="export-options grid grid-cols-[1fr_106px] items-center gap-2.25">
                  <SegmentedControl<ExportFormat>
                    className="format-control"
                    label="Download format"
                    value={format}
                    options={[
                      { value: "pdf", label: "PDF" },
                      { value: "png", label: "PNG" },
                    ]}
                    onChange={(value) => {
                      setFormat(value);
                      setDownloaded(false);
                    }}
                  />
                  <SelectControl
                    compact
                    aria-label="Print quality"
                    value={dpi}
                    onChange={(event) => {
                      setDpi(Number(event.target.value) as 150 | 300);
                      setDownloaded(false);
                    }}
                  >
                    <option value="300">300 DPI</option>
                    <option value="150">150 DPI</option>
                  </SelectControl>
                </div>
              )}
              <p className="export-dimensions mt-2 mb-2.5 flex flex-wrap justify-between gap-1.75 text-control text-muted">
                <span>
                  {sharing
                    ? `${shareSize.name} · PNG`
                    : `${dimensions.widthMm / 10} × ${dimensions.heightMm / 10} cm`}
                </span>
                <span className="text-[18px] leading-normal font-semibold tabular-nums">
                  {pixelWidth.toLocaleString()} × {pixelHeight.toLocaleString()}{" "}
                  px
                </span>
              </p>
              <PrimaryButton
                className="download-button w-full"
                onClick={() => void download()}
                disabled={exporting || importing || mapStatus !== "ready"}
              >
                {exporting ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : downloaded ? (
                  <Check size={17} />
                ) : (
                  <Download size={17} />
                )}
                {exporting
                  ? sharing
                    ? "Creating your image…"
                    : "Creating your print…"
                  : downloaded
                    ? "Download again"
                    : sharing
                      ? "Download PNG"
                      : "Download print"}
              </PrimaryButton>
              <p
                className="download-status mt-2 min-h-3.5 text-center text-caption leading-[1.6] text-muted wrap-anywhere"
                role="status"
              >
                {exporting
                  ? exportProgress
                  : downloaded
                    ? sharing
                      ? "Your image is ready to share."
                      : "Your print is ready. Enjoy every mile of it."
                    : mapStatus === "loading"
                      ? "Loading your route map…"
                      : mapStatus === "error"
                        ? "Reconnect to load the map before downloading."
                        : sharing
                          ? "Save the image, then upload it to your app."
                          : "Print at actual size, with scaling set to 100%."}
              </p>
              {error && errorSource === "export" && (
                <div className="message-area mt-3 mobile:empty:mt-0">
                  <ErrorNotice onDismiss={() => setError("")}>
                    {error}
                  </ErrorNotice>
                </div>
              )}
            </div>
          </aside>

          <div className="preview-column sticky top-5 min-w-0 mobile:static mobile:-order-1 mobile:w-full">
            <div className="preview-panel overflow-hidden rounded-xl border border-[#e0e6e6] bg-white">
              <FormatControls
                settings={settings}
                onChange={(patch) => {
                  updateSettings(patch);
                  if (patch.outputMode) setError("");
                }}
              />
              <div
                className="preview-stage group relative flex min-h-135.5 flex-col items-center justify-center bg-studio px-11 pt-16 pb-3.75 wide:min-h-147.5 tablet:min-h-127.5 tablet:px-6.25 mobile:min-h-0 mobile:px-9.5 mobile:pb-4 small:px-6.25 small:pb-3.5"
                data-orientation={
                  (
                    sharing
                      ? shareSize.width > shareSize.height
                      : settings.orientation === "landscape"
                  )
                    ? "landscape"
                    : "portrait"
                }
                data-map-status={mapStatus}
              >
                <button
                  type="button"
                  className="fit-button absolute top-3 right-3 z-10 flex min-h-8 items-center gap-1.5 rounded-[5px] border-0 bg-[#f3f6f4] px-2.5 py-1.5 text-caption text-[#7a8f82] hover:bg-[#e9f3ed] hover:text-evergreen"
                  onClick={() => setFitRequest((value) => value + 1)}
                  title="Center the route on the map"
                >
                  <Maximize2 size={15} />
                  <span>Fit route</span>
                </button>
                <div
                  className="poster-holder w-87 max-w-full shadow-[0_12px_22px_#30474a13,0_2px_3px_#30474a15] wide:w-98 mobile:w-70 group-data-[orientation=landscape]:w-122.5 mobile:group-data-[orientation=landscape]:w-105"
                  data-testid="poster-preview"
                >
                  <PosterPreview
                    key={mapRetry}
                    track={track}
                    settings={settings}
                    fitRequest={fitRequest}
                    onViewChange={viewChanged}
                    onStatusChange={statusChanged}
                  />
                </div>
                {mapStatus === "error" && (
                  <div
                    className="map-error-note mt-3.5 flex flex-col gap-2 rounded-md bg-[#fff3ef] px-3 py-2.5 text-center text-label text-[#964b3a] [&>button]:rounded-sm [&>button]:border [&>button]:border-[#e6c7bb] [&>button]:bg-white [&>button]:p-1.75 [&>button]:text-inherit"
                    role="status"
                  >
                    <span>
                      The map couldn’t load. Check your connection and try
                      again.
                    </span>
                    <button
                      onClick={() => {
                        setMapStatus("loading");
                        setMapRetry((value) => value + 1);
                      }}
                    >
                      Reload map
                    </button>
                  </div>
                )}
                <div className="preview-hint mt-5 flex items-center justify-center gap-1.5 text-center text-caption leading-normal text-muted">
                  <Map size={13} />
                  <span>Drag to frame. Scroll to zoom.</span>
                </div>
              </div>
              <div className="preview-footnote grid grid-cols-2 items-center gap-x-4 gap-y-2 border-t border-[#e0e6e6] px-5.75 py-3.5 font-sans text-caption font-normal text-muted tablet:px-4.25 mobile:py-2.75 small:gap-x-3 small:px-3.25">
                <span className="flex items-center gap-1.5">
                  <Layers3 size={14} />
                  {sharing
                    ? sharing && settings.shareSize === "story"
                      ? "Space for Story controls above and below."
                      : "Sized for sharing. Ready for your feed."
                    : "Designed to look as good on paper."}
                </span>
                <button
                  type="button"
                  className="how-button inline-flex min-h-9 items-center gap-1.5 justify-self-end border-0 bg-transparent p-0 text-left hover:text-evergreen"
                  onClick={() => infoDialog.current?.showModal()}
                >
                  <Info size={14} />
                  How it works
                </button>
              </div>
            </div>

          </div>
        </section>
        <input
          ref={fileInput}
          type="file"
          name="file"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          aria-label="Upload GPX file"
          className="sr-only"
          tabIndex={-1}
          onChange={fileChanged}
        />
      </main>

      <footer className="site-footer mx-auto mt-7.5 grid max-w-300 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3.75 border-t border-[#e8eded] pt-6 pb-7 text-caption text-muted wide:max-w-325 tablet:mx-6.25 mobile:mx-5 mobile:mt-6.25 mobile:pt-5 mobile:pb-5.75 narrow:grid-cols-1 narrow:gap-2.5 narrow:text-center small:mx-3.5">
        <span>For the journeys that stay with you.</span>
        <span className="footer-credit flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
          <span>Created by Tamer Aktas</span>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/tameraktasTU/waymark"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-evergreen"
          >
            GitHub
          </a>
        </span>
        <TextButton
          caption
          muted
          className="justify-self-end narrow:justify-self-center"
          onClick={() => infoDialog.current?.showModal()}
        >
          Maps, privacy & printing
          <ArrowUpRight size={13} />
        </TextButton>
      </footer>

      <InfoDialog dialogRef={infoDialog} />
    </>
  );
}

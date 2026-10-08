import {
  Printer,
  RectangleHorizontal,
  RectangleVertical,
  Share2,
} from "lucide-react";
import {
  PAPER_SIZES,
  SHARE_SIZES,
  paperDimensions,
  shareDimensions,
} from "../lib/presets";
import type { PosterSettings } from "../lib/types";

const modeOptions = [
  { value: "print", label: "Print", icon: Printer },
  { value: "share", label: "Share", icon: Share2 },
] as const;

const sizeButton =
  "min-h-11 min-w-0 rounded-md border border-[#dfe7e2] bg-white px-2 py-2 text-[15px] font-medium whitespace-nowrap text-muted hover:border-[#a5c2b4] hover:bg-[#f8fbf9] aria-pressed:border-evergreen aria-pressed:bg-[#eff6f2] aria-pressed:text-evergreen small:px-1";

export default function FormatControls({
  settings,
  onChange,
}: {
  settings: PosterSettings;
  onChange: (patch: Partial<PosterSettings>) => void;
}) {
  const sharing = settings.outputMode === "share";
  const paper = paperDimensions(settings);
  const image = shareDimensions(settings);

  return (
    <div className="paper-toolbar flex flex-col gap-3 px-[23px] pt-4 pb-[18px] tablet:px-[17px] small:px-[13px]">
      <div
        className="output-mode grid grid-cols-2 gap-1 border-b border-[#dfe8e2]"
        role="group"
        aria-label="Output type"
      >
        {modeOptions.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={settings.outputMode === value}
            onClick={() => onChange({ outputMode: value })}
            className="flex min-h-11 items-center justify-center gap-2 rounded-t-md border-0 border-b-2 border-transparent bg-transparent px-3 py-2.5 text-body font-medium text-muted hover:bg-[#f6f9f7] hover:text-ink aria-pressed:border-evergreen aria-pressed:bg-[#eff6f2] aria-pressed:text-evergreen"
          >
            <Icon size={18} strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </div>

      {sharing ? (
        <div
          className="share-sizes grid grid-cols-4 gap-2 small:gap-1.5"
          role="group"
          aria-label="Sharing format"
        >
          {SHARE_SIZES.map((size) => (
            <button
              key={size.id}
              type="button"
              aria-label={size.name}
              aria-pressed={settings.shareSize === size.id}
              onClick={() => onChange({ shareSize: size.id })}
              title={`${size.name} · ${size.ratio} · ${size.width} × ${size.height} px`}
              className={sizeButton}
            >
              {size.id === "instagram-post" ? "Post" : size.name}
            </button>
          ))}
        </div>
      ) : (
        <div
          className="paper-sizes grid grid-cols-4 gap-2 small:gap-1.5"
          role="group"
          aria-label="Paper size"
        >
          {PAPER_SIZES.map((size) => (
            <button
              key={size.id}
              type="button"
              aria-pressed={settings.paperSize === size.id}
              onClick={() => onChange({ paperSize: size.id })}
              title={size.description}
              className={sizeButton}
            >
              {size.name}
            </button>
          ))}
        </div>
      )}

      <div className="format-details flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-3">
          {sharing && (
            <span className="share-ratio border-r border-[#dfe8e2] pr-3 text-[18px] leading-normal font-semibold text-evergreen tabular-nums">
              {image.ratio}
            </span>
          )}
          <span className="format-dimensions text-[18px] leading-normal font-semibold whitespace-nowrap text-ink tabular-nums">
            {sharing
              ? `${image.width} × ${image.height} px`
              : `${paper.widthMm / 10} × ${paper.heightMm / 10} cm`}
          </span>
        </div>
        {sharing ? (
          <span className="text-control font-medium text-muted">PNG</span>
        ) : (
          <div
            className="orientation-control flex gap-1"
            role="group"
            aria-label="Print orientation"
          >
            {(
              [
                {
                  value: "portrait",
                  label: "Portrait",
                  icon: RectangleVertical,
                },
                {
                  value: "landscape",
                  label: "Landscape",
                  icon: RectangleHorizontal,
                },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                aria-pressed={settings.orientation === value}
                onClick={() => onChange({ orientation: value })}
                title={label}
                className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 py-2 text-control text-muted hover:bg-[#f5f8f6] aria-pressed:border-[#d7e5dc] aria-pressed:bg-[#eff6f2] aria-pressed:text-evergreen"
              >
                <Icon size={17} strokeWidth={1.8} />
                <span className="small:sr-only">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

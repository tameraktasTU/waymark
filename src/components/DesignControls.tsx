import { Check } from "lucide-react";
import { PALETTES } from "../lib/presets";
import type { PaletteId, PosterColors, TemplateId } from "../lib/types";
import { FieldGroup } from "./StudioControls";

const TEMPLATES: {
  id: TemplateId;
  name: string;
  description: string;
  thumbnailClasses: string;
}[] = [
  {
    id: "classic",
    name: "The classic",
    description: "A map with a story",
    thumbnailClasses:
      "h-[90px] p-2 [&>.thumbnail-map]:h-[53px] mobile:h-[108px] mobile:p-[11px] mobile:[&>.thumbnail-map]:h-[70px] small:h-[88px] small:p-2 small:[&>.thumbnail-map]:h-[54px]",
  },
  {
    id: "gallery",
    name: "Gallery",
    description: "Room to breathe",
    thumbnailClasses:
      "h-[90px] px-3 py-3 [&>.thumbnail-map]:h-[45px] mobile:h-[108px] mobile:px-4 mobile:py-[15px] mobile:[&>.thumbnail-map]:h-[64px] small:h-[88px] small:px-[11px] small:py-3 small:[&>.thumbnail-map]:h-[46px]",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Let the route speak",
    thumbnailClasses:
      "h-[90px] p-2 [&>.thumbnail-map]:h-[62px] [&>.thumbnail-text]:w-[65%] [&>.thumbnail-text]:self-start [&>.thumbnail-subtext]:hidden mobile:h-[108px] mobile:p-[11px] mobile:[&>.thumbnail-map]:h-[81px] small:h-[88px] small:p-2 small:[&>.thumbnail-map]:h-[62px]",
  },
];

export function TemplatePicker({
  value,
  onChange,
}: {
  value: TemplateId;
  onChange: (value: TemplateId) => void;
}) {
  return (
    <FieldGroup label="Poster layout">
      <div className="template-grid grid grid-cols-3 gap-[9px]">
        {TEMPLATES.map((template) => (
          <button
            key={template.id}
            className="template-option group flex min-w-0 flex-col items-stretch justify-start border-0 bg-transparent p-0 text-left text-[#76867c]"
            onClick={() => onChange(template.id)}
            aria-pressed={value === template.id}
            aria-label={`${template.name} template`}
          >
            <span
              className={`template-thumbnail relative flex flex-col items-center gap-[5px] rounded-md border border-[#dce3df] bg-[#f3f5f4] group-aria-pressed:border-[#5a9780] group-aria-pressed:shadow-[0_0_0_1px_#5a9780] ${template.thumbnailClasses}`}
              aria-hidden="true"
            >
              <span className="thumbnail-map relative w-full overflow-hidden bg-[#dce5da]">
                <svg
                  viewBox="0 0 60 60"
                  className="absolute inset-0 z-1 size-full"
                >
                  <path
                    d="M14 42C8 25 33 39 31 19S49 13 47 34 26 51 14 42"
                    className="fill-none stroke-[#e3694b] stroke-2"
                  />
                </svg>
              </span>
              <span className="thumbnail-text block h-[3px] w-[52%] bg-[#536c5b]" />
              <span className="thumbnail-subtext block h-0.5 w-[34%] bg-[#b1bfb4]" />
              {value === template.id && (
                <span className="template-check absolute top-1 right-1 z-2 grid size-3.5 place-items-center rounded-full bg-evergreen text-white">
                  <Check size={9} />
                </span>
              )}
            </span>
            <strong className="mt-1.5 block text-caption font-medium text-[#627268] group-aria-pressed:text-[#267156] mobile:text-control">
              {template.name}
            </strong>
            <span className="template-description mt-[3px] block text-caption text-muted">
              {template.description}
            </span>
          </button>
        ))}
      </div>
    </FieldGroup>
  );
}

export function PalettePicker({
  value,
  onChange,
}: {
  value: PaletteId;
  onChange: (value: PaletteId, colors: PosterColors) => void;
}) {
  return (
    <FieldGroup label="Color palette">
      <div className="palette-grid grid grid-cols-2 gap-x-[7px] gap-y-2.5">
        {PALETTES.map((palette) => (
          <button
            key={palette.id}
            className="palette-option group min-w-0 border-0 bg-transparent p-0 text-caption text-muted mobile:text-label small:text-caption"
            onClick={() => onChange(palette.id, { ...palette.colors })}
            aria-label={`${palette.name} palette`}
            aria-pressed={value === palette.id}
          >
            <span
              className="palette-preview relative mb-[5px] block h-10 overflow-hidden rounded-md border-2 border-transparent group-aria-pressed:border-[#5a9780] mobile:h-[50px] small:h-[38px]"
              style={{ background: palette.colors.land }}
            >
              <span
                className="absolute -top-3 right-[5px] h-[150%] w-[22px] rotate-[23deg]"
                style={{ background: palette.colors.water }}
              />
              <svg
                viewBox="0 0 90 55"
                className="absolute inset-0 size-full"
                aria-hidden="true"
              >
                <path
                  d="M16 43c-5-14 22-9 20-22S63 8 68 23 44 46 56 44"
                  stroke={palette.colors.route}
                  className="fill-none stroke-2"
                />
              </svg>
              {value === palette.id && (
                <span className="palette-check absolute top-0.5 right-0.5 grid size-[13px] place-items-center rounded-full bg-white text-evergreen">
                  <Check size={10} />
                </span>
              )}
            </span>
            <span>{palette.name}</span>
          </button>
        ))}
      </div>
    </FieldGroup>
  );
}

export function ColorFields({
  colors,
  onChange,
}: {
  colors: PosterColors;
  onChange: (key: keyof PosterColors, value: string) => void;
}) {
  return (
    <div className="color-grid grid grid-cols-3 gap-x-[7px] gap-y-2.5 small:grid-cols-2">
      {(
        [
          { key: "route", name: "Route line" },
          { key: "land", name: "Land" },
          { key: "water", name: "Water" },
          { key: "roads", name: "Roads" },
          { key: "background", name: "Paper" },
          { key: "text", name: "Text" },
        ] as const
      ).map(({ key, name }) => (
        <label
          className="color-field flex items-center gap-[7px] text-caption text-muted mobile:text-label small:gap-[5px] small:text-caption"
          key={key}
        >
          <span
            className="color-swatch relative block size-[22px] shrink-0 overflow-hidden rounded-md border border-[#d1dbd4] focus-within:outline-2 focus-within:outline-evergreen focus-within:outline-offset-3 mobile:size-7"
            style={{ background: colors[key] }}
          >
            <input
              type="color"
              aria-label={`${name} color`}
              value={colors[key]}
              onChange={(event) => onChange(key, event.target.value)}
              className="absolute inset-0 size-full cursor-pointer p-0 opacity-0"
            />
          </span>
          <span>{name}</span>
        </label>
      ))}
    </div>
  );
}

import { ChevronDown, X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

type ButtonProps = ComponentProps<"button">;

export function PrimaryButton({
  className = "",
  compact = false,
  ...props
}: ButtonProps & { compact?: boolean }) {
  return (
    <button
      {...props}
      className={`primary-button flex items-center justify-center gap-2.5 rounded-[7px] border-0 bg-evergreen font-medium text-white enabled:hover:bg-[#10574e] ${compact ? "px-[13px] py-2.5 text-label" : "px-5 py-3 text-[.9375rem] mobile:py-[13px]"} ${className}`}
    />
  );
}

export function TextButton({
  className = "",
  caption = false,
  muted = false,
  ...props
}: ButtonProps & { caption?: boolean; muted?: boolean }) {
  return (
    <button
      {...props}
      className={`text-button inline-flex items-center gap-[7px] border-0 bg-transparent p-0 font-medium hover:text-evergreen ${caption ? "text-caption" : "text-control"} ${muted ? "text-muted" : "text-[#61726c]"} ${className}`}
    />
  );
}

export function StepButton(props: ButtonProps) {
  return (
    <button
      {...props}
      className="next-step flex min-h-10 items-center justify-center gap-[9px] rounded-md border border-[#dee9e3] bg-[#f8fbf9] p-[9px] text-label font-medium text-[#397963] hover:bg-[#eef6f1]"
    />
  );
}

export function SectionHeading({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2 className="m-0 font-display text-[20px] font-medium tracking-[-.35px]">
        {title}
      </h2>
      <p className="mt-1 text-label leading-normal text-muted mobile:text-control">
        {children}
      </p>
    </div>
  );
}

export function FieldGroup({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="field-group flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-label font-medium text-[#55665d] mobile:text-control"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 80,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  children?: ReactNode;
}) {
  const id = `field-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className="field-group flex min-w-0 flex-col gap-1.5">
      <div className="field-label-row flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="text-label font-medium text-[#55665d] mobile:text-control"
        >
          {label}
        </label>
        {children}
      </div>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        type="text"
        autoComplete="off"
        className="min-w-0 w-full rounded-md border border-[#dfe6e2] bg-white px-3 py-2 text-body text-[#43584b] placeholder:text-[#9aa69f]"
      />
    </div>
  );
}

export function SelectControl({
  compact = false,
  ...props
}: ComponentProps<"select"> & { compact?: boolean }) {
  return (
    <div
      className={`select-wrapper relative min-w-0 ${compact ? "quality-control" : ""}`}
    >
      <select
        {...props}
        className={`min-w-0 w-full appearance-none rounded-md border border-[#dfe6e2] bg-white pr-[30px] pl-3 py-2 text-[#43584b] ${compact ? "text-control" : "text-body"}`}
      />
      <ChevronDown
        size={compact ? 14 : 15}
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[#87978c]"
      />
    </div>
  );
}

export function SegmentedControl<Value extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`segmented-control flex gap-0.5 rounded-md bg-[#f0f4f2] p-[3px] ${className}`}
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className="min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-2.5 py-2 text-label text-muted aria-pressed:border-[#e3e8e5] aria-pressed:bg-white aria-pressed:text-[#347a65] aria-pressed:shadow-[0_1px_3px_#26382e08]"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) {
  return (
    <label className="toggle-row flex cursor-pointer items-center justify-between gap-3">
      <span>
        <span className="toggle-label block text-label text-muted">
          {label}
        </span>
        {description && (
          <span className="toggle-description mt-1 block text-caption text-muted">
            {description}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only peer"
      />
      <span
        className="toggle-track block h-[17px] w-[29px] shrink-0 rounded-[20px] bg-[#dce4df] p-0.5 peer-checked:bg-[#508f73] peer-checked:[&>span]:translate-x-3 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-700 peer-focus-visible:ring-offset-2"
        aria-hidden="true"
      >
        <span className="block size-[13px] rounded-full bg-white transition-transform duration-180" />
      </span>
    </label>
  );
}

export function ErrorNotice({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div
      className="error-message flex justify-between gap-3 rounded-[7px] border border-[#efccc1] bg-[#fff3ef] px-3.5 py-3 text-control leading-[1.6] text-[#9c4936]"
      role="alert"
    >
      <span>{children}</span>
      <button
        aria-label="Dismiss error"
        onClick={onDismiss}
        className="self-start border-0 bg-transparent p-0 text-inherit"
      >
        <X size={16} />
      </button>
    </div>
  );
}

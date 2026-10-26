export function inputClass(hasError: boolean) {
  return `w-full rounded-[10px] border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none ${
    hasError ? "border-critical focus:border-critical" : "border-border focus:border-accent"
  }`;
}

export function Field({
  label,
  error,
  hint,
  children,
  className = "",
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-critical">{error}</span>
      ) : (
        hint && <span className="text-xs text-muted">{hint}</span>
      )}
    </label>
  );
}

export function ActionButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`rounded-[8px] p-2 text-muted transition hover:bg-surface-2 ${
        danger ? "hover:text-critical" : "hover:text-accent-strong"
      }`}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        {icon}
      </div>
      <p className="font-medium text-ink">{title}</p>
      <p className="max-w-sm text-sm text-muted">{text}</p>
    </div>
  );
}

/** Esqueleto de lista enquanto os dados carregam: avatar e duas linhas por item. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Carregando" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-b-0">
          <span className="rh-skeleton h-9 w-9 shrink-0 rounded-full" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="rh-skeleton h-3 rounded-full" style={{ width: `${55 - (i % 3) * 12}%` }} />
            <span className="rh-skeleton h-2.5 rounded-full" style={{ width: `${32 - (i % 2) * 8}%` }} />
          </span>
          <span className="rh-skeleton hidden h-7 w-20 rounded-[8px] sm:block" />
        </div>
      ))}
    </div>
  );
}

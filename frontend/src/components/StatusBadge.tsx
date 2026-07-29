interface StatusBadgeProps {
  label: string;
  state: "online" | "offline" | "loading" | "neutral";
}

export function StatusBadge({ label, state }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-${state}`}>
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

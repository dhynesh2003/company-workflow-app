import Link from "next/link";

type EmptyStateProps = {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
};

export function EmptyState({ title, description, actionHref, actionLabel }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">✓</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {actionHref && actionLabel && <Link href={actionHref} className="btn secondary">{actionLabel}</Link>}
    </div>
  );
}

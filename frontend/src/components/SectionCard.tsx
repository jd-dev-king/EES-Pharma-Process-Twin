import type { PropsWithChildren, ReactNode } from "react";

interface SectionCardProps extends PropsWithChildren {
  title: string;
  eyebrow: string;
  action?: ReactNode;
}

export function SectionCard({ title, eyebrow, action, children }: SectionCardProps) {
  return (
    <section className="section-card">
      <header className="section-card-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

import type { ReactNode } from 'react';

type SectionCardProps = {
  title: string;
  badge: ReactNode;
  description: string;
  highlights?: readonly string[];
  highlight?: boolean;
  className?: string;
  footer?: ReactNode;
  children?: ReactNode;
  emptyStateTitle?: string;
  emptyStateCopy?: string;
};

export function SectionCard({
  title,
  badge,
  description,
  highlights = [],
  highlight = false,
  className,
  footer,
  children,
  emptyStateTitle,
  emptyStateCopy,
}: SectionCardProps) {
  const badgeContent = typeof badge === 'string' || typeof badge === 'number'
    ? <span className="section-card__badge-pill">{badge}</span>
    : badge;

  return (
    <section className={[highlight ? 'section-card section-card--highlight' : 'section-card', className].filter(Boolean).join(' ')}>
      <div className="section-card__header">
        <h2 className="section-card__title">{title}</h2>
        <div className="section-card__badge">{badgeContent}</div>
      </div>
      <div className="section-card__body">
        <p className="section-card__description">{description}</p>
        {highlights.length > 0 ? (
          <ul className="section-card__list">
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {children ? (
          children
        ) : emptyStateTitle && emptyStateCopy ? (
          <div className="section-card__placeholder" aria-label={`${title} 비가용 상태`}>
            <span className="section-card__placeholder-title">{emptyStateTitle}</span>
            <span className="section-card__placeholder-copy">{emptyStateCopy}</span>
          </div>
        ) : null}
        {footer}
      </div>
    </section>
  );
}

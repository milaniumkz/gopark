import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type StatCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  tone?: "blue" | "green" | "orange" | "purple";
  icon?: ReactNode;
  meta?: string;
  to?: string;
  onClick?: () => void;
  className?: string;
};

export function StatCard({ title, value, subtitle, tone = "blue", icon, meta, to, onClick, className }: StatCardProps) {
  const content = (
    <>
      <div className="metric-card__top">
        <span>{title}</span>
        {icon ? <div className="metric-card__icon">{icon}</div> : null}
      </div>
      <strong>{value}</strong>
      {subtitle ? <p className="metric-card__sub">{subtitle}</p> : null}
      {meta ? <p className="metric-card__meta">{meta}</p> : null}
    </>
  );

  if (to) {
    return (
      <Link className={`metric-card metric-card--${tone} metric-card--link${className ? ` ${className}` : ""}`} to={to}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={`metric-card metric-card--${tone} metric-card--link metric-card--button${className ? ` ${className}` : ""}`} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <article className={`metric-card metric-card--${tone}${className ? ` ${className}` : ""}`}>
      {content}
    </article>
  );
}

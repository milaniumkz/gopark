import type { ReactNode } from "react";

export function EmptyStatePanel({
  title,
  message,
  extra,
}: {
  title: string;
  message: string;
  extra?: ReactNode;
}) {
  return (
    <article className="panel empty-panel">
      <strong>{title}</strong>
      <p>{message}</p>
      {extra ? <div>{extra}</div> : null}
    </article>
  );
}

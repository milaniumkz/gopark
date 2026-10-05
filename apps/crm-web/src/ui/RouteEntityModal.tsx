import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

type RouteEntityModalProps = {
  title: string;
  subtitle: string;
  closeTo: string;
  children: ReactNode;
};

export function RouteEntityModal({ title, subtitle, closeTo, children }: RouteEntityModalProps) {
  const navigate = useNavigate();

  function handleClose() {
    navigate(closeTo);
  }

  return (
    <>
      <button
        type="button"
        className="entity-modal__backdrop"
        onClick={handleClose}
        aria-label="Закрыть карточку"
      />
      <section className="entity-modal" aria-modal="true" role="dialog" aria-labelledby="entity-route-modal-title">
        <div className="entity-modal__header">
          <div>
            <span className="layout-settings__eyebrow">Карточка</span>
            <h3 id="entity-route-modal-title">{title}</h3>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="topbar__button" onClick={handleClose}>
            Закрыть
          </button>
        </div>
        <div className="entity-modal__body">{children}</div>
      </section>
    </>
  );
}

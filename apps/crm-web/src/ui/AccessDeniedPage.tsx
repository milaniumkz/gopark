export function AccessDeniedPage() {
  return (
    <section className="page-stack">
      <div className="hero-card">
        <p className="eyebrow">Доступ ограничен</p>
        <h2>Раздел недоступен для текущей роли</h2>
        <p>
          Для вашей роли этот раздел недоступен. Перейдите в другой раздел или войдите под учётной записью с нужными правами.
        </p>
      </div>
    </section>
  );
}

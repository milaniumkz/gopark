import { useRef, useState } from "react";

function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Selecting dates is read-only: it changes the report period, never obligations. */
export function DateRangePicker({ from, to, onChange }: {
  from: string; to: string; onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(`${from || dateOnly(new Date())}T12:00:00`));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const dragging = useRef(false);
  const moved = useRef(false);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const start = anchor && preview ? (anchor < preview ? anchor : preview) : from;
  const end = anchor && preview ? (anchor > preview ? anchor : preview) : to;
  function finish(day: string) {
    const initial = anchor || day;
    onChange(initial < day ? initial : day, initial > day ? initial : day);
    setAnchor(null); setPreview(null); setOpen(false); dragging.current = false;
  }
  return <div className="date-range-picker">
    <input aria-label="Дата начала периода" type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to && to >= e.target.value ? to : e.target.value)} />
    <input aria-label="Дата окончания периода" type="date" value={to} min={from || undefined} onChange={(e) => onChange(from || e.target.value, e.target.value)} />
    <button type="button" aria-expanded={open} onClick={() => { setOpen(!open); setAnchor(null); }}>Календарь</button>
    {(from || to) && <button type="button" className="button-secondary" onClick={() => onChange("", "")}>Сбросить период</button>}
    {open && <div className="date-range-popup" role="dialog" aria-label="Выбор периода">
      <div className="toolbar">
        <button type="button" aria-label="Предыдущий месяц" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <strong>{month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</strong>
        <button type="button" aria-label="Следующий месяц" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        <button type="button" aria-label="Закрыть календарь" onClick={() => setOpen(false)}>×</button>
      </div>
      <p>Выберите начало и конец или проведите по дням.</p>
      <div className="date-range-grid" onPointerMove={(event) => {
        if (!dragging.current) return;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>("[data-date]");
        if (target?.dataset.date) { moved.current = true; setPreview(target.dataset.date); }
      }} onPointerUp={(event) => {
        if (!dragging.current) return;
        dragging.current = false;
        if (moved.current) {
          const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>("[data-date]");
          finish(target?.dataset.date || preview || anchor || from);
        }
      }} onPointerCancel={() => { dragging.current = false; setPreview(null); }}>
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const day = dateOnly(new Date(month.getFullYear(), month.getMonth(), i + 1));
          return <button type="button" key={day} data-date={day} aria-label={day} aria-pressed={Boolean(start && day >= start && day <= (end || start))}
            onPointerDown={(e) => { if (e.button !== 0) return; dragging.current = true; moved.current = false; if (!anchor) { setAnchor(day); setPreview(day); } }}
            onClick={() => { if (moved.current) { moved.current = false; return; } if (anchor && anchor !== day) finish(day); else { setAnchor(day); setPreview(day); } }}
            onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
            {i + 1}
          </button>;
        })}
      </div>
      <div className="toolbar">
        <button type="button" onClick={() => { onChange(dateOnly(first), dateOnly(new Date(month.getFullYear(), month.getMonth() + 1, 0))); setOpen(false); }}>Весь месяц</button>
        <button type="button" onClick={() => { const today = dateOnly(new Date()); onChange(today, today); setOpen(false); }}>Сегодня</button>
        {anchor && <button type="button" onClick={() => finish(anchor)}>Один день</button>}
      </div>
    </div>}
  </div>;
}

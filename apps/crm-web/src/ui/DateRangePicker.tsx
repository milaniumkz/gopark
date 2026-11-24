import { useLayoutEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./date-range-picker.css";

function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function display(day: string): string {
  return day ? day.split("-").reverse().join(".") : "…";
}
/** Draft selection is applied atomically after the second click. */
export function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(
    () => new Date(`${from || dateOnly(new Date())}T12:00:00`),
  );
  const [anchor, setAnchor] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const start = anchor ? [anchor, preview || anchor].sort()[0] : from;
  const end = anchor ? [anchor, preview || anchor].sort()[1] : to;
  function close() {
    setOpen(false);
    setAnchor(null);
    setPreview(null);
    trigger.current?.focus();
  }
  function apply(a: string, b: string) {
    onChange(a, b);
    close();
  }
  function choose(day: string) {
    if (anchor === null) {
      setAnchor(day);
      setPreview(day);
      return;
    }
    const [a, b] = [anchor, day].sort();
    apply(a, b);
  }
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, window.innerWidth - 24);
      const height = Math.min(
        popup.current?.offsetHeight || 450,
        window.innerHeight - 24,
      );
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: Math.max(
          12,
          Math.min(rect.bottom + 8, window.innerHeight - height - 12),
        ),
      });
    }
    place();
    const observer = new ResizeObserver(place);
    if (popup.current) observer.observe(popup.current);
    popup.current
      ?.querySelector<HTMLButtonElement>(
        '[data-date][aria-pressed="true"], [data-date]',
      )
      ?.focus();
    function outside(e: PointerEvent) {
      if (
        !popup.current?.contains(e.target as Node) &&
        !trigger.current?.contains(e.target as Node)
      )
        close();
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  return (
    <div className="date-range-picker">
      <button
        ref={trigger}
        type="button"
        className="date-range-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          setMonth(new Date(`${from || dateOnly(new Date())}T12:00:00`));
          setAnchor(null);
          setPreview(null);
          setOpen(true);
        }}
      >
        Период:{" "}
        {from || to ? `${display(from)} — ${display(to)}` : "Выбрать даты"}
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            ref={popup}
            className="date-range-calendar"
            role="dialog"
            aria-label="Выбор периода"
            style={position}
          >
            <div className="date-range-calendar__header">
              <button
                type="button"
                aria-label="Предыдущий месяц"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
              >
                ‹
              </button>
              <label>
                Месяц
                <input
                  type="month"
                  aria-label="Месяц календаря"
                  value={`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`}
                  onChange={(e) => {
                    if (e.target.value)
                      setMonth(new Date(`${e.target.value}-01T12:00:00`));
                  }}
                />
              </label>
              <button
                type="button"
                aria-label="Следующий месяц"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
              >
                ›
              </button>
              <button
                type="button"
                aria-label="Закрыть календарь"
                onClick={close}
              >
                ×
              </button>
            </div>
            <p aria-live="polite">
              {anchor
                ? `Начало: ${display(anchor)}. Выберите дату до.`
                : "Первое нажатие — дата от, второе — дата до."}
            </p>
            <div className="date-range-calendar__grid">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
                <span key={d}>{d}</span>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <span key={`empty-${i}`} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const day = dateOnly(
                  new Date(month.getFullYear(), month.getMonth(), i + 1),
                );
                return (
                  <button
                    type="button"
                    key={day}
                    data-date={day}
                    aria-label={day}
                    aria-pressed={Boolean(
                      start && day >= start && day <= (end || start),
                    )}
                    className={
                      day === start || day === end
                        ? "date-range-calendar__edge"
                        : ""
                    }
                    onClick={() => choose(day)}
                    onMouseEnter={() => {
                      if (anchor) setPreview(day);
                    }}
                    onKeyDown={(e) => {
                      const shift: Record<string, number> = {
                        ArrowLeft: -1,
                        ArrowRight: 1,
                        ArrowUp: -7,
                        ArrowDown: 7,
                      };
                      if (shift[e.key]) {
                        e.preventDefault();
                        const next = new Date(`${day}T12:00:00`);
                        next.setDate(next.getDate() + shift[e.key]);
                        const nextDay = dateOnly(next);
                        if (next.getMonth() !== month.getMonth()) {
                          setMonth(
                            new Date(next.getFullYear(), next.getMonth(), 1),
                          );
                          requestAnimationFrame(() =>
                            popup.current
                              ?.querySelector<HTMLButtonElement>(
                                `[data-date="${nextDay}"]`,
                              )
                              ?.focus(),
                          );
                        } else
                          popup.current
                            ?.querySelector<HTMLButtonElement>(
                              `[data-date="${nextDay}"]`,
                            )
                            ?.focus();
                      }
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="date-range-calendar__actions">
              <button
                type="button"
                onClick={() => {
                  const d = dateOnly(new Date());
                  apply(d, d);
                }}
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={() =>
                  apply(
                    dateOnly(first),
                    dateOnly(
                      new Date(month.getFullYear(), month.getMonth() + 1, 0),
                    ),
                  )
                }
              >
                Весь месяц
              </button>
              <button type="button" onClick={() => apply("", "")}>
                Сбросить период
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

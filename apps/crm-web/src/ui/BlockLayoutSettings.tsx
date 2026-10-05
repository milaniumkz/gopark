import { useEffect, useMemo, useState, type RefObject } from "react";
import { loadRouteBlockLayout, resetRouteBlockLayout, saveRouteBlockLayout, type BlockLayoutItemConfig, type BlockLayoutRouteConfig } from "../lib/block-layout";

interface BlockLayoutSettingsProps {
  contentRef: RefObject<HTMLElement | null>;
  routeKey: string;
  routeLabel: string;
}

interface ScannedBlockItem {
  key: string;
  label: string;
  element: HTMLElement;
}

interface ScannedBlockContainer {
  key: string;
  label: string;
  items: ScannedBlockItem[];
}

const CONTAINER_SELECTORS = [
  ".page-stack",
  ".stats-grid",
  ".table-grid",
  ".registry-layout",
  ".registry-side",
  ".registry-summary",
  ".filter-panel__grid",
  ".filter-panel__stack",
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "block";
}

function getContainerLabel(element: HTMLElement): string {
  if (element.classList.contains("page-stack")) {
    return "Порядок секций";
  }

  if (element.classList.contains("stats-grid")) {
    return "Карточки показателей";
  }

  if (element.classList.contains("table-grid")) {
    return "Основные блоки";
  }

  if (element.classList.contains("registry-layout")) {
    return "Реестр и боковая колонка";
  }

  if (element.classList.contains("registry-side")) {
    return "Боковая колонка";
  }

  if (element.classList.contains("registry-summary")) {
    return "Сводные блоки";
  }

  if (element.classList.contains("filter-panel__grid")) {
    return "Фильтры и быстрые формы";
  }

  if (element.classList.contains("filter-panel__stack")) {
    return "Фильтры";
  }

  return "Блоки";
}

function getBlockLabel(element: HTMLElement): string {
  const explicitSelector = [
    ".panel__title h3",
    ".hero-card h2",
    ".quick-form__title",
    "h2",
    "h3",
    "h4",
    ".eyebrow",
    "strong",
    "span",
  ].join(", ");

  if (element.classList.contains("hero-card")) {
    return element.querySelector("h2")?.textContent?.trim() || "Hero-блок";
  }

  if (element.classList.contains("stats-grid")) {
    return "Карточки показателей";
  }

  if (element.classList.contains("table-grid")) {
    return "Основные блоки";
  }

  if (element.classList.contains("registry-layout")) {
    return "Реестр и боковая колонка";
  }

  if (element.classList.contains("registry-side")) {
    return "Боковая колонка";
  }

  if (element.classList.contains("registry-summary")) {
    return "Сводные блоки";
  }

  if (element.classList.contains("filter-panel")) {
    return element.querySelector(".panel__title h3")?.textContent?.trim() || "Фильтры и форма";
  }

  if (element.classList.contains("metric-card")) {
    return element.querySelector("span")?.textContent?.trim() || "Карточка показателя";
  }

  return element.querySelector(explicitSelector)?.textContent?.trim() || "Блок";
}

function scanBlockContainers(root: HTMLElement): ScannedBlockContainer[] {
  const containers = Array.from(root.querySelectorAll<HTMLElement>(CONTAINER_SELECTORS.join(", ")));

  return containers
    .map((container, containerIndex) => {
      const itemCounter = new Map<string, number>();
      const items = Array.from(container.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement)
        .filter((child) => !child.hasAttribute("hidden"))
        .map((child) => {
          const label = getBlockLabel(child);
          const nextCount = (itemCounter.get(label) ?? 0) + 1;
          itemCounter.set(label, nextCount);

          return {
            key: `${slugify(label)}-${nextCount}`,
            label,
            element: child,
          };
        });

      return {
        key: `${getContainerLabel(container)}-${containerIndex}`,
        label: getContainerLabel(container),
        items,
      };
    })
    .filter((container) => container.items.length > 0);
}

function normalizeContainerConfig(container: ScannedBlockContainer, config: BlockLayoutRouteConfig): BlockLayoutItemConfig[] {
  const current = new Map((config[container.key] ?? []).map((item) => [item.key, item]));

  return container.items.map((item, index) => ({
    key: item.key,
    order: current.get(item.key)?.order ?? index,
    hidden: current.get(item.key)?.hidden ?? false,
  }));
}

function normalizeRouteConfig(containers: ScannedBlockContainer[], config: BlockLayoutRouteConfig): BlockLayoutRouteConfig {
  return Object.fromEntries(containers.map((container) => [container.key, normalizeContainerConfig(container, config)]));
}

function applyRouteLayout(containers: ScannedBlockContainer[], config: BlockLayoutRouteConfig) {
  for (const container of containers) {
    const itemConfig = normalizeContainerConfig(container, config);
    const configMap = new Map(itemConfig.map((item) => [item.key, item]));

    for (const [index, item] of container.items.entries()) {
      const next = configMap.get(item.key);
      item.element.style.order = String(next?.order ?? index);
      item.element.style.display = next?.hidden ? "none" : "";
    }
  }
}

function sortContainerItems(container: ScannedBlockContainer, config: BlockLayoutRouteConfig) {
  const itemConfig = normalizeContainerConfig(container, config);
  const configMap = new Map(itemConfig.map((item) => [item.key, item]));

  return [...container.items].sort((left, right) => {
    const leftOrder = configMap.get(left.key)?.order ?? 0;
    const rightOrder = configMap.get(right.key)?.order ?? 0;
    return leftOrder - rightOrder;
  });
}

export function BlockLayoutSettings({ contentRef, routeKey, routeLabel }: BlockLayoutSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [containers, setContainers] = useState<ScannedBlockContainer[]>([]);
  const [layoutConfig, setLayoutConfig] = useState<BlockLayoutRouteConfig>({});

  useEffect(() => {
    const next = loadRouteBlockLayout(routeKey);
    setLayoutConfig(next);
    setIsOpen(false);
  }, [routeKey]);

  useEffect(() => {
    const root = contentRef.current;

    if (!root) {
      return;
    }

    const refresh = () => {
      const scanned = scanBlockContainers(root);
      setContainers(scanned);
    };

    refresh();

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(refresh);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [contentRef, routeKey]);

  useEffect(() => {
    if (!containers.length) {
      return;
    }

    const normalized = normalizeRouteConfig(containers, layoutConfig);
    applyRouteLayout(containers, normalized);
    saveRouteBlockLayout(routeKey, normalized);
  }, [containers, layoutConfig, routeKey]);

  const visibleContainers = useMemo(
    () => containers.filter((container) => container.items.length > 1 || container.label === "Порядок секций"),
    [containers],
  );

  function updateContainer(containerKey: string, updater: (items: BlockLayoutItemConfig[]) => BlockLayoutItemConfig[]) {
    setLayoutConfig((current) => {
      const container = containers.find((item) => item.key === containerKey);

      if (!container) {
        return current;
      }

      const normalized = normalizeContainerConfig(container, current);
      return {
        ...current,
        [containerKey]: updater(normalized).map((item, index) => ({
          ...item,
          order: index,
        })),
      };
    });
  }

  function moveItem(containerKey: string, itemKey: string, direction: -1 | 1) {
    updateContainer(containerKey, (items) => {
      const next = [...items].sort((left, right) => left.order - right.order);
      const currentIndex = next.findIndex((item) => item.key === itemKey);
      const swapIndex = currentIndex + direction;

      if (currentIndex < 0 || swapIndex < 0 || swapIndex >= next.length) {
        return next;
      }

      const currentItem = next[currentIndex];
      next[currentIndex] = next[swapIndex];
      next[swapIndex] = currentItem;
      return next;
    });
  }

  function toggleItem(containerKey: string, itemKey: string) {
    updateContainer(containerKey, (items) =>
      items.map((item) => (item.key === itemKey ? { ...item, hidden: !item.hidden } : item)),
    );
  }

  function handleReset() {
    resetRouteBlockLayout(routeKey);
    const next = normalizeRouteConfig(containers, {});
    setLayoutConfig(next);
  }

  return (
    <>
      <button
        className={`topbar__button topbar__button--ghost${isOpen ? " topbar__button--active" : ""}`}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>Настроить блоки</span>
      </button>
      {isOpen ? <button type="button" className="layout-settings__backdrop" onClick={() => setIsOpen(false)} aria-label="Закрыть настройки блоков" /> : null}
      <aside className={`layout-settings${isOpen ? " layout-settings--open" : ""}`}>
        <div className="layout-settings__header">
          <div>
            <span className="layout-settings__eyebrow">Отображение раздела</span>
            <strong>{routeLabel}</strong>
            <p>Выберите, какие блоки показывать сверху, ниже или скрывать. Настройка запоминается отдельно для каждого раздела.</p>
          </div>
          <div className="layout-settings__actions">
            <button type="button" className="button-link" onClick={handleReset}>
              Сбросить раздел
            </button>
            <button type="button" className="topbar__button" onClick={() => setIsOpen(false)}>
              Закрыть
            </button>
          </div>
        </div>
        <div className="layout-settings__body">
          {visibleContainers.length ? (
            visibleContainers.map((container) => {
              const sortedItems = sortContainerItems(container, layoutConfig);
              const configMap = new Map(normalizeContainerConfig(container, layoutConfig).map((item) => [item.key, item]));

              return (
                <article className="layout-settings__group" key={container.key}>
                  <div className="layout-settings__group-title">
                    <h3>{container.label}</h3>
                    <span>{container.items.length} блоков</span>
                  </div>
                  <div className="layout-settings__list">
                    {sortedItems.map((item, index) => {
                      const current = configMap.get(item.key);
                      return (
                        <div className="layout-settings__item" key={item.key}>
                          <div className="layout-settings__item-copy">
                            <strong>{item.label}</strong>
                            <span>{current?.hidden ? "Скрыт" : `Позиция ${index + 1}`}</span>
                          </div>
                          <div className="layout-settings__item-actions">
                            <button type="button" onClick={() => moveItem(container.key, item.key, -1)} disabled={index === 0}>
                              Выше
                            </button>
                            <button
                              type="button"
                              onClick={() => moveItem(container.key, item.key, 1)}
                              disabled={index === sortedItems.length - 1}
                            >
                              Ниже
                            </button>
                            <button type="button" onClick={() => toggleItem(container.key, item.key)}>
                              {current?.hidden ? "Показать" : "Скрыть"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="layout-settings__empty">
              <strong>Настраиваемых блоков пока нет</strong>
              <p>Откройте раздел с карточками или панелями, и здесь появится порядок отображения.</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

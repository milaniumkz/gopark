export function formatCurrency(amount: number): string {
  return `${new Intl.NumberFormat("ru-KG", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(amount)} сом`;
}

export function formatShortId(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 8)}…`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-KG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateOnly(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-KG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isPastDate(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.getTime() < Date.now();
}

export function formatDueDateLabel(value: string | null | undefined, isOverdue: boolean): string {
  const formatted = formatDateOnly(value);
  return isOverdue ? `просрочено с ${formatted}` : formatted;
}

export function formatRepairPeriodLabel(
  occurredAt: string | null | undefined,
  periodLabel: string | null | undefined,
): string {
  const period = periodLabel?.trim();
  if (period?.includes("..")) {
    const [from, to] = period.split("..").map((item) => item.trim());
    return to ? `Ремонт с ${formatDateOnly(from)} по ${formatDateOnly(to)}` : `Ремонт с ${formatDateOnly(from)}`;
  }

  if (period) {
    return `Ремонт ${period}`;
  }

  return occurredAt ? `Ремонт с ${formatDateOnly(occurredAt)}` : "Даты ремонта не указаны";
}

export function downloadCsv(filename: string, rows: Array<[string, string | number]>): void {
  downloadCsvTable(
    filename,
    ["metric", "value"],
    rows.map(([metric, value]) => [metric, String(value)]),
  );
}

export function downloadCsvTable(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>,
): void {
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "Активен",
    blocked: "Заблокирован",
    invited: "Приглашён",
    draft: "Черновик",
    requested: "На согласовании",
    approved: "Одобрено",
    rejected: "Отклонено",
    processing: "В обработке",
    published: "Отправлено",
    failed: "Ошибка",
    succeeded: "Завершён",
    pending: "Ожидает",
    open: "Открыт",
    resolved: "Решён",
    closed: "Выкуплен",
    terminated: "Расторгнут",
    archived: "В архиве",
    assigned: "На линии",
    maintenance: "Ремонт",
    day_off: "Выходной",
    dayoff: "Выходной",
    vacation: "Отпросился",
    force_majeure: "Форс-мажор",
    accident: "ДТП",
    office: "В офисе",
    idle: "Простой",
    customs: "Растаможка",
    installment: "В рассрочке",
    impound: "Штрафстоянка",
    abandon: "Абандон",
    sold: "Продан",
    written_off: "Списан",
    free: "В пуле",
    planned: "Запланирован",
    paid: "Оплатил",
    unpaid: "Не оплатил",
    partial: "Частично",
    deferred: "Отложен",
    defaulted: "Проблемный",
    overdue: "Просрочено",
  };

  return labels[status] ?? status;
}

export function getStatusTone(status: string): string {
  const tones: Record<string, string> = {
    active: "badge badge--green",
    draft: "badge badge--slate",
    approved: "badge badge--green",
    published: "badge badge--green",
    assigned: "badge badge--green",
    maintenance: "badge badge--cyan",
    paid: "badge badge--green",
    installment: "badge badge--green",
    day_off: "badge badge--blue",
    dayoff: "badge badge--blue",
    office: "badge badge--slate",
    vacation: "badge badge--cyan",
    force_majeure: "badge badge--orange",
    partial: "badge badge--yellow",
    deferred: "badge badge--purple",
    overdue: "badge badge--red",
    requested: "badge badge--yellow",
    processing: "badge badge--yellow",
    pending: "badge badge--yellow",
    queued: "badge badge--blue",
    open: "badge badge--yellow",
    archived: "badge badge--slate",
    idle: "badge badge--yellow",
    customs: "badge badge--purple",
    accident: "badge badge--red",
    unpaid: "badge badge--red",
    failed: "badge badge--red",
    impound: "badge badge--orange",
    abandon: "badge badge--slate",
    sold: "badge badge--blue",
    written_off: "badge badge--red",
    free: "badge badge--slate",
    planned: "badge badge--slate",
  };

  return tones[status] ?? "badge badge--slate";
}

export function getPaymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    succeeded: "Завершён",
    processing: "В обработке",
    failed: "Ошибка",
  };

  return labels[status] ?? getStatusLabel(status);
}

export function getPaymentProviderLabel(provider: string): string {
  const labels: Record<string, string> = {
    bakai: "Bakai",
    cash: "Наличные",
    bank: "Банк",
  };

  return labels[provider] ?? provider;
}

export function getPayoutStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    requested: "На согласовании",
    approved: "Одобрена",
    rejected: "Отклонена",
    processing: "В обработке",
    failed: "Ошибка",
  };

  return labels[status] ?? getStatusLabel(status);
}

export function getOutboxStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    published: "Отправлено",
    queued: "В очереди",
    failed: "Ошибка отправки",
    pending: "Ожидает обработку",
  };

  return labels[status] ?? getStatusLabel(status);
}

export function getOutboxTopicLabel(topic: string): string {
  const labels: Record<string, string> = {
    "payment.created": "Создан платёж",
    "payment.registered": "Платёж зарегистрирован",
    "payout.requested": "Запрошен вывод",
    "payout.approved": "Вывод одобрен",
    "driver.credit.created": "Создан свободный остаток",
    "driver.credit.written_off": "Списан свободный остаток",
    "driver_status_request.approved": "Подтверждение одобрено",
    "driver_status_request.rejected": "Подтверждение отклонено",
    "contract.paid_off": "Договор закрыт досрочно",
  };

  return labels[topic] ?? topic;
}

export function getAggregateTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    payment: "Платёж",
    payout: "Вывод",
    contract: "Договор",
    driver: "Водитель",
    car: "Автомобиль",
    user: "Пользователь",
    system: "Система",
    owner: "Владелец",
    admin: "Администратор",
    finance: "Финансы",
    manager: "Бригадир",
    operator: "Оператор",
    auditor: "Аудитор",
    outbox_event: "Событие",
    driver_status_request: "Подтверждение",
  };

  return labels[type] ?? type;
}

export function getUserRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    owner: "Владелец",
    admin: "Администратор",
    finance: "Финансы",
    manager: "Бригадир",
    operator: "Оператор",
    auditor: "Аудитор",
    driver: "Водитель",
  };

  return labels[role] ?? role;
}

export function getNotificationChannelLabel(channel: string): string {
  const labels: Record<string, string> = {
    push: "Push",
    sms: "SMS",
    in_app: "В приложении",
  };

  return labels[channel] ?? channel;
}

export function getNotificationTemplateLabel(template: string): string {
  const labels: Record<string, string> = {
    payout_requested: "Запрошен вывод",
    payout_approved: "Выплата одобрена",
    payout_rejected: "Выплата отклонена",
    chat_message_received: "Новое сообщение",
    status_request_created: "Новый запрос статуса",
    status_request_approved: "Статус одобрен",
    status_request_rejected: "Статус отклонён",
    driver_photo_uploaded: "Фото водителя загружено",
    driver_photo_approved: "Фото водителя одобрено",
    driver_photo_rejected: "Фото водителя отклонено",
    driver_registered: "Водитель зарегистрировался",
    driver_payment_received: "Платёж водителя",
    contract_completed: "Договор выкуплен",
    contract_terminated: "Договор расторгнут",
    incident_created: "Создан инцидент",
    incident_updated: "Инцидент обновлён",
    inspection_created: "Создан осмотр",
    password_reset_requested: "Запрос сброса пароля",
    password_reset_completed: "Пароль сброшен",
  };

  return labels[template] ?? template;
}

export function getNotificationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Ожидает отправки",
    failed: "Ошибка доставки",
    published: "Отправлено",
  };

  return labels[status] ?? getStatusLabel(status);
}

export function getIncidentPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    low: "Низкий",
    medium: "Средний",
    high: "Высокий",
    critical: "Критичный",
  };

  return labels[priority] ?? priority;
}

export function getIncidentTypeLabel(type: string | undefined): string {
  const labels: Record<string, string> = {
    accident: "ДТП",
    insurance: "Страховка",
    insurance_gps: "Страховка и ТО",
    repair: "СТО",
    fine: "Штраф",
    inspection: "Осмотр",
    blacklist: "Чёрный список",
    finance: "Финансовый риск",
    general: "Инцидент",
  };

  return labels[type ?? "general"] ?? type ?? "Инцидент";
}

export function getLedgerTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    payment: "Платёж",
    payout: "Выплата",
    obligation: "Начисление",
    adjustment: "Корректировка",
  };

  return labels[type] ?? type;
}

export function getCurrencyLabel(currency: string): string {
  const labels: Record<string, string> = {
    KGS: "сом",
    USD: "USD",
  };

  return labels[currency] ?? currency;
}

export function getAuditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    "outbox.event.published": "Событие отправлено",
    "outbox.event.failed": "Ошибка отправки события",
    "system.post": "Действие в системе: создание",
    "system.patch": "Действие в системе: изменение",
    "system.delete": "Действие в системе: удаление",
    "payout.approved": "Вывод одобрен",
    "payout.created": "Создан вывод",
    "payout.rejected": "Вывод отклонён",
    "payment.created": "Создан платёж",
    "obligation.payment.applied": "Платёж учтён",
    "user.created": "Создан пользователь",
    "user.updated": "Пользователь изменён",
    "user.blocked": "Пользователь удалён/заблокирован",
    "user.password.changed": "Пароль изменён",
    "driver.password.reset": "Пароль водителя сброшен",
    "driver.created": "Создан водитель",
    "driver.updated": "Водитель изменён",
    "driver.manager_changed": "Бригадир водителя изменён",
    "driver.photo.approved": "Фото водителя одобрено",
    "driver.photo.rejected": "Фото водителя отклонено",
    "driver.credit.created": "Создан свободный остаток",
    "driver.credit.written_off": "Списан свободный остаток",
    "car.created": "Создан автомобиль",
    "car.updated": "Автомобиль изменён",
    "contract.created": "Создан договор",
    "contract.updated": "Договор изменён",
    "contract.status.active": "Договор возвращён в работу",
    "contract.status.terminated": "Договор расторгнут",
    "contract.status.closed": "Договор выкуплен",
    "contract.status.problem": "Договор отмечен проблемным",
    "driver_status_request.approved": "Подтверждение одобрено",
    "driver_status_request.rejected": "Подтверждение отклонено",
    "contract.paid_off": "Договор закрыт досрочно",
  };

  return labels[action] ?? action;
}

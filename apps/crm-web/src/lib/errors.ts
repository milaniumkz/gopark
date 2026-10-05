export function localizeApiError(message: string, statusCode?: number): string {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    if (statusCode === 400) return "Проверьте заполненные данные.";
    if (statusCode === 403) return "Недостаточно прав для этого действия.";
    if (statusCode === 404) return "Запись не найдена или уже удалена.";
    if (statusCode === 409) return "Такая запись уже есть в системе.";
    if (statusCode === 413) return "Файл слишком большой. Уменьшите фото и попробуйте снова.";
    if (statusCode && statusCode >= 500) return "На сервере произошла ошибка. Попробуйте ещё раз или обратитесь к администратору.";
    return "Не удалось выполнить запрос. Попробуйте ещё раз.";
  }
  if (normalized.includes("session expired") || normalized.includes("crm session is not initialized")) {
    return "Сессия истекла. Войдите заново.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("networkerror") || normalized.includes("load failed")) {
    return "Нет связи с сервером. Проверьте интернет и попробуйте снова.";
  }
  if (normalized.includes("internal server error")) {
    return "На сервере произошла ошибка. Попробуйте ещё раз или обратитесь к администратору.";
  }
  if (normalized.includes("driver phone is already registered")) {
    return "Водитель с таким номером уже зарегистрирован.";
  }
  if (normalized.includes("current manager cannot use this driver")) {
    return "Этот водитель не закреплён за текущим бригадиром.";
  }
  if (normalized.includes("field \"") && normalized.includes("required")) {
    return "Заполните обязательные поля.";
  }
  if (normalized.includes("insufficient role") || normalized.includes("forbidden")) {
    return "Недостаточно прав для этого действия.";
  }
  if (normalized.includes("not found")) {
    return "Запись не найдена или уже удалена.";
  }
  if (normalized.includes("bad request")) {
    return "Проверьте заполненные данные.";
  }
  if (normalized.includes("only pending status requests can be reviewed")) {
    return "Эта заявка уже рассмотрена.";
  }
  if (normalized.includes("payment calendar date must be yyyy-mm-dd")) {
    return "Дата календаря платежей указана неверно.";
  }
  if (normalized.includes("unknown payment calendar day status")) {
    return "Неизвестный статус дня в календаре платежей.";
  }
  if (normalized.includes("payload too large")) {
    return "Файл слишком большой. Уменьшите фото и попробуйте снова.";
  }
  if (normalized.includes("request failed")) {
    return statusCode ? `Не удалось выполнить запрос. Код ошибки: ${statusCode}.` : "Не удалось выполнить запрос.";
  }
  return message.trim();
}

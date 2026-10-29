type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export type ServiceValidationMode =
  | "save"
  | "arrival"
  | "complete"
  | "partial"
  | "full"
  | "dispatch";
function check(field: Field) {
  field.setCustomValidity(
    field.required && !field.value.trim() ? "Заполните это поле" : "",
  );
  return field.validity.valid;
}
function mark(field: Field, invalid: boolean) {
  field.classList.toggle("sto-field-invalid", invalid);
  if (invalid) field.setAttribute("aria-invalid", "true");
  else field.removeAttribute("aria-invalid");
  const label = field.closest("label");
  if (invalid && label)
    label.dataset.validationError =
      field.validity.valueMissing || field.validity.customError
        ? "Заполните это поле"
        : "Укажите корректное значение";
  else if (label) delete label.dataset.validationError;
}
export function clearServiceValidation(root: HTMLElement | null) {
  root?.querySelectorAll<Field>("input,select,textarea").forEach((field) => {
    field.setCustomValidity("");
    mark(field, false);
  });
}
export function updateServiceValidation(target: EventTarget | null) {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  ) {
    if (target.classList.contains("sto-field-invalid") && check(target))
      mark(target, false);
  }
}
export function validateServiceFields(
  root: HTMLElement | null,
  mode: ServiceValidationMode,
): boolean {
  if (!root) return false;
  let first: Field | undefined;
  for (const field of root.querySelectorAll<Field>("input,select,textarea")) {
    if (
      field.dataset.validationFor &&
      !field.dataset.validationFor.split(" ").includes(mode)
    ) {
      mark(field, false);
      continue;
    }
    if (!field.willValidate) {
      mark(field, false);
      continue;
    }
    const valid = check(field);
    mark(field, !valid);
    if (!valid) first ??= field;
  }
  if (first) {
    first.scrollIntoView({ block: "center", behavior: "smooth" });
    first.focus({ preventScroll: true });
    first.reportValidity();
    return false;
  }
  return true;
}

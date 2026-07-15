/**
 * Moves focus to the first control reporting invalid below `root` — after a
 * failed submit or a blocked wizard step. `aria-invalid` may sit on a group
 * container (a radio fieldset), so the first focusable control inside wins.
 */
export function focusFirstInvalid(root: ParentNode | null | undefined): void {
  const invalid = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!invalid) return;

  const control = invalid.matches("input, select, textarea")
    ? invalid
    : invalid.querySelector<HTMLElement>("input, select, textarea");
  (control ?? invalid).focus();
}

import { ApiError } from '../api';

/** What went wrong while doing something on a page: the action ("Adding the number"), and the error. */
export type Problem = { action: string; error: unknown } | null;

/** A problem with one form field: shown next to it. */
export type FieldProblem = { field: string; message: string } | null;

export const problemMessage = (error: unknown) => (error instanceof Error ? error.message : String(error || 'Something went wrong.'));

/** The field the server says is wrong, with its message; null when the error is not about one field. */
export const fieldProblem = (error: unknown): FieldProblem => (error instanceof ApiError && error.field
  ? { field: error.field, message: error.message } : null);

/** Scroll to the field and put the cursor in it, so the person sees what to fix. */
export function focusField(form: HTMLElement | null, field: string) {
  const input = form?.querySelector<HTMLElement>(`[name="${field}"]`);
  if (!input) return;
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus({ preventScroll: true });
}

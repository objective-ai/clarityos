/**
 * lib/case-convert.ts
 *
 * Utilities for converting between camelCase (TypeScript/JavaScript convention)
 * and snake_case (Python/FastAPI convention). Used by apiFetch to transparently
 * convert request payloads and response bodies.
 */

/**
 * Converts a single snake_case string to camelCase.
 * e.g. "patient_id" -> "patientId"
 */
export function toCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Converts a single camelCase string to snake_case.
 * e.g. "patientId" -> "patient_id"
 */
export function toSnake(str: string): string {
  return str.replace(/([A-Z])/g, (letter: string) => `_${letter.toLowerCase()}`);
}

/**
 * Recursively converts all object keys from snake_case to camelCase.
 * Arrays are iterated element-by-element. Primitive values pass through unchanged.
 */
export function camelizeKeys<T = unknown>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => camelizeKeys(item)) as T;
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[toCamel(key)] = camelizeKeys(value);
    }
    return result as T;
  }
  return obj as T;
}

/**
 * Recursively converts all object keys from camelCase to snake_case.
 * Arrays are iterated element-by-element. Primitive values pass through unchanged.
 */
export function snakifyKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => snakifyKeys(item));
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[toSnake(key)] = snakifyKeys(value);
    }
    return result;
  }
  return obj;
}

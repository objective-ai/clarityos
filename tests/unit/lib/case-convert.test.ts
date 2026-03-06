import { describe, test, expect } from "vitest";
import {
  toCamel,
  toSnake,
  camelizeKeys,
  snakifyKeys,
} from "@/lib/case-convert";

describe("toCamel", () => {
  test("converts snake_case to camelCase", () => {
    expect(toCamel("patient_id")).toBe("patientId");
  });

  test("handles multiple underscores", () => {
    expect(toCamel("created_at_time")).toBe("createdAtTime");
  });

  test("returns single word unchanged", () => {
    expect(toCamel("name")).toBe("name");
  });

  test("leaves already camelCase unchanged", () => {
    expect(toCamel("patientId")).toBe("patientId");
  });
});

describe("toSnake", () => {
  test("converts camelCase to snake_case", () => {
    expect(toSnake("patientId")).toBe("patient_id");
  });

  test("handles multiple uppercase letters", () => {
    expect(toSnake("createdAtTime")).toBe("created_at_time");
  });

  test("returns single word unchanged", () => {
    expect(toSnake("name")).toBe("name");
  });
});

describe("camelizeKeys", () => {
  test("converts object keys from snake_case to camelCase", () => {
    const input = { patient_id: "123", first_name: "Jane" };
    expect(camelizeKeys(input)).toEqual({
      patientId: "123",
      firstName: "Jane",
    });
  });

  test("handles nested objects", () => {
    const input = { patient_info: { first_name: "Jane" } };
    expect(camelizeKeys(input)).toEqual({
      patientInfo: { firstName: "Jane" },
    });
  });

  test("handles arrays of objects", () => {
    const input = [{ first_name: "Jane" }, { first_name: "John" }];
    expect(camelizeKeys(input)).toEqual([
      { firstName: "Jane" },
      { firstName: "John" },
    ]);
  });

  test("passes primitives through unchanged", () => {
    expect(camelizeKeys("hello")).toBe("hello");
    expect(camelizeKeys(42)).toBe(42);
    expect(camelizeKeys(true)).toBe(true);
  });

  test("handles null", () => {
    expect(camelizeKeys(null)).toBeNull();
  });
});

describe("snakifyKeys", () => {
  test("converts object keys from camelCase to snake_case", () => {
    const input = { patientId: "123", firstName: "Jane" };
    expect(snakifyKeys(input)).toEqual({
      patient_id: "123",
      first_name: "Jane",
    });
  });

  test("handles nested objects", () => {
    const input = { patientInfo: { firstName: "Jane" } };
    expect(snakifyKeys(input)).toEqual({
      patient_info: { first_name: "Jane" },
    });
  });

  test("handles arrays of objects", () => {
    const input = [{ firstName: "Jane" }, { firstName: "John" }];
    expect(snakifyKeys(input)).toEqual([
      { first_name: "Jane" },
      { first_name: "John" },
    ]);
  });

  test("passes primitives through unchanged", () => {
    expect(snakifyKeys("hello")).toBe("hello");
    expect(snakifyKeys(42)).toBe(42);
    expect(snakifyKeys(null)).toBeNull();
  });
});

"use client";

import { useCallback, useRef, useState } from "react";
import type { ExamSection, StructureFinding } from "@/types/exam-findings";
import type { ScribeStructureFindingV2, ScribeExamFindingsV2 } from "@/types/scribe";
import { useExamFindingsStore } from "@/store/examFindingsStore";
import { mapAiStatus } from "@/lib/ai-status-mapper";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MergeFieldState {
  original: StructureFinding;
  inserted: boolean;
}

type MergeStateMap = Record<string, MergeFieldState>;

function makeKey(section: string, eye: string, structure: string): string {
  return `${section}.${eye}.${structure}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMergeState(
  encounterId: string,
  examFindings: ScribeExamFindingsV2 | undefined,
) {
  const [state, setState] = useState<MergeStateMap>({});
  const snapshotTaken = useRef(false);
  const snapshotRef = useRef<MergeStateMap>({});

  // Take snapshot of current store values on first render
  if (!snapshotTaken.current && examFindings) {
    snapshotTaken.current = true;
    const store = useExamFindingsStore.getState();
    const snap: MergeStateMap = {};

    for (const [sectionShort, sectionData] of Object.entries(examFindings)) {
      if (!sectionData) continue;
      const section: ExamSection = sectionShort === "anterior" ? "anterior_segment" : "posterior_segment";
      const storeKey = `${encounterId}:${section}` as `${string}:${ExamSection}`;
      const draft = store.findings[storeKey]?.draft;

      for (const eye of ["OD", "OS"] as const) {
        const structures = sectionData[eye];
        if (!structures) continue;
        const eyeLower = eye.toLowerCase() as "od" | "os";
        const eyeFindings = eyeLower === "od" ? draft?.findings_od : draft?.findings_os;

        for (const structure of Object.keys(structures)) {
          const key = makeKey(sectionShort, eyeLower, structure);
          snap[key] = {
            original: eyeFindings?.[structure] ?? { status: "", severity: null, finding: "" },
            inserted: false,
          };
        }
      }
    }
    snapshotRef.current = snap;
    // Don't setState here — initial state is empty, isInserted returns false
  }

  const setStructureField = useExamFindingsStore.getState().setStructureField;

  // Check if AI has matching OD+OS values for a structure
  const hasMatchingOu = useCallback(
    (sectionShort: string, structure: string): boolean => {
      if (!examFindings) return false;
      const sectionData = examFindings[sectionShort as keyof ScribeExamFindingsV2];
      if (!sectionData) return false;
      const od = sectionData.OD?.[structure];
      const os = sectionData.OS?.[structure];
      if (!od || !os) return false;
      return od.status === os.status && od.notes === os.notes;
    },
    [examFindings],
  );

  const insertField = useCallback(
    (sectionShort: string, eye: "od" | "os", structure: string, aiFinding: ScribeStructureFindingV2) => {
      const section: ExamSection = sectionShort === "anterior" ? "anterior_segment" : "posterior_segment";
      const mapped = mapAiStatus(section, structure, aiFinding.status, aiFinding.notes);

      const doInsert = (targetEye: "od" | "os") => {
        const key = makeKey(sectionShort, targetEye, structure);

        // Ensure we have the original snapshot
        if (!snapshotRef.current[key]) {
          const store = useExamFindingsStore.getState();
          const storeKey = `${encounterId}:${section}` as `${string}:${ExamSection}`;
          const draft = store.findings[storeKey]?.draft;
          const eyeFindings = targetEye === "od" ? draft?.findings_od : draft?.findings_os;
          snapshotRef.current[key] = {
            original: eyeFindings?.[structure] ?? { status: "", severity: null, finding: "" },
            inserted: false,
          };
        }

        // Write to store
        setStructureField(encounterId, section, targetEye, structure, "status", mapped.status);
        if (mapped.finding) {
          setStructureField(encounterId, section, targetEye, structure, "finding", mapped.finding);
        }

        setState((prev) => ({
          ...prev,
          [key]: { ...snapshotRef.current[key], inserted: true },
        }));
      };

      doInsert(eye);

      // OU auto-insert: if AI has matching OD+OS, insert both
      if (hasMatchingOu(sectionShort, structure)) {
        const otherEye = eye === "od" ? "os" : "od";
        doInsert(otherEye);
      }
    },
    [encounterId, hasMatchingOu, setStructureField],
  );

  const revertField = useCallback(
    (sectionShort: string, eye: "od" | "os", structure: string) => {
      const section: ExamSection = sectionShort === "anterior" ? "anterior_segment" : "posterior_segment";
      const key = makeKey(sectionShort, eye, structure);
      const snap = snapshotRef.current[key];
      if (!snap) return;

      setStructureField(encounterId, section, eye, structure, "status", snap.original.status);
      setStructureField(encounterId, section, eye, structure, "finding", snap.original.finding);

      setState((prev) => ({
        ...prev,
        [key]: { ...snap, inserted: false },
      }));
    },
    [encounterId, setStructureField],
  );

  const isInserted = useCallback(
    (sectionShort: string, eye: "od" | "os", structure: string): boolean => {
      return state[makeKey(sectionShort, eye, structure)]?.inserted ?? false;
    },
    [state],
  );

  const insertAll = useCallback(
    (sectionShort: string) => {
      if (!examFindings) return;
      const sectionData = examFindings[sectionShort as keyof ScribeExamFindingsV2];
      if (!sectionData) return;

      for (const eye of ["OD", "OS"] as const) {
        const structures = sectionData[eye];
        if (!structures) continue;
        const eyeLower = eye.toLowerCase() as "od" | "os";
        for (const [structure, finding] of Object.entries(structures)) {
          if (!isInserted(sectionShort, eyeLower, structure)) {
            insertField(sectionShort, eyeLower, structure, finding);
          }
        }
      }
    },
    [examFindings, insertField, isInserted],
  );

  // Count how many AI suggestions exist vs how many are inserted
  const getCounts = useCallback(
    (sectionShort: string): { total: number; inserted: number } => {
      if (!examFindings) return { total: 0, inserted: 0 };
      const sectionData = examFindings[sectionShort as keyof ScribeExamFindingsV2];
      if (!sectionData) return { total: 0, inserted: 0 };

      let total = 0;
      let inserted = 0;
      for (const eye of ["OD", "OS"] as const) {
        const structures = sectionData[eye];
        if (!structures) continue;
        const eyeLower = eye.toLowerCase() as "od" | "os";
        for (const structure of Object.keys(structures)) {
          total++;
          if (isInserted(sectionShort, eyeLower, structure)) inserted++;
        }
      }
      return { total, inserted };
    },
    [examFindings, isInserted],
  );

  return {
    insertField,
    revertField,
    isInserted,
    insertAll,
    getCounts,
    hasMatchingOu,
  };
}

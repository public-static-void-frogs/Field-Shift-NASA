import { useCallback, useMemo, useState } from 'react';
import type { CatalogFeature, DetectedField } from '../../../types/maps/map.types.ts';
import {
  appendSection,
  cancelSection,
  selectedSectionIds,
  setSectionCropSelection,
  toSectionField,
  toggleSectionField,
  type MapSection,
  type SectionCoordinate,
  type SectionSelection,
} from '../utils/sectionSelection.ts';

/** Sections and their field membership are transient and never mutate saved farm fields. */
export function useMapSections() {
  const [state, setState] = useState<SectionSelection>({
    sections: [],
    looseFields: [],
    activeId: null,
  });
  const draw = useCallback((outline: SectionCoordinate[], features: CatalogFeature[]) => {
    const section: MapSection = {
      id: crypto.randomUUID(),
      outline,
      fields: features.map(toSectionField),
      added: false,
    };
    setState((previous) => appendSection(previous, section));
  }, []);
  const toggle = useCallback((feature: CatalogFeature) => {
    setState((previous) => toggleSectionField(previous, toSectionField(feature)));
  }, []);
  const activate = useCallback((id: string) => {
    setState((previous) => ({
      ...previous,
      activeId: id,
      sections: previous.sections.map((section) =>
        section.id === id ? { ...section, added: true } : section,
      ),
    }));
  }, []);
  const cancel = useCallback((id: string) => {
    setState((previous) => cancelSection(previous, id));
  }, []);
  const beginAnalysis = useCallback((id: string, token: string) => {
    setState((previous) => ({
      ...previous,
      sections: previous.sections.map((section) =>
        section.id === id
          ? {
              ...section,
              analysisStatus: 'pending',
              analysisToken: token,
              analysisError: undefined,
              detectedFields: undefined,
              excludedFields: [],
            }
          : section,
      ),
    }));
  }, []);
  const completeAnalysis = useCallback((id: string, token: string, fields: DetectedField[]) => {
    setState((previous) => ({
      ...previous,
      sections: previous.sections.map((section) =>
        section.id === id && section.analysisToken === token
          ? {
              ...section,
              analysisStatus: 'complete',
              detectedFields: fields,
              excludedFields: [],
            }
          : section,
      ),
    }));
  }, []);
  const failAnalysis = useCallback((id: string, token: string, error: string) => {
    setState((previous) => ({
      ...previous,
      sections: previous.sections.map((section) =>
        section.id === id && section.analysisToken === token
          ? { ...section, analysisStatus: 'failed', analysisError: error }
          : section,
      ),
    }));
  }, []);
  const abortAnalysis = useCallback((id: string, token: string) => {
    setState((previous) => ({
      ...previous,
      sections: previous.sections.map((section) =>
        section.id === id && section.analysisToken === token && section.analysisStatus === 'pending'
          ? { ...section, analysisStatus: undefined, analysisToken: undefined }
          : section,
      ),
    }));
  }, []);
  const toggleDetectedField = useCallback((id: string, fieldId: string) => {
    setState((previous) => ({
      ...previous,
      sections: previous.sections.map((section) => {
        if (section.id !== id) {
          return section;
        }
        const excluded = new Set(section.excludedFields ?? []);
        if (!excluded.delete(fieldId)) {
          excluded.add(fieldId);
        }
        return { ...section, excludedFields: [...excluded] };
      }),
    }));
  }, []);
  const setCropSelection = useCallback(
    (id: string, crop: DetectedField['crop'], included: boolean) => {
      setState((previous) => ({
        ...previous,
        sections: previous.sections.map((section) =>
          section.id === id ? setSectionCropSelection(section, crop, included) : section,
        ),
      }));
    },
    [],
  );
  const selectedIds = useMemo(() => selectedSectionIds(state), [state]);
  const activeSection = state.sections.find((section) => section.id === state.activeId) ?? null;

  return {
    sections: state.sections,
    selectedIds,
    activeSection,
    draw,
    toggle,
    activate,
    cancel,
    beginAnalysis,
    completeAnalysis,
    failAnalysis,
    abortAnalysis,
    toggleDetectedField,
    setCropSelection,
  };
}

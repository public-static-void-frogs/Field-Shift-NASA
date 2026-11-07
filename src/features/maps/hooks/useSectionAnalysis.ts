import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMap } from 'react-leaflet';
import { sectionAnalysisMutations } from '../../../api/section-analysis/section-analysis.mutations.ts';
import type { DetectedField } from '../../../types/maps/map.types.ts';
import { captureSectionImage, MapCaptureError } from '../utils/captureSectionImage.ts';
import type { MapSection } from '../utils/sectionSelection.ts';

export type SectionAnalysisActions = {
  begin: (id: string, token: string) => void;
  complete: (id: string, token: string, fields: DetectedField[]) => void;
  fail: (id: string, token: string, error: string) => void;
  abort: (id: string, token: string) => void;
};

export function useSectionAnalysis(section: MapSection, actions: SectionAnalysisActions) {
  const map = useMap();
  const { t } = useTranslation();
  const mutation = useMutation(sectionAnalysisMutations.analyze());
  const current = useRef<{ controller: AbortController; token: string } | null>(null);
  const { abort } = actions;
  useEffect(
    () => () => {
      const active = current.current;
      if (active) {
        active.controller.abort();
        abort(section.id, active.token);
      }
    },
    [section.id, abort],
  );
  async function analyze() {
    if (current.current) {
      return;
    }
    const controller = new AbortController();
    const token = crypto.randomUUID();
    current.current = { controller, token };
    actions.begin(section.id, token);
    try {
      const image = await captureSectionImage(map, section, controller.signal);
      const ring = section.outline.map(([latitude, longitude]) => [longitude, latitude]);
      if (
        ring.length &&
        (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
      ) {
        ring.push([...ring[0]]);
      }
      const result = await mutation.mutateAsync({
        input: {
          points: section.fields.map(({ id, coordinates }) => ({ id, coordinates })),
          image,
          region: { type: 'Polygon', coordinates: [ring] },
        },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        actions.complete(section.id, token, result.fields);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        actions.fail(
          section.id,
          token,
          error instanceof MapCaptureError
            ? t('Unable to capture map imagery.')
            : t('Unable to analyze this section.'),
        );
      }
    } finally {
      if (current.current?.token === token) {
        current.current = null;
      }
      mutation.reset();
    }
  }

  return { analyze };
}

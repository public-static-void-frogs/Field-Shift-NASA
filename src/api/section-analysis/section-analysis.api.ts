import type { Polygon } from 'geojson';
import type { DetectedField, MapBounds } from '../../types/maps/map.types.ts';
import { request } from '../core/http.ts';

export type AnalysisPoint = { id: string; coordinates: [number, number] };
export type SectionMapImage = {
  dataUrl: string;
  width: number;
  height: number;
  bounds: MapBounds;
  crs: 'EPSG:3857';
};
export type AnalyzeSectionInput = {
  points: AnalysisPoint[];
  image: SectionMapImage;
  region: Polygon;
};
export type SectionAnalysisResult = {
  requestId: string;
  mock: false;
  model: 'sam2-tiny+tempcnn';
  skippedPoints: { pointId: string; reason: string }[];
  provenance: {
    segmentationInputs: 'submitted_map_image_and_points';
    cropInputs: 'synthetic';
    syntheticCropInputs: true;
    sequenceShape: [16, 3];
    seed: number;
    perturbationProbability: number;
    maxPerturbation: number;
    cropLabelSource: 'unmapped_class_indices' | 'training_class_mapping';
    classLabels: string[];
    device: string;
  };
  fields: DetectedField[];
};

export const sectionAnalysisApi = {
  analyze: (input: AnalyzeSectionInput, signal: AbortSignal): Promise<SectionAnalysisResult> =>
    request('/maps/sections/analyze', {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
      timeoutMs: 300_000,
    }),
};

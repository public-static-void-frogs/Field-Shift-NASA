import { mutationOptions } from '@tanstack/react-query';
import { sectionAnalysisApi, type AnalyzeSectionInput } from './section-analysis.api.ts';

export const sectionAnalysisMutations = {
  analyze: () =>
    mutationOptions({
      mutationKey: ['section-analysis', 'analyze'],
      mutationFn: ({ input, signal }: { input: AnalyzeSectionInput; signal: AbortSignal }) =>
        sectionAnalysisApi.analyze(input, signal),
      retry: false,
      gcTime: 0,
    }),
};

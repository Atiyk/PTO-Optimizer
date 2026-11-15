import type { SolveInput } from '@daysoff/engine/solver/types';
import { previewPinnedDay, type PinPreview } from '../ui/pinPreview';
import type { StyledSolveOptions } from './yearPlan';

export interface PinPreviewRequest { id: number; input: SolveInput; options: StyledSolveOptions; date: string }
export interface PinPreviewResponse { id: number; preview: PinPreview | null }

self.addEventListener('message', (event: MessageEvent<PinPreviewRequest>) => {
  const { id, input, options, date } = event.data;
  let preview: PinPreview | null;
  try { preview = previewPinnedDay(input, options, date); } catch { preview = null; }
  self.postMessage({ id, preview } satisfies PinPreviewResponse);
});

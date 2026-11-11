import type { SolveInput } from '@daysoff/engine/solver/types';
import { previewPinnedDay, type PinPreview } from '../ui/pinPreview';
import type { ConsumerSolveOptions } from './optimizer';

export interface PinPreviewRequest { id: number; input: SolveInput; options: ConsumerSolveOptions; date: string }
export interface PinPreviewResponse { id: number; preview: PinPreview | null }

self.addEventListener('message', (event: MessageEvent<PinPreviewRequest>) => {
  const { id, input, options, date } = event.data;
  let preview: PinPreview | null;
  try { preview = previewPinnedDay(input, options, date); } catch { preview = null; }
  self.postMessage({ id, preview } satisfies PinPreviewResponse);
});

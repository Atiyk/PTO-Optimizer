import { computePlannerJob, computePlannerOutcome, type PlannerComputationJob, type PlannerWorkerMessage } from './plannerComputation';

function send(message: PlannerWorkerMessage) {
  self.postMessage(message);
}

self.addEventListener('message', (event: MessageEvent<PlannerComputationJob>) => {
  const { request, existingOutcome } = event.data;
  const outcome = existingOutcome ?? computePlannerOutcome(request);
  if (!existingOutcome) send({ phase: 'plan', outcome });
  // Show a funded result as soon as its solve finishes. The multi-solve score
  // sweep can finish separately without delaying the primary plan.
  send({ phase: 'scores', scores: computePlannerJob({ request, existingOutcome: outcome }).scores });
});

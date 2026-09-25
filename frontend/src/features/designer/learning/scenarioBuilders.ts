import type { LearningContext, LearningScenario, ScenarioBindings, ScenarioInstance, InvoiceExercise, PaymentInstruction } from '../../../types/learning';
import { addDataLink, addSession, emptyGraph, makeId } from '../system/graph.ts';
import { createInvoiceExercise } from './finance/invoice.ts';
import { createPaymentInstruction } from './finance/paymentAuthorization.ts';
import { financialPayload } from './outcomes.ts';

export function createLearningScenario(experienceId: LearningContext['experienceId']): LearningScenario {
  let graph = emptyGraph();
  const trusted = experienceId === 'q_authorization_vault';
  graph.name = trusted ? 'Q-Authorization Vault' : 'Hóa đơn điện tử & công nợ';
  const a = makeId(), b = makeId(), c = makeId();
  graph.nodes = [
    { id: a, type: 'participant', name: trusted ? 'Alice · Trung tâm chính' : 'Chi nhánh', position: { x: 50, y: trusted ? 270 : 90 }, config: {} },
    { id: b, type: 'participant', name: trusted ? 'Bob · Trung tâm phê duyệt' : 'Trung tâm kế toán', position: { x: 610, y: trusted ? 270 : 90 }, config: {} },
    ...(trusted ? [{ id: c, type: 'key_distributor' as const, name: 'Charlie · Bên phân phối khóa', position: { x: 330, y: 20 }, config: {} }] : []),
  ];
  graph = addDataLink(addSession(graph, trusted ? 'trusted_distributor' : 'direct_bb84', a, b, trusted ? c : undefined), a, b);
  graph.quantumPaths = graph.quantumPaths.map(p => ({ ...p, providerConfig: {
    model: 'current_fso', dataset: 'clearlowSI.csv', windowStart: 0, Pt_dBm: 5, xi: 30, thresholdMode: 'adaptive',
  } }));
  const bindings: ScenarioBindings = { senderNodeId: a, receiverNodeId: b, ...(trusted ? { distributorNodeId: c } : {}),
    sessionId: graph.qkdSessions[0].id, pathIds: graph.quantumPaths.map(p => p.id), dataEdgeId: graph.edges[0].id };
  const createdAt = new Date().toISOString();
  const context: LearningContext = trusted
    ? { experienceId: 'q_authorization_vault', bindings, createdAt, finance: { ...createPaymentInstruction(), dailyLimitRemainingVnd: 8000000000 } }
    : { experienceId: 'electronic_invoice', bindings, createdAt, finance: createInvoiceExercise() };
  if (context.experienceId === 'electronic_invoice') context.finance.payments = context.finance.payments.map(p => p.paymentId === 'TT-DEMO-C' ? { ...p, amountVnd: 3000000 } : p);
  return { graph, context };
}

export function buildInvoiceScenario(): ScenarioInstance<InvoiceExercise> {
  const { graph, context } = createLearningScenario('electronic_invoice');
  if (context.experienceId !== 'electronic_invoice') throw new Error('Invalid scenario');
  return { experienceId: context.experienceId, graph, bindings: context.bindings, finance: context.finance, initialPayload: financialPayload(context) };
}
export function buildAuthorizationScenario(): ScenarioInstance<PaymentInstruction> {
  const { graph, context } = createLearningScenario('q_authorization_vault');
  if (context.experienceId !== 'q_authorization_vault') throw new Error('Invalid scenario');
  return { experienceId: context.experienceId, graph, bindings: context.bindings, finance: context.finance, initialPayload: financialPayload(context) };
}

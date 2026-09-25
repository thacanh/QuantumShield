import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateInvoice, createInvoiceExercise, reconciliationCorrect } from '../src/features/designer/learning/finance/invoice.ts';
import { authorizationControls, createPaymentInstruction } from '../src/features/designer/learning/finance/paymentAuthorization.ts';
import { createLearningScenario } from '../src/features/designer/learning/scenarioBuilders.ts';
import { deriveInvoiceOutcome, deriveAuthorizationOutcome, financialPayload, financeReadiness, payloadIssue, scenarioDesignIssues } from '../src/features/designer/learning/outcomes.ts';
import { exportDesign, importDesign } from '../src/features/designer/system/persistence.ts';
import { comparisonSnapshot } from '../src/features/designer/experiment/comparison.ts';
import { answerDecision, applyFinanceDecisions, emptyProgress, financeDecisions, financeMastered, observeLearningRun, retryDecision, securityDecisions } from '../src/features/designer/learning/decisions.ts';
import { directTemplate } from '../src/features/designer/system/graph.ts';

test('LAN HTTP without randomUUID can open all learning tracks with valid unique graph IDs', () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues } });
  try {
    const graphs = [directTemplate(), ...['q_authorization_vault', 'electronic_invoice'].map(id => createLearningScenario(id).graph)];
    const ids = graphs.flatMap(g => [g.id, ...[...g.nodes, ...g.edges, ...g.quantumPaths, ...g.qkdSessions].map(entity => entity.id)]);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    for (const graph of graphs) assert.deepEqual(importDesign(exportDesign(graph)), graph);
  } finally {
    Object.defineProperty(globalThis, 'crypto', originalCrypto);
  }
});

function scenario(id = 'electronic_invoice') {
  const s = createLearningScenario(id);
  if (id === 'electronic_invoice') Object.assign(s.context.finance, { selectedPaymentIds: ['TT-DEMO-A'], reconciled: true });
  else Object.assign(s.context.finance, { makerDecision: 'APPROVED', checkerDecision: 'APPROVED' });
  return s;
}
function resultFor(s) {
  return { id: 'experiment-test', state: 'completed', scope: 'qkd', graphSnapshot: structuredClone(s.graph),
    sessions: [{ sessionId: s.context.bindings.sessionId, protocol: s.graph.qkdSessions[0].protocol, qkdStatus: 'completed', keyStatus: 'verified', finalKeyLength: 512, siftedCount: 700, siftRatio: .4, qber: 0 }],
    dataResults: [{ edgeId: s.context.bindings.dataEdgeId, sessionId: s.context.bindings.sessionId, protection: 'aes_256_gcm', applicationStatus: 'encrypted', transmissionStatus: 'delivered', aesReady: true, integrityVerified: true, decryptedPayload: financialPayload(s.context) }] };
}
const derive = (s, r = resultFor(s), text) => (s.context.experienceId === 'electronic_invoice' ? deriveInvoiceOutcome : deriveAuthorizationOutcome)(s.context, s.graph, r, text);

function masterFinance(context) {
  const points = financeDecisions(context);
  return points.reduce((p, q) => answerDecision(p, points, q.id, q.correctId), { ...emptyProgress(), read: true });
}
test('decisions require reading, correct sequence and a valid option; no skipping finance', () => {
  const { context } = createLearningScenario('q_authorization_vault'), points = financeDecisions(context);
  const unread = emptyProgress(), read = { ...unread, read: true };
  assert.equal(answerDecision(unread, points, points[0].id, 'B'), unread);
  assert.equal(answerDecision(read, points, points[1].id, 'C'), read);
  assert.equal(answerDecision(read, points, points[0].id, 'unknown'), read);
  assert.equal(financeMastered(context, read), false);
  assert.throws(() => applyFinanceDecisions(context, read), /Hoàn thành/);
});
test('incorrect attempts get feedback, require retry and remain counted after learning', () => {
  const { context } = createLearningScenario('q_authorization_vault'), points = financeDecisions(context);
  let p = answerDecision({ ...emptyProgress(), read: true }, points, points[0].id, 'B');
  p = answerDecision(p, points, 'vault-compliance', 'B');
  assert.deepEqual(p.answers['vault-compliance'], { selectedId: 'B', attempts: 1, mistakes: 1, solved: false });
  assert.equal(answerDecision(p, points, 'vault-compliance', 'B'), p);
  p = answerDecision(retryDecision(p, 'vault-compliance'), points, 'vault-compliance', 'B');
  p = answerDecision(retryDecision(p, 'vault-compliance'), points, 'vault-compliance', 'C');
  assert.deepEqual(p.answers['vault-compliance'], { selectedId: 'C', attempts: 3, mistakes: 2, solved: true });
  assert.equal(retryDecision(p, 'vault-compliance'), p);
  assert.equal(answerDecision(p, points, 'vault-compliance', 'C'), p);
  assert.equal(p.answers[points[0].id].attempts, 1);
});
test('applying learned decisions creates a valid snapshot without mutating original scenario or balances', () => {
  for (const id of ['electronic_invoice', 'q_authorization_vault']) {
    const { context } = createLearningScenario(id), before = structuredClone(context), p = masterFinance(context);
    assert.ok(financeMastered(context, p));
    const applied = applyFinanceDecisions(context, p);
    assert.ok(financeReadiness(applied).ready);
    assert.deepEqual(context, before);
    if (id === 'electronic_invoice') {
      assert.equal(applied.finance.reconciled, true);
      assert.deepEqual(applied.finance.selectedPaymentIds, ['TT-DEMO-A']);
      assert.equal(applied.finance.payments.find(p => p.paymentId === 'TT-DEMO-C').amountVnd, 3000000);
    } else {
      assert.equal(applied.finance.availableBalanceVnd, 8000000000);
      assert.equal(applied.finance.dailyLimitRemainingVnd, 8000000000);
      assert.notEqual(applied.finance.maker, applied.finance.checker);
      assert.equal(applied.finance.checkerDecision, 'APPROVED');
    }
  }
});
test('knowledge completion cannot override invalid actual business controls', () => {
  const { context } = createLearningScenario('q_authorization_vault'), p = masterFinance(context);
  context.finance.availableBalanceVnd = 4000000000;
  assert.throws(() => applyFinanceDecisions(context, p), /chưa đạt/);
});
test('security decisions require applied finance and a current terminal QKD run', () => {
  const s = scenario('q_authorization_vault'), finance = financeDecisions(s.context), security = securityDecisions(s.context, observeLearningRun(s.context, resultFor(s)));
  const points = [...finance, ...security], p = masterFinance(s.context);
  assert.equal(answerDecision(p, points, security[0].id, 'B', true), p);
  const applied = { ...p, applied: true };
  assert.equal(answerDecision(applied, points, security[0].id, 'B', false), applied);
  assert.equal(answerDecision(applied, points, security[1].id, 'B', true), applied);
  const done = security.reduce((progress, q) => answerDecision(progress, points, q.id, q.correctId, true), applied);
  assert.equal(points.filter(q => done.answers[q.id]?.solved).length, 6);
});
test('observation uses bound real result, excludes secrets and refuses acquisition or waiting data', () => {
  const s = scenario(), r = resultFor(s);
  r.sessions[0].qber = .012; r.sessions[0].preview = [{ secret: 'RAW-SECRET' }];
  r.dataResults[0].ciphertext = 'CIPHER-SECRET'; r.dataResults[0].nonce = 'NONCE-SECRET';
  const observation = observeLearningRun(s.context, r), before = structuredClone(r);
  assert.equal(observation.finalKeyLength, 512); assert.equal(observation.qber, .012);
  assert.equal(observation.outstandingVnd, 5000000);
  assert.equal(observation.outcome.status, 'PROTECTED_DELIVERED');
  assert.equal(/SECRET|decryptedPayload|invoice_reconciliation_snapshot/.test(JSON.stringify(observation)), false);
  assert.deepEqual(r, before);
  for (const patch of [{ scope: 'acquisition' }, { state: 'waiting_for_hardware' }, { state: 'processing' }]) assert.equal(observeLearningRun(s.context, { ...r, ...patch }), undefined);
  r.graphSnapshot.edges[0].id = 'replacement';
  assert.equal(observeLearningRun(s.context, r), undefined);
});
test('illustrative 192-bit question never replaces real metrics; live answer follows success, short key and abort', () => {
  const s = scenario('q_authorization_vault'), r = resultFor(s);
  let observation = observeLearningRun(s.context, r), points = securityDecisions(s.context, observation);
  assert.match(points[0].situation, /minh họa.*192 bit/);
  assert.match(points[2].situation, /512 bit/);
  assert.match(points[2].options.find(o => o.id === 'B').label, /chưa phải đã quyết toán/);
  r.sessions[0].finalKeyLength = 192;
  observation = observeLearningRun(s.context, r);
  assert.match(securityDecisions(s.context, observation)[2].options.find(o => o.id === 'B').label, /chưa đủ/);
  r.sessions[0].qkdStatus = 'aborted'; r.state = 'aborted';
  assert.match(securityDecisions(s.context, observeLearningRun(s.context, r))[2].options.find(o => o.id === 'B').label, /QKD bị hủy/);
});
test('a new experiment requires a new interpretation without clearing earlier mistakes or double counting', () => {
  const s = scenario(), r = resultFor(s), finance = financeDecisions(s.context);
  const security = securityDecisions(s.context, observeLearningRun(s.context, r)), points = [...finance, ...security];
  let p = { ...masterFinance(s.context), applied: true };
  p = security.reduce((p, q) => answerDecision(p, points, q.id, q.correctId, true), p);
  r.id = 'new-run';
  const newPoints = [...finance, ...securityDecisions(s.context, observeLearningRun(s.context, r))];
  assert.equal(newPoints.filter(q => p.answers[q.id]?.solved).length, 5);
  const saved = exportDesign({ ...s.graph, learningProgress: p, observation: observeLearningRun(s.context, r) });
  assert.equal(/learningProgress|answers|security-result|outstandingVnd/.test(saved), false);
});

test('invoice matches only settled exact references: 11m total, 6m collected, 5m receivable', () => {
  const f = createInvoiceExercise(), before = structuredClone(f);
  const r = calculateInvoice(f.invoice, f.payments, f.today);
  assert.deepEqual([r.subtotal, r.tax, r.total, r.matchedPaid, r.outstanding, r.status], [10000000, 1000000, 11000000, 6000000, 5000000, 'PARTIALLY_PAID']);
  assert.deepEqual(r.matchedIds, ['TT-DEMO-A']);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(f, before);
});
test('invoice unpaid, due-date boundary, overdue, full payment and excess payment', () => {
  const f = createInvoiceExercise();
  const calc = (amount, date = f.invoice.dueDate) => calculateInvoice(f.invoice, [{ ...f.payments[0], amountVnd: amount }], date);
  assert.equal(calc(0).status, 'UNPAID');
  assert.equal(calc(1).status, 'PARTIALLY_PAID');
  assert.equal(calc(1, '2026-10-16').status, 'OVERDUE');
  assert.equal(calc(11000000, '2026-10-16').status, 'PAID');
  assert.equal(calc(12000000).outstanding, 0);
  assert.equal(calc(12000000).overpayment, 1000000);
});
test('invoice rejects invalid dates, negative or unsafe money, invalid tax and duplicate payment IDs', () => {
  for (const mutate of [
    f => f.invoice.dueDate = '2026-02-30', f => f.today = '',
    f => f.invoice.lines[0].quantity = .5, f => f.invoice.lines[0].unitPriceVnd = -1,
    f => f.invoice.lines[0].unitPriceVnd = Number.MAX_SAFE_INTEGER,
    f => f.invoice.taxRate = NaN, f => f.invoice.discountVnd = 12000000,
    f => f.payments[0].amountVnd = -1, f => f.payments.push({ ...f.payments[0] }),
  ]) { const f = createInvoiceExercise(); mutate(f); assert.ok(calculateInvoice(f.invoice, f.payments, f.today).errors.length); }
});
test('learner must choose all and only matching payments, and edits invalidate readiness', () => {
  const s = scenario(), f = s.context.finance;
  assert.ok(reconciliationCorrect(f)); assert.ok(financeReadiness(s.context).ready);
  for (const selectedPaymentIds of [[], ['TT-DEMO-B'], ['TT-DEMO-A', 'TT-DEMO-C'], ['TT-DEMO-A', 'TT-DEMO-D']]) assert.equal(reconciliationCorrect({ ...f, selectedPaymentIds }), false);
  f.payments[2].status = 'settled';
  assert.equal(financeReadiness(s.context).ready, false);
});
test('authorization transitions distinguish approval, compliance, rejection and technical hold', () => {
  const p = createPaymentInstruction();
  assert.equal(authorizationControls(p).decision, 'PENDING_APPROVAL');
  p.makerDecision = p.checkerDecision = 'APPROVED';
  assert.equal(authorizationControls(p).decision, 'HOLD_QKD');
  assert.ok(authorizationControls(p).ready);
  for (const field of ['kycStatus', 'riskStatus']) assert.equal(authorizationControls({ ...p, [field]: 'REVIEW_REQUIRED' }).decision, 'HOLD_COMPLIANCE');
  for (const patch of [{ kycStatus: 'INVALID' }, { riskStatus: 'BLOCKED' }, { makerDecision: 'REJECTED' }, { checkerDecision: 'REJECTED' }, { beneficiaryStatus: 'UNKNOWN' }, { beneficiaryStatus: 'BLOCKED' }, { checker: p.maker.toLowerCase() }]) assert.equal(authorizationControls({ ...p, ...patch }).decision, 'REJECTED');
});
test('amount and all three balance/limit controls are enforced with inclusive boundaries', () => {
  const p = createPaymentInstruction();
  for (const field of ['availableBalanceVnd', 'perTransactionLimitVnd', 'dailyLimitRemainingVnd']) {
    assert.equal(authorizationControls({ ...p, [field]: p.amountVnd - 1 }).decision, 'REJECTED');
    assert.equal(authorizationControls({ ...p, [field]: p.amountVnd }).decision, 'PENDING_APPROVAL');
  }
  for (const amountVnd of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(authorizationControls({ ...p, amountVnd }).decision, 'REJECTED');
});
test('scenario builders use unchanged v1 graph and exact stable session/path/DATA bindings', () => {
  for (const id of ['electronic_invoice', 'q_authorization_vault']) {
    const s = scenario(id), b = s.context.bindings;
    assert.deepEqual(scenarioDesignIssues(s.graph, s.context), []);
    assert.deepEqual(importDesign(exportDesign(s.graph)), s.graph);
    assert.equal(s.graph.quantumPaths.length, id === 'electronic_invoice' ? 1 : 2);
    assert.deepEqual(s.graph.qkdSessions[0].pathIds, b.pathIds);
    assert.ok(s.graph.quantumPaths.every(p => p.providerConfig.model === 'current_fso'));
    assert.notEqual(createLearningScenario(id).context.bindings.sessionId, b.sessionId);
  }
});
test('deleted or replaced links, reversed DATA, missing distributor and ambiguous keys cannot silently rebind', () => {
  for (const mutate of [
    s => s.graph.edges[0].id = 'replacement', s => s.graph.quantumPaths[0].id = 'replacement',
    s => s.graph.qkdSessions[0].id = 'replacement', s => s.graph.edges[0].target = s.context.bindings.senderNodeId,
    s => s.graph.edges[0].config.protection = 'none', s => s.graph.nodes.pop(),
    s => { s.graph.edges[0].config.keySource = 'auto'; s.graph.qkdSessions.push({ ...s.graph.qkdSessions[0], id: 'other' }); },
  ]) { const s = scenario('q_authorization_vault'); mutate(s); assert.ok(scenarioDesignIssues(s.graph, s.context).length); assert.equal(derive(s).status, 'DESIGN_INCOMPLETE'); }
});
test('financial snapshots allow notes but reject changed totals, forged controls and non-JSON', () => {
  for (const id of ['electronic_invoice', 'q_authorization_vault']) {
    const s = scenario(id), text = financialPayload(s.context), payload = JSON.parse(text);
    payload.note = 'Ghi chú thử nghiệm tiếng Việt';
    assert.equal(payloadIssue(s.context, JSON.stringify(payload)), undefined);
    if (id === 'electronic_invoice') payload.reconciliation.outstanding_vnd = 0;
    else payload.business_checks.available_balance = 'FAIL';
    assert.ok(payloadIssue(s.context, JSON.stringify(payload)));
    assert.ok(payloadIssue(s.context, 'not-json'));
    assert.ok(payloadIssue(s.context, 'null'));
  }
  const s = createLearningScenario('q_authorization_vault');
  assert.equal(financialPayload(s.context), '');
});
test('protected invoice preserves receivable; authorized payment never debits balance', () => {
  for (const id of ['electronic_invoice', 'q_authorization_vault']) {
    const s = scenario(id), before = structuredClone(s), outcome = derive(s);
    assert.equal(outcome.status, id === 'electronic_invoice' ? 'PROTECTED_DELIVERED' : 'AUTHORIZED');
    assert.ok(outcome.success); assert.deepEqual(s, before);
  }
});
test('QKD completed with 7 key bits is a transmission hold, not a QKD abort', () => {
  const s = scenario('q_authorization_vault'), r = resultFor(s);
  r.sessions[0].finalKeyLength = 7; r.dataResults[0].applicationStatus = 'insufficient_key';
  assert.equal(derive(s, r).status, 'HOLD_QKD');
  assert.equal(r.sessions[0].qkdStatus, 'completed');
});
test('authorization requires exact session and DATA, verified key, delivery and original plaintext', () => {
  for (const mutate of [
    r => r.scope = 'acquisition', r => r.sessions[0].sessionId = 'other',
    r => r.sessions[0].qkdStatus = 'aborted', r => r.sessions[0].keyStatus = 'distilled',
    r => r.dataResults[0].edgeId = 'other', r => r.dataResults[0].sessionId = 'other',
    r => r.dataResults[0].protection = 'none', r => r.dataResults[0].transmissionStatus = 'blocked',
    r => delete r.dataResults[0].decryptedPayload, r => r.dataResults[0].decryptedPayload = 'different',
  ]) { const s = scenario('q_authorization_vault'), r = resultFor(s); mutate(r); assert.equal(derive(s, r).status, 'HOLD_QKD'); }
});
test('AES-GCM integrity failure explicitly rejects the authorization', () => {
  const s = scenario('q_authorization_vault'), r = resultFor(s);
  Object.assign(r.dataResults[0], { diagnostic: 'AES_GCM_INTEGRITY_CHECK_FAILED', applicationStatus: 'failed', transmissionStatus: 'failed', integrityVerified: false });
  assert.equal(derive(s, r).status, 'REJECTED');
});
test('valid channel cannot approve an invalid financial instruction or newly edited amount', () => {
  const s = scenario('q_authorization_vault'), r = resultFor(s);
  s.context.finance.availableBalanceVnd = 1;
  assert.equal(derive(s, r).status, 'REJECTED');
  s.context.finance.availableBalanceVnd = 8000000000;
  s.context.finance.amountVnd = 4000000000;
  assert.equal(derive(s, r, r.dataResults[0].decryptedPayload).status, 'HOLD_QKD');
});
test('persistence and comparison do not retain financial payloads, exercise state or decrypted data', () => {
  const s = scenario(), r = resultFor(s);
  const polluted = { ...s.graph, finance: s.context.finance, learning: s.context, payload: financialPayload(s.context), experimentResult: r };
  const saved = exportDesign(polluted), comparison = JSON.stringify(comparisonSnapshot(r));
  for (const forbidden of ['customer_tax_id', 'HD-DEMO', 'decryptedPayload', 'selectedPaymentIds', 'matched_paid_vnd']) {
    assert.equal(saved.includes(forbidden), false, forbidden);
    assert.equal(comparison.includes(forbidden), false, forbidden);
  }
});

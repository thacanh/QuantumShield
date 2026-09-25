import type { SystemGraph } from './system';

export type LearningExperienceId = 'qkd_lab' | 'electronic_invoice' | 'q_authorization_vault';
export type LearningLevel = 'core' | 'basic' | 'advanced';
export interface LearningExperienceDefinition {
  id: LearningExperienceId; level: LearningLevel; title: string; description: string; learningObjectives: string[];
}
export interface ScenarioBindings {
  senderNodeId: string; receiverNodeId: string; distributorNodeId?: string;
  sessionId: string; pathIds: string[]; dataEdgeId: string;
}
export interface InvoiceLine { id: string; description: string; quantity: number; unitPriceVnd: number }
export interface EducationalInvoice {
  invoiceId: string; sellerName: string; customerName: string; customerTaxId: string;
  issueDate: string; dueDate: string; lines: InvoiceLine[]; taxRate: number; discountVnd: number;
}
export interface PaymentRecord {
  paymentId: string; invoiceReference: string; amountVnd: number; valueDate: string;
  status: 'settled' | 'pending' | 'reversed';
}
export type CollectionStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
export interface InvoiceExercise {
  invoice: EducationalInvoice; payments: PaymentRecord[]; today: string;
  selectedPaymentIds: string[]; reconciled: boolean;
}
export interface PaymentInstruction {
  instructionId: string; payerToken: string; beneficiaryToken: string; amountVnd: number; purpose: string;
  availableBalanceVnd: number; perTransactionLimitVnd: number; dailyLimitRemainingVnd: number;
  beneficiaryStatus: 'VALIDATED' | 'UNKNOWN' | 'BLOCKED';
  kycStatus: 'VALID' | 'REVIEW_REQUIRED' | 'INVALID';
  riskStatus: 'LOW' | 'MEDIUM' | 'REVIEW_REQUIRED' | 'BLOCKED';
  maker: string; checker: string;
  makerDecision: 'APPROVED' | 'PENDING' | 'REJECTED'; checkerDecision: 'APPROVED' | 'PENDING' | 'REJECTED';
}
export type FinancialDecision = 'DRAFT' | 'PENDING_APPROVAL' | 'HOLD_COMPLIANCE' | 'HOLD_QKD' | 'AUTHORIZED' | 'REJECTED';
export interface ScenarioInstance<TFinance> {
  experienceId: Exclude<LearningExperienceId, 'qkd_lab'>; graph: SystemGraph; bindings: ScenarioBindings;
  finance: TFinance; initialPayload: string;
}
export type LearningContext = { bindings: ScenarioBindings; createdAt: string } & (
  { experienceId: 'electronic_invoice'; finance: InvoiceExercise } |
  { experienceId: 'q_authorization_vault'; finance: PaymentInstruction }
);
export interface LearningScenario { graph: SystemGraph; context: LearningContext }
export interface LearningOutcome {
  status: FinancialDecision | 'DESIGN_INCOMPLETE' | 'PROTECTED_DELIVERED' | 'TRANSMISSION_BLOCKED';
  title: string; reasons: string[]; success: boolean;
}

export type LearningStep = 'learn' | 'practice' | 'protect' | 'summary';
export interface DecisionPoint {
  id: string; phase: 'finance' | 'security'; concept: string; situation: string; question: string;
  options: { id: string; label: string; explanation: string }[]; correctId: string; reminder: string;
}
export interface DecisionAnswer { selectedId?: string; attempts: number; mistakes: number; solved: boolean }
export interface LearningProgress {
  read: boolean; applied: boolean; answers: Record<string, DecisionAnswer>;
}
// Whitelisted educational observation: no payload, ciphertext, measurements or key material.
export interface LearningObservation {
  id: string; qkdStatus: string | null; qber: number | null; finalKeyLength: number; keyStatus: string;
  applicationStatus: string; transmissionStatus: string; integrityVerified: boolean;
  outcome: LearningOutcome; outstandingVnd?: number;
}
export interface LearningRunObservation { graph: SystemGraph; context: LearningContext; observation: LearningObservation }

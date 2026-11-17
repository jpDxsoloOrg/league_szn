import type { Division } from '../../../types';
import type {
  SeasonMovementChoice,
  SeasonMovementReviewView,
  SeasonReviewApplyResult,
  SeasonReviewDecisionInput,
} from '../../../types/progression';
import { getAdjacentDivisions } from '../../../utils/divisionTiers';

/** One row's unsaved choice. `decision` is '' when the GM has not picked one. */
export interface DecisionDraft {
  decision: SeasonMovementChoice | '';
  toDivisionId: string;
  announce: boolean;
}

export interface DivisionChoice {
  divisionId: string;
  name: string;
}

/** Where a promote / relegate goes: a fixed division, a list the GM picks from, or nowhere. */
export type TargetChoice =
  | { type: 'fixed'; divisionId: string }
  | { type: 'pick'; options: DivisionChoice[] }
  | { type: 'none' };

export type MoveChoice = Exclude<SeasonMovementChoice, 'stay'>;

export function isMove(decision: SeasonMovementChoice | ''): decision is MoveChoice {
  return decision === 'promote' || decision === 'relegate';
}

/** True once a promote / relegate for this review has been applied; the row is then read-only. */
export function isApplied(review: SeasonMovementReviewView): boolean {
  return isMove(review.decision ?? '');
}

/**
 * Why `choice` cannot be applied to this review, as a refusal code, or null
 * when it can. A sibling choice (AMBIGUOUS_TARGET) is allowed: the GM picks.
 */
export function unavailableReason(review: SeasonMovementReviewView, choice: SeasonMovementChoice): string | null {
  if (!isMove(choice)) return null;
  const preview = review.targets[choice];
  if (!preview) return 'NO_TRACK';
  if (preview.ok || preview.code === 'AMBIGUOUS_TARGET') return null;
  return preview.code;
}

/** The draft a row starts with: the saved decision, else the recommendation when it is possible. */
export function initialDraft(review: SeasonMovementReviewView): DecisionDraft {
  const preferred = review.decision ?? review.recommendation;
  const decision = unavailableReason(review, preferred) === null ? preferred : '';
  return { decision, toDivisionId: '', announce: false };
}

/**
 * The target of a promote / relegate. `refusalCandidates` (from an
 * AMBIGUOUS_TARGET refusal on apply) win over the preview.
 */
export function targetChoice(
  review: SeasonMovementReviewView,
  decision: SeasonMovementChoice | '',
  divisions: readonly Division[],
  refusalCandidates?: readonly DivisionChoice[],
): TargetChoice {
  if (!isMove(decision)) return { type: 'none' };
  if (refusalCandidates && refusalCandidates.length > 0) return { type: 'pick', options: [...refusalCandidates] };
  const preview = review.targets[decision];
  if (!preview) return { type: 'none' };
  if (preview.ok) return { type: 'fixed', divisionId: preview.toDivisionId };
  if (preview.code !== 'AMBIGUOUS_TARGET') return { type: 'none' };
  const options = getAdjacentDivisions(divisions, review.divisionId, decision === 'promote' ? 'above' : 'below')
    .map(({ divisionId, name }) => ({ divisionId, name }));
  return { type: 'pick', options };
}

/** True when the row has a decision to send: not applied yet and not an unchanged 'stay'. */
export function isPending(review: SeasonMovementReviewView, draft: DecisionDraft | undefined): boolean {
  if (!draft || draft.decision === '' || isApplied(review)) return false;
  return !(draft.decision === 'stay' && review.decision === 'stay');
}

export interface BuiltDecisions {
  decisions: SeasonReviewDecisionInput[];
  /** Players whose move needs a target the GM has not picked. */
  missingTarget: string[];
}

/** Turns the pending drafts into apply decisions, listing rows that still need a target. */
export function buildDecisions(
  reviews: readonly SeasonMovementReviewView[],
  drafts: Readonly<Record<string, DecisionDraft>>,
  divisions: readonly Division[],
  candidatesByPlayer: Readonly<Record<string, DivisionChoice[]>> = {},
): BuiltDecisions {
  const decisions: SeasonReviewDecisionInput[] = [];
  const missingTarget: string[] = [];
  for (const review of reviews) {
    const draft = drafts[review.playerId];
    if (!draft || !isPending(review, draft) || draft.decision === '') continue;
    if (!isMove(draft.decision)) {
      decisions.push({ playerId: review.playerId, decision: draft.decision });
      continue;
    }
    const target = targetChoice(review, draft.decision, divisions, candidatesByPlayer[review.playerId]);
    if (target.type === 'pick' && !target.options.some((option) => option.divisionId === draft.toDivisionId)) {
      missingTarget.push(review.playerId);
      continue;
    }
    decisions.push({
      playerId: review.playerId,
      decision: draft.decision,
      ...(target.type === 'pick' ? { toDivisionId: draft.toDivisionId } : {}),
      announce: draft.announce,
    });
  }
  return { decisions, missingTarget };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

/** The review after an apply result: an applied decision is stored, a refusal leaves it as it was. */
export function withResult(review: SeasonMovementReviewView, result: SeasonReviewApplyResult): SeasonMovementReviewView {
  if (!result.ok) return review;
  const moved = result.move?.toDivisionId;
  return {
    ...review,
    decision: result.decision,
    ...(moved ? { toDivisionId: moved, currentDivisionId: moved } : {}),
  };
}

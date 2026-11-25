import type { ContractPatch, ContractStatus } from '../types';

export interface ContractUpdateParts {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
  ConditionExpression: string;
}

/**
 * Shared by `DynamoContractsRepository.update` and `DynamoUnitOfWork.updateContract`
 * so both paths write identical rows. `null` in the patch REMOVEs the attribute.
 * The condition always requires the row to exist, plus the expected status when given.
 */
export function buildContractUpdate(
  patch: ContractPatch,
  nowIso: string,
  expectedStatus?: ContractStatus,
): ContractUpdateParts {
  const sets: string[] = ['#updatedAt = :updatedAt'];
  const removes: string[] = [];
  const names: Record<string, string> = { '#updatedAt': 'updatedAt', '#contractId': 'contractId' };
  const values: Record<string, unknown> = { ':updatedAt': nowIso };
  let index = 0;
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const nameKey = `#p${index}`;
    names[nameKey] = field;
    if (value === null) {
      removes.push(nameKey);
    } else {
      const valueKey = `:p${index}`;
      values[valueKey] = value;
      sets.push(`${nameKey} = ${valueKey}`);
    }
    index++;
  }
  let updateExpression = `SET ${sets.join(', ')}`;
  if (removes.length > 0) updateExpression += ` REMOVE ${removes.join(', ')}`;

  const conditions = ['attribute_exists(#contractId)'];
  if (expectedStatus) {
    names['#expectedStatus'] = 'status';
    values[':expectedStatus'] = expectedStatus;
    conditions.push('#expectedStatus = :expectedStatus');
  }
  return {
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ConditionExpression: conditions.join(' AND '),
  };
}

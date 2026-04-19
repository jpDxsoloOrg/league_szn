export interface BuildUpdateExpressionResult {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
  hasChanges: boolean;
}

const toToken = (field: string): string => field.replace(/[^a-zA-Z0-9_]/g, '_');

export function buildUpdateExpression(
  patch: object,
  nowIso: string,
): BuildUpdateExpressionResult {
  const setExpressions: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  let hasChanges = false;

  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const tok = toToken(field);
    setExpressions.push(`#${tok} = :${tok}`);
    names[`#${tok}`] = field;
    values[`:${tok}`] = value;
    hasChanges = true;
  }

  const tok = toToken('updatedAt');
  setExpressions.push(`#${tok} = :${tok}`);
  names[`#${tok}`] = 'updatedAt';
  values[`:${tok}`] = nowIso;

  return {
    UpdateExpression: `SET ${setExpressions.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    hasChanges,
  };
}

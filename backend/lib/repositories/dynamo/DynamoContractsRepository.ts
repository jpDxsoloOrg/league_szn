import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import {
  buildContract,
  type ContractCreateInput,
  type ContractListFilter,
  type ContractsRepository,
} from '../contracts';
import type { Contract, ContractPatch, ContractStatus } from '../types';
import { ConcurrencyError, NotFoundError } from '../errors';
import { buildContractUpdate } from './contractRows';

const newestFirst = (a: Contract, b: Contract): number => b.createdAt.localeCompare(a.createdAt);

function isConditionalCheckFailure(err: unknown): boolean {
  return (err as { name?: unknown } | null | undefined)?.name === 'ConditionalCheckFailedException';
}

export class DynamoContractsRepository implements ContractsRepository {
  async findById(contractId: string): Promise<Contract | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.CONTRACTS,
      Key: { contractId },
    });
    return (result.Item as Contract | undefined) ?? null;
  }

  async listByPlayer(playerId: string): Promise<Contract[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.CONTRACTS,
      IndexName: 'PlayerIndex',
      KeyConditionExpression: '#playerId = :playerId',
      ExpressionAttributeNames: { '#playerId': 'playerId' },
      ExpressionAttributeValues: { ':playerId': playerId },
      ScanIndexForward: false,
    });
    return items as unknown as Contract[];
  }

  async list(filter: ContractListFilter = {}): Promise<Contract[]> {
    const clauses: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      names[`#${field}`] = field;
      values[`:${field}`] = value;
      clauses.push(`#${field} = :${field}`);
    }
    const items = await dynamoDb.scanAll({
      TableName: TableNames.CONTRACTS,
      ...(clauses.length > 0 && {
        FilterExpression: clauses.join(' AND '),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    });
    return (items as unknown as Contract[]).sort(newestFirst);
  }

  async create(input: ContractCreateInput): Promise<Contract> {
    const contract = buildContract(uuidv4(), input, new Date().toISOString());
    await dynamoDb.put({
      TableName: TableNames.CONTRACTS,
      Item: contract,
      ConditionExpression: 'attribute_not_exists(contractId)',
    });
    return contract;
  }

  async update(contractId: string, patch: ContractPatch, expectedStatus?: ContractStatus): Promise<Contract> {
    const parts = buildContractUpdate(patch, new Date().toISOString(), expectedStatus);
    try {
      const result = await dynamoDb.update({
        TableName: TableNames.CONTRACTS,
        Key: { contractId },
        ...parts,
        ReturnValues: 'ALL_NEW',
      });
      return result.Attributes as Contract;
    } catch (err) {
      if (!isConditionalCheckFailure(err)) throw err;
      const existing = await this.findById(contractId);
      if (!existing) throw new NotFoundError('Contract', contractId);
      throw new ConcurrencyError('Contract', contractId);
    }
  }
}

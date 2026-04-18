import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  CompanyCreateInput,
  CompanyPatch,
  CompaniesRepository,
} from '../CompaniesRepository';
import type { Company } from '../types';
import { buildUpdateExpression } from './util';

export class DynamoCompaniesRepository implements CompaniesRepository {
  async findById(companyId: string): Promise<Company | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.COMPANIES,
      Key: { companyId },
    });
    return (result.Item as Company | undefined) ?? null;
  }

  async list(): Promise<Company[]> {
    const result = await dynamoDb.scan({ TableName: TableNames.COMPANIES });
    const companies = (result.Items || []) as unknown as Company[];
    companies.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return companies;
  }

  async create(input: CompanyCreateInput): Promise<Company> {
    const now = new Date().toISOString();
    const item: Company = {
      companyId: uuidv4(),
      name: input.name,
      ...(input.abbreviation !== undefined ? { abbreviation: input.abbreviation } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.COMPANIES, Item: item });
    return item;
  }

  async update(companyId: string, patch: CompanyPatch): Promise<Company> {
    const expr = buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb.update({
      TableName: TableNames.COMPANIES,
      Key: { companyId },
      UpdateExpression: expr.UpdateExpression,
      ExpressionAttributeNames: expr.ExpressionAttributeNames,
      ExpressionAttributeValues: expr.ExpressionAttributeValues,
      ConditionExpression: 'attribute_exists(companyId)',
      ReturnValues: 'ALL_NEW',
    }).catch((err: { name?: string }) => {
      if (err.name === 'ConditionalCheckFailedException') {
        throw new NotFoundError('Company', companyId);
      }
      throw err;
    });
    return result.Attributes as Company;
  }

  async delete(companyId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.COMPANIES,
      Key: { companyId },
    });
  }
}

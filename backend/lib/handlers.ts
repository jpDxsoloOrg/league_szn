import { APIGatewayProxyEvent, APIGatewayProxyResult, APIGatewayProxyHandler, Callback, Context } from "aws-lambda";
import { dynamoDb, TableNames } from "./dynamodb";
import { badRequest, created, serverError } from "./response";
import { parseBody } from "./parseBody";
import { v4 as uuidv4 } from 'uuid';

export interface CreateHandlerOptions {
    tableName: (typeof TableNames)[keyof typeof TableNames]
    idField: string;
    entityName: string;
    requiredFields: string[];
    optionalFields?: string[];
    defaults?: Record<string, unknown>;
    nullableFields?: string[];
    validate?: (body: Record<string, unknown> , event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult | null>;
    buildItem?: (body: Record<string, unknown> , baseItem: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export function handlerFactory(options: CreateHandlerOptions): APIGatewayProxyHandler
{
    return async function(event: APIGatewayProxyEvent, _context: Context, _callback: Callback): Promise<APIGatewayProxyResult> {
        try {
            const { data: body, error: parseError } = parseBody(event);
            if (parseError) return parseError;
            const requiredFieldsMissing = options.requiredFields.filter(field => !body[field]);
            if(requiredFieldsMissing.length === 1) {
                return badRequest(`${requiredFieldsMissing[0]} is required`);
            }
            if (requiredFieldsMissing.length > 0) return badRequest(`${requiredFieldsMissing.join(', ')} are required`);

            if (options.validate) {
                const validateError = await options.validate(body, event);
                if (validateError) return validateError;
            }

            const requiredFields = options.requiredFields.reduce((acc, field) => {
                acc[field] = body[field];
                return acc;
            }, {} as Record<string, unknown>);

            const optionalFields = options.optionalFields?.reduce((acc, field) => {
                if (body[field]) {
                    acc[field] = body[field];
                }
                return acc;
            }, {} as Record<string, unknown>);

            const nullableFields = options.nullableFields?.reduce((acc, field) => {
                acc[field] = body[field] ?? null;
                return acc;
            }, {} as Record<string, unknown>);

            const baseItem: Record<string, unknown> = {
                [options.idField]: uuidv4(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                ...requiredFields,
                ...(options.defaults ?? {}),
                ...(optionalFields ?? {}),
                ...(nullableFields ?? {}),
            }
            const item = await options.buildItem?.(body, baseItem) ?? baseItem;
            await dynamoDb.put({
                TableName: options.tableName,
                Item: item,
            });
            return created(item);
        } catch (error) {
            console.error('Error creating item: ', options.entityName, error);
            return serverError(`Failed to create ${options.entityName}`);
        }
    }
}



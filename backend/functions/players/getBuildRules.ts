import { APIGatewayProxyHandler } from 'aws-lambda';
import { success } from '../../lib/response';
import { getBuildRulesView } from '../../lib/builds/buildRulesView';

/** GET /builds/rules (BLD-03), public: every build rule the frontend shows. */
export const handler: APIGatewayProxyHandler = async () => success(getBuildRulesView());

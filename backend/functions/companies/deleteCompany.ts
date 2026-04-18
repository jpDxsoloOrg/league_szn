import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, serverError, conflict } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const companyId = event.pathParameters?.companyId;
    if (!companyId) {
      return badRequest('Company ID is required');
    }

    const { companies, shows, players } = getRepositories();
    const company = await companies.findById(companyId);
    if (!company) {
      return badRequest('Company not found');
    }

    // Check if any players are assigned to this company
    const allPlayers = await players.list();
    const assignedPlayers = allPlayers.filter((p) => p.companyId === companyId);

    if (assignedPlayers.length > 0) {
      return conflict(
        `Cannot delete company. ${assignedPlayers.length} player(s) are still assigned to this company.`
      );
    }

    // Check if any shows are assigned to this company
    const companyShows = await shows.listByCompany(companyId);
    if (companyShows.length > 0) {
      return conflict(
        `Cannot delete company. ${companyShows.length} show(s) are still assigned to this company.`
      );
    }

    await companies.delete(companyId);
    return noContent();
  } catch (err) {
    console.error('Error deleting company:', err);
    return serverError('Failed to delete company');
  }
};

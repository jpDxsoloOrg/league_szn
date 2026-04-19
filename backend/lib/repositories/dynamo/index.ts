import { registerDriver, type Repositories } from '../registry';
import { DynamoRosterRepository } from './DynamoRosterRepository';
import { DynamoCompetitionRepository } from './DynamoCompetitionRepository';
import { DynamoSeasonRepository } from './DynamoSeasonRepository';
import { DynamoLeagueOpsRepository } from './DynamoLeagueOpsRepository';
import { DynamoContentRepository } from './DynamoContentRepository';
import { DynamoUserRepository } from './DynamoUserRepository';
import { createDynamoUnitOfWorkFactory } from './DynamoUnitOfWork';
import { dynamoClearAllData, dynamoExportAllData, dynamoImportAllData } from './adminOps';

registerDriver('dynamo', (): Repositories => ({
  roster: new DynamoRosterRepository(),
  competition: new DynamoCompetitionRepository(),
  season: new DynamoSeasonRepository(),
  leagueOps: new DynamoLeagueOpsRepository(),
  content: new DynamoContentRepository(),
  user: new DynamoUserRepository(),
  runInTransaction: createDynamoUnitOfWorkFactory(),
  clearAllData: dynamoClearAllData,
  exportAllData: dynamoExportAllData,
  importAllData: dynamoImportAllData,
}));

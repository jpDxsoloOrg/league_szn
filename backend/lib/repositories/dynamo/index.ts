import { registerDriver, type Repositories } from '../registry';
import { DynamoRosterRepository } from './DynamoRosterRepository';
import { DynamoCompetitionRepository } from './DynamoCompetitionRepository';
import { DynamoSeasonRepository } from './DynamoSeasonRepository';
import { DynamoLeagueOpsRepository } from './DynamoLeagueOpsRepository';
import { DynamoContentRepository } from './DynamoContentRepository';
import { DynamoUserRepository } from './DynamoUserRepository';
import {
  DynamoFactionDirectMessagesRepository,
  DynamoFactionMessagesRepository,
} from './DynamoFactionMessagesRepository';
import {
  DynamoRivalriesRepository,
  DynamoRivalryMessagesRepository,
  DynamoRivalryNotesRepository,
} from './DynamoRivalriesRepository';
import { DynamoMatchRatingsRepository } from './DynamoMatchRatingsRepository';
import { createDynamoUnitOfWorkFactory } from './DynamoUnitOfWork';
import { dynamoClearAllData, dynamoExportAllData, dynamoImportAllData } from './adminOps';

registerDriver('dynamo', (): Repositories => ({
  roster: new DynamoRosterRepository(),
  competition: new DynamoCompetitionRepository(),
  season: new DynamoSeasonRepository(),
  leagueOps: new DynamoLeagueOpsRepository(),
  content: new DynamoContentRepository(),
  user: new DynamoUserRepository(),
  factionMessages: new DynamoFactionMessagesRepository(),
  factionDirectMessages: new DynamoFactionDirectMessagesRepository(),
  rivalries: new DynamoRivalriesRepository(),
  rivalryMessages: new DynamoRivalryMessagesRepository(),
  rivalryNotes: new DynamoRivalryNotesRepository(),
  matchRatings: new DynamoMatchRatingsRepository(),
  runInTransaction: createDynamoUnitOfWorkFactory(),
  clearAllData: dynamoClearAllData,
  exportAllData: dynamoExportAllData,
  importAllData: dynamoImportAllData,
}));

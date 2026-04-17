import { registerDriver, type Repositories } from '../registry';
import { DynamoDivisionsRepository } from './DivisionsRepository';
import { DynamoStipulationsRepository } from './StipulationsRepository';
import { DynamoMatchTypesRepository } from './MatchTypesRepository';

registerDriver('dynamo', (): Repositories => ({
  divisions: new DynamoDivisionsRepository(),
  stipulations: new DynamoStipulationsRepository(),
  matchTypes: new DynamoMatchTypesRepository(),
  runInTransaction: async () => {
    throw new Error('runInTransaction is not implemented in the dynamo driver yet (scheduled for Wave 7)');
  },
}));

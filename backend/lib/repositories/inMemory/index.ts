import { registerDriver, type Repositories } from '../registry';
import { InMemoryDivisionsRepository } from './DivisionsRepository';
import { InMemoryStipulationsRepository } from './StipulationsRepository';
import { InMemoryMatchTypesRepository } from './MatchTypesRepository';

export function buildInMemoryRepositories(): Repositories {
  return {
    divisions: new InMemoryDivisionsRepository(),
    stipulations: new InMemoryStipulationsRepository(),
    matchTypes: new InMemoryMatchTypesRepository(),
    runInTransaction: async () => {
      throw new Error('runInTransaction is not implemented in the in-memory driver yet (scheduled for Wave 7)');
    },
  };
}

registerDriver('memory', buildInMemoryRepositories);

export { InMemoryDivisionsRepository } from './DivisionsRepository';
export { InMemoryStipulationsRepository } from './StipulationsRepository';
export { InMemoryMatchTypesRepository } from './MatchTypesRepository';

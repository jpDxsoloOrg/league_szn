export interface Environment {
  name: string;
  baseUrl: string;
  apiUrl: string;
}

const environments: Record<string, Environment> = {
  local: {
    name: 'local',
    baseUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:3001/dev',
  },
  dev: {
    name: 'dev',
    baseUrl: 'http://dev.leagueszn.jpdxsolo.com',
    apiUrl: 'https://dgsmskbzb2.execute-api.us-east-1.amazonaws.com/devtest',
  },
  prod: {
    name: 'prod',
    baseUrl: 'http://leagueszn.jpdxsolo.com',
    apiUrl: 'https://9pcccl0caj.execute-api.us-east-1.amazonaws.com/dev',
  },
};

export function getEnvironment(): Environment {
  const envName = process.env.TEST_ENV || 'dev';
  return environments[envName] || environments.dev;
}

export { environments };

import { handler as getCompaniesHandler } from './getCompanies';
import { handler as getCompanyHandler } from './getCompany';
import { handler as createCompanyHandler } from './createCompany';
import { handler as updateCompanyHandler } from './updateCompany';
import { handler as deleteCompanyHandler } from './deleteCompany';
import { createRouter, RouteConfig } from '../../lib/router';

const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/companies',
    method: 'GET',
    handler: getCompaniesHandler,
  },
  {
    resource: '/companies',
    method: 'POST',
    handler: createCompanyHandler,
  },
  {
    resource: '/companies/{companyId}',
    method: 'GET',
    handler: getCompanyHandler,
  },
  {
    resource: '/companies/{companyId}',
    method: 'PUT',
    handler: updateCompanyHandler,
  },
  {
    resource: '/companies/{companyId}',
    method: 'DELETE',
    handler: deleteCompanyHandler,
  },
];
export const handler = createRouter(routes);

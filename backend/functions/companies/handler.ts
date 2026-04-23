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
    requireAuth: true,
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
    requireAuth: true,
  },
  {
    resource: '/companies/{companyId}',
    method: 'DELETE',
    handler: deleteCompanyHandler,
    requireAuth: true,
  },
];
export const handler = createRouter(routes);

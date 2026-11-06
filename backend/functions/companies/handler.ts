import { handler as getCompaniesHandler } from './getCompanies';
import { handler as getCompanyHandler } from './getCompany';
import { handler as createCompanyHandler } from './createCompany';
import { handler as updateCompanyHandler } from './updateCompany';
import { handler as deleteCompanyHandler } from './deleteCompany';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/companies',
    method: 'GET',
    handler: getCompaniesHandler,
    access: 'public',
  },
  {
    resource: '/companies',
    method: 'POST',
    handler: createCompanyHandler,
    access: STAFF,
  },
  {
    resource: '/companies/{companyId}',
    method: 'GET',
    handler: getCompanyHandler,
    access: 'public',
  },
  {
    resource: '/companies/{companyId}',
    method: 'PUT',
    handler: updateCompanyHandler,
    access: STAFF,
  },
  {
    resource: '/companies/{companyId}',
    method: 'DELETE',
    handler: deleteCompanyHandler,
    access: STAFF,
  },
];
export const handler = createRouter(routes);

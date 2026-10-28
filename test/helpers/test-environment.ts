const TEST_DATABASE_MARKER = /(^|[_-])test([_-]|$)/i;
const TEST_TENANT_SCHEMA = /^tenant_test_[a-z0-9_]+$/;

export interface TestEnvironment {
  NODE_ENV: 'test';
  DB_HOST: string;
  DB_PORT: string;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  REDIS_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
}

export function assertSafeTestDatabase(databaseName: string): void {
  if (!TEST_DATABASE_MARKER.test(databaseName)) {
    throw new Error(
      `Refusing to use database "${databaseName}": test databases must contain a standalone "test" marker.`,
    );
  }
}

export function assertSafeTestTenantSchema(schemaName: string): void {
  if (!TEST_TENANT_SCHEMA.test(schemaName)) {
    throw new Error(
      `Refusing to modify schema "${schemaName}": test tenant schemas must start with "tenant_test_".`,
    );
  }
}

export function getTestEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): TestEnvironment {
  const databaseName = environment.TEST_DB_NAME ?? 'erp_test';
  assertSafeTestDatabase(databaseName);

  return {
    NODE_ENV: 'test',
    DB_HOST: environment.TEST_DB_HOST ?? '127.0.0.1',
    DB_PORT: environment.TEST_DB_PORT ?? '55432',
    DB_NAME: databaseName,
    DB_USER: environment.TEST_DB_USER ?? 'erp_test',
    DB_PASSWORD: environment.TEST_DB_PASSWORD ?? 'erp_test',
    REDIS_URL: environment.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379/15',
    JWT_ACCESS_SECRET:
      environment.TEST_JWT_ACCESS_SECRET ??
      'test-only-access-secret-not-valid-outside-automated-tests',
    JWT_REFRESH_SECRET:
      environment.TEST_JWT_REFRESH_SECRET ??
      'test-only-refresh-secret-not-valid-outside-automated-tests',
  };
}

export function installTestEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): TestEnvironment {
  const testEnvironment = getTestEnvironment(environment);
  Object.assign(environment, testEnvironment);
  return testEnvironment;
}

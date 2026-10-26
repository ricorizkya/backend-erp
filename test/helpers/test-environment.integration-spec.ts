import {
  assertSafeTestDatabase,
  assertSafeTestTenantSchema,
  getTestEnvironment,
} from './test-environment';

describe('integration test environment guard', () => {
  it('uses isolated local services by default', () => {
    const environment = getTestEnvironment({});

    expect(environment).toMatchObject({
      NODE_ENV: 'test',
      DB_HOST: '127.0.0.1',
      DB_PORT: '55432',
      DB_NAME: 'erp_test',
      REDIS_URL: 'redis://127.0.0.1:56379/15',
    });
  });

  it.each(['erp', 'erp_development', 'production'])(
    'rejects unsafe database name %s',
    (databaseName) => {
      expect(() => assertSafeTestDatabase(databaseName)).toThrow(
        'Refusing to use database',
      );
    },
  );

  it('accepts only tenant_test_* schemas for destructive test cleanup', () => {
    expect(() =>
      assertSafeTestTenantSchema('tenant_test_factory_a'),
    ).not.toThrow();
    expect(() => assertSafeTestTenantSchema('tenant_factory_a')).toThrow(
      'Refusing to modify schema',
    );
  });
});

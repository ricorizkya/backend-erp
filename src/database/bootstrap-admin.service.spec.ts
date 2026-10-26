import { parseBootstrapAdminConfig } from './bootstrap-admin.service';

describe('parseBootstrapAdminConfig', () => {
  it('disables bootstrap when credentials are absent', () => {
    expect(parseBootstrapAdminConfig({})).toBeNull();
  });

  it('normalizes a valid bootstrap configuration', () => {
    expect(
      parseBootstrapAdminConfig({
        email: ' Admin@Example.com ',
        password: 'StrongPassword123',
        fullName: ' ERP Admin ',
        tenantCode: 'ADMIN',
      }),
    ).toEqual({
      email: 'admin@example.com',
      password: 'StrongPassword123',
      fullName: 'ERP Admin',
      tenantCode: 'admin',
    });
  });

  it.each([
    [{ email: 'admin@example.com' }, 'must be set together'],
    [
      { email: 'admin@example.com', password: 'weak' },
      'must be at least 12 characters',
    ],
    [
      { email: 'invalid', password: 'StrongPassword123' },
      'must be a valid email',
    ],
    [
      {
        email: 'admin@example.com',
        password: 'StrongPassword123',
        tenantCode: 'Invalid-Code',
      },
      'may contain only',
    ],
  ])('rejects unsafe bootstrap input', (input, message) => {
    expect(() => parseBootstrapAdminConfig(input)).toThrow(message);
  });
});

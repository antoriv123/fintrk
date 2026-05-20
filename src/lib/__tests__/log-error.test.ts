import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sin SENTRY_DSN, solo console. Con uno válido, debería hacer fetch.
describe('logError', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('sin SENTRY_DSN cae en console.error y no hace fetch', async () => {
    delete process.env.SENTRY_DSN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const consoleMock = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { logError } = await import('../log-error');
    logError('hello', new Error('boom'));

    expect(consoleMock).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    consoleMock.mockRestore();
  });

  it('con SENTRY_DSN valido hace fetch POST al endpoint', async () => {
    process.env.SENTRY_DSN = 'https://abc123@o12345.ingest.sentry.io/678901';
    const fetchMock = vi.fn(() => Promise.resolve({} as Response));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-1111-1111-111111111111' });

    const { logError } = await import('../log-error');
    logError('hello', new Error('boom'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const args = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string>; body: string }];
    expect(args[0]).toBe('https://o12345.ingest.sentry.io/api/678901/store/');
    const opts = args[1];
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-Sentry-Auth']).toContain('sentry_key=abc123');
    const payload = JSON.parse(opts.body);
    expect(payload.exception.values[0].value).toBe('boom');

    delete process.env.SENTRY_DSN;
  });

  it('dsn invalido no lanza', async () => {
    process.env.SENTRY_DSN = 'not-a-url';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { logError } = await import('../log-error');
    expect(() => logError('hello')).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();

    delete process.env.SENTRY_DSN;
  });
});

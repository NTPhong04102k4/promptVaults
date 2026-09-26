import { apiClient, ApiError } from './apiClient';

describe('apiClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('sends a GET request and returns the parsed JSON body', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 1, name: 'test' }),
    }) as unknown as typeof fetch;

    const result = await apiClient.get<{ id: number; name: string }>('https://example.com/items/1');

    expect(result).toEqual({ id: 1, name: 'test' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/items/1',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('sends a POST request with a JSON-serialized body and Content-Type header', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ created: true }),
    }) as unknown as typeof fetch;

    await apiClient.post('https://example.com/items', { name: 'new' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'new' }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
  });

  it('throws an ApiError with the parsed message on a non-2xx response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'Item not found' }),
    }) as unknown as typeof fetch;

    await expect(apiClient.get('https://example.com/items/999')).rejects.toMatchObject({
      status: 404,
      message: 'Item not found',
    });
  });

  it('falls back to statusText when the error body has no message', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new Error('not json');
      },
    }) as unknown as typeof fetch;

    await expect(apiClient.delete('https://example.com/items/1')).rejects.toMatchObject({
      status: 500,
      message: 'Internal Server Error',
    });
  });

  it('resolves to undefined for a 204 No Content response instead of throwing', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    }) as unknown as typeof fetch;

    const result = await apiClient.delete('https://example.com/items/1');

    expect(result).toBeUndefined();
  });

  it('exposes ApiError as the rejected error type', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ message: 'Bad input' }),
    }) as unknown as typeof fetch;

    await expect(apiClient.put('https://example.com/items/1', {})).rejects.toBeInstanceOf(ApiError);
  });

  it('unwraps an OperationResult envelope and returns data', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, message: 'ok', data: { id: 7 } }),
    }) as unknown as typeof fetch;

    await expect(apiClient.get('https://example.com/account/me')).resolves.toEqual({ id: 7 });
  });

  it('returns the raw body when envelope is false', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 900 }),
    }) as unknown as typeof fetch;

    await expect(
      apiClient.post('https://example.com/auth/login', {}, { envelope: false })
    ).resolves.toEqual({ access_token: 'a', refresh_token: 'r', expires_in: 900 });
  });

  it('exposes the backend errorCode on ApiError', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({
        success: false,
        errorCode: 'EmailExists',
        message: 'Email nay da duoc su dung.',
      }),
    }) as unknown as typeof fetch;

    await expect(apiClient.post('https://example.com/auth/register', {})).rejects.toMatchObject({
      status: 409,
      code: 'EmailExists',
      message: 'Email nay da duoc su dung.',
    });
  });

  it('uses http_<status> as the code when the error body has none', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new Error('not json');
      },
    }) as unknown as typeof fetch;

    await expect(apiClient.get('https://example.com/x')).rejects.toMatchObject({ code: 'http_502' });
  });

  it('maps a fetch failure to a network ApiError', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(
      new TypeError('Network request failed')
    ) as unknown as typeof fetch;

    await expect(apiClient.get('https://example.com/x')).rejects.toMatchObject({
      status: 0,
      code: 'network',
    });
  });
});

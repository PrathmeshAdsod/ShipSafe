import { afterEach, describe, expect, it, vi } from 'vitest';

describe('gitlab client flow consumer cache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.GITLAB_MR_FLOW_CONSUMER_ID;
  });

  it('caches resolved consumer ids between calls', async () => {
    process.env.GITLAB_TOKEN = 'token';
    process.env.GITLAB_HOST = 'https://gitlab.example.com';

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: {
            aiCatalogConfiguredItems: {
              nodes: [
                {
                  id: 'gid://gitlab/AiCatalogItemConsumer/12',
                  item: { name: 'ShipSafe MR Review' }
                }
              ]
            }
          }
        })
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { gl } = await import('../src/gitlab/client');
    const first = await gl.resolveFlowConsumerId('mr', 5, 'ShipSafe MR Review');
    const second = await gl.resolveFlowConsumerId('mr', 5, 'ShipSafe MR Review');

    expect(first).toBe(12);
    expect(second).toBe(12);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('caches consumer ids per project and matches flow names case-insensitively', async () => {
    process.env.GITLAB_TOKEN = 'token';
    process.env.GITLAB_HOST = 'https://gitlab.example.com';

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: {
              aiCatalogConfiguredItems: {
                nodes: [
                  {
                    id: 'gid://gitlab/AiCatalogItemConsumer/12',
                    item: { name: 'ShipSafe MR Review' }
                  }
                ]
              }
            }
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: {
              aiCatalogConfiguredItems: {
                nodes: [
                  {
                    id: 'gid://gitlab/AiCatalogItemConsumer/34',
                    item: { name: 'ShipSafe MR Review' }
                  }
                ]
              }
            }
          })
      });
    vi.stubGlobal('fetch', fetchSpy);

    const { gl } = await import('../src/gitlab/client');
    const first = await gl.resolveFlowConsumerId('mr', 5, ' shipsafe   mr review ');
    const second = await gl.resolveFlowConsumerId('mr', 9, 'ShipSafe MR Review');

    expect(first).toBe(12);
    expect(second).toBe(34);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';


afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

for (const environment of ['test', 'production']) {
  describe(environment, () => {
    async function setup() {
      vi.stubEnv('VITE_APP_ENVIRONMENT', environment);
vi.doMock('../src/config/firebaseConfig', async () => {
  const { MANAGER_COLLECTION } = await import('../src/config/environment');
  return { firebaseOnlineStorageConfig: { enabled: true, projectId: 'demo-bmx', apiKey: 'test-key', collectionPath: MANAGER_COLLECTION, documentId: 'mainAppState', databaseId: 'default' } };
});

      return import('../src/utils/onlineStorage');
    }
    it('routes state and live requests to the correct collections', async () => {
      const storage = await setup();
      const fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
      vi.stubGlobal('fetch', fetch);
      storage.setOnlineStorageAuthToken('owner-token');
      await storage.getOnlineAppStateStatus();
      await storage.loadPublicLiveRace();
      await storage.loadPublicLiveRaceMeta();
      const base = environment === 'test' ? 'bmxRaceTest' : 'bmxRaceManager';
      const live = environment === 'test' ? 'bmxRaceTestLive' : 'bmxRacePublic';
      expect(fetch.mock.calls[0][0]).toContain(`/documents/${base}/mainAppState?`);
      expect(fetch.mock.calls[1][0]).toContain(`/documents/${live}/currentRace?`);
      expect(fetch.mock.calls[2][0]).toContain(`/documents/${live}/currentRaceMeta?`);
      expect(fetch.mock.calls[1][1].headers).toEqual(environment === 'test' ? { Authorization: 'Bearer owner-token' } : {});
    });
    it('requires authentication for both test spectator reads', async () => {
      const storage = await setup();
      const fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
      vi.stubGlobal('fetch', fetch);
      await storage.loadPublicLiveRace();
      await storage.loadPublicLiveRaceMeta();
      expect(fetch).toHaveBeenCalledTimes(environment === 'test' ? 0 : 2);
    });
    it('isolates local saves, exports and deletes', async () => {
      vi.stubEnv('VITE_APP_ENVIRONMENT', environment);
      const values = { bmx_event: 'production', 'bmx_test:bmx_event': 'test' };
      const localStorage = Object.assign({}, values);
      Object.defineProperties(localStorage, {
        getItem: { value: (key: string) => localStorage[key] ?? null },
        setItem: { value: (key: string, value: string) => { localStorage[key] = value; } },
        removeItem: { value: (key: string) => { delete localStorage[key]; } },
      });
      vi.stubGlobal('window', { localStorage });
      const { appStorage } = await import('../src/utils/storage');
      expect(appStorage.getItem('bmx_event')).toBe(environment);
      expect(appStorage.keys()).toEqual(['bmx_event']);
      appStorage.setItem('bmx_event', 'changed');
      appStorage.removeItem('bmx_event');
      expect(localStorage[environment === 'test' ? 'bmx_event' : 'bmx_test:bmx_event']).toBe(environment === 'test' ? 'production' : 'test');
    });
  });
}

it('only the owner can enter the test app and its local database is separate', async () => {
  vi.stubEnv('VITE_APP_ENVIRONMENT', 'test');
  const env = await import('../src/config/environment');
  expect(env.canEnterEnvironment('stranger')).toBe(false);
  expect(env.canEnterEnvironment(env.TEST_OWNER_UID)).toBe(true);
  expect(env.DATABASE_NAME).toBe('BMXDB-test');
});

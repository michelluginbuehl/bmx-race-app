import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Firebase auth persistence", () => {
  it("persists a login and restores a still-valid session without signing in again", async () => {
    vi.stubEnv("VITE_APP_ENVIRONMENT", "production");

    const values: Record<string, string> = {};
    const localStorage = {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => {
        values[key] = value;
      },
      removeItem: (key: string) => {
        delete values[key];
      },
    };
    vi.stubGlobal("window", { localStorage });

    vi.doMock("../src/config/firebaseConfig", () => ({
      firebaseOnlineStorageConfig: {
        enabled: true,
        apiKey: "test-key",
      },
    }));

    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        email: "race@example.com",
        localId: "owner-1",
        idToken: "id-token-1",
        refreshToken: "refresh-token-1",
        expiresIn: "3600",
      }),
    });
    vi.stubGlobal("fetch", fetch);

    const auth = await import("../src/utils/onlineAuth");
    const signedIn = await auth.signInWithFirebaseEmailPassword("race@example.com", "secret");

    expect(signedIn.email).toBe("race@example.com");
    expect(values.bmx_firebase_auth_session_v1).toBeTruthy();

    const restored = await auth.getValidFirebaseAuthSession();
    expect(restored?.idToken).toBe("id-token-1");
    expect(restored?.refreshToken).toBe("refresh-token-1");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("removes the persisted session on explicit sign-out", async () => {
    vi.stubEnv("VITE_APP_ENVIRONMENT", "production");

    const values: Record<string, string> = {
      bmx_firebase_auth_session_v1: JSON.stringify({
        email: "race@example.com",
        localId: "owner-1",
        idToken: "id-token-1",
        refreshToken: "refresh-token-1",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        signedInAt: new Date().toISOString(),
      }),
    };
    const localStorage = {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => {
        values[key] = value;
      },
      removeItem: (key: string) => {
        delete values[key];
      },
    };
    vi.stubGlobal("window", { localStorage });

    vi.doMock("../src/config/firebaseConfig", () => ({
      firebaseOnlineStorageConfig: {
        enabled: true,
        apiKey: "test-key",
      },
    }));

    const auth = await import("../src/utils/onlineAuth");
    auth.signOutFirebaseAuth();

    expect(values.bmx_firebase_auth_session_v1).toBeUndefined();
  });
});

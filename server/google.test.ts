import { afterEach, describe, expect, it, vi } from "vitest";
import { connectGoogle, disconnectGoogle, DRIVE_SCOPES, GOOGLE_KEY, googleToken, type GoogleEnv } from "./google";

function fakeDb() {
  const rows = new Map<string, string>();
  const db = {
    rows,
    prepare(sql: string) {
      let args: string[] = [];
      const stmt = {
        bind(...a: string[]) {
          args = a;
          return stmt;
        },
        async first<T>() {
          const v = rows.get(args[0]);
          return (v === undefined ? null : { value: v }) as T | null;
        },
        async run() {
          if (sql.startsWith("DELETE")) rows.delete(args[0]);
          else rows.set(args[0], args[1]);
          return {};
        },
      };
      return stmt;
    },
  };
  return db;
}

const idToken = (email: string) => `x.${btoa(JSON.stringify({ email })).replace(/=+$/, "")}.y`;

function env(): GoogleEnv & { DB: ReturnType<typeof fakeDb> } {
  return { DB: fakeDb() as unknown as D1Database & ReturnType<typeof fakeDb>, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" } as never;
}

afterEach(() => vi.unstubAllGlobals());

describe("shared Google Drive connection", () => {
  it("keeps the refresh token server-side and hands out access tokens", async () => {
    const e = env();
    const calls: Record<string, string>[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = Object.fromEntries(new URLSearchParams(init.body as string));
      calls.push(body);
      if (body.grant_type === "authorization_code")
        return Response.json({ access_token: "a1", expires_in: 3600, refresh_token: "r1", scope: [...DRIVE_SCOPES, "openid", "email"].join(" "), id_token: idToken("carli@roopip.co.za") });
      return Response.json({ access_token: "a2", expires_in: 3600 });
    });

    const first = await connectGoogle(e, "code1", "daniel@example.com");
    expect(first).toMatchObject({ accessToken: "a1", email: "carli@roopip.co.za" });
    expect(calls[0]).toMatchObject({ code: "code1", redirect_uri: "postmessage", client_secret: "secret" });
    expect(JSON.parse(e.DB.rows.get(GOOGLE_KEY)!).refreshToken).toBe("r1");

    // Still fresh: no call to Google.
    expect(await googleToken(e)).toMatchObject({ accessToken: "a1" });
    expect(calls).toHaveLength(1);

    // Expired: refreshed quietly.
    const saved = JSON.parse(e.DB.rows.get(GOOGLE_KEY)!);
    saved.access.expires = Date.now() - 1;
    e.DB.rows.set(GOOGLE_KEY, JSON.stringify(saved));
    expect(await googleToken(e)).toMatchObject({ accessToken: "a2", email: "carli@roopip.co.za" });
    expect(calls[1]).toMatchObject({ grant_type: "refresh_token", refresh_token: "r1" });
  });

  it("refuses a sign-in without both Drive permissions", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ access_token: "a", refresh_token: "r", scope: DRIVE_SCOPES[0] }));
    await expect(connectGoogle(env(), "c", null)).rejects.toThrow("missing_scopes");
  });

  it("forgets a revoked or expired sign-in so the app asks to connect again", async () => {
    const e = env();
    e.DB.rows.set(GOOGLE_KEY, JSON.stringify({ refreshToken: "r", email: null, connectedBy: null, at: "" }));
    vi.stubGlobal("fetch", async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
    expect(await googleToken(e)).toBeNull();
    expect(e.DB.rows.has(GOOGLE_KEY)).toBe(false);
  });

  it("revokes and deletes on sign out", async () => {
    const e = env();
    e.DB.rows.set(GOOGLE_KEY, JSON.stringify({ refreshToken: "r9", email: null, connectedBy: null, at: "" }));
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response("");
    });
    await disconnectGoogle(e);
    expect(urls[0]).toContain("revoke?token=r9");
    expect(e.DB.rows.has(GOOGLE_KEY)).toBe(false);
  });

  it("returns nothing when no one has connected yet", async () => {
    expect(await googleToken(env())).toBeNull();
  });
});

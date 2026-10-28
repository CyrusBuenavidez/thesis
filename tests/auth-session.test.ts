import assert from "node:assert/strict";
import test from "node:test";

import {
  applySessionPersistenceToCookieOptions,
  AUTH_COOKIE_MAX_AGE_SECONDS,
  getAuthCookieOptions,
  getSessionPreferenceCookieOptions,
  parseSessionPersistence,
} from "../lib/auth/session-cookie-policy.ts";

test("legacy and remembered sessions remain persistent", () => {
  assert.equal(parseSessionPersistence(undefined), "persistent");
  assert.equal(parseSessionPersistence("persistent"), "persistent");
  assert.equal(
    getAuthCookieOptions("persistent").maxAge,
    AUTH_COOKIE_MAX_AGE_SECONDS,
  );
});

test("clearing Remember me creates a browser-session cookie", () => {
  assert.equal(parseSessionPersistence("session"), "session");
  assert.equal(getAuthCookieOptions("session").maxAge, undefined);
  assert.equal(
    applySessionPersistenceToCookieOptions(
      { maxAge: AUTH_COOKIE_MAX_AGE_SECONDS },
      "session",
    ).maxAge,
    undefined,
  );
});

test("session-only policy preserves cookie deletion", () => {
  assert.equal(
    applySessionPersistenceToCookieOptions({ maxAge: 0 }, "session").maxAge,
    0,
  );
});

test("auth cookies use cross-site request protections", () => {
  const options = getAuthCookieOptions("persistent");

  assert.equal(options.path, "/");
  assert.equal(options.sameSite, "lax");
  assert.equal(
    getSessionPreferenceCookieOptions("persistent").httpOnly,
    true,
  );
});

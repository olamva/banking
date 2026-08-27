import assert from "node:assert/strict";
import { test } from "node:test";
import { store } from "../../src/net/token.ts";

test("the vault name alone decides which store holds the token", () => {
  delete process.env.KEY_VAULT_NAME;
  assert.equal(store(), "keychain");
  process.env.KEY_VAULT_NAME = "bank-vault";
  try {
    assert.equal(store(), "Key Vault");
  } finally {
    delete process.env.KEY_VAULT_NAME;
  }
});

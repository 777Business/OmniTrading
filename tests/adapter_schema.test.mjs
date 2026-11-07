/**
 * Adapter Schema Validation Test Suite
 *
 * Verifies that the universal BrokerAdapter CredentialSchema specification
 * properly validates across diverse broker authentication models:
 * 1. API Key / Secret Schema (e.g. Crypto / Equities Broker)
 * 2. OAuth 2.0 PKCE / Authorization Code Schema
 * 3. Session Token & Multi-Option Select Schema
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

function validateCredentialsAgainstSchema(schema, credentials) {
  const errors = [];

  for (const field of schema.fields) {
    const val = credentials[field.name];

    if (field.required) {
      if (val === undefined || val === null || String(val).trim() === '') {
        errors.push(`Field '${field.name}' (${field.label}) is required.`);
        continue;
      }
    }

    if (val !== undefined && val !== null && String(val).trim() !== '') {
      if (field.type === 'checkbox' && typeof val !== 'boolean') {
        errors.push(`Field '${field.name}' must be boolean.`);
      }
      if (field.type === 'select' && field.options) {
        const validValues = field.options.map((o) => o.value);
        if (!validValues.includes(String(val))) {
          errors.push(`Field '${field.name}' value '${val}' is not in allowed options: [${validValues.join(', ')}].`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

describe('Universal BrokerAdapter CredentialSchema Test Suite', () => {
  // Schema 1: Mock API Key / Secret Schema
  const apiKeySchema = {
    authType: 'api-key',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'text', required: true },
      { name: 'apiSecret', label: 'API Secret', type: 'password', required: true },
      { name: 'passphrase', label: 'Passphrase', type: 'password', required: false },
    ],
    docsUrl: 'https://mock-broker.example.com/docs',
  };

  test('1. API Key Schema accepts valid credentials and rejects missing required fields', () => {
    // Valid input
    const validRes = validateCredentialsAgainstSchema(apiKeySchema, {
      apiKey: 'pub-key-12345',
      apiSecret: 'secret-val-abcde',
    });
    assert.equal(validRes.valid, true);
    assert.equal(validRes.errors.length, 0);

    // Missing API Secret
    const invalidRes = validateCredentialsAgainstSchema(apiKeySchema, {
      apiKey: 'pub-key-12345',
      apiSecret: '',
    });
    assert.equal(invalidRes.valid, false);
    assert.match(invalidRes.errors[0], /API Secret/);
  });

  // Schema 2: Mock OAuth 2.0 Schema
  const oauthSchema = {
    authType: 'oauth',
    fields: [
      { name: 'clientId', label: 'OAuth Client ID', type: 'text', required: true },
      { name: 'clientSecret', label: 'OAuth Client Secret', type: 'password', required: true },
    ],
    oauthUrl: 'https://auth.mock-oauth-broker.example.com/oauth/authorize',
    oauthRedirectUri: 'http://127.0.0.1:8787/api/auth/callback',
  };

  test('2. OAuth 2.0 Schema validates endpoint URLs and client identifiers', () => {
    assert.equal(oauthSchema.authType, 'oauth');
    assert.ok(oauthSchema.oauthUrl.startsWith('https://'));
    assert.ok(oauthSchema.oauthRedirectUri.includes('/api/auth/callback'));

    const res = validateCredentialsAgainstSchema(oauthSchema, {
      clientId: 'my-app-id',
      clientSecret: 'my-client-secret',
    });
    assert.equal(res.valid, true);

    const emptyRes = validateCredentialsAgainstSchema(oauthSchema, {});
    assert.equal(emptyRes.valid, false);
    assert.equal(emptyRes.errors.length, 2);
  });

  // Schema 3: Mock Session Token & Environment Select Schema
  const sessionTokenSchema = {
    authType: 'api-key',
    fields: [
      { name: 'token', label: 'Session Token', type: 'password', required: true },
      {
        name: 'cluster',
        label: 'Cluster Environment',
        type: 'select',
        required: true,
        options: [
          { label: 'US East Sandbox', value: 'us-east-sandbox' },
          { label: 'EU West Sandbox', value: 'eu-west-sandbox' },
          { label: 'APAC Sandbox', value: 'apac-sandbox' },
        ],
      },
      { name: 'agreeRisk', label: 'I understand paper trading conditions', type: 'checkbox', required: true },
    ],
  };

  test('3. Session Token & Select Schema validates option bounds and types', () => {
    // Valid input
    const valid = validateCredentialsAgainstSchema(sessionTokenSchema, {
      token: 'tok-999-alpha',
      cluster: 'us-east-sandbox',
      agreeRisk: true,
    });
    assert.equal(valid.valid, true);

    // Invalid cluster selection
    const invalidCluster = validateCredentialsAgainstSchema(sessionTokenSchema, {
      token: 'tok-999-alpha',
      cluster: 'invalid-cluster-id',
      agreeRisk: true,
    });
    assert.equal(invalidCluster.valid, false);
    assert.match(invalidCluster.errors[0], /not in allowed options/);
  });
});

import { describe, expect, it } from 'vitest';
import { readCloudConfig } from './supabase';

describe('cloud configuration', () => {
  it('retains explicit local mode when no cloud configuration is supplied', () => {
    expect(readCloudConfig({})).toEqual({ mode: 'local' });
  });
  it('fails closed for incomplete configuration instead of silently storing locally', () => {
    expect(readCloudConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co' }).mode).toBe('invalid');
  });
  it('accepts only HTTPS and browser keys, refusing secret and service_role keys', () => {
    expect(readCloudConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }).mode).toBe('cloud');
    expect(readCloudConfig({ VITE_SUPABASE_URL: 'http://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }).mode).toBe('invalid');
    expect(readCloudConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test' }).mode).toBe('invalid');
    const token = `e30.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`;
    expect(readCloudConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: token }).mode).toBe('invalid');
  });
});

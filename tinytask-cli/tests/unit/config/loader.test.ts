import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../../src/config/loader.js';

describe('Configuration Loader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should load default config when no file exists', async () => {
    const config = await loadConfig({});
    expect(config.outputFormat).toBe('table');
    expect(config.colorOutput).toBe(true);
    expect(config.timeout).toBe(30000);
  });

  it('should apply CLI options as overrides', async () => {
    const config = await loadConfig({
      url: 'http://custom:3000/mcp',
      outputFormat: 'json',
    });

    expect(config.url).toBe('http://custom:3000/mcp');
    expect(config.outputFormat).toBe('json');
  });

  it('should apply environment variable overrides', async () => {
    process.env.TINYTASK_URL = 'http://env:3000/mcp';
    process.env.TINYTASK_FORMAT = 'csv';
    process.env.TINYTASK_TIMEOUT = '60000';

    const config = await loadConfig({});
    expect(config.url).toBe('http://env:3000/mcp');
    expect(config.outputFormat).toBe('csv');
    expect(config.timeout).toBe(60000);
  });

  it('should prioritize CLI options over environment variables', async () => {
    process.env.TINYTASK_URL = 'http://env:3000/mcp';

    const config = await loadConfig({
      url: 'http://cli:4000/mcp',
    });

    expect(config.url).toBe('http://cli:4000/mcp');
  });

  it('should handle no color environment variable', async () => {
    process.env.TINYTASK_NO_COLOR = 'true';

    const config = await loadConfig({});
    expect(config.colorOutput).toBe(false);
  });

  it('should use agent identity from TKO_AGENT environment variable', async () => {
    process.env.TKO_AGENT = 'test-agent';

    const config = await loadConfig({});
    expect(config.agent).toBe('test-agent');
  });

  it('should fall back to TINYTASK_AGENT when TKO_AGENT is not set', async () => {
    delete process.env.TKO_AGENT;
    process.env.TINYTASK_AGENT = 'legacy-agent';

    const config = await loadConfig({});
    expect(config.agent).toBe('legacy-agent');
  });

  it('should prioritize TKO_AGENT over TINYTASK_AGENT', async () => {
    process.env.TKO_AGENT = 'tko-agent';
    process.env.TINYTASK_AGENT = 'legacy-agent';

    const config = await loadConfig({});
    expect(config.agent).toBe('tko-agent');
  });

  it('should validate configuration schema', async () => {
    // Invalid URL should fail validation
    await expect(
      loadConfig({
        url: 'not-a-valid-url',
      })
    ).rejects.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('config flow names', () => {
  afterEach(() => {
    delete process.env.SHIPSAFE_MR_FLOW_NAME;
    delete process.env.SHIPSAFE_ISSUE_FLOW_NAME;
    delete process.env.SHIPSAFE_RELEASE_FLOW_NAME;
    vi.resetModules();
  });

  it('uses ShipSafe flow names by default', async () => {
    const { getConfig } = await import('../src/config');
    const config = getConfig();

    expect(config.mrFlowName).toBe('ShipSafe MR Review');
    expect(config.issueFlowName).toBe('ShipSafe Issue Triage');
    expect(config.releaseFlowName).toBe('ShipSafe Release Gate');
  });

  it('allows published flow names to be overridden from env', async () => {
    process.env.SHIPSAFE_MR_FLOW_NAME = 'Custom MR Flow';
    process.env.SHIPSAFE_ISSUE_FLOW_NAME = 'Custom Issue Flow';
    process.env.SHIPSAFE_RELEASE_FLOW_NAME = 'Custom Release Flow';

    const { getConfig } = await import('../src/config');
    const config = getConfig();

    expect(config.mrFlowName).toBe('Custom MR Flow');
    expect(config.issueFlowName).toBe('Custom Issue Flow');
    expect(config.releaseFlowName).toBe('Custom Release Flow');
  });
});

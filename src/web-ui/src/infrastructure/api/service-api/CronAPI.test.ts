import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CronAPI } from './CronAPI';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('./ApiClient', () => ({
  api: {
    invoke: invokeMock,
  },
}));

describe('CronAPI', () => {
  let cronAPI: CronAPI;

  beforeEach(() => {
    cronAPI = new CronAPI();
    invokeMock.mockReset();
  });

  it('runs an existing scheduled job immediately through the desktop command', async () => {
    invokeMock.mockResolvedValueOnce({ id: 'cron-1' });

    await expect(cronAPI.runJobNow('cron-1')).resolves.toEqual({ id: 'cron-1' });

    expect(invokeMock).toHaveBeenCalledWith('run_cron_job_now', {
      request: { jobId: 'cron-1' },
    });
  });
});

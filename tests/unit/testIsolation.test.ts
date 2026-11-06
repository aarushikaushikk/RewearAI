import { describe, it, expect, vi } from 'vitest';
import { connectToDatabase, DatabaseConnectionError } from '@/lib/db';

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock('mongoose', () => ({ default: { connect } }));

describe('standard test suite isolation', () => {
  it('ignores any MONGODB_URI set in the shell', () => {
    expect(process.env.MONGODB_URI).toBeFalsy();
  });

  it('cannot open a database connection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(connectToDatabase()).rejects.toBeInstanceOf(DatabaseConnectionError);

    expect(connect).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

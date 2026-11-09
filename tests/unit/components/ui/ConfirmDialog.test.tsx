// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

afterEach(cleanup);

function Harness({ onConfirm = vi.fn(), isWorking = false }: { onConfirm?: () => void; isWorking?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Delete item
      </button>
      <ConfirmDialog
        open={open}
        title="Delete this clothing item?"
        message="This removes White Top and its photo. This can't be undone."
        confirmLabel="Delete clothing item"
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
        isWorking={isWorking}
      />
    </>
  );
}

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    render(<Harness />);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('opens as a labelled modal dialog with focus on Cancel, the safe choice', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Delete item' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Delete this clothing item?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(/can't be undone/);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('calls onConfirm from the specific confirm button', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Delete item' }));
    await user.click(screen.getByRole('button', { name: 'Delete clothing item' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Cancel', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
  ])('closes on %s and returns focus to the button that opened it', async (_label, close) => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Delete item' });

    await user.click(opener);
    await close(user);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Delete item' }));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Delete clothing item' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Delete clothing item' })).toHaveFocus();
  });

  it('disables both buttons, and ignores Escape, while the action runs', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Delete item' }));

    rerender(<Harness isWorking />);
    await user.keyboard('{Escape}');

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  });
});

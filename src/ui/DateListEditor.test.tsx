import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DateListEditor } from './DateListEditor';

afterEach(cleanup);

describe('DateListEditor', () => {
  it('disables Add until a date is entered, and never creates a submit control', () => {
    render(<DateListEditor dates={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('button[type="submit"]')).toBeNull();
  });

  it('adds once with Enter, clears the draft, and retains keyboard focus for another date', () => {
    const onAdd = vi.fn();
    render(<DateListEditor label="Unavailable date to add" dates={[]} onAdd={onAdd} onRemove={vi.fn()} />);
    const input = screen.getByLabelText('Unavailable date to add') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2027-03-17' } });
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onAdd).toHaveBeenCalledExactlyOnceWith('2027-03-17');
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('status').textContent).toContain('Added 2027-03-17');
  });

  it('prevents duplicate dates without clearing the choice or calling the solver callback', () => {
    const onAdd = vi.fn();
    render(<DateListEditor dates={['2027-03-17']} onAdd={onAdd} onRemove={vi.fn()} />);
    const input = screen.getByLabelText('Date to add') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2027-03-17' } });
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('status').id);
    expect(screen.getByRole('status').textContent).toContain('already in the list');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();
    expect(input.value).toBe('2027-03-17');
  });

  it('removes a date and returns focus to the date field rather than the disappearing chip', () => {
    const onRemove = vi.fn();
    render(<DateListEditor dates={['2027-03-17']} onAdd={vi.fn()} onRemove={onRemove} />);
    const button = screen.getByRole('button', { name: 'Remove 2027-03-17' });
    button.focus();
    fireEvent.click(button);
    expect(onRemove).toHaveBeenCalledExactlyOnceWith('2027-03-17');
    expect(document.activeElement).toBe(screen.getByLabelText('Date to add'));
    expect(screen.getByRole('status').textContent).toContain('Removed 2027-03-17');
  });

  it('has distinct accessible labels, a semantic date list and 44px touch targets', () => {
    render(
      <>
        <DateListEditor label="Overlap date to add" dates={['2027-03-17']} onAdd={vi.fn()} onRemove={vi.fn()} />
        <DateListEditor label="Unavailable date to add" dates={[]} onAdd={vi.fn()} onRemove={vi.fn()} />
      </>,
    );
    expect(screen.getByLabelText('Overlap date to add')).toBeTruthy();
    expect(screen.getByLabelText('Unavailable date to add')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Overlap date to add selected dates' })).toBeTruthy();
    const remove = screen.getByRole('button', { name: 'Remove 2027-03-17' });
    expect(remove.className).toContain('h-11');
    expect(remove.className).toContain('min-w-11');
    for (const add of screen.getAllByRole('button', { name: 'Add' })) {
      expect(add.className).toContain('min-h-11');
    }
  });
});

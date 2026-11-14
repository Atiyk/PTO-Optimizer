import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NumberStepper } from './NumberStepper';

afterEach(cleanup);

describe('NumberStepper (F28)', () => {
  function mount(overrides: Partial<Parameters<typeof NumberStepper>[0]> = {}) {
    const props = {
      id: 'n', value: '3', onTextChange: vi.fn(), onDecrement: vi.fn(), onIncrement: vi.fn(),
      decrementLabel: 'One fewer', incrementLabel: 'One more', ...overrides,
    };
    render(<><label htmlFor="n">Count</label><NumberStepper {...props} /></>);
    return props;
  }

  it('is a labelled number field between two named 44px buttons', () => {
    mount({ unit: 'weeks' });
    const field = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Count' });
    expect(field.value).toBe('3');
    for (const name of ['One fewer', 'One more']) {
      const b = screen.getByRole('button', { name });
      expect(b.getAttribute('type')).toBe('button');
      expect(b.className).toContain('h-11 w-11');
    }
    expect(screen.getByText('weeks')).toBeTruthy();
  });

  it('passes typing through as text, so a blank field stays blank', () => {
    const props = mount();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } });
    expect(props.onTextChange).toHaveBeenCalledWith('');
  });

  it('steps and respects disabled bounds', () => {
    const props = mount({ decrementDisabled: true });
    fireEvent.click(screen.getByRole('button', { name: 'One more' }));
    fireEvent.click(screen.getByRole('button', { name: 'One fewer' }));
    expect(props.onIncrement).toHaveBeenCalledTimes(1);
    expect(props.onDecrement).not.toHaveBeenCalled();
  });
});

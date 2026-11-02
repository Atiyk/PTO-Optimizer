import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CountrySelect } from './CountrySelect';

afterEach(cleanup);

function openPicker() {
  const onChange = vi.fn();
  const view = render(<CountrySelect country="US" onChangeCountry={onChange} />);
  const input = screen.getByRole('combobox', { name: 'Country' }) as HTMLInputElement;
  act(() => input.focus());
  return { ...view, input, onChange };
}

describe('searchable country combobox', () => {
  it('associates its label, listbox and active option while keeping keyboard focus in the input', () => {
    const { input } = openPicker();
    const list = screen.getByRole('listbox', { name: 'Country' });
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    const activeId = input.getAttribute('aria-activedescendant');
    expect(document.getElementById(activeId ?? '')?.getAttribute('role')).toBe('option');
    expect(document.getElementById(activeId ?? '')?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(input);
    expect(list.querySelector('button,input,a')).toBeNull();
  });

  it('filters by name or code and selects the active result with Enter', () => {
    const { input, onChange, rerender } = openPicker();
    fireEvent.change(input, { target: { value: 'United King' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option').textContent).toContain('United Kingdom');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('GB');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(input);
    rerender(<CountrySelect country="GB" onChangeCountry={onChange} />);
    expect(input.value).toBe('United Kingdom');
  });

  it('moves and wraps the active descendant with ArrowDown and ArrowUp', () => {
    const { input, onChange } = openPicker();
    fireEvent.change(input, { target: { value: 'united' } });
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[options.length - 1].id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);
    fireEvent.keyDown(input, { key: 'Enter' });
    const code = options[1].id.split('-').at(-1);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(code);
  });

  it('restores the current selection on Escape and can reopen without losing focus', () => {
    const { input, onChange } = openPicker();
    fireEvent.change(input, { target: { value: 'canada' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(input.value).toBe('United States');
    expect(document.activeElement).toBe(input);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });

  it('selects with the pointer while preventing the option from stealing input focus', () => {
    const { input, onChange } = openPicker();
    fireEvent.change(input, { target: { value: 'canada' } });
    const option = screen.getByRole('option', { name: 'Canada (CA)' });
    expect(fireEvent.mouseDown(option)).toBe(false);
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('CA');
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('handles empty results and closes on blur without selecting or delaying focus', () => {
    const { input, onChange } = openPicker();
    fireEvent.change(input, { target: { value: 'no-such-country-zzzz' } });
    expect(screen.getByText('No matches')).toBeTruthy();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    act(() => input.blur());
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.value).toBe('United States');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Glossary } from './Glossary';
import { GLOSSARY_TERMS } from '../content/glossary/terms';

afterEach(cleanup);

describe('Understand glossary search', () => {
  it('prerenders learning pathways and a labelled search field without needing JavaScript', () => {
    const html = renderToStaticMarkup(<Glossary />);
    expect(html).toContain('Your PTO basics');
    expect(html).toContain('Practical guides');
    expect(html).toContain('Look up a term');
    expect(html).toContain(`${GLOSSARY_TERMS.length} terms available`);
    expect(html).toContain('type="search"');
  });

  it('puts filtered results directly below the search field and announces the count', () => {
    render(<Glossary />);
    const input = screen.getByRole('searchbox', { name: 'Search the glossary' });
    expect(screen.getByRole('heading', { name: 'Your PTO basics' })).toBeTruthy();
    fireEvent.change(input, { target: { value: 'zzzxxyy' } });
    expect(screen.getByRole('status').textContent).toBe('0 terms found');
    expect(screen.getByText('No terms match "zzzxxyy".')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Your PTO basics' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Practical guides' })).toBeNull();
    fireEvent.change(input, { target: { value: 'accrual' } });
    expect(screen.getByRole('status').textContent).toMatch(/^[1-9]\d* terms? found$/);
    expect(screen.getByRole('link', { name: 'accrual' })).toBeTruthy();
  });

  it('clears search without losing keyboard focus or the learning pathways', () => {
    render(<Glossary />);
    const input = screen.getByRole('searchbox', { name: 'Search the glossary' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'carryover' } });
    const clear = screen.getByRole('button', { name: 'Clear search' });
    fireEvent.click(clear);
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('status').textContent).toBe(`${GLOSSARY_TERMS.length} terms available`);
    expect(screen.getByRole('heading', { name: 'Your PTO basics' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getByRole('heading', { name: 'Your PTO basics' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(`${GLOSSARY_TERMS.length} terms available`);
  });

  it('keeps every term reachable from the A to Z index with a letter jump list', () => {
    const html = renderToStaticMarkup(<Glossary />);
    for (const term of GLOSSARY_TERMS) expect(html).toContain(`href="/glossary/${term.id}"`);
    expect(html).toContain('aria-label="Jump to letter"');
    expect(html).toContain('href="#letter-a"');
    expect(html).toContain('id="letter-a"');
    expect(html).not.toMatch(/uppercase tracking|rounded-full|rounded-xl/);
  });
});

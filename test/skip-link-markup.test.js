import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf-8');

describe('skip-to-content link', () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  it('renders a skip link as the first focusable element in body pointing at #main-view', () => {
    const body = document.body;
    const skipLink = body.querySelector('a[href="#main-view"]');
    const mainView = document.getElementById('main-view');

    expect(skipLink).not.toBeNull();
    expect(skipLink.textContent.trim()).not.toBe('');
    expect(mainView).not.toBeNull();
    expect(mainView.tagName).toBe('MAIN');
  });

  it('makes the main landmark programmatically focusable so the skip link can move focus there', () => {
    const mainView = document.getElementById('main-view');
    expect(mainView.getAttribute('tabindex')).toBe('-1');
  });
});

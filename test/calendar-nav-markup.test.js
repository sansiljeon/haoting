import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf-8');

describe('calendar nav markup', () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  it('renders a sidebar nav item routing to the calendar view', () => {
    const navButton = document.querySelector('.nav-item[data-route="calendar"]');

    expect(navButton).not.toBeNull();
    expect(navButton.tagName).toBe('BUTTON');
    expect(navButton.textContent).toContain('수업 일정');
  });

  it('places the calendar nav item inside the shared nav menu alongside the other routes', () => {
    const navMenu = document.getElementById('nav-menu');
    const navButton = navMenu.querySelector('[data-route="calendar"]');

    expect(navButton).not.toBeNull();
    expect(navMenu.querySelectorAll('.nav-item').length).toBeGreaterThanOrEqual(6);
  });
});

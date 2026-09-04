import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf-8');

describe('숙제 기록 / 학습 기록 nav item markup', () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  it.each([
    ['homework', '숙제 기록'],
    ['study', '학습 기록'],
  ])('adds a "%s" nav button with the label "%s"', (route, label) => {
    const button = document.querySelector(`button.nav-item[data-route="${route}"]`);
    expect(button).not.toBeNull();
    expect(button.textContent).toContain(label);
  });

  it.each(['homework', 'study'])('keeps the same structure (icon + label) for "%s"', (route) => {
    const button = document.querySelector(`button.nav-item[data-route="${route}"]`);
    const icon = button.querySelector('i.fa-solid');
    const label = button.querySelector('span');
    expect(icon).not.toBeNull();
    expect(label).not.toBeNull();
  });

  it('loads api-config.js before app.js so window.HAOTING_API_TOKEN is available first', () => {
    const scripts = Array.from(document.querySelectorAll('script')).map((s) => s.getAttribute('src'));
    const apiConfigIndex = scripts.indexOf('./api-config.js');
    const appIndex = scripts.indexOf('./app.js');
    expect(apiConfigIndex).toBeGreaterThan(-1);
    expect(appIndex).toBeGreaterThan(-1);
    expect(apiConfigIndex).toBeLessThan(appIndex);
  });
});

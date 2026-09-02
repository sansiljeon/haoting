import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf-8');

describe('login screen markup', () => {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  it('renders an email/password login form before the app shell is shown', () => {
    const form = document.getElementById('login-form');
    const email = document.getElementById('login-email');
    const password = document.getElementById('login-password');
    const appShell = document.getElementById('app-shell');

    expect(form).not.toBeNull();
    expect(email.getAttribute('type')).toBe('email');
    expect(password.getAttribute('type')).toBe('password');
    expect(appShell.classList.contains('hidden')).toBe(true);
  });

  it('gives every form field an associated label for accessibility', () => {
    const fields = ['login-email', 'login-password'];
    for (const id of fields) {
      const label = document.querySelector(`label[for="${id}"]`);
      expect(label, `expected a <label for="${id}">`).not.toBeNull();
    }
  });
});

# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast, trust
your instincts, and ship with confidence — without them, vibe coding is just yolo
coding. With tests, it's a superpower.

## Framework

[Vitest](https://vitest.dev/) 4 with `jsdom` for DOM assertions.

## Running tests

```bash
npm test
```

## Test layers

- **Markup tests** (`test/*.test.js`): load `index.html` as a static string into
  `jsdom` and assert on structure — form fields, labels, ARIA attributes, initial
  visibility state. `app.js` is a single unmodularized IIFE with no exports, so
  logic inside it can't be unit-imported yet; markup tests are the practical way
  to pin down regressions in `index.html` without refactoring `app.js`.
- **Integration/E2E**: not set up yet. `gstack browse` (`/qa`, `/design-review`)
  covers this today by driving the real deployed app in a headless browser.

## Conventions

- One `describe` per screen/component, one `it` per behavior.
- Test files live in `test/` and end in `.test.js`.
- Prefer asserting on `id`/`for` attributes and ARIA roles over CSS classes —
  classes change with Tailwind edits, ids are the stable contract.

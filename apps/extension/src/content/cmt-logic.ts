import { FieldSchemaType } from '@cmt-autofill/contracts';
import { Author, Paper } from '../shared/schemas';

// ─────────────────────────────────────────────────────────────────────────────
// Knockout-safe DOM helpers
// ─────────────────────────────────────────────────────────────────────────────

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    (el as any).value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setSelectValue(selectEl: HTMLSelectElement, value: string) {
  const options = Array.from(selectEl.options);
  const matchedOpt = options.find(
    o => o.value === value || o.value.toLowerCase() === value.toLowerCase()
  );
  if (matchedOpt) {
    matchedOpt.selected = true;
    selectEl.value = matchedOpt.value;
  } else {
    setInputValue(selectEl, value);
    return;
  }

  selectEl.dispatchEvent(new Event('input', { bubbles: true }));
  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  selectEl.dispatchEvent(new Event('blur', { bubbles: true }));
}

function setChecked(el: HTMLInputElement, want: boolean) {
  if (el.checked !== want) el.click();
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForElement<T extends Element>(selector: string, timeoutMs = 5000): Promise<T | null> {
  return new Promise(resolve => {
    const existing = document.querySelector<T>(selector);
    if (existing) { resolve(existing); return; }

    const observer = new MutationObserver(() => {
      const el = document.querySelector<T>(selector);
      if (el) { observer.disconnect(); resolve(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
  });
}

/**
 * Case-insensitive matching of user-entered country string against <select> options.
 * Matches in priority order:
 *   1. Option value (country code) exact match — e.g. "IN", "in" -> "IN"
 *   2. Option text (country name) exact match — e.g. "India" -> "IN"
 *   3. Option text starts with input — e.g. "United" -> "United States" -> "US"
 *   4. Input starts with option text — handles "United States of America" -> "US"
 *   5. Option text contains input
 *   6. Input contains option text
 */
function matchCountryOption(selectEl: HTMLSelectElement, input: string): string | null {
  if (!input?.trim()) return null;
  const lower = input.trim().toLowerCase();
  const opts = Array.from(selectEl.options).filter(o => o.value !== '');

  const byValue = opts.find(o => o.value.toLowerCase() === lower);
  if (byValue) return byValue.value;

  const byText = opts.find(o => o.text.trim().toLowerCase() === lower);
  if (byText) return byText.value;

  const byTextStart = opts.find(o => o.text.trim().toLowerCase().startsWith(lower));
  if (byTextStart) return byTextStart.value;

  const byInputStart = opts.find(o => lower.startsWith(o.text.trim().toLowerCase()));
  if (byInputStart) return byInputStart.value;

  const byContains = opts.find(o => o.text.trim().toLowerCase().includes(lower));
  if (byContains) return byContains.value;

  const byInputContains = opts.find(o => lower.includes(o.text.trim().toLowerCase()));
  if (byInputContains) return byInputContains.value;

  return null;
}

/**
 * Find the country <select> inside a form.
 * CMT wraps it in a div.form-select-wrapper, and adds data-wrapped="".
 */
function findCountrySelect(form: HTMLFormElement): HTMLSelectElement | null {
  return (
    form.querySelector<HTMLSelectElement>('select[aria-label="Country/Region"]') ??
    form.querySelector<HTMLSelectElement>('.form-select-wrapper select') ??
    form.querySelector<HTMLSelectElement>('select[data-wrapped]') ??
    null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Deterministic fills — Title & Abstract
// ─────────────────────────────────────────────────────────────────────────────

export async function fillTitleAndAbstract(paper: Paper) {
  const titleEl = document.getElementById('titleTextbox') as HTMLInputElement | null;
  if (titleEl) {
    setInputValue(titleEl, paper.title);
    console.log('[CMT FILLER] Filled title:', paper.title);
  } else {
    console.warn('[CMT FILLER] #titleTextbox not found');
  }

  const abstractEl = document.getElementById('abstractTextbox') as HTMLTextAreaElement | null;
  if (abstractEl && paper.abstract) {
    setInputValue(abstractEl, paper.abstract);
    console.log('[CMT FILLER] Filled abstract');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: Deterministic fills — Authors
// Reads existing author emails from the table, adds only missing ones.
// IMPORTANT: Never clicks the main CMT Submit button. Only the inline Add author form.
// ─────────────────────────────────────────────────────────────────────────────

export async function fillAuthors(authors: Author[]) {
  if (!authors || authors.length === 0) return;

  for (const author of authors) {
    const existingEmails = Array.from(
      document.querySelectorAll('[id^="autorEmailCell-"]')
    ).map(el => el.textContent?.trim().toLowerCase() ?? '');

    if (existingEmails.includes(author.email.toLowerCase())) {
      console.log(`[CMT FILLER] Author already present, skipping: ${author.email}`);
      continue;
    }

    const added = await addAuthor(author);
    if (!added) {
      console.warn(`[CMT FILLER] Failed to add author: ${author.email}`);
    }
  }
}

async function addAuthor(author: Author): Promise<boolean> {
  // Click the "Add" button to open the inline author form
  const addBtn = document.querySelector<HTMLButtonElement>('button[title="Add author"]');
  if (!addBtn) {
    console.warn('[CMT FILLER] Add author button not found');
    return false;
  }
  addBtn.click();

  // Wait for the inline author form to appear
  const form = await waitForElement<HTMLFormElement>('form.form-inline', 4000);
  if (!form) {
    console.warn('[CMT FILLER] Author inline form did not appear');
    return false;
  }

  await sleep(300); // Let Knockout render the form

  // — Email —
  const emailInput = form.querySelector<HTMLInputElement>('input[placeholder="Email"]');
  if (emailInput) {
    setInputValue(emailInput, author.email);
    emailInput.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  await sleep(400);

  // — First Name —
  const firstInput = form.querySelector<HTMLInputElement>('input[placeholder="First Name"]');
  if (firstInput) setInputValue(firstInput, author.firstName);

  // — Last Name —
  const lastInput = form.querySelector<HTMLInputElement>('input[placeholder="Last Name"]');
  if (lastInput) setInputValue(lastInput, author.lastName);

  // — Organization —
  const orgInput = form.querySelector<HTMLInputElement>('input[placeholder="Organization"]');
  if (orgInput) setInputValue(orgInput, author.organization);

  // — Country/Region —
  if (author.countryCode) {
    const countrySelect = findCountrySelect(form);
    if (countrySelect) {
      let waited = 0;
      while (countrySelect.options.length <= 1 && waited < 1000) {
        await sleep(100);
        waited += 100;
      }

      const matchedValue = matchCountryOption(countrySelect, author.countryCode);
      if (matchedValue) {
        setSelectValue(countrySelect, matchedValue);
        console.log(`[CMT FILLER] Country "${author.countryCode}" -> matched "${matchedValue}"`);
      } else {
        console.warn(`[CMT FILLER] No match for country "${author.countryCode}" in select (${countrySelect.options.length} options)`);
      }
    } else {
      console.warn('[CMT FILLER] Country/Region select not found in author form');
    }
  }

  await sleep(200);

  // Click the inline form's "+ Add" button inside the author form
  const addSubmitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!addSubmitBtn) {
    console.warn('[CMT FILLER] Add submit button not found inside author form');
    return false;
  }
  addSubmitBtn.click();

  // Wait for the author row to appear in the table
  const prevCount = document.querySelectorAll('[id^="autorEmailCell-"]').length;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    const newCount = document.querySelectorAll('[id^="autorEmailCell-"]').length;
    if (newCount > prevCount) {
      console.log(`[CMT FILLER] Successfully added author: ${author.email}`);
      return true;
    }
    if (!document.querySelector('form.form-inline')) break;
  }

  const finalEmails = Array.from(
    document.querySelectorAll('[id^="autorEmailCell-"]')
  ).map(el => el.textContent?.trim().toLowerCase() ?? '');
  return finalEmails.includes(author.email.toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: Scrape only the Additional Questions for LLM
// ─────────────────────────────────────────────────────────────────────────────

export function scrapeAdditionalQuestions(): FieldSchemaType[] {
  const fields: FieldSchemaType[] = [];

  document.querySelectorAll('div[id^="sq_"]').forEach(el => {
    const id = el.id;
    const label =
      el.querySelector('h5')?.textContent?.trim() ||
      el.querySelector('label')?.textContent?.trim() ||
      'Additional Question';

    const details = el.querySelector('p[data-bind*="details"]')?.textContent?.trim() || undefined;
    const checkboxEl = el.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const radioEls   = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    const textEl     = el.querySelector<HTMLInputElement | HTMLTextAreaElement>('input[type="text"], textarea');
    const selectEl   = el.querySelector<HTMLSelectElement>('select');

    if (checkboxEl && radioEls.length === 0) {
      fields.push({ id, kind: 'agreement', label, details, required: false, current: checkboxEl.checked });
    } else if (radioEls.length > 0) {
      const choices = Array.from(radioEls).map(r => ({
        id: r.id || r.value,
        text: r.closest('label')?.textContent?.trim() || r.parentElement?.textContent?.trim() || r.value
      }));
      fields.push({ id, kind: 'radio', label, details, required: true, choices });
    } else if (textEl) {
      const maxLen = (textEl as HTMLInputElement).maxLength > 0 ? (textEl as HTMLInputElement).maxLength : undefined;
      fields.push({
        id,
        kind: textEl.tagName === 'TEXTAREA' ? 'textarea' : 'text',
        label,
        details,
        required: false,
        maxLength: maxLen,
        current: (textEl as HTMLInputElement).value
      });
    } else if (selectEl) {
      const choices = Array.from(selectEl.options)
        .filter(o => o.value !== '')
        .map(o => ({ id: o.value, text: o.text }));
      fields.push({ id, kind: selectEl.multiple ? 'listbox' : 'dropdown', label, details, required: true, choices });
    }
  });

  // Reproducibility checklist
  document.querySelectorAll('ul.repro-questions > li').forEach((li, index) => {
    const label = li.textContent?.trim() || `Reproducibility Q${index + 1}`;
    fields.push({ id: `repro_${index}`, kind: 'repro', label, required: true });
  });

  return fields;
}

export function scrapeFormMeta(): { conference: string; welcomeText: string; authorsPresent: string[] } {
  return {
    conference:
      document.querySelector('#conferenceDropdownMenuButton')?.getAttribute('title') ||
      'Unknown Conference',
    welcomeText: document.querySelector('.well')?.textContent?.trim() || '',
    authorsPresent: Array.from(document.querySelectorAll('[id^="autorEmailCell-"]')).map(
      el => el.textContent?.trim() ?? ''
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: Fill LLM answers into the Additional Questions
// ─────────────────────────────────────────────────────────────────────────────

export function fillAdditionalQuestions(answers: Record<string, any>) {
  for (const [id, decision] of Object.entries(answers)) {
    const value = decision?.value;
    if (value === undefined || value === null) continue;

    const container = document.getElementById(id);
    if (!container) {
      console.warn(`[CMT FILLER] Container #${id} not found`);
      continue;
    }

    // Radio buttons
    const radioEls = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    if (radioEls.length > 0) {
      const targetStr = String(value);
      let matched = false;
      radioEls.forEach(r => {
        if (r.id === targetStr || r.value === targetStr) {
          setChecked(r, true);
          matched = true;
        }
      });
      if (!matched) console.warn(`[CMT FILLER] No radio match for #${id} value="${value}"`);
      continue;
    }

    // Checkbox (agreement)
    const cbEl = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (cbEl) {
      setChecked(cbEl, Boolean(value));
      continue;
    }

    // Select / listbox
    const selectEl = container.querySelector<HTMLSelectElement>('select');
    if (selectEl) {
      setSelectValue(selectEl, String(value));
      continue;
    }

    // Text / textarea
    const textEl = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input[type="text"], textarea'
    );
    if (textEl) {
      setInputValue(textEl, String(value));
      continue;
    }

    console.warn(`[CMT FILLER] Could not find fillable element inside #${id}`);
  }
}

import { FormSchemaType, FieldSchemaType } from '@cmt-autofill/contracts';
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

function matchCountryOption(selectEl: HTMLSelectElement, input: string): string | null {
  if (!input || !input.trim()) return null;
  const lower = input.trim().toLowerCase();
  const options = Array.from(selectEl.options).filter(o => o.value !== '');

  // 1. Exact match on option code/value (case-insensitive) e.g. "US", "us" -> "US"
  const byValue = options.find(o => o.value.toLowerCase() === lower);
  if (byValue) return byValue.value;

  // 2. Exact match on country name (case-insensitive) e.g. "united states" -> "US"
  const byTextExact = options.find(o => o.text.trim().toLowerCase() === lower);
  if (byTextExact) return byTextExact.value;

  // 3. Name starts with or is contained in input
  const byTextStarts = options.find(o => 
    o.text.trim().toLowerCase().startsWith(lower) || lower.startsWith(o.text.trim().toLowerCase())
  );
  if (byTextStarts) return byTextStarts.value;

  const byTextContains = options.find(o => o.text.trim().toLowerCase().includes(lower));
  if (byTextContains) return byTextContains.value;

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Deterministic fills — Title & Abstract
// ─────────────────────────────────────────────────────────────────────────────

export async function fillTitleAndAbstract(paper: Paper) {
  const titleEl = document.getElementById('titleTextbox') as HTMLInputElement | null;
  if (titleEl) {
    setInputValue(titleEl, paper.title);
    console.log('[CMT FILLER] Filled title:', paper.title);
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
  // Click the "Add" button to open the inline form
  const addBtn = document.querySelector<HTMLButtonElement>('button[title="Add author"]');
  if (!addBtn) {
    console.warn('[CMT FILLER] Add author button not found');
    return false;
  }
  addBtn.click();

  // Wait for the inline form to appear
  const form = await waitForElement<HTMLFormElement>('form.form-inline', 4000);
  if (!form) {
    console.warn('[CMT FILLER] Author inline form did not appear');
    return false;
  }

  await sleep(200); // Let Knockout render

  // Fill email
  const emailInput = form.querySelector<HTMLInputElement>('input[placeholder="Email"]');
  if (emailInput) setInputValue(emailInput, author.email);
  await sleep(300); // CMT validates email on blur/change — give it a moment

  // Fill First Name
  const firstInput = form.querySelector<HTMLInputElement>('input[placeholder="First Name"]');
  if (firstInput) setInputValue(firstInput, author.firstName);

  // Fill Last Name
  const lastInput = form.querySelector<HTMLInputElement>('input[placeholder="Last Name"]');
  if (lastInput) setInputValue(lastInput, author.lastName);

  // Fill Organization
  const orgInput = form.querySelector<HTMLInputElement>('input[placeholder="Organization"]');
  if (orgInput) setInputValue(orgInput, author.organization);



  // Fill Country — select by matching code or name
  if (author.countryCode) {
    const countrySelect = form.querySelector<HTMLSelectElement>('select');
    if (countrySelect) {
      const matchedValue = matchCountryOption(countrySelect, author.countryCode);
      if (matchedValue) {
        setInputValue(countrySelect, matchedValue);
        console.log(`[CMT FILLER] Matched country "${author.countryCode}" -> "${matchedValue}"`);
      } else {
        console.warn(`[CMT FILLER] Could not match country "${author.countryCode}" in select options`);
      }
    }
  }

  await sleep(200);

  // Submit the form via the Add button
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submitBtn) {
    submitBtn.click();
  } else {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  // Wait for the new row to appear (row count increases) or timeout
  const prevCount = document.querySelectorAll('[id^="autorEmailCell-"]').length;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    const newCount = document.querySelectorAll('[id^="autorEmailCell-"]').length;
    if (newCount > prevCount) {
      console.log(`[CMT FILLER] Successfully added author: ${author.email}`);
      return true;
    }
    // Also check if the form has closed (success or error)
    if (!document.querySelector('form.form-inline')) break;
  }

  // Check one more time
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

  // Additional Questions (sq_*)
  document.querySelectorAll('div[id^="sq_"]').forEach(el => {
    const id = el.id;
    const label =
      el.querySelector('h5')?.textContent?.trim() ||
      el.querySelector('label')?.textContent?.trim() ||
      'Additional Question';

    const checkboxEl = el.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const radioEls = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    const textEl = el.querySelector<HTMLInputElement | HTMLTextAreaElement>('input[type="text"], textarea');
    const selectEl = el.querySelector<HTMLSelectElement>('select');

    if (checkboxEl && radioEls.length === 0) {
      // Single agreement checkbox
      fields.push({ id, kind: 'agreement', label, required: false, current: checkboxEl.checked });
    } else if (radioEls.length > 0) {
      const choices = Array.from(radioEls).map(r => ({
        id: r.id || r.value,
        text: r.parentElement?.textContent?.trim() || r.value
      }));
      fields.push({ id, kind: 'radio', label, required: true, choices });
    } else if (textEl) {
      const maxLen = (textEl as HTMLInputElement).maxLength > 0 ? (textEl as HTMLInputElement).maxLength : undefined;
      fields.push({
        id,
        kind: textEl.tagName === 'TEXTAREA' ? 'textarea' : 'text',
        label,
        required: false,
        maxLength: maxLen,
        current: (textEl as HTMLInputElement).value
      });
    } else if (selectEl) {
      const choices = Array.from(selectEl.options)
        .filter(o => o.value !== '')
        .map(o => ({ id: o.value, text: o.text }));
      const isMultiple = selectEl.multiple;
      fields.push({ id, kind: isMultiple ? 'listbox' : 'dropdown', label, required: true, choices });
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
      // Try direct element lookup as fallback
      const el = document.querySelector<HTMLElement>(`[id="${id}"]`);
      if (!el) { console.warn(`[CMT FILLER] Element not found for field: ${id}`); continue; }
    }

    // Radio buttons inside the sq_ container
    const radioEls = (container || document).querySelectorAll<HTMLInputElement>(
      `#${id} input[type="radio"]`
    );
    if (radioEls.length > 0) {
      const targetId = String(value);
      let matched = false;
      radioEls.forEach(r => {
        if (r.id === targetId || r.value === targetId) {
          setChecked(r, true);
          matched = true;
        }
      });
      if (!matched) console.warn(`[CMT FILLER] No radio match for ${id} value="${value}"`);
      continue;
    }

    // Checkbox (agreement)
    const cbEl = (container || document).querySelector<HTMLInputElement>(`#${id} input[type="checkbox"]`);
    if (cbEl) {
      setChecked(cbEl, Boolean(value));
      continue;
    }

    // Select / listbox
    const selectEl = (container || document).querySelector<HTMLSelectElement>(`#${id} select`);
    if (selectEl) {
      setInputValue(selectEl, String(value));
      continue;
    }

    // Text / textarea
    const textEl = (container || document).querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `#${id} input[type="text"], #${id} textarea`
    );
    if (textEl) {
      setInputValue(textEl, String(value));
      continue;
    }

    console.warn(`[CMT FILLER] Could not find fillable element inside #${id}`);
  }
}

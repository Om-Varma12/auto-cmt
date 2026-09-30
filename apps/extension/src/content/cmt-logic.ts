import { FormSchemaType, FieldSchemaType, DecideResponse } from '@cmt-autofill/contracts';

export class CMTScraper {
  static scrapeForm(): FormSchemaType {
    const conferenceName = document.querySelector('#conferenceDropdownMenuButton')?.getAttribute('title') || 'Unknown Conference';
    const welcomeText = document.querySelector('.well')?.textContent?.trim() || '';

    const fields: FieldSchemaType[] = [];

    // 1. Title
    const titleEl = document.querySelector('#titleTextbox') as HTMLInputElement;
    if (titleEl) {
      fields.push({
        id: 'title',
        kind: 'text',
        label: 'Title',
        required: true,
        current: titleEl.value
      });
    }

    // 2. Abstract
    const abstractEl = document.querySelector('#abstractTextbox') as HTMLTextAreaElement;
    if (abstractEl) {
      fields.push({
        id: 'abstract',
        kind: 'textarea',
        label: 'Abstract',
        required: true,
        current: abstractEl.value
      });
    }

    // 3. Conflict Domains
    const conflictEl = document.querySelector('#submissionConflictDomainsRawTextbox') as HTMLInputElement;
    if (conflictEl) {
      fields.push({
        id: 'conflict_domains',
        kind: 'text',
        label: 'Conflict Domains',
        required: false,
        current: conflictEl.value
      });
    }

    // 4. Additional Questions (sq_*)
    const sqElements = document.querySelectorAll('div[id^="sq_"]');
    sqElements.forEach(el => {
      const id = el.id;
      const label = el.querySelector('label')?.textContent?.trim() || 'Additional Question';

      const checkbox = el.querySelector('input[type="checkbox"]');
      const radio = el.querySelector('input[type="radio"]');
      const text = el.querySelector('input[type="text"], textarea');
      const select = el.querySelector('select');

      if (checkbox) {
        fields.push({ id, kind: 'agreement', label, required: false, current: (checkbox as HTMLInputElement).checked });
      } else if (radio) {
        const options = Array.from(el.querySelectorAll('input[type="radio"]')).map(r => ({
          id: r.id,
          text: r.parentElement?.textContent?.trim() || ''
        }));
        fields.push({ id, kind: 'radio', label, required: true, choices: options });
      } else if (text) {
        fields.push({ id, kind: 'text', label, required: false, current: (text as HTMLInputElement).value });
      } else if (select) {
        const options = Array.from((select as HTMLSelectElement).options).map(o => ({
          id: o.value,
          text: o.text
        }));
        fields.push({ id, kind: 'dropdown', label, required: true, choices: options });
      }
    });

    // 5. Repro Checklist
    const reproItems = document.querySelectorAll('ul.repro-questions > li');
    reproItems.forEach((li, index) => {
      const label = li.textContent?.trim() || `Reproducibility Q${index + 1}`;
      fields.push({
        id: `repro_${index}`,
        kind: 'repro',
        label,
        required: true
      });
    });

    return {
      conference: conferenceName,
      welcomeText,
      fields,
      authorsPresent: Array.from(document.querySelectorAll('[id^="autorEmailCell-"]')).map(el => el.textContent?.trim() || '')
    };
  }
}

export class CMTFiller {
  static setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    if (setter) {
      setter.call(el, v);
    } else {
      (el as any).value = v;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  static setChecked(el: HTMLInputElement, want: boolean) {
    if (el.checked !== want) el.click();
  }

  static fill(answers: Record<string, any>) {
    for (const [id, decision] of Object.entries(answers)) {
      const value = decision.value;
      const el = document.getElementById(id) || document.querySelector(`[id*="${id}"]`);

      if (!el) continue;

      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        this.setChecked(el, !!value);
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        this.setValue(el, String(value));
      }
    }
  }
}

import i18next from '../common/i18n.js';

// Confirm-style buttons swap their label in JS, so the data-i18n keys are swapped too (a language switch re-applies them)
export function setButtonMode(button, textKey, ariaKey) {
  button.dataset.i18n = textKey;
  button.dataset.i18nAttr = `aria-label:${ariaKey}`;
  button.textContent = i18next.t(textKey);
  button.setAttribute('aria-label', i18next.t(ariaKey));
}

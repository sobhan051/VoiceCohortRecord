// warnings.js – per-field warning styling, section badges, and the warning panel.

import { state } from './state.js';

export function applyFieldWarnings() {
    // Remove old warning styles from all inputs and their parent labels
    document.querySelectorAll('.field-warning, .field-critical').forEach(el => {
        el.classList.remove('field-warning', 'field-critical');
    });

    Object.entries(state.fieldWarnings).forEach(([vcode, warnings]) => {
        if (warnings.length === 0 || vcode === 'general') return;

        const input = document.querySelector(`[data-vcode="${vcode}"]`);
        if (!input) return;

        const hasCritical = warnings.some(w => w.severity === 'critical');
        const className = hasCritical ? 'field-critical' : 'field-warning';

        if (input.type === 'radio' || input.type === 'checkbox') {
            // Style the visible label card
            const label = input.closest('label');
            if (label) {
                label.classList.add(className);
            }
        } else {
            // Text / numeric – style the input itself
            input.classList.add(className);
        }
    });
}

export function updateSectionBadges() {
    document.querySelectorAll('section[id^="sect-"]').forEach(sectionEl => {
        const sectionKey = sectionEl.id.replace('sect-', '');
        let count = 0;

        // Get all unique v_codes in this section that have warnings
        const warnedVcodes = new Set();
        sectionEl.querySelectorAll('[data-vcode]').forEach(input => {
            const vcode = input.dataset.vcode;
            if (vcode !== 'general' && state.fieldWarnings[vcode] && state.fieldWarnings[vcode].length > 0) {
                warnedVcodes.add(vcode);
            }
        });
        count = warnedVcodes.size;   // one count per field, regardless of warning count

        const badge = document.getElementById(`badge-${sectionKey}`);
        if (badge) {
            badge.textContent = count > 0 ? count : '';
            badge.classList.toggle('active', count > 0);
        }
    });
}

export function updateWarningPanel() {
    const totalWarnings = Object.values(state.fieldWarnings).reduce((sum, arr) => sum + arr.length, 0);
    const toggleBtn = document.getElementById('warning-toggle-btn');
    const countSpan = document.getElementById('warning-count');
    const listEl = document.getElementById('warning-list');

    if (totalWarnings > 0) {
        toggleBtn.style.display = 'flex';
        countSpan.textContent = totalWarnings;
        // Build warning list
        listEl.innerHTML = '';
        Object.entries(state.fieldWarnings).forEach(([vcode, warnings]) => {
            warnings.forEach(w => {
                listEl.innerHTML += `<div class="warning-item"><span class="vcode">${vcode}</span>: ${w.message}</div>`;
            });
        });
    } else {
        toggleBtn.style.display = 'none';
        listEl.innerHTML = '';
        listEl.classList.remove('active');
    }
}

export function toggleWarningPanel() {
    const list = document.getElementById('warning-list');
    list.classList.toggle('active');
}

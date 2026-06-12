// main.js – entry module. Bootstraps the questionnaire, wires the manual-edit
// listener and final submit, and exposes the handful of handlers that
// index.html (and the rendered form) call via inline `onclick=`.

import { state } from './state.js';
import * as api from './api.js';
import { renderForm, updateQuestionVisibility } from './render.js';
import { applyFieldWarnings, updateSectionBadges, updateWarningPanel, toggleWarningPanel } from './warnings.js';
import { toggleRecording, stopRecordingViaFab } from './recorder.js';
import { openPatientModal, changePatient, startSubmission } from './patient.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const sections = await api.getFormStructure();
        renderForm(sections);
        updateQuestionVisibility();
    } catch (err) {
        console.error("Failed to load form structure:", err);
        document.getElementById('form-container').innerHTML =
            `<div class="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200">خطا در دریافت اطلاعات از سرور. لطفا اتصال دیتابیس را بررسی کنید.</div>`;
    }
    // Require a patient before any recording can happen
    openPatientModal();
});

// ---------- Manual Input Listener (clears field warnings on change) ----------
document.addEventListener('change', function (event) {
    const input = event.target;
    if (!input.dataset.vcode) return;

    const vcode = input.dataset.vcode;
    let value;
    if (input.type === 'checkbox') {
        const checkboxes = document.querySelectorAll(`input[type="checkbox"][data-vcode="${vcode}"]:checked`);
        value = Array.from(checkboxes).map(cb => cb.value).join(',');
    } else if (input.type === 'radio') {
        if (input.checked) value = input.value;
        else return;
    } else {
        value = input.value;
    }

    state.sessionContext[vcode] = value;
    // Remove warnings for this field when user manually edits
    delete state.fieldWarnings[vcode];
    applyFieldWarnings();
    updateSectionBadges();
    updateWarningPanel();

    updateQuestionVisibility();
});

async function submitFinalForm() {
    if (!state.currentSubmissionId) {
        openPatientModal();
        return;
    }

    // Warn (but don't block) if anomalies are still open
    const openWarnings = Object.values(state.fieldWarnings).reduce((s, a) => s + a.length, 0);
    if (openWarnings > 0 &&
        !confirm(`${openWarnings} هشدار بررسی‌نشده وجود دارد. آیا مطمئن هستید که می‌خواهید ثبت نهایی کنید؟`)) {
        return;
    }

    try {
        const data = await api.completeSubmission({
            submission_id: state.currentSubmissionId,
            answers: state.sessionContext,
            confidence: state.sessionConfidence,
        });
        if (data.error) {
            alert(`خطا در ثبت نهایی: ${data.error}`);
            return;
        }
        alert(`اطلاعات با موفقیت ثبت شد. (${data.saved} پاسخ ذخیره شد)`);
        // Lock further edits for this patient; require an explicit new start
        state.currentSubmissionId = null;
        document.getElementById('status-badge').textContent = 'ثبت شد';
    } catch (err) {
        console.error('complete-submission failed:', err);
        alert('ارتباط با سرور با مشکل مواجه شد.');
    }
}

// Expose the inline-handler functions that index.html and the rendered form
// reference via `onclick=` (modules don't create globals automatically).
window.toggleRecording = toggleRecording;
window.stopRecordingViaFab = stopRecordingViaFab;
window.changePatient = changePatient;
window.startSubmission = startSubmission;
window.toggleWarningPanel = toggleWarningPanel;
window.submitFinalForm = submitFinalForm;

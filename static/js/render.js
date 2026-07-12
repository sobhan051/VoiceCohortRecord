// render.js – form rendering, conditional visibility, and applying AI results
// to the DOM.

import { state } from './state.js';

// ---------- Section-Level Visibility (DB rules) ----------
export function updateQuestionVisibility() {
    document.querySelectorAll('section[id^="sect-"]').forEach(sectionEl => {
        const sectionKey = sectionEl.id.replace('sect-', '');
        const meta = state.sectionMetaMap[sectionKey];
        let sectionShouldShow = true;

        if (meta && meta.depends_on_vcode) {
            const parentValue = state.sessionContext[meta.depends_on_vcode];
            if (parentValue === undefined || parentValue === null || parentValue === '') {
                sectionShouldShow = false;
            } else if (parentValue != meta.depends_on_value) {
                sectionShouldShow = false;
            }
        }

        sectionEl.style.display = sectionShouldShow ? '' : 'none';
        sectionEl.style.opacity = sectionShouldShow ? '1' : '0';
    });
}

// ---------- Rendering ----------
export function renderForm(sections) {
    const container = document.getElementById('form-container');
    container.innerHTML = '';

    // Build section progress data
    state.sectionProgressData = {};
    sections.forEach(section => {
        state.sectionMetaMap[section.section_key] = {
            depends_on_vcode: section.depends_on_vcode || null,
            depends_on_value: section.depends_on_value || null
        };
        state.sectionProgressData[section.section_key] = {
            name_fa: section.name_fa,
            total: section.questions ? section.questions.length : 0,
            answered: 0
        };

        const sectHtml = `
            <section class="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100"
                     id="sect-${section.section_key}">
                <div class="flex justify-between items-center mb-6 pb-4 border-b border-gray-50">
                    <h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">
                        ${section.name_fa}
                        <span id="badge-${section.section_key}" class="section-warning-badge"></span>
                    </h2>
                    <button onclick="toggleRecording('${section.section_key}')"
                            id="btn-${section.section_key}"
                            class="flex items-center gap-2 px-5 py-2.5 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-all group">
                        <span id="icon-${section.section_key}">
                            <svg class="w-6 h-6 text-gray-500 group-hover:text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                            </svg>
                        </span>
                        <span id="text-${section.section_key}" class="text-sm font-bold">ثبت با صدا</span>
                    </button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    ${section.questions.map(q => renderQuestion(q)).join('')}
                </div>
            </section>
        `;
        container.insertAdjacentHTML('beforeend', sectHtml);
    });
}

export function renderQuestion(q) {
    // The server guarantees coding_options is an object (see questionnaire.py).
    const options = q.coding_options || {};

    if (q.response_type === 'MultiSelect') {
        return `
            <div class="md:col-span-2 space-y-3">
                <label class="block text-gray-700 font-bold">${q.question_text_fa}</label>
                <div class="flex flex-wrap gap-4">
                    ${Object.entries(options).map(([key, val]) => `
                        <label class="flex items-center gap-3 border-2 border-gray-100 px-4 py-3 rounded-2xl cursor-pointer hover:border-blue-200 hover:bg-blue-50 transition-all">
                            <input type="checkbox" name="${q.v_code}[]" value="${key}" data-vcode="${q.v_code}" class="w-5 h-5 cursor-pointer">
                            <span class="text-base">${val}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }
    if (q.response_type === 'Categorical' || q.response_type === 'Dichotomous') {
        return `
            <div class="md:col-span-2 space-y-3">
                <label class="block text-gray-700 font-bold">${q.question_text_fa}</label>
                <div class="flex flex-wrap gap-4">
                    ${Object.entries(options).map(([key, val]) => `
                        <label class="flex items-center gap-3 border-2 border-gray-100 px-4 py-3 rounded-2xl cursor-pointer hover:border-blue-200 hover:bg-blue-50 transition-all">
                            <input type="radio" name="${q.v_code}" value="${key}" data-vcode="${q.v_code}" class="w-5 h-5 cursor-pointer">
                            <span class="text-base">${val}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }
    return `
        <div class="flex flex-col gap-2 relative">
            <label class="text-gray-600 text-sm font-medium">${q.question_text_fa}</label>
            <div class="relative">
                <input type="text" data-vcode="${q.v_code}"
                       class="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                       placeholder="${q.unit ? 'واحد: ' + q.unit : '---'}">
            </div>
        </div>
    `;
}

// ---------- Apply AI results ----------
export function applyAiResults(data) {
    Object.keys(data).forEach(vCode => {
        const val = data[vCode];
        if (val === null || val === undefined) return;

        if (typeof val === 'string' && val.includes(',')) {
            const codes = val.split(',').map(c => c.trim());
            codes.forEach(code => {
                const checkboxes = document.querySelectorAll(
                    `input[type="checkbox"][data-vcode="${vCode}"][value="${code}"]`
                );
                checkboxes.forEach(cb => {
                    cb.checked = true;
                    cb.closest('label').classList.add('ai-updated');
                });
                setTimeout(() => {
                    checkboxes.forEach(cb => cb.closest('label').classList.remove('ai-updated'));
                }, 3000);
            });
        } else {
            const inputs = document.querySelectorAll(`[data-vcode="${vCode}"]`);
            inputs.forEach(input => {
                if (input.type === 'radio') {
                    if (input.value == val) {
                        input.checked = true;
                        input.closest('label').classList.add('ai-updated');
                    }
                } else {
                    input.value = val;
                    input.classList.add('ai-updated');
                }
                setTimeout(() => {
                    input.classList.remove('ai-updated');
                    if (input.closest('label')) input.closest('label').classList.remove('ai-updated');
                }, 3000);
            });
        }
    });
}

// Visually flag a section the patient already completed. The mic stays enabled
// so they can re-record to correct an answer.
export function markSectionAnswered(sectionKey) {
    const sectionEl = document.getElementById(`sect-${sectionKey}`);
    if (!sectionEl) return;
    sectionEl.classList.add('section-answered');

    const badge = document.getElementById(`badge-${sectionKey}`);
    if (badge && !badge.classList.contains('active')) {
        badge.textContent = '✓ تکمیل شد';
        badge.classList.add('section-done-badge');
    }
}

// ---------- Progress Panel ----------
export function updateProgressPanel() {
    // Count answered questions per visible section (unique vcode per question)
    const visibleSections = document.querySelectorAll('section[id^="sect-"]:not([style*="display: none"])');
    visibleSections.forEach(sectionEl => {
        const sectionKey = sectionEl.id.replace('sect-', '');
        if (!state.sectionProgressData[sectionKey]) return;
        let answered = 0;
        const countedVcodes = new Set();
        sectionEl.querySelectorAll('[data-vcode]').forEach(input => {
            const vcode = input.dataset.vcode;
            if (!vcode || countedVcodes.has(vcode)) return;
            countedVcodes.add(vcode);
            if (input.type === 'checkbox') {
                const checked = sectionEl.querySelectorAll(
                    `input[type="checkbox"][data-vcode="${vcode}"]:checked`
                );
                if (checked.length > 0) answered++;
            } else if (input.type === 'radio') {
                const checked = sectionEl.querySelector(
                    `input[type="radio"][data-vcode="${vcode}"]:checked`
                );
                if (checked) answered++;
            } else if (input.value && input.value.trim() !== '') {
                answered++;
            }
        });
        state.sectionProgressData[sectionKey].answered = answered;
    });

    // Build the list HTML
    const listEl = document.getElementById('progress-section-list');
    let totalAnswered = 0;
    let totalQuestions = 0;
    let html = '';

    Object.entries(state.sectionProgressData).forEach(([key, data]) => {
        // Skip sections that are currently hidden
        const sectionEl = document.getElementById(`sect-${key}`);
        const isVisible = !sectionEl || sectionEl.style.display !== 'none';
        if (!isVisible) return;

        totalAnswered += data.answered;
        totalQuestions += data.total;

        const pct = data.total > 0 ? Math.round((data.answered / data.total) * 100) : 0;
        let countClass = 'empty';
        let barClass = 'pb-empty';
        if (data.answered === data.total && data.total > 0) {
            countClass = 'complete';
            barClass = 'pb-complete';
        } else if (data.answered > 0) {
            countClass = 'partial';
            barClass = 'pb-partial';
        }

        html += `
            <div class="progress-section-item" onclick="scrollToSection('${key}')">
                <span class="sec-name" title="${data.name_fa}">${data.name_fa}</span>
                <span class="sec-count ${countClass}" dir="ltr">${data.answered} / ${data.total}</span>
            </div>
            <div class="px-3 pb-1">
                <div class="progress-bar-track">
                    <div class="progress-bar-fill ${barClass}" style="width: ${pct}%"></div>
                </div>
            </div>`;
    });

    if (!html) {
        html = '<div class="text-center py-8 text-gray-400 text-xs">هیچ قسمتی نمایش داده نشده است</div>';
    }
    listEl.innerHTML = html;

    // Update overall progress
    const overallPct = totalQuestions > 0 ? Math.round((totalAnswered / totalQuestions) * 100) : 0;
    const ringEl = document.getElementById('overall-ring');
    const barFillEl = document.getElementById('overall-bar-fill');
    if (ringEl) {
        ringEl.textContent = overallPct + '%';
        ringEl.className = 'overall-ring ' + (
            overallPct === 100 ? 'bg-green-500' :
            overallPct > 0 ? 'bg-amber-500' :
            'bg-gray-300'
        );
    }
    if (barFillEl) {
        barFillEl.style.width = overallPct + '%';
        barFillEl.className = 'progress-bar-fill ' + (
            overallPct === 100 ? 'pb-complete' :
            overallPct > 0 ? 'pb-partial' :
            'pb-empty'
        );
    }

    // Update submit button state
    const submitBtn = document.getElementById('panel-submit-btn');
    if (submitBtn) {
        submitBtn.disabled = totalAnswered === 0;
        if (totalAnswered === 0) {
            submitBtn.innerHTML = 'هیچ پاسخی ثبت نشده';
        } else {
            submitBtn.innerHTML = `<span class="flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                ثبت نهایی
            </span>`;
        }
    }

    // Update status badge in header
    const badgeEl = document.getElementById('status-badge');
    if (badgeEl && totalQuestions > 0) {
        if (overallPct === 100) {
            badgeEl.textContent = '✅ همه بخش‌ها تکمیل شد';
            badgeEl.className = 'bg-green-50 text-green-600 px-4 py-2 rounded-full text-sm font-medium';
        } else {
            badgeEl.textContent = `📊 ${totalAnswered} از ${totalQuestions}`;
            badgeEl.className = 'bg-blue-50 text-blue-600 px-4 py-2 rounded-full text-sm font-medium';
        }
    }
}

export function scrollToSection(sectionKey) {
    const el = document.getElementById(`sect-${sectionKey}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

export function toggleProgressPanel() {
    const panel = document.getElementById('progress-panel');
    panel.classList.toggle('open');
}

export function resetButtonUI(sectionKey) {
    const btn = document.getElementById(`btn-${sectionKey}`);
    const icon = document.getElementById(`icon-${sectionKey}`);
    const text = document.getElementById(`text-${sectionKey}`);

    btn.className = "flex items-center gap-2 px-5 py-2.5 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-all group";
    text.innerText = "ثبت با صدا";
    icon.innerHTML = `<svg class="w-6 h-6 text-gray-500 group-hover:text-blue-600" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
    </svg>`;
}

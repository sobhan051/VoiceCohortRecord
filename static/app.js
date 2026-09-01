// app.js – Full client‑side logic with non‑blocking anomaly warnings

let mediaRecorder;
let audioChunks = [];
let recordingStates = {};
let activeRecordingSection = null;
// let audioContext = null;
// let analyserNode = null;
// let silenceDetectionActive = false;
// const SILENCE_THRESHOLD = 0.01;
// const SILENCE_DURATION_MS = 3500;
// let silenceStartTime = null;
let recordingStartTime = null;
const MIN_RECORDING_MS = 3000;

let sessionContext = {};           // { v_code: value }
let sessionConfidence = {};        // { v_code: 0..1 } – AI confidence per field
let sessionConfidenceReasons = {}; // { v_code: reason } – why confidence is below 1
let sectionMetaMap = {};          // { section_key: { depends_on_vcode, depends_on_value } }
let fieldWarnings = {};           // { v_code: [ { message, severity } ] }
let currentSubmissionId = null;   // set once a patient/submission is started
let questionRulesMap = {};        // { v_code: {logic, rules} } – question dependency rules (visibility_rules)
let lastAudioBySection = {};      // { section_key: Blob } – kept so a failed send can be retried without re-recording
let sectionProgressData = {};     // { section_key: { name_fa, total, answered } } – for the progress panel
let adminViewMode = false;
let adminSubmissionId = null;
let adminFormName = '';

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    adminViewMode = urlParams.get('admin_view') === 'true';
    adminSubmissionId = urlParams.get('submission_id');
    const selectedFormId = urlParams.get('form_id') || localStorage.getItem('selected_form_id') || '';

    try {
        const url = selectedFormId ? `/get-form-structure?form_id=${selectedFormId}` : '/get-form-structure';
        const res = await fetch(url);
        const data = await res.json();

        if (data && data.form_name && data.sections) {
            adminFormName = data.form_name;
            updateProgressPanelTitle(adminFormName);
            renderForm(data.sections);
        } else {
            renderForm(Array.isArray(data) ? data : []);
        }
        updateQuestionVisibility();
    } catch (err) {
        console.error("Failed to load form structure:", err);
        document.getElementById('form-container').innerHTML =
            `<div class="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200">خطا در دریافت اطلاعات از سرور. لطفا اتصال دیتابیس را بررسی کنید.</div>`;
    }

    if (adminViewMode && adminSubmissionId) {
        await loadAdminSubmissionData(adminSubmissionId);
    } else {
        autoStartFromSession();
    }
});

function updateProgressPanelTitle(formName) {
    const titleEl = document.getElementById('progress-panel-title');
    if (titleEl) {
        titleEl.textContent = formName;
        titleEl.style.fontSize = '1.1rem';
        titleEl.style.fontWeight = '700';
        titleEl.style.color = '#1e40af';
    }
}

async function loadAdminSubmissionData(submissionId) {
    try {
        const res = await fetch(`/api/admin/submission/${submissionId}`);
        const data = await res.json();
        if (data.error) {
            showToast('خطا در بارگذاری اطلاعات: ' + data.error);
            return;
        }

        currentSubmissionId = submissionId;

        document.getElementById('pt-first').value = data.user?.first_name || '';
        document.getElementById('pt-last').value = data.user?.last_name || '';
        document.getElementById('pt-national').value = data.user?.national_code || '';
        document.getElementById('pt-phone').value = data.user?.phone_number || '';
        document.getElementById('patient-card').classList.remove('hidden');

        const userBadge = document.getElementById('patient-card-badge');
        if (userBadge) {
            userBadge.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> مشاهده توسط مدیر`;
        }

        if (data.responses && data.responses.length > 0) {
            const answers = {};
            const confidence = {};
            data.responses.forEach(resp => {
                if (resp.extracted_value) {
                    answers[resp.v_code] = resp.extracted_value;
                }
                if (resp.ai_confidence) {
                    confidence[resp.v_code] = resp.ai_confidence;
                }
            });

            Object.entries(answers).forEach(([vcode, val]) => {
                if (val !== null && val !== undefined) sessionContext[vcode] = String(val);
            });
            Object.entries(confidence).forEach(([vcode, conf]) => {
                if (conf !== null && conf !== undefined) sessionConfidence[vcode] = conf;
            });

            applyAiResults(answers);
        }

        // Cross-form answers: parent fields that live in another form the
        // user already submitted. Required for visibility_rules /
        // deactive_options on the current form to evaluate against parents
        // recorded elsewhere (e.g. A4 gender in form 1 -> disable option 19
        // of K1 in form 2).
        if (data.cross_form_answers) {
            Object.entries(data.cross_form_answers).forEach(([vcode, val]) => {
                if (val === null || val === undefined || val === '') return;
                if (sessionContext[vcode] === undefined) {
                    sessionContext[vcode] = String(val);
                }
            });
        }

        updateQuestionVisibility();

        document.getElementById('status-badge').textContent = data.status === 'completed' ? 'تکمیل شده' : 'پیش‌نویس';

        makeFormReadOnly();
        setupAdminViewButtons();

        updateProgressPanel();
    } catch (err) {
        console.error('Failed to load admin submission data:', err);
        showToast('خطا در بارگذاری اطلاعات پاسخ‌ها');
    }
}

function makeFormReadOnly() {
    document.querySelectorAll('input[data-vcode], select[data-vcode], textarea[data-vcode]').forEach(input => {
        input.readOnly = true;
        input.disabled = true;
        input.classList.add('bg-gray-100');
    });
    document.querySelectorAll('section[id^="sect-"] button[id^="btn-"]').forEach(btn => {
        btn.style.display = 'none';
    });
}

function setupAdminViewButtons() {
    const submitBtn = document.getElementById('panel-submit-btn');
    if (!submitBtn) return;

    const footer = submitBtn.parentElement;
    footer.innerHTML = `
        <div class="flex flex-col gap-3 w-full">
            <button type="button" onclick="runAdminFormCheck()"
                    class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-all text-sm shadow-sm">
                <span class="flex items-center justify-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                    </svg>
                    بررسی فرم
                </span>
            </button>
            <button type="button" onclick="window.location.href='/dashboard?section=submissions'"
                    class="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-4 rounded-xl transition-all text-sm">
                <span class="flex items-center justify-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                    </svg>
                    بازگشت به لیست پرسشنامه‌ها
                </span>
            </button>
        </div>`;
}

async function runAdminFormCheck() {
    const footer = document.querySelector('#progress-panel .panel-footer');
    const btn = document.querySelector('#progress-panel .panel-footer button');
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<span class="flex items-center justify-center gap-2"><svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> در حال بررسی...</span>`;
    btn.disabled = true;

    try {
        const res = await fetch('/check-final-anomalies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                submission_id: currentSubmissionId,
                answers: sessionContext,
                confidence_reasons: sessionConfidenceReasons,
            })
        });
        const data = await res.json();
        const warnings = (!data.error && data.warnings) ? data.warnings : [];

        fieldWarnings = {};
        warnings.forEach(w => {
            if (!fieldWarnings[w.v_code]) fieldWarnings[w.v_code] = [];
            fieldWarnings[w.v_code].push({
                message: w.message,
                severity: w.severity || 'warning'
            });
        });

        applyFieldWarnings();
        updateSectionBadges();
        updateWarningPanel();

        if (warnings.length > 0) {
            const list = document.getElementById('warning-list');
            if (list) list.classList.add('active');
            showToast(`${warnings.length} مورد یافت شد`);
        } else {
            showToast('موردی یافت نشد - فرم صحیح است');
        }
    } catch (err) {
        console.error('Admin form check failed:', err);
        showToast('خطا در بررسی فرم');
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
}

// Add this helper function at the top
function getBestAudioMimeType() {
    // Priority order with bitrate recommendations
    const mimeTypes = [
        { 
            mime: 'audio/webm', 
            label: 'webm',
            bitrate: 32000,  // 32 kbps - optimal for speech
            codec: 'opus'
        },
        { 
            mime: 'audio/mp4', 
            label: 'm4a',
            bitrate: 64000,  // 64 kbps for AAC
            codec: 'aac'
        },
        { 
            mime: 'audio/ogg', 
            label: 'ogg',
            bitrate: 64000,  // 64 kbps for Vorbis
            codec: 'vorbis'
        },
        { 
            mime: 'audio/wav', 
            label: 'wav',
            bitrate: null,   // Uncompressed
            codec: 'pcm'
        }
    ];
    
    for (const mt of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mt.mime)) {
            console.log(`Using format: ${mt.mime} (${mt.codec} @ ${mt.bitrate ? mt.bitrate/1000 + 'kbps' : 'uncompressed'})`);
            return mt;
        }
    }
    
    // Fallback to browser default
    console.warn('No preferred format supported, using browser default');
    return { mime: '', label: 'default', bitrate: null, codec: 'unknown' };
}


// ---------- Session-based Patient / Submission gate ----------
function changePatient() {
    // Redirect to the dashboard to pick a different user
    window.location.href = '/dashboard';
}

async function autoStartFromSession() {
    const errEl = document.getElementById('pt-error');
    
    // Read user session from localStorage (set by dashboard on login)
    const saved = localStorage.getItem('vcr_user');
    if (!saved) {
        errEl.textContent = 'نشست کاربری یافت نشد. لطفاً ابتدا وارد شوید.';
        errEl.classList.remove('hidden');
        setTimeout(() => { window.location.href = '/login'; }, 3000);
        return;
    }

    let userData;
    try {
        userData = JSON.parse(saved);
    } catch {
        errEl.textContent = 'اطلاعات نشست نامعتبر است. لطفاً دوباره وارد شوید.';
        errEl.classList.remove('hidden');
        localStorage.removeItem('vcr_user');
        setTimeout(() => { window.location.href = '/login'; }, 3000);
        return;
    }

    // Pre-fill the patient card with user data
    document.getElementById('pt-first').value = userData.first_name || '';
    document.getElementById('pt-last').value = userData.last_name || '';
    document.getElementById('pt-national').value = userData.national_code || '';
    document.getElementById('pt-phone').value = userData.phone_number || '';
    
    // Show the patient card
    document.getElementById('patient-card').classList.remove('hidden');

    // Auto-start submission using the user_id from session
    try {
        // Include form_id if stored (from dashboard form selection)
        const selectedFormId = localStorage.getItem('selected_form_id') || null;
        const body = { user_id: userData.user_id };
        if (selectedFormId) body.form_id = selectedFormId;
        const res = await fetch('/start-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.error) {
            errEl.textContent = data.error;
            errEl.classList.remove('hidden');
            // Make the failure impossible to miss (e.g. form locked by the
            // sequence gate) and prevent the misleading "session not started"
            // alert on submit: toast + disabled final-submit button.
            showToast(data.error);
            const submitBtn = document.getElementById('panel-submit-btn');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.title = data.error;
            }
            return;
        }

        currentSubmissionId = data.submission_id;
        const name = data.user_name || 'بیمار';

        // Update badge text
        document.getElementById('patient-card-subtitle').textContent =
            `بیمار: ${name} — شروع شده در ${new Date().toLocaleDateString('fa-IR')}`;

        // Progressive resume: prefill any sections this patient already answered
        loadExistingProgress(data);
        updateProgressPanel();
    } catch (err) {
        console.error('start-submission failed:', err);
        errEl.textContent = 'ارتباط با سرور با مشکل مواجه شد.';
        errEl.classList.remove('hidden');
    }
}

// ---------- Progressive resume ----------
// Prefill answers saved on a previous visit and mark answered sections "done".
function loadExistingProgress(data) {
    const answers = data.answers || {};
    const confidence = data.confidence || {};
    const answeredSections = data.answered_sections || [];

    // Seed client state so the final submit includes prior answers untouched.
    Object.entries(answers).forEach(([vcode, val]) => {
        if (val !== null && val !== undefined) sessionContext[vcode] = String(val);
    });
    Object.entries(confidence).forEach(([vcode, conf]) => {
        if (conf !== null && conf !== undefined) sessionConfidence[vcode] = conf;
    });

    // Reuse the AI-fill routine to populate the inputs from saved answers.
    if (Object.keys(answers).length > 0) {
        applyAiResults(answers);
        updateQuestionVisibility();
    }

    answeredSections.forEach(markSectionAnswered);

    if (answeredSections.length > 0) {
        document.getElementById('status-badge').textContent =
            `ادامه پرسشنامه (${answeredSections.length} بخش تکمیل‌شده)`;
    }
}

// Visually flag a section the patient already completed. The mic stays enabled
// so they can re-record to correct an answer.
function markSectionAnswered(sectionKey) {
    const sectionEl = document.getElementById(`sect-${sectionKey}`);
    if (!sectionEl) return;
    sectionEl.classList.add('section-answered');

    const badge = document.getElementById(`badge-${sectionKey}`);
    if (badge && !badge.classList.contains('active')) {
        badge.innerHTML = '<span class="inline-flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg> تکمیل شد</span>';
        badge.classList.add('section-done-badge');
    }
}

// ---------- Floating Stop Button & Volume Meter ----------
function showFloatingStopButton() {
    document.getElementById('floating-stop-btn').classList.remove('hidden');
    document.getElementById('floating-stop-btn').classList.add('flex');
    document.getElementById('volume-meter-container').classList.remove('hidden');
    document.getElementById('volume-meter-container').classList.add('flex');
}

function hideFloatingStopButton() {
    document.getElementById('floating-stop-btn').classList.add('hidden');
    document.getElementById('floating-stop-btn').classList.remove('flex');
    document.getElementById('volume-meter-container').classList.add('hidden');
    document.getElementById('volume-meter-container').classList.remove('flex');
}

function stopRecordingViaFab() {
    if (activeRecordingSection) toggleRecording(activeRecordingSection);
}

// ---------- Section‑Level Visibility (DB rules) ----------
function updateQuestionVisibility() {
    document.querySelectorAll('section[id^="sect-"]').forEach(sectionEl => {
        const sectionKey = sectionEl.id.replace('sect-', '');
        const meta = sectionMetaMap[sectionKey];
        let sectionShouldShow = true;

        if (meta && meta.depends_on_vcode) {
            const parentValue = sessionContext[meta.depends_on_vcode];
            if (parentValue === undefined || parentValue === null || parentValue === '') {
                sectionShouldShow = false;
            } else if (parentValue != meta.depends_on_value) {
                sectionShouldShow = false;
            }
        }

        sectionEl.style.display = sectionShouldShow ? '' : 'none';
        sectionEl.style.opacity = sectionShouldShow ? '1' : '0';
    });

    // Question-level dependency rules (questions.visibility_rules JSONB)
    applyQuestionRulesVisibility();
}

// ---------- Question-Level Dependency Rules (visibility_rules JSONB) ----------
// Each rule may carry `deactive_options`: when the rule's parent answer
// matches, the listed option codes of the current question are disabled.
function normalizeRules(raw) {
    if (!raw) return null;
    let rules = raw;
    if (typeof rules === 'string') {
        try { rules = JSON.parse(rules); } catch (e) { return null; }
    }
    if (!rules || typeof rules !== 'object' || !Array.isArray(rules.rules)) return null;
    const clean = rules.rules
        .filter(r => r && r.v_code && Array.isArray(r.values) && r.values.length > 0)
        .map(r => {
            const rule = { v_code: String(r.v_code), values: r.values.map(String) };
            if (Array.isArray(r.deactive_options) && r.deactive_options.length > 0) {
                rule.deactive_options = r.deactive_options.map(String);
            }
            return rule;
        });
    if (clean.length === 0) return null;
    return { logic: rules.logic === 'any' ? 'any' : 'all', rules: clean };
}

// Effective answer for a parent v_code — collapses grouped BASE_0/BASE_1
// entries into one comma-joined value (multi-select semantics).
function getEffectiveAnswer(vcode) {
    const direct = sessionContext[vcode];
    if (direct !== undefined && direct !== null && direct !== '') return String(direct);
    const entries = [];
    Object.entries(sessionContext).forEach(([key, val]) => {
        const m = key.match(/^(.+?)_(\d+)$/);
        if (m && m[1] === vcode && val !== undefined && val !== null && val !== '') {
            entries.push([parseInt(m[2]), String(val)]);
        }
    });
    if (entries.length === 0) return null;
    entries.sort((a, b) => a[0] - b[0]);
    return entries.map(e => e[1]).join(',');
}

// Mirror of app/services/visibility.py — keep the two in sync.
// Tri-state evaluation: 'applicable' (dependency met), 'na' (dependency
// explicitly failed — a parent was ANSWERED with a non-qualifying value), or
// 'pending' (a parent hasn't been answered yet). The pending state is what
// keeps the progress bar from counting the question before its dependency is
// actually resolved by an answer.
function getQuestionRuleState(vcode) {
    const rules = questionRulesMap[vcode];
    if (!rules) return 'applicable';
    const results = rules.rules.map(rule => {
        let parentValue = getEffectiveAnswer(rule.v_code);
        if (parentValue === null || parentValue === undefined) return 'pending';
        parentValue = String(parentValue).trim();
        if (parentValue === '') return 'pending';
        if (parentValue.toUpperCase() === 'N/A') return 'fail';
        const allowed = rule.values.map(String);
        if (parentValue.includes(',')) {
            const selected = parentValue.split(',').map(v => v.trim()).filter(Boolean);
            return selected.some(v => allowed.includes(v)) ? 'pass' : 'fail';
        }
        return allowed.includes(parentValue) ? 'pass' : 'fail';
    });
    if (rules.logic === 'any') {
        if (results.includes('pass')) return 'applicable';
        if (results.includes('pending')) return 'pending';
        return 'na';
    }
    // logic "all"
    if (results.includes('pending')) return 'pending';
    return results.every(r => r === 'pass') ? 'applicable' : 'na';
}

// Returns the list of option codes that should be deactivated on the
// question owning these rules. Each rule may carry a `deactive_options`
// list — when that rule's parent answer matches, those option codes
// become unavailable (greyed out + uncheckable) on the current question.
function getDeactiveOptionsFor(vcode) {
    const rules = questionRulesMap[vcode];
    if (!rules) return [];
    const out = [];
    const seen = new Set();
    rules.rules.forEach(rule => {
        if (!Array.isArray(rule.deactive_options) || rule.deactive_options.length === 0) return;
        const state = evaluateRuleState(rule);
        if (state !== 'pass') return;
        rule.deactive_options.forEach(opt => {
            const k = String(opt);
            if (!seen.has(k)) {
                seen.add(k);
                out.push(k);
            }
        });
    });
    return out;
}

// Evaluate a single rule's parent match state without computing the full
// question tri-state ('pass' | 'fail' | 'pending').
function evaluateRuleState(rule) {
    let parentValue = getEffectiveAnswer(rule.v_code);
    if (parentValue === null || parentValue === undefined) return 'pending';
    parentValue = String(parentValue).trim();
    if (parentValue === '') return 'pending';
    if (parentValue.toUpperCase() === 'N/A') return 'fail';
    const allowed = rule.values.map(String);
    if (parentValue.includes(',')) {
        const selected = parentValue.split(',').map(v => v.trim()).filter(Boolean);
        return selected.some(v => allowed.includes(v)) ? 'pass' : 'fail';
    }
    return allowed.includes(parentValue) ? 'pass' : 'fail';
}

// Wrapper around JUST the control (options row / input box) — dimming for
// non-applicable/pending questions must never touch the question text, which
// stays fully readable (full opacity) while the field worker records.
function getControlWrapper(input) {
    if (input.type === 'radio' || input.type === 'checkbox') {
        return input.closest('.flex.flex-wrap') || input.closest('label') || input.parentElement;
    }
    return input.closest('.relative') || input.parentElement;
}

// Disable + clear + tag «غیرمرتبط» on every question whose dependency is not
// met, and restore fields whose dependency becomes satisfied. Runs inside
// updateQuestionVisibility() so it re-evaluates on every answer change.
// NOTE: only the controls (options/inputs) are dimmed — the question text is
// never greyed out or lightened.
function applyQuestionRulesVisibility() {
    Object.keys(questionRulesMap).forEach(vcode => {
        const state = getQuestionRuleState(vcode);

        // Every rendered input of this question: plain v_code + grouped BASE_N
        const inputs = Array.from(document.querySelectorAll('[data-vcode]'))
            .filter(inp => inp.dataset.vcode === vcode ||
                (inp.dataset.vcode + '_').startsWith(vcode + '_'));

        const isGrouped = Object.values(groupedQuestionsMap).some(qs =>
            qs.some(q => q.v_code === vcode));

        if (state === 'na') {
            inputs.forEach(input => {
                if (input.type === 'radio' || input.type === 'checkbox') {
                    input.checked = false;
                } else {
                    if (input.dataset.origPlaceholder === undefined) {
                        input.dataset.origPlaceholder = input.placeholder || '';
                    }
                    input.value = '';
                    input.placeholder = 'غیرمرتبط';
                }
                input.disabled = true;
                input.dataset.na = '1';
                const control = getControlWrapper(input);
                if (control) control.classList.add('opacity-50');
            });
            if (isGrouped) {
                Object.keys(sessionContext).forEach(k => {
                    const m = k.match(/^(.+?)_(\d+)$/);
                    if (m && m[1] === vcode) sessionContext[k] = 'N/A';
                });
            } else {
                sessionContext[vcode] = 'N/A';
            }
        } else {
            // 'applicable' → enabled; 'pending' → disabled + dimmed but NOT
            // N/A-marked, so the progress bar doesn't count it until its
            // dependency is resolved by answering the parent.
            inputs.forEach(input => {
                input.disabled = state === 'pending';
                delete input.dataset.na;
                if (input.type !== 'radio' && input.type !== 'checkbox' &&
                    state === 'applicable' && input.dataset.origPlaceholder !== undefined) {
                    input.placeholder = input.dataset.origPlaceholder;
                }
                const control = getControlWrapper(input);
                if (control) control.classList.toggle('opacity-50', state === 'pending');
            });
            // Drop any auto "N/A" state (e.g. the parent was cleared again)
            Object.keys(sessionContext).forEach(k => {
                const m = k.match(/^(.+?)_(\d+)$/);
                if ((k === vcode || (m && m[1] === vcode)) &&
                    String(sessionContext[k]).toUpperCase() === 'N/A') {
                    delete sessionContext[k];
                }
            });
        }

        // «غیرمرتبط» badge(s) — only when the dependency is explicitly false
        const badges = [];
        const plainBadge = document.getElementById(`na-badge-${vcode}`);
        if (plainBadge) badges.push(plainBadge);
        document.querySelectorAll(`[id^="na-badge-${vcode}_"]`).forEach(b => badges.push(b));
        badges.forEach(b => { b.style.display = state === 'na' ? 'inline-block' : 'none'; });

        // Per-rule deactive_options: grey out + uncheck option codes whose
        // parent rule currently passes. Independent of the question's overall
        // tri-state, so it works for both applicable and na states.
        applyDeactiveOptionsFor(vcode);
    });
}

// Per-question option-level deactivation. Scoped to radio / checkbox inputs
// (the only response types that have option codes). When a rule lists
// deactive_options and the parent answer matches, the matching option cards
// become unselectable, the input is unchecked, and the label is dimmed.
function applyDeactiveOptionsFor(vcode) {
    const deactive = getDeactiveOptionsFor(vcode);
    if (deactive.length === 0) {
        // Re-enable any previously-deactivated option for this question
        const prev = document.querySelectorAll('input[type="radio"][data-vcode="' + vcode + '"][data-deactive="1"], input[type="checkbox"][data-vcode="' + vcode + '"][data-deactive="1"]');
        prev.forEach(inp => {
            inp.disabled = !!inp.dataset.na;
            delete inp.dataset.deactive;
            const label = inp.closest('label');
            if (label) {
                label.classList.remove('opacity-40', 'pointer-events-none', 'cursor-not-allowed');
                label.title = '';
            }
        });
        return;
    }
    const deactiveSet = new Set(deactive.map(String));
    const selector = [
        'input[type="radio"][data-vcode="' + vcode + '"]',
        'input[type="checkbox"][data-vcode="' + vcode + '"]',
    ].join(',');
    const inputs = Array.from(document.querySelectorAll(selector));
    inputs.forEach(inp => {
        const label = inp.closest('label');
        if (deactiveSet.has(String(inp.value))) {
            if (inp.checked) inp.checked = false;
            inp.disabled = true;
            inp.dataset.deactive = '1';
            if (label) {
                label.classList.add('opacity-40', 'pointer-events-none', 'cursor-not-allowed');
                label.title = 'این گزینه توسط قوانین فرم غیرفعال شده است';
            }
        } else {
            // Only re-enable if the option is NOT also N/A-tagged by visibility
            if (inp.dataset.deactive === '1') {
                inp.disabled = !!inp.dataset.na;
                delete inp.dataset.deactive;
                if (label) {
                    label.classList.remove('opacity-40', 'pointer-events-none', 'cursor-not-allowed');
                    label.title = '';
                }
            }
        }
    });
}

// ---------- Rendering ----------
// ---------- Grouped (multi-entry) Questions ----------
let groupEntryCounts = {};
let groupedQuestionsMap = {}; // { group_pair: [question_objects] }
let groupedQuestionsSections = {}; // { group_pair: section_key }

function extractGroupedQuestions(sections) {
    groupedQuestionsMap = {};
    groupedQuestionsSections = {};
    sections.forEach(section => {
        // Collect grouped questions but DON'T remove them from section.questions
        // Progress counting needs the full count
        (section.questions || []).forEach(q => {
            if (q.group_pair) {
                if (!groupedQuestionsMap[q.group_pair]) groupedQuestionsMap[q.group_pair] = [];
                groupedQuestionsMap[q.group_pair].push(q);
                groupedQuestionsSections[q.group_pair] = section.section_key;
            }
        });
    });
}

function renderGroupContainer(groupPair) {
    const questions = groupedQuestionsMap[groupPair] || [];
    if (!groupEntryCounts[groupPair]) groupEntryCounts[groupPair] = 1;
    const count = groupEntryCounts[groupPair];
    let entriesHtml = '';
    for (let idx = 0; idx < count; idx++) {
        entriesHtml += renderGroupEntry(groupPair, questions, idx);
    }
    const label = questions.length > 0 ? questions[0].question_text_fa.split(' ').slice(0,3).join(' ') : groupPair;
    return `
        <div class="md:col-span-2 group-container" id="group-${groupPair}" data-group-pair="${groupPair}">
            <div class="bg-blue-50 border-2 border-blue-100 rounded-2xl p-4 space-y-4">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="text-sm font-bold text-blue-700">${label}</h3>
                    <span class="text-xs text-blue-500 bg-blue-100 px-2 py-1 rounded-full" id="group-count-${groupPair}">${count} ردیف</span>
                </div>
                <div id="group-entries-${groupPair}" class="space-y-4">
                    ${entriesHtml}
                </div>
                <button type="button" onclick="addGroupEntry('${groupPair}')" 
                    class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium mt-2 transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                    </svg>
                    افزودن ردیف جدید
                </button>
            </div>
        </div>
    `;
}

function renderGroupEntry(groupPair, questions, idx) {
    const fields = questions.map(q => {
        const indexedVcode = q.v_code + '_' + idx;
        return renderQuestion({ ...q, v_code: indexedVcode, _groupPair: groupPair, _groupIdx: idx });
    }).join('');
    const removeBtn = idx > 0 ? `
        <button type="button" onclick="removeGroupEntry('${groupPair}', ${idx})"
            class="absolute top-2 left-2 text-red-400 hover:text-red-600 transition p-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
        </button>` : '';
    return `
        <div class="group-entry border border-gray-200 rounded-xl p-3 bg-white relative" data-group="${groupPair}" data-idx="${idx}">
            ${removeBtn}
            <div class="text-xs text-gray-400 mb-2 font-medium">ردیف ${idx + 1}</div>
            <div class="grid grid-cols-1 md:grid-cols-${Math.min(questions.length, 3)} gap-x-6 gap-y-4">
                ${fields}
            </div>
        </div>
    `;
}

function addGroupEntry(groupPair) {
    const entries = document.querySelectorAll(`.group-entry[data-group="${groupPair}"]`);
    const lastEntry = entries[entries.length - 1];
    if (lastEntry) {
        const inputs = lastEntry.querySelectorAll('input[data-vcode], select[data-vcode], textarea[data-vcode]');
        const allFilled = Array.from(inputs).every(inp => {
            if (inp.type === 'radio' || inp.type === 'checkbox') {
                // For radio/checkbox, at least one in the group must be checked
                const name = inp.name;
                const groupInputs = lastEntry.querySelectorAll(`input[name="${name}"]`);
                return Array.from(groupInputs).some(gi => gi.checked);
            }
            return inp.value && inp.value.trim() !== '';
        });
        if (!allFilled) {
            showToast('لطفاً تمام فیلدهای ردیف قبلی را پر کنید');
            return;
        }
    }

    groupEntryCounts[groupPair] = (groupEntryCounts[groupPair] || 1) + 1;
    const newIdx = groupEntryCounts[groupPair] - 1;
    const questions = groupedQuestionsMap[groupPair] || [];
    const container = document.getElementById('group-entries-' + groupPair);
    if (!container) return;

    const tmpDiv = document.createElement('div');
    tmpDiv.innerHTML = renderGroupEntry(groupPair, questions, newIdx);
    container.appendChild(tmpDiv.firstElementChild);

    const counter = document.getElementById('group-count-' + groupPair);
    if (counter) counter.textContent = groupEntryCounts[groupPair] + ' ردیف';
    updateProgressPanel();
}

function addGroupEntrySilent(groupPair) {
    groupEntryCounts[groupPair] = (groupEntryCounts[groupPair] || 1) + 1;
    const newIdx = groupEntryCounts[groupPair] - 1;
    const questions = groupedQuestionsMap[groupPair] || [];
    const container = document.getElementById('group-entries-' + groupPair);
    if (!container) return;
    const tmpDiv = document.createElement('div');
    tmpDiv.innerHTML = renderGroupEntry(groupPair, questions, newIdx);
    container.appendChild(tmpDiv.firstElementChild);
    const counter = document.getElementById('group-count-' + groupPair);
    if (counter) counter.textContent = groupEntryCounts[groupPair] + ' ردیف';
}

function removeGroupEntry(groupPair, idx) {
    const entries = document.querySelectorAll(`.group-entry[data-group="${groupPair}"]`);
    if (entries.length <= 1) {
        showToast('حداقل یک ردیف الزامی است');
        return;
    }
    const entry = document.querySelector(`.group-entry[data-group="${groupPair}"][data-idx="${idx}"]`);
    if (entry) entry.remove();
    const remaining = document.querySelectorAll(`.group-entry[data-group="${groupPair}"]`);
    groupEntryCounts[groupPair] = remaining.length;
    const counter = document.getElementById('group-count-' + groupPair);
    if (counter) counter.textContent = remaining.length + ' ردیف';
    updateProgressPanel();
}

function collectGroupedAnswers() {
    document.querySelectorAll('.group-entry').forEach(entry => {
        const groupPair = entry.dataset.group;
        const idx = parseInt(entry.dataset.idx);
        entry.querySelectorAll('[data-vcode]').forEach(inp => {
            const rawVcode = inp.dataset.vcode;
            if (rawVcode && /_\d+$/.test(rawVcode)) {
                // N/A-tagged (dependency not met) fields keep their "N/A" state
                if (inp.dataset.na === '1') return;
                // Pending (dependency not yet resolved) fields stay disabled
                // and untouched — don't overwrite their state
                if (inp.disabled) return;
                if (inp.type === 'radio') {
                    if (inp.checked) sessionContext[rawVcode] = inp.value;
                } else if (inp.type === 'checkbox') {
                    const allChecked = entry.querySelectorAll(`input[type="checkbox"][data-vcode="${rawVcode}"]:checked`);
                    sessionContext[rawVcode] = Array.from(allChecked).map(c => c.value).join(',');
                } else {
                    sessionContext[rawVcode] = inp.value;
                }
            }
        });
    });
}

function applyGroupedAiResults(data) {
    // First pass: figure out how many rows each group needs
    const groupMaxIdx = {}; // { groupPair: maxIdx }

    Object.entries(data).forEach(([vcode, val]) => {
        if (val === null || val === undefined || val === '') return;
        // Find which group this vcode belongs to
        let baseVcode = vcode;
        let idx = 0;
        const match = vcode.match(/^(.+?)_(\d+)$/);
        if (match) {
            baseVcode = match[1];
            idx = parseInt(match[2]);
        }
        // Check if this base vcode is in any group
        for (const [gp, questions] of Object.entries(groupedQuestionsMap)) {
            if (questions.some(q => q.v_code === baseVcode)) {
                if (!groupMaxIdx[gp] || idx > groupMaxIdx[gp]) groupMaxIdx[gp] = idx;
                break;
            }
        }
    });

    // Auto-add rows for groups that need more than currently exist
    Object.entries(groupMaxIdx).forEach(([gp, maxIdx]) => {
        const currentCount = groupEntryCounts[gp] || 1;
        for (let i = currentCount; i <= maxIdx; i++) {
            addGroupEntrySilent(gp);
        }
    });

    // Second pass: fill in the values
    Object.entries(data).forEach(([vcode, val]) => {
        if (val === null || val === undefined || val === '') return;
        let baseVcode = vcode;
        let idx = 0;
        const match = vcode.match(/^(.+?)_(\d+)$/);
        if (match) {
            baseVcode = match[1];
            idx = parseInt(match[2]);
        }
        // If plain vcode belongs to a group, map to idx=0
        let targetVcode = vcode;
        for (const [gp, questions] of Object.entries(groupedQuestionsMap)) {
            if (questions.some(q => q.v_code === baseVcode)) {
                if (!match) targetVcode = baseVcode + '_0';
                break;
            }
        }
        const inputs = document.querySelectorAll(`[data-vcode="${targetVcode}"]`);
        inputs.forEach(input => {
            if (input.type === 'radio') {
                if (input.value == val) {
                    input.checked = true;
                    const lbl = input.closest('label');
                    if (lbl) lbl.classList.add('ai-updated');
                    setTimeout(() => { if (lbl) lbl.classList.remove('ai-updated'); }, 3000);
                }
            } else if (input.type === 'checkbox') {
                // Not expected for grouped, but handle anyway
                input.checked = true;
                input.classList.add('ai-updated');
                setTimeout(() => input.classList.remove('ai-updated'), 3000);
            } else {
                input.value = String(val);
                input.classList.add('ai-updated');
                setTimeout(() => input.classList.remove('ai-updated'), 3000);
            }
        });
        // Dispatch change on first matching input to sync sessionContext
        if (inputs.length > 0) {
            inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
}

function getIndexedGroupAnswers(groupPair) {
    const questions = groupedQuestionsMap[groupPair] || [];
    const results = [];
    const count = groupEntryCounts[groupPair] || 1;
    for (let idx = 0; idx < count; idx++) {
        const entry = {};
        let hasValue = false;
        questions.forEach(q => {
            const vc = q.v_code + '_' + idx;
            const val = sessionContext[vc];
            if (val !== undefined && val !== null && val !== '') {
                entry[q.v_code] = val;
                hasValue = true;
            }
        });
        if (hasValue) results.push(entry);
    }
    return results;
}


function renderForm(sections) {
    const container = document.getElementById('form-container');
    container.innerHTML = '';

    // Extract grouped questions before rendering
    extractGroupedQuestions(sections);

    // Build section progress data
    sectionProgressData = {};
    sections.forEach(section => {
        sectionMetaMap[section.section_key] = {
            depends_on_vcode: section.depends_on_vcode || null,
            depends_on_value: section.depends_on_value || null
        };
        sectionProgressData[section.section_key] = {
            name_fa: section.name_fa,
            total: section.questions ? section.questions.length : 0,
            answered: 0
        };

        // Collect question-level dependency rules (before the grouped filter)
        (section.questions || []).forEach(q => {
            const rules = normalizeRules(q.visibility_rules);
            if (rules) questionRulesMap[q.v_code] = rules;
        });

        // Place each group container at the sort_order position of its first
        // question, so groups keep their place inside the section instead of
        // always jumping to the top. Members of the group render inside the
        // container as back-to-back rows in sort order.
        const fullQuestions = section.questions || [];
        const sectionGroups = Object.keys(groupedQuestionsMap)
            .filter(gp => groupedQuestionsSections[gp] === section.section_key);
        const groupFirstVcode = {};
        sectionGroups.forEach(gp => {
            const first = fullQuestions.find(q => q.group_pair === gp);
            if (first) groupFirstVcode[gp] = first.v_code;
        });
        const renderedGroups = new Set();
        let bodyHtml = fullQuestions.map(q => {
            if (q.group_pair) {
                if (groupFirstVcode[q.group_pair] === q.v_code) {
                    renderedGroups.add(q.group_pair);
                    return renderGroupContainer(q.group_pair);
                }
                return ''; // later members of the group render inside its rows
            }
            return renderQuestion(q);
        }).join('');
        // Safety net: a group whose first question wasn't matched still renders
        bodyHtml += sectionGroups
            .filter(gp => !renderedGroups.has(gp))
            .map(gp => renderGroupContainer(gp)).join('');

        // Non-grouped questions only (for anything else that uses the list)
        section.questions = fullQuestions.filter(q => !q.group_pair);

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
                    ${bodyHtml}
                </div>
            </section>
        `;
        container.insertAdjacentHTML('beforeend', sectHtml);
    });

}

// ---------- Progress Panel ----------
function updateProgressPanel() {
    // Count answered questions per visible section (unique vcode per question)
    const visibleSections = document.querySelectorAll('section[id^="sect-"]:not([style*="display: none"])');
    visibleSections.forEach(sectionEl => {
        const sectionKey = sectionEl.id.replace('sect-', '');
        if (!sectionProgressData[sectionKey]) return;
        let answered = 0;
        const countedVcodes = new Set();
        sectionEl.querySelectorAll('[data-vcode]').forEach(input => {
            const vcode = input.dataset.vcode;
            if (!vcode || countedVcodes.has(vcode)) return;
            // Skip indexed/grouped vcodes (e.g. D1__1, D1__2) — handled separately below
            if (/_\d+$/.test(vcode)) return;
            countedVcodes.add(vcode);
            const isNa = input.dataset.na === '1';
            if (input.type === 'checkbox') {
                const checked = sectionEl.querySelectorAll(
                    `input[type="checkbox"][data-vcode="${vcode}"]:checked`
                );
                if (isNa || checked.length > 0) answered++;
            } else if (input.type === 'radio') {
                const checked = sectionEl.querySelector(
                    `input[type="radio"][data-vcode="${vcode}"]:checked`
                );
                if (isNa || checked) answered++;
            } else if (isNa || (input.value && input.value.trim() !== '')) {
                answered++;
            }
        });
        // Count grouped answers — only the first row (idx=0) counts toward progress
        Object.entries(groupedQuestionsMap).forEach(([gp, questions]) => {
            if (groupedQuestionsSections[gp] !== sectionKey) return;
            questions.forEach(q => {
                const vc = q.v_code + '_0';
                if (countedVcodes.has(vc)) return;
                countedVcodes.add(vc);
                // Pending (dependency not yet resolved) grouped fields don't count
                const input0 = document.querySelector(`[data-vcode="${vc}"]`);
                if (input0 && input0.disabled && input0.dataset.na !== '1') return;
                const val = sessionContext[vc];
                if (val !== undefined && val !== null && val !== '') {
                    answered++;
                }
            });
        });
        sectionProgressData[sectionKey].answered = answered;
    });

    // Build the list HTML
    const listEl = document.getElementById('progress-section-list');
    let totalAnswered = 0;
    let totalQuestions = 0;
    let html = '';

    Object.entries(sectionProgressData).forEach(([key, data]) => {
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
        submitBtn.textContent = totalAnswered === 0 ? 'هیچ پاسخی ثبت نشده' : `ثبت نهایی (${totalAnswered})`;
        // Re-wrap with icon
        if (totalAnswered > 0) {
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
            badgeEl.innerHTML = '<span class="inline-flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> همه بخش‌ها تکمیل شد</span>';
            badgeEl.className = 'bg-green-50 text-green-600 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap';
        } else {
            badgeEl.textContent = `${totalAnswered} از ${totalQuestions}`;
            badgeEl.className = 'bg-blue-50 text-blue-600 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap';
        }
    }
}

function scrollToSection(sectionKey) {
    const el = document.getElementById(`sect-${sectionKey}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function toggleProgressPanel() {
    const panel = document.getElementById('progress-panel');
    panel.classList.toggle('open');
}

function renderQuestion(q) {
    if (q.response_type === 'MultiSelect') {
        let options = q.coding_options;
        if (typeof options === 'string') {
            try { options = JSON.parse(options); } catch (e) { options = {}; }
        }
        return `
            <div class="md:col-span-2 space-y-3">
                <div class="flex items-center gap-2 flex-wrap">
                    <label class="block text-gray-700 font-bold">${q.question_text_fa}</label>
                    <span id="na-badge-${q.v_code}" style="display:none" class="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full border border-gray-200">غیرمرتبط</span>
                </div>
                <div class="flex flex-wrap gap-4">
                    ${Object.entries(options || {}).map(([key, val]) => `
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
        let options = q.coding_options;
        if (typeof options === 'string') {
            try { options = JSON.parse(options); } catch (e) { options = {}; }
        }
        return `
            <div class="md:col-span-2 space-y-3">
                <div class="flex items-center gap-2 flex-wrap">
                    <label class="block text-gray-700 font-bold">${q.question_text_fa}</label>
                    <span id="na-badge-${q.v_code}" style="display:none" class="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full border border-gray-200">غیرمرتبط</span>
                </div>
                <div class="flex flex-wrap gap-4">
                    ${Object.entries(options || {}).map(([key, val]) => `
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
            <div class="flex items-center gap-2 flex-wrap">
                <label class="text-gray-600 text-sm font-medium">${q.question_text_fa}</label>
                <span id="na-badge-${q.v_code}" style="display:none" class="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full border border-gray-200">غیرمرتبط</span>
            </div>
            <div class="relative">
                <input type="text" data-vcode="${q.v_code}"
                       class="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                       placeholder="${q.unit ? 'واحد: ' + q.unit : '---'}">
            </div>
        </div>
    `;
}

// Modified toggleRecording function with bitrate control
async function toggleRecording(sectionKey) {
    const btn = document.getElementById(`btn-${sectionKey}`);
    const icon = document.getElementById(`icon-${sectionKey}`);
    const text = document.getElementById(`text-${sectionKey}`);

    if (!recordingStates[sectionKey] && !currentSubmissionId) {
        // No active session — redirect to login
        alert('لطفاً ابتدا وارد شوید.');
        window.location.href = '/login';
        return;
    }

    if (!recordingStates[sectionKey]) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Get best supported format for this browser
            const audioFormat = getBestAudioMimeType();
            
            // Create MediaRecorder with optimal settings
            const options = {
                mimeType: audioFormat.mime
            };
            
            // Add bitrate for formats that support it
            if (audioFormat.bitrate) {
                options.audioBitsPerSecond = audioFormat.bitrate;
                console.log(`Setting bitrate: ${audioFormat.bitrate/1000}kbps`);
            }
            
            mediaRecorder = new MediaRecorder(stream, options);
            
            // Store the format info for later
            mediaRecorder.audioFormat = audioFormat;
            audioChunks = [];

            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                // Use the correct MIME type for the blob
                const audioBlob = new Blob(audioChunks, { type: mediaRecorder.audioFormat.mime });
                sendAudioToServer(sectionKey, audioBlob, mediaRecorder.audioFormat);
            };

            // Start recording with data collection every second
            mediaRecorder.start(1000);
            recordingStartTime = Date.now();
            silenceStartTime = null;
            silenceDetectionActive = true;

            // Volume meter setup (unchanged from your original)
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            analyserNode = audioContext.createAnalyser();
            analyserNode.fftSize = 256;
            source.connect(analyserNode);

            const scriptProcessor = audioContext.createScriptProcessor(256, 1, 1);
            analyserNode.connect(scriptProcessor);
            scriptProcessor.connect(audioContext.destination);

            scriptProcessor.onaudioprocess = (event) => {
                if (!silenceDetectionActive) return;
                const input = event.inputBuffer.getChannelData(0);
                let sum = 0;
                for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
                const rms = Math.sqrt(sum / input.length);

                const meterFill = document.getElementById('volume-meter-fill');
                if (meterFill) {
                    const displayPercent = Math.min((rms / 0.2) * 100, 100);
                    meterFill.style.height = displayPercent + '%';
                    if (rms < 0.005) meterFill.style.backgroundColor = '#ef4444';
                    else if (rms > 0.25) meterFill.style.backgroundColor = '#f97316';
                    else if (rms > 0.15) meterFill.style.backgroundColor = '#eab308';
                    else meterFill.style.backgroundColor = '#22c55e';
                }

                if (Date.now() - recordingStartTime < MIN_RECORDING_MS) return;

                if (rms < SILENCE_THRESHOLD) {
                    if (silenceStartTime === null) {
                        silenceStartTime = Date.now();
                    } else if (Date.now() - silenceStartTime > SILENCE_DURATION_MS) {
                        scriptProcessor.disconnect();
                        if (activeRecordingSection) toggleRecording(activeRecordingSection);
                    }
                } else {
                    silenceStartTime = null;
                }
            };

            recordingStates[sectionKey] = true;
            activeRecordingSection = sectionKey;
            showFloatingStopButton();
            document.getElementById('volume-meter-fill').style.height = '0%';

            btn.classList.add('mic-recording');
            text.innerText = "توقف ضبط";
            icon.innerHTML = `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>`;
        } catch (err) {
            console.error("Mic access denied:", err);
            alert("خطا: اجازه دسترسی به میکروفون داده نشده است.");
            activeRecordingSection = null;
            hideFloatingStopButton();
        }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        if (audioContext) {
            audioContext.close().catch(console.error);
            audioContext = null;
            analyserNode = null;
        }
        silenceDetectionActive = false;
        recordingStates[sectionKey] = false;
        activeRecordingSection = null;
        hideFloatingStopButton();

        btn.classList.remove('mic-recording');
        btn.classList.add('bg-blue-100', 'text-blue-600');
        text.innerText = "در حال تحلیل...";
        icon.innerHTML = `<svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
    }
}

// Modified sendAudioToServer to handle format info
async function sendAudioToServer(sectionKey, blob, audioFormat) {
    // Hold onto the recording so any failure can be retried without re-recording.
    if (blob) {
        lastAudioBySection[sectionKey] = blob;
        lastAudioBySection[`${sectionKey}_format`] = audioFormat;
    }
    
    const audioBlob = blob || lastAudioBySection[sectionKey];
    if (!audioBlob) {
        alert("صدای ضبط‌شده‌ای برای ارسال یافت نشد. لطفا دوباره ضبط کنید.");
        return;
    }

    const savedFormat = lastAudioBySection[`${sectionKey}_format`] || audioFormat || { label: 'webm', bitrate: 32000 };
    
    const formData = new FormData();
    // Use appropriate file extension based on format
    const fileExtension = savedFormat.label === 'm4a' ? 'm4a' : savedFormat.label;
    formData.append("audio", audioBlob, `voice.${fileExtension}`);
    formData.append("section_key", sectionKey);
    formData.append("audio_format", savedFormat.label);  // Send format info to server
    formData.append("bitrate", savedFormat.bitrate || '');  // Send bitrate for logging
    
    if (currentSubmissionId) formData.append("submission_id", currentSubmissionId);

    // Log the actual file size for debugging
    console.log(`Uploading ${savedFormat.label} (${savedFormat.bitrate ? savedFormat.bitrate/1000 + 'kbps' : 'uncompressed'}): ${(audioBlob.size/1024).toFixed(2)} KB`);

    try {
        const response = await fetch("/process-voice", { method: "POST", body: formData });
        const result = await response.json();

        if (result.error) {
            console.error("Server returned error:", result.error);
            offerAudioRetry(sectionKey, `خطا در پردازش صدا: ${result.error}`);
            return;
        }

        if (result.data) {
            // Update session context — map plain grouped v_codes to __0
            Object.entries(result.data).forEach(([vcode, val]) => {
                if (val !== null && val !== undefined) {
                    let ctxKey = vcode;
                    if (!/_\d+$/.test(vcode)) {
                        // Check if this plain vcode belongs to a group
                        for (const [gp, qs] of Object.entries(groupedQuestionsMap)) {
                            if (qs.some(q => q.v_code === vcode)) {
                                ctxKey = vcode + '_0';
                                break;
                            }
                        }
                    }
                    sessionContext[ctxKey] = String(val);
                }
            });

            // Track AI confidence per field for the final submit
            if (result.confidence) {
                Object.entries(result.confidence).forEach(([vcode, conf]) => {
                    if (conf !== null && conf !== undefined) {
                        let ctxKey = vcode;
                        if (!/_\d+$/.test(vcode)) {
                            for (const [gp, qs] of Object.entries(groupedQuestionsMap)) {
                                if (qs.some(q => q.v_code === vcode)) {
                                    ctxKey = vcode + '_0';
                                    break;
                                }
                            }
                        }
                        sessionConfidence[ctxKey] = conf;
                    }
                });
            }

            // Track why each field's confidence is below 1
            if (result.confidence_reasons) {
                Object.entries(result.confidence_reasons).forEach(([vcode, reason]) => {
                    if (reason) {
                        let ctxKey = vcode;
                        if (!/_\d+$/.test(vcode)) {
                            for (const [gp, qs] of Object.entries(groupedQuestionsMap)) {
                                if (qs.some(q => q.v_code === vcode)) {
                                    ctxKey = vcode + '_0';
                                    break;
                                }
                            }
                        }
                        sessionConfidenceReasons[ctxKey] = String(reason);
                    }
                });
            }

            applyAiResults(result.data);

            updateQuestionVisibility();
            markSectionAnswered(sectionKey);
            updateProgressPanel();
            
            // Clear stored audio on success
            delete lastAudioBySection[sectionKey];
            delete lastAudioBySection[`${sectionKey}_format`];

            // Anomaly check (non‑blocking)
            try {
                const anomalyResp = await fetch("/check-section-anomalies", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        section_key: sectionKey,
                        answers: sessionContext,
                        confidence_reasons: result.confidence_reasons || {},
                        submission_id: currentSubmissionId
                    })
                });
                const anomalyData = await anomalyResp.json();
                if (!anomalyData.error && anomalyData.warnings && anomalyData.warnings.length > 0) {
                    anomalyData.warnings.forEach(w => {
                        if (!fieldWarnings[w.v_code]) {
                            fieldWarnings[w.v_code] = [];
                        }
                        fieldWarnings[w.v_code].push({
                            message: w.message,
                            severity: w.severity || 'warning'
                        });
                    });
                    applyFieldWarnings();
                    updateSectionBadges();
                    updateWarningPanel();
                }
            } catch (anomalyErr) {
                console.error("Section anomaly check failed:", anomalyErr);
            }
        }
    } catch (err) {
        console.error("Fetch error:", err);
        offerAudioRetry(sectionKey, "ارتباط با سرور با مشکل مواجه شد.");
    } finally {
        resetButtonUI(sectionKey);
    }
}

// On a failed send the recording is still in memory; let the user retry it with
// one click instead of re-recording the whole section.
let pendingRetrySection = null;

function offerAudioRetry(sectionKey, message) {
    console.error('[sendAudioToServer]', message);
    if (!lastAudioBySection[sectionKey]) {
        showToast('ارسال صدای ضبط‌شده ناموفق بود. لطفاً دوباره ضبط کنید.');
        return;
    }
    pendingRetrySection = sectionKey;
    document.getElementById('audio-retry-message').textContent =
        'ارسال صدای ضبط‌شده با مشکل مواجه شد. صدای شما حفظ شده و می‌توانید دوباره تلاش کنید.';
    document.getElementById('audio-retry-modal').classList.add('open');
}

function retryAudioSend() {
    const sectionKey = pendingRetrySection;
    closeAudioRetryModal();
    if (!sectionKey) return;
    // Re-show the analyzing state, then resend the held blob.
    const text = document.getElementById(`text-${sectionKey}`);
    if (text) text.innerText = "در حال تحلیل...";
    sendAudioToServer(sectionKey, null);
}

function closeAudioRetryModal() {
    document.getElementById('audio-retry-modal').classList.remove('open');
    pendingRetrySection = null;
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAudioRetryModal();
});

// Non-blocking error notice (auto-dismisses after 5 seconds).
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>`;
    const span = document.createElement('span');
    span.textContent = message;
    toast.appendChild(span);
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// ---------- Warning UI functions ----------
function applyFieldWarnings() {
    // Remove old warning styles from all inputs and their parent labels
    document.querySelectorAll('.field-warning, .field-critical').forEach(el => {
        el.classList.remove('field-warning', 'field-critical');
    });

    Object.entries(fieldWarnings).forEach(([vcode, warnings]) => {
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

function updateSectionBadges() {
    document.querySelectorAll('section[id^="sect-"]').forEach(sectionEl => {
        const sectionKey = sectionEl.id.replace('sect-', '');
        let count = 0;

        // Get all unique v_codes in this section that have warnings
        const warnedVcodes = new Set();
        sectionEl.querySelectorAll('[data-vcode]').forEach(input => {
            const vcode = input.dataset.vcode;
            if (vcode !== 'general' && fieldWarnings[vcode] && fieldWarnings[vcode].length > 0) {
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

function updateWarningPanel() {
    const totalWarnings = Object.values(fieldWarnings).reduce((sum, arr) => sum + arr.length, 0);
    const toggleBtn = document.getElementById('warning-toggle-btn');
    const countSpan = document.getElementById('warning-count');
    const listEl = document.getElementById('warning-list');

    if (totalWarnings > 0) {
        toggleBtn.style.display = 'flex';
        countSpan.textContent = totalWarnings;
        // Build warning list
        listEl.innerHTML = '';
        Object.entries(fieldWarnings).forEach(([vcode, warnings]) => {
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

function toggleWarningPanel() {
    const list = document.getElementById('warning-list');
    list.classList.toggle('active');
}

// ---------- Apply AI results (unchanged) ----------
function applyAiResults(data) {
    // Handle grouped (indexed) answers
    applyGroupedAiResults(data);

    Object.keys(data).forEach(vCode => {
        // Skip grouped v_codes (already handled above)
        if (/_\d+$/.test(vCode)) return;
        const val = data[vCode];
        if (val === null || val === undefined) return;

        // "N/A" = the AI judged this question not applicable (e.g. never
        // smoked → quit age). Tag the inputs instead of filling a value.
        if (val === 'N/A') {
            document.querySelectorAll(`[data-vcode="${vCode}"]`).forEach(input => {
                input.dataset.na = '1';
                if (input.type !== 'radio' && input.type !== 'checkbox') {
                    if (input.dataset.origPlaceholder === undefined) {
                        input.dataset.origPlaceholder = input.placeholder || '';
                    }
                    input.value = '';
                    input.placeholder = 'غیرمرتبط';
                }
                input.classList.add('ai-updated');
            });
            return;
        }

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

function resetButtonUI(sectionKey) {
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

// ---------- Manual Input Listener (clears field warnings on change) ----------
document.addEventListener('change', function(event) {
    const input = event.target;
    if (!input.dataset.vcode) return;

    // Collect grouped answers first
    collectGroupedAnswers();

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

    sessionContext[vcode] = value;
    // A manual answer overrides any AI "not applicable" marking.
    delete input.dataset.na;
    // Remove warnings for this field when user manually edits
    delete fieldWarnings[vcode];
    applyFieldWarnings();
    updateSectionBadges();
    updateWarningPanel();

    updateQuestionVisibility();
    updateProgressPanel();
});

// Sanity check runs at most once per submission session. If warnings are found
// they're shown and the user can edit + submit again — the second click saves
// directly without re-running the check (no confirm/alert loop).
let finalSanityDone = false;

async function submitFinalForm() {
    if (!currentSubmissionId) {
        alert('هنوز نشست پرسشنامه شروع نشده است. لطفاً صفحه را مجدداً بارگذاری کنید.');
        return;
    }

    const submitBtn = document.getElementById('panel-submit-btn');
    const originalLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = finalSanityDone ? 'در حال ذخیره...' : 'در حال بررسی...';
    }

    try {
        // Final whole-form cross-section sanity pass — only the first click.
        if (!finalSanityDone) {
            const finalResp = await fetch('/check-final-anomalies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    submission_id: currentSubmissionId,
                    answers: sessionContext,
                    confidence_reasons: sessionConfidenceReasons,
                })
            });
            const finalData = await finalResp.json();
            const warnings = (!finalData.error && finalData.warnings) ? finalData.warnings : [];
            warnings.forEach(w => {
                if (!fieldWarnings[w.v_code]) fieldWarnings[w.v_code] = [];
                fieldWarnings[w.v_code].push({
                    message: w.message,
                    severity: w.severity || 'warning'
                });
            });
            finalSanityDone = true;

            if (warnings.length > 0) {
                applyFieldWarnings();
                updateSectionBadges();
                updateWarningPanel();
                const list = document.getElementById('warning-list');
                if (list) list.classList.add('active');
                // Scroll to the first flagged field so the user sees it.
                const first = warnings.find(w => w.v_code && w.v_code !== 'general');
                const el = first ? document.querySelector(`[data-vcode="${first.v_code}"]`) : null;
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                showToast(`${warnings.length} هشدار یافت شد — فیلدهای مشخص‌شده را در صورت نیاز اصلاح کنید و دوباره ثبت کنید.`);
                return; // don't save yet; next click saves without re-checking
            }
        }

        // Collect grouped answers before submit
        collectGroupedAnswers();

        // Build answer payload — group indexed keys under their base v_code
        const answersPayload = {};
        Object.entries(sessionContext).forEach(([key, val]) => {
            const match = key.match(/^(.+?)_(\d+)$/);
            if (match) {
                // Grouped: send as { base_vcode: [val0, val1, ...], group_pairs: { base_vcode: group_pair } }
                // Actually, keep indexed keys so backend knows the group structure
                answersPayload[key] = val;
            } else {
                answersPayload[key] = val;
            }
        });

        const res = await fetch('/complete-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                submission_id: currentSubmissionId,
                answers: answersPayload,
                confidence: sessionConfidence,
            })
        });
        const data = await res.json();
        if (data.error) {
            alert(`خطا در ثبت نهایی: ${data.error}`);
            return;
        }
        let msg = `اطلاعات با موفقیت ثبت شد. (${data.saved} پاسخ ذخیره شد)`;
        if (data.health_check && data.health_check.check_id) {
            msg += data.health_check.existing ? "\nچکاپ شما قبلاً ایجاد شده است." : "\n✓ چکاپ سلامت شما ایجاد شد — در داشبورد قابل مشاهده است.";
        }
        // No blocking alert — hand the message to the dashboard, which shows it
        // as a toast in the bottom-right corner after the redirect.
        try { sessionStorage.setItem('vcr_flash', msg); } catch (e) { /* ignore */ }
        if (data.health_check && data.health_check.check_id && !data.health_check.existing) {
            window.location.href = `/health-check/${data.health_check.check_id}`;
            return;
        }
        // Submission complete & responses saved in DB — return to the dashboard
        // (the health-check branch above keeps its own redirect target)
        currentSubmissionId = null;
        finalSanityDone = false;
        window.location.href = '/dashboard';
    } catch (err) {
        console.error('complete-submission failed:', err);
        alert('ارتباط با سرور با مشکل مواجه شد.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalLabel;
        }
    }
}
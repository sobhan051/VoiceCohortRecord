// app.js – Full client‑side logic with non‑blocking anomaly warnings

let mediaRecorder;
let audioChunks = [];
let recordingStates = {};
let activeRecordingSection = null;
let audioContext = null;
let analyserNode = null;
let silenceDetectionActive = false;

const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 4000;
const MIN_RECORDING_MS = 3000;
let silenceStartTime = null;
let recordingStartTime = null;

let sessionContext = {};           // { v_code: value }
let sectionMetaMap = {};          // { section_key: { depends_on_vcode, depends_on_value } }
let aiSkipSections = new Set();   // section keys hidden by AI
let fieldWarnings = {};           // { v_code: [ { message, severity } ] }

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/get-form-structure');
        const sections = await res.json();
        renderForm(sections);
        updateQuestionVisibility();
    } catch (err) {
        console.error("Failed to load form structure:", err);
        document.getElementById('form-container').innerHTML =
            `<div class="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200">خطا در دریافت اطلاعات از سرور. لطفا اتصال دیتابیس را بررسی کنید.</div>`;
    }
});

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

// ---------- Section‑Level Visibility (DB rules + AI skips) ----------
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

        if (sectionShouldShow && aiSkipSections.has(sectionKey)) {
            sectionShouldShow = false;
        }

        sectionEl.style.display = sectionShouldShow ? '' : 'none';
        sectionEl.style.opacity = sectionShouldShow ? '1' : '0';
    });
}

// ---------- Rendering ----------
function renderForm(sections) {
    const container = document.getElementById('form-container');
    container.innerHTML = '';

    sections.forEach(section => {
        sectionMetaMap[section.section_key] = {
            depends_on_vcode: section.depends_on_vcode || null,
            depends_on_value: section.depends_on_value || null
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

function renderQuestion(q) {
    if (q.response_type === 'MultiSelect') {
        let options = q.coding_options;
        if (typeof options === 'string') {
            try { options = JSON.parse(options); } catch (e) { options = {}; }
        }
        return `
            <div class="md:col-span-2 space-y-3">
                <label class="block text-gray-700 font-bold">${q.question_text_fa}</label>
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
                <label class="block text-gray-700 font-bold">${q.question_text_fa}</label>
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
            <label class="text-gray-600 text-sm font-medium">${q.question_text_fa}</label>
            <div class="relative">
                <input type="text" data-vcode="${q.v_code}"
                       class="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                       placeholder="${q.unit ? 'واحد: ' + q.unit : '---'}">
            </div>
        </div>
    `;
}

// ---------- Recording Logic (auto‑stop + volume meter) unchanged ----------
async function toggleRecording(sectionKey) {
    const btn = document.getElementById(`btn-${sectionKey}`);
    const icon = document.getElementById(`icon-${sectionKey}`);
    const text = document.getElementById(`text-${sectionKey}`);

    if (!recordingStates[sectionKey]) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                sendAudioToServer(sectionKey, audioBlob);
            };

            mediaRecorder.start();
            recordingStartTime = Date.now();
            silenceStartTime = null;
            silenceDetectionActive = true;

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

                console.log('RMS:', rms.toFixed(4));
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

// ---------- Server Communication with non‑blocking anomaly check ----------
async function sendAudioToServer(sectionKey, blob) {
    const formData = new FormData();
    formData.append("audio", blob, "voice.wav");
    formData.append("section_key", sectionKey);

    try {
        const response = await fetch("/process-voice", { method: "POST", body: formData });
        const result = await response.json();

        if (result.error) {
            console.error("Server returned error:", result.error);
            alert(`خطا در پردازش صدا: ${result.error}`);
            return;
        }

        if (result.data) {
            // Update session context
            Object.entries(result.data).forEach(([vcode, val]) => {
                if (val !== null && val !== undefined) {
                    sessionContext[vcode] = String(val);
                }
            });

            applyAiResults(result.data);

            // Handle AI skips
            if (result.skip_sections && Array.isArray(result.skip_sections)) {
                aiSkipSections.clear();
                result.skip_sections.forEach(key => aiSkipSections.add(key));
            }

            updateQuestionVisibility();

            // --- Anomaly check (non‑blocking) ---
            try {
                const anomalyResp = await fetch("/check-section-anomalies", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        section_key: sectionKey,
                        answers: sessionContext,
                        confidence_reasons: result.confidence_reasons || {}  
                    })
                });
                const anomalyData = await anomalyResp.json();
                if (!anomalyData.error && anomalyData.warnings && anomalyData.warnings.length > 0) {
                    // Store warnings per field and update UI
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
        alert("ارتباط با سرور با مشکل مواجه شد.");
    } finally {
        resetButtonUI(sectionKey);
    }
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

// ---------- Manual Input Listener (clears AI skips & field warnings on change) ----------
document.addEventListener('change', function(event) {
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

    sessionContext[vcode] = value;
    // Remove warnings for this field when user manually edits
    delete fieldWarnings[vcode];
    applyFieldWarnings();
    updateSectionBadges();
    updateWarningPanel();

    aiSkipSections.clear();   // manual input invalidates AI skips
    updateQuestionVisibility();
});

function submitFinalForm() {
    alert("اطلاعات با موفقیت در پایگاه داده مرکزی ذخیره شد.");
}
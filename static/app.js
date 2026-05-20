/**
 * VCR Project – Voice Cohort Form
 * Full client‑side logic with:
 *   - Conditional question/section visibility
 *   - Auto‑stop on silence with live volume meter
 *   - Floating stop button
 *   - Multi‑select checkboxes
 *   - Session context for dynamic form
 */

let mediaRecorder;
let audioChunks = [];
let recordingStates = {};            // true/false per section
let activeRecordingSection = null;   // which section is currently recording
let audioContext = null;
let analyserNode = null;
let silenceDetectionActive = false;

const SILENCE_THRESHOLD = 0.01;     // adjust after testing
const SILENCE_DURATION_MS = 4000;   // stop after 4 seconds of silence
const MIN_RECORDING_MS = 3000;      // don’t auto‑stop before 3 seconds
let silenceStartTime = null;
let recordingStartTime = null;

// Session context: collected answers  { v_code: "value" }
let sessionContext = {};

let sectionMetaMap = {};    // { section_key: { depends_on_vcode, depends_on_value } }

// ------------------- Initial Load ----------------------
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/get-form-structure');
        const sections = await res.json();
        renderForm(sections);
        updateQuestionVisibility();    // apply initial visibility
    } catch (err) {
        console.error("Failed to load form structure:", err);
        document.getElementById('form-container').innerHTML =
            `<div class="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200">خطا در دریافت اطلاعات از سرور. لطفا اتصال دیتابیس را بررسی کنید.</div>`;
    }
});

// ------------------- Floating Stop Button --------------
function showFloatingStopButton() {
    const btn = document.getElementById('floating-stop-btn');
    const meter = document.getElementById('volume-meter-container');
    if (btn) { btn.classList.remove('hidden'); btn.classList.add('flex'); }
    if (meter) { meter.classList.remove('hidden'); meter.classList.add('flex'); }
}

function hideFloatingStopButton() {
    const btn = document.getElementById('floating-stop-btn');
    const meter = document.getElementById('volume-meter-container');
    if (btn) { btn.classList.add('hidden'); btn.classList.remove('flex'); }
    if (meter) { meter.classList.add('hidden'); meter.classList.remove('flex'); }
}

function stopRecordingViaFab() {
    if (activeRecordingSection) {
        toggleRecording(activeRecordingSection);   // will stop because recordingStates is true
    }
}

// ------------------- Visibility Logic ------------------
function getQuestionMeta(vcode) {
    return questionMetaMap[vcode] || null;
}

function updateQuestionVisibility() {
    // Section‑level visibility only
    document.querySelectorAll('section[id^="sect-"]').forEach(sectionEl => {
        const sectionKey = sectionEl.id.replace('sect-', '');
        const meta = sectionMetaMap[sectionKey];
        let sectionShouldShow = true;

        if (meta && meta.depends_on_vcode) {
            const parentValue = sessionContext[meta.depends_on_vcode];
            // Hide if parent unanswered or mismatched
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
// ------------------- Rendering --------------------------
function renderForm(sections) {
    const container = document.getElementById('form-container');
    container.innerHTML = '';

    sections.forEach(section => {
        // Store section metadata for visibility
        sectionMetaMap[section.section_key] = {
            depends_on_vcode: section.depends_on_vcode || null,
            depends_on_value: section.depends_on_value || null
        };

        const sectHtml = `
            <section class="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100"
                     id="sect-${section.section_key}">
                <div class="flex justify-between items-center mb-6 pb-4 border-b border-gray-50">
                    <h2 class="text-xl font-bold text-gray-800">${section.name_fa}</h2>
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
    // Multi‑select (checkboxes)
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

    // Categorical / Dichotomous (radio buttons)
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

    // Default: Text / Numeric / Date / etc.
    return `
        <div class="flex flex-col gap-2">
            <label class="text-gray-600 text-sm font-medium">${q.question_text_fa}</label>
            <div class="relative">
                <input type="text" data-vcode="${q.v_code}"
                       class="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                       placeholder="${q.unit ? 'واحد: ' + q.unit : '---'}">
            </div>
        </div>
    `;
}

// ------------------- Recording Logic (with auto‑stop) ----
async function toggleRecording(sectionKey) {
    const btn = document.getElementById(`btn-${sectionKey}`);
    const icon = document.getElementById(`icon-${sectionKey}`);
    const text = document.getElementById(`text-${sectionKey}`);

    if (!recordingStates[sectionKey]) {
        // === START RECORDING ===
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

            // Set up audio analysis for volume meter + silence detection
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
                for (let i = 0; i < input.length; i++) {
                    sum += input[i] * input[i];
                }
                const rms = Math.sqrt(sum / input.length);

                // Update volume meter
                const meterFill = document.getElementById('volume-meter-fill');
                if (meterFill) {
                    const displayPercent = Math.min((rms / 0.2) * 100, 100);
                    meterFill.style.height = displayPercent + '%';
                    if (rms < 0.005) meterFill.style.backgroundColor = '#ef4444';      // red
                    else if (rms > 0.25) meterFill.style.backgroundColor = '#f97316'; // orange
                    else if (rms > 0.15) meterFill.style.backgroundColor = '#eab308'; // yellow
                    else meterFill.style.backgroundColor = '#22c55e';                 // green
                }

                console.log('RMS:', rms.toFixed(4));

                // Auto‑stop on silence
                if (Date.now() - recordingStartTime < MIN_RECORDING_MS) return;
                if (rms < SILENCE_THRESHOLD) {
                    if (silenceStartTime === null) {
                        silenceStartTime = Date.now();
                    } else if (Date.now() - silenceStartTime > SILENCE_DURATION_MS) {
                        scriptProcessor.disconnect();
                        if (activeRecordingSection) {
                            toggleRecording(activeRecordingSection);
                        }
                    }
                } else {
                    silenceStartTime = null;
                }
            };

            recordingStates[sectionKey] = true;
            activeRecordingSection = sectionKey;
            showFloatingStopButton();
            document.getElementById('volume-meter-fill').style.height = '0%';

            // UI: recording state
            btn.classList.add('mic-recording');
            text.innerText = "توقف ضبط";
            icon.innerHTML = `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>`;
        } catch (err) {
            console.error("Mic access denied:", err);
            alert("خطا: اجازه دسترسی به میکروفون داده نشده است.");
            // Clean up in case of error
            activeRecordingSection = null;
            hideFloatingStopButton();
        }
    } else {
        // === STOP RECORDING ===
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());

        // Clean up audio analysis
        if (audioContext) {
            audioContext.close().catch(console.error);
            audioContext = null;
            analyserNode = null;
        }
        silenceDetectionActive = false;
        recordingStates[sectionKey] = false;
        activeRecordingSection = null;
        hideFloatingStopButton();

        // UI: processing state
        btn.classList.remove('mic-recording');
        btn.classList.add('bg-blue-100', 'text-blue-600');
        text.innerText = "در حال تحلیل...";
        icon.innerHTML = `<svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
    }
}

// ------------------- Server Communication --------------
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
            // Update session context from AI extraction
            Object.entries(result.data).forEach(([vcode, val]) => {
                if (val !== null && val !== undefined) {
                    sessionContext[vcode] = String(val);
                }
            });
            applyAiResults(result.data);
            updateQuestionVisibility();
            console.log("AI Extracted:", result);
        }
    } catch (err) {
        console.error("Fetch error:", err);
        alert("ارتباط با سرور با مشکل مواجه شد.");
    } finally {
        resetButtonUI(sectionKey);
    }
}

// ------------------- Apply AI Results -------------------
function applyAiResults(data) {
    Object.keys(data).forEach(vCode => {
        const val = data[vCode];
        if (val === null || val === undefined) return;

        // Multi‑select (comma‑separated)
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
            // Radio or text
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

// ------------------- Manual Input Handling --------------
document.addEventListener('change', function(event) {
    const input = event.target;
    if (!input.dataset.vcode) return;

    const vcode = input.dataset.vcode;
    let value;

    if (input.type === 'checkbox') {
        // Build comma‑separated list from all checked boxes with the same vcode
        const checkboxes = document.querySelectorAll(`input[type="checkbox"][data-vcode="${vcode}"]:checked`);
        value = Array.from(checkboxes).map(cb => cb.value).join(',');
    } else if (input.type === 'radio') {
        if (input.checked) {
            value = input.value;
        } else {
            return;   // ignore uncheck (only fires on newly checked radio)
        }
    } else {
        value = input.value;
    }

    sessionContext[vcode] = value;
    updateQuestionVisibility();
});

// Placeholder submit
function submitFinalForm() {
    alert("اطلاعات با موفقیت در پایگاه داده مرکزی ذخیره شد.");
}
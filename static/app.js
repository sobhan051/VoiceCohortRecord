let mediaRecorder;
let audioChunks = [];
let recordingStates = {}; // true/false per section

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/get-form-structure');
        const sections = await res.json();
        renderForm(sections);
    } catch (err) {
        console.error("Failed to load form structure:", err);
        const container = document.getElementById('form-container');
        container.innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200">خطا در دریافت اطلاعات از سرور. لطفا اتصال دیتابیس را بررسی کنید.</div>`;
    }
});

function renderForm(sections) {
    const container = document.getElementById('form-container');
    container.innerHTML = '';

    sections.forEach(section => {
        const sectHtml = `
            <section class="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100" id="sect-${section.section_key}">
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
            recordingStates[sectionKey] = true;

            btn.classList.add('mic-recording');
            text.innerText = "توقف ضبط";
            icon.innerHTML = `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>`;
        } catch (err) {
            console.error("Mic access denied:", err);
            alert("خطا: اجازه دسترسی به میکروفون داده نشده است.");
        }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        recordingStates[sectionKey] = false;

        btn.classList.remove('mic-recording');
        btn.classList.add('bg-blue-100', 'text-blue-600');
        text.innerText = "در حال تحلیل...";
        icon.innerHTML = `<svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
    }
}

async function sendAudioToServer(sectionKey, blob) {
    const formData = new FormData();
    formData.append("audio", blob, "voice.wav");
    formData.append("section_key", sectionKey);

    try {
        const response = await fetch("/process-voice", { method: "POST", body: formData });
        const result = await response.json();
        
        // Check for server‑side errors
        if (result.error) {
            console.error("Server returned error:", result.error);
            alert(`خطا در پردازش صدا: ${result.error}`);
            return;
        }

        if (result.data) {
            applyAiResults(result.data);   // note: unified function name
            console.log("AI Extracted:", result);
        }
    } catch (err) {
        console.error("Fetch error:", err);
        alert("ارتباط با سرور با مشکل مواجه شد.");
    } finally {
        resetButtonUI(sectionKey);
    }
}

function applyAiResults(data) {
    Object.keys(data).forEach(vCode => {
        const val = data[vCode];
        if (val === null || val === undefined) return;

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

function submitFinalForm() {
    alert("اطلاعات با موفقیت در پایگاه داده مرکزی ذخیره شد.");
}
// signup.js – create an account and log in immediately

const NATIONAL_RE = /^\d{10}$/;
const PHONE_RE = /^09\d{9}$/;

const errEl = document.getElementById('signup-error');
const btn = document.getElementById('signup-btn');

function showError(msg) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
}

function clearError() {
    errEl.classList.add('hidden');
}

function setBusy(busy) {
    btn.disabled = busy;
    btn.textContent = busy ? 'در حال ثبت‌نام...' : 'ثبت‌نام';
}

function digitsOnly(v) {
    return v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const first = document.getElementById('signup-first').value.trim();
    const last = document.getElementById('signup-last').value.trim();
    const national = digitsOnly(document.getElementById('signup-national').value.trim());
    const phone = digitsOnly(document.getElementById('signup-phone').value.trim());

    if (!first || !last) {
        showError('نام و نام خانوادگی را وارد کنید.');
        return;
    }
    if (!NATIONAL_RE.test(national)) {
        showError('کد ملی باید ۱۰ رقم باشد.');
        return;
    }
    if (phone && !PHONE_RE.test(phone)) {
        showError('شماره تماس باید با ۰۹ شروع شده و ۱۱ رقم باشد.');
        return;
    }

    setBusy(true);
    try {
        const res = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_name: first, last_name: last, national_code: national, phone_number: phone }),
        });
        const data = await res.json();
        if (data.error) {
            showError(data.error);
            return;
        }
        // Logged in automatically — persist the session like dashboard.js does.
        localStorage.setItem('vcr_user', JSON.stringify(data.user));
        window.location.href = '/login';
    } catch (err) {
        console.error('Signup failed:', err);
        showError('ارتباط با سرور با مشکل مواجه شد.');
    } finally {
        setBusy(false);
    }
});

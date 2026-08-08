// dashboard.js – Login, user dashboard, and admin dashboard with full CRUD

let currentUser = null;
let adminSection = 'dashboard';

// ---------- Login ----------
function showLoginError(msg) {
    const errEl = document.getElementById('login-error');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
}

function clearLoginError() {
    const errEl = document.getElementById('login-error');
    if (errEl) errEl.classList.add('hidden');
}

function showLoginPage() {
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('dashboard-app').classList.add('hidden');
}

function enterDashboard(user) {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('dashboard-app').classList.remove('hidden');

    if (user.role === 2) {
        document.getElementById('admin-dashboard').classList.remove('hidden');
        document.getElementById('admin-user-info').textContent =
            `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.national_code;
        showAdminSection('dashboard');
    } else {
        document.getElementById('user-dashboard').classList.remove('hidden');
        document.getElementById('user-info').textContent =
            `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.national_code;
        loadUserDashboard();
    }
}

async function handleLogin() {
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    const national = document.getElementById('login-national').value.trim();

    if (!national) {
        showLoginError('کد ملی الزامی است.');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'در حال ورود...';
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ national_code: national }),
        });
        const data = await res.json();

        if (data.error) {
            showLoginError(data.error);
            return;
        }

        currentUser = data.user;
        // Persist session in localStorage so it survives page reload / server restart
        localStorage.setItem('vcr_user', JSON.stringify(currentUser));
        enterDashboard(currentUser);
    } catch (err) {
        console.error('Login failed:', err);
        showLoginError('ارتباط با سرور با مشکل مواجه شد.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'ورود';
    }
}

function handleLogout() {
    currentUser = null;
    // Clear persisted session
    localStorage.removeItem('vcr_user');
    document.getElementById('dashboard-app').classList.add('hidden');
    document.getElementById('user-dashboard').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
    showLoginPage();
    document.getElementById('login-national').value = '';
    clearLoginError();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleLogin();
    });

    // Auto-restore session from localStorage
    tryRestoreSession();
});


// ---------- Session Persistence (localStorage) ----------

async function tryRestoreSession() {
    const saved = localStorage.getItem('vcr_user');
    if (!saved) return;

    let userData;
    try {
        userData = JSON.parse(saved);
    } catch {
        localStorage.removeItem('vcr_user');
        return;
    }

    // Verify the session is still valid (user still exists in DB)
    try {
        const res = await fetch(`/api/dashboard?user_id=${userData.user_id}`);
        const data = await res.json();
        if (data.error || !data.user) {
            localStorage.removeItem('vcr_user');
            return;
        }

        // Session is valid — restore and update localStorage with fresh data
        currentUser = data.user;
        localStorage.setItem('vcr_user', JSON.stringify(currentUser));
        enterDashboard(currentUser);
    } catch (err) {
        // Network error (server restart, temporary outage) — keep the saved session
        // so it works on next page refresh when the server is back up.
        console.warn('Failed to verify session (server may be restarting):', err);
    }
}

// ---------- User Dashboard ----------
async function loadUserDashboard() {
    const container = document.getElementById('user-content');
    container.innerHTML = '<div class="text-center py-20"><div class="animate-spin h-10 w-10 mx-auto mb-4 border-4 border-blue-500 border-t-transparent rounded-full"></div><p class="text-gray-500">در حال بارگذاری...</p></div>';

    try {
        const res = await fetch(`/api/dashboard?user_id=${currentUser.user_id}`);
        const data = await res.json();
        if (data.error) { container.innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-xl">${data.error}</div>`; return; }

        const stats = data.stats;
        const submissions = data.submissions || [];
        const openForms = data.open_forms || [];

        let html = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold text-gray-800">داشبورد کاربری</h2>
                <p class="text-gray-500 mt-2">خلاصه فعالیت‌های شما</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="stat-card bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div><p class="text-gray-500 text-sm">کل پرسشنامه‌ها</p><p class="text-3xl font-bold text-gray-800 mt-2">${stats.total_submissions}</p></div>
                        <div class="bg-blue-100 p-3 rounded-full"><span class="text-2xl">📋</span></div>
                    </div>
                </div>
                <div class="stat-card bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div><p class="text-gray-500 text-sm">تکمیل شده</p><p class="text-3xl font-bold text-green-600 mt-2">${stats.completed_submissions}</p></div>
                        <div class="bg-green-100 p-3 rounded-full"><span class="text-2xl">✅</span></div>
                    </div>
                </div>
                <div class="stat-card bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div><p class="text-gray-500 text-sm">پیش‌نویس</p><p class="text-3xl font-bold text-yellow-600 mt-2">${stats.draft_submissions}</p></div>
                        <div class="bg-yellow-100 p-3 rounded-full"><span class="text-2xl">✏️</span></div>
                    </div>
                </div>
            </div>`;

        if (openForms.length > 0) {
            html += `
                <div class="mb-8">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">فرم‌های قابل تکمیل</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${openForms.map(f => `
                            <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition">
                                <h4 class="font-bold text-gray-800 mb-2">${f.form_name}</h4>
                                ${f.category ? `<p class="text-sm text-gray-500 mb-4">دسته: ${f.category}</p>` : ''}
                                <a href="/form" class="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm transition">شروع پرسشنامه</a>
                            </div>`).join('')}
                    </div>
                </div>`;
        }

        if (submissions.length > 0) {
            html += `
                <div class="mb-8">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">پرسشنامه‌های شما</h3>
                    <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead class="bg-gray-50 border-b">
                                    <tr>
                                        <th class="text-right p-4 text-sm font-bold text-gray-600">فرم</th>
                                        <th class="text-right p-4 text-sm font-bold text-gray-600">وضعیت</th>
                                        <th class="text-right p-4 text-sm font-bold text-gray-600">تاریخ</th>
                                        <th class="text-right p-4 text-sm font-bold text-gray-600">تعداد پاسخ</th>
                                        <th class="text-right p-4 text-sm font-bold text-gray-600">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${submissions.map(sub => `
                                        <tr class="border-b hover:bg-gray-50 transition">
                                            <td class="p-4 text-sm">${sub.form_name}</td>
                                            <td class="p-4">
                                                <span class="px-2 py-1 rounded-full text-xs ${sub.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
                                                    ${sub.status === 'completed' ? 'تکمیل شده' : 'پیش‌نویس'}
                                                </span>
                                            </td>
                                            <td class="p-4 text-sm">${sub.updated_at ? new Date(sub.updated_at).toLocaleDateString('fa-IR') : '-'}</td>
                                            <td class="p-4 text-sm">${sub.response_count} از ${sub.total_questions || '?'}</td>
                                            <td class="p-4">
                                                ${sub.status === 'draft' ? `<a href="/form" class="text-blue-600 hover:text-blue-800 text-sm">ادامه</a>` : `<span class="text-gray-400 text-sm">✅ تکمیل شده</span>`}
                                            </td>
                                        </tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>`;
        } else {
            html += `
                <div class="bg-white rounded-2xl p-8 shadow-sm text-center">
                    <p class="text-gray-500 mb-4">هنوز هیچ پرسشنامه‌ای ثبت نکرده‌اید</p>
                    <a href="/form" class="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl transition">شروع پرسشنامه جدید</a>
                </div>`;
        }
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="bg-red-50 text-red-600 p-4 rounded-xl">خطا در بارگذاری اطلاعات</div>';
    }
}

// ---------- Admin Dashboard ----------
function showAdminSection(section) {
    adminSection = section;
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === section) item.classList.add('active');
    });
    const container = document.getElementById('admin-content');
    switch (section) {
        case 'dashboard': loadAdminDashboard(container); break;
        case 'submissions': loadAdminSubmissions(container); break;
        case 'users': loadAdminUsers(container); break;
        case 'forms': loadAdminForms(container); break;
        case 'api-logs': loadAdminApiLogs(container); break;
        case 'settings': loadAdminSettings(container); break;
    }
}

async function loadAdminDashboard(container) {
    container.innerHTML = '<div class="text-center py-20">در حال بارگذاری آمار...</div>';
    try {
        const res = await fetch('/api/admin/stats');
        const stats = await res.json();
        container.innerHTML = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold text-gray-800">داشبورد مدیریتی</h2>
                <p class="text-gray-500 mt-2">خلاصه وضعیت سیستم</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="stat-card bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div><p class="text-gray-500 text-sm">کل پرسشنامه‌ها</p><p class="text-3xl font-bold text-gray-800 mt-2">${stats.total_submissions}</p></div>
                        <div class="bg-blue-100 p-3 rounded-full"><span class="text-2xl">📋</span></div>
                    </div>
                </div>
                <div class="stat-card bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div><p class="text-gray-500 text-sm">تکمیل شده</p><p class="text-3xl font-bold text-green-600 mt-2">${stats.completed_submissions}</p></div>
                        <div class="bg-green-100 p-3 rounded-full"><span class="text-2xl">✅</span></div>
                    </div>
                </div>
                <div class="stat-card bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div><p class="text-gray-500 text-sm">کاربران</p><p class="text-3xl font-bold text-gray-800 mt-2">${stats.total_users}</p></div>
                        <div class="bg-purple-100 p-3 rounded-full"><span class="text-2xl">👥</span></div>
                    </div>
                </div>
                <div class="stat-card bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div><p class="text-gray-500 text-sm">درخواست‌های AI</p><p class="text-3xl font-bold text-gray-800 mt-2">${stats.total_api_calls}</p></div>
                        <div class="bg-orange-100 p-3 rounded-full"><span class="text-2xl">🤖</span></div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white rounded-2xl p-6 shadow-sm">
                    <h3 class="font-bold text-gray-800 mb-4">آمار تکمیل پرسشنامه</h3>
                    <div class="space-y-3">
                        <div>
                            <div class="flex justify-between text-sm mb-1"><span>تکمیل شده</span><span>${stats.completed_submissions}</span></div>
                            <div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-green-500 rounded-full h-2" style="width: ${stats.total_submissions > 0 ? (stats.completed_submissions / stats.total_submissions * 100) : 0}%"></div></div>
                        </div>
                        <div>
                            <div class="flex justify-between text-sm mb-1"><span>پیش‌نویس</span><span>${stats.draft_submissions}</span></div>
                            <div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-yellow-500 rounded-full h-2" style="width: ${stats.total_submissions > 0 ? (stats.draft_submissions / stats.total_submissions * 100) : 0}%"></div></div>
                        </div>
                    </div>
                </div>
                <div class="bg-white rounded-2xl p-6 shadow-sm">
                    <h3 class="font-bold text-gray-800 mb-4">اطلاعات سیستم</h3>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between py-2 border-b"><span class="text-gray-600">میانگین دقت AI:</span><span class="font-bold">${stats.avg_confidence}%</span></div>
                        <div class="flex justify-between py-2 border-b"><span class="text-gray-600">پرسشنامه‌های هفته اخیر:</span><span class="font-bold">${stats.recent_submissions}</span></div>
                    </div>
                </div>
            </div>`;
    } catch (e) { container.innerHTML = '<div class="bg-red-50 text-red-600 p-4 rounded-xl">خطا در بارگذاری اطلاعات</div>'; }
}

// ---------- Submissions Management ----------
async function loadAdminSubmissions(container) {
    container.innerHTML = '<div class="text-center py-20">در حال بارگذاری پرسشنامه‌ها...</div>';
    try {
        const res = await fetch('/api/admin/submissions?limit=100');
        const submissions = await res.json();
        let html = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold text-gray-800">مدیریت پرسشنامه‌ها</h2>
                <p class="text-gray-500 mt-2">مشاهده، ویرایش و حذف کلیه پاسخ‌های ثبت شده</p>
            </div>
            <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50 border-b">
                            <tr>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">کد ملی</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">نام کاربر</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">تاریخ</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">وضعیت</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">تعداد پاسخ</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">عملیات</th>
                            </tr>
                        </thead>
                        <tbody>`;

        if (submissions.length === 0) {
            html += `<tr><td colspan="6" class="text-center p-8 text-gray-500">هیچ پرسشنامه‌ای یافت نشد</td></tr>`;
        } else {
            submissions.forEach(sub => {
                html += `
                    <tr class="border-b hover:bg-gray-50 transition">
                        <td class="p-4 text-sm">${sub.national_code}</td>
                        <td class="p-4 text-sm">${sub.user_name || 'نامشخص'}</td>
                        <td class="p-4 text-sm">${new Date(sub.created_at).toLocaleDateString('fa-IR')}</td>
                        <td class="p-4">
                            <span class="px-2 py-1 rounded-full text-xs ${sub.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
                                ${sub.status === 'completed' ? 'تکمیل شده' : 'پیش‌نویس'}
                            </span>
                        </td>
                        <td class="p-4 text-sm">${sub.response_count}</td>
                        <td class="p-4 flex gap-2">
                            <button onclick="viewAdminSubmission('${sub.submission_id}')" class="text-blue-600 hover:text-blue-800 text-sm">جزئیات</button>
                            <button onclick="deleteAdminSubmission('${sub.submission_id}')" class="text-red-600 hover:text-red-800 text-sm">حذف</button>
                        </td>
                    </tr>`;
            });
        }
        html += `</tbody></table></div></div>`;
        container.innerHTML = html;
    } catch (e) { container.innerHTML = '<div class="bg-red-50 text-red-600 p-4 rounded-xl">خطا در بارگذاری</div>'; }
}

async function deleteAdminSubmission(submissionId) {
    if (!confirm('آیا از حذف این پرسشنامه و تمام پاسخ‌های آن اطمینان دارید؟')) return;
    try {
        const res = await fetch(`/api/admin/submissions/${submissionId}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.error) { alert(result.error); return; }
        alert('پرسشنامه با موفقیت حذف شد');
        showAdminSection('submissions');
    } catch (e) { alert('خطا در حذف پرسشنامه'); }
}

async function viewAdminSubmission(submissionId) {
    try {
        const res = await fetch(`/api/admin/submission/${submissionId}`);
        const data = await res.json();
        if (data.error) { alert(data.error); return; }

        let html = `
            <div class="mb-6">
                <h4 class="font-bold text-gray-700 mb-2">اطلاعات کاربر</h4>
                <div class="bg-gray-50 p-4 rounded-xl space-y-2">
                    <p><strong>نام:</strong> ${data.user?.first_name || '-'} ${data.user?.last_name || '-'}</p>
                    <p><strong>کد ملی:</strong> ${data.user?.national_code || '-'}</p>
                    <p><strong>شماره تماس:</strong> ${data.user?.phone_number || '-'}</p>
                    <p><strong>تاریخ ثبت:</strong> ${new Date(data.created_at).toLocaleDateString('fa-IR')}</p>
                    <p><strong>وضعیت:</strong> ${data.status === 'completed' ? 'تکمیل شده' : 'پیش‌نویس'}</p>
                </div>
            </div>
            <h4 class="font-bold text-gray-700 mb-4">پاسخ‌ها</h4>
            <div class="space-y-4">
                ${data.responses.map(resp => `
                    <div class="border rounded-xl p-4" id="resp-${resp.response_id}">
                        <p class="font-bold text-gray-800 mb-2">${resp.question_text} <span class="text-sm text-gray-400">(${resp.v_code})</span></p>
                        <p class="text-gray-600"><strong>پاسخ:</strong> <span id="resp-val-${resp.response_id}">${resp.extracted_value || '-'}</span></p>
                        ${resp.transcript ? `<p class="text-gray-500 text-sm mt-2"><strong>متن ضبط شده:</strong> ${resp.transcript}</p>` : ''}
                        <div class="flex items-center gap-4 mt-2 text-xs text-gray-400">
                            <span>${resp.is_voice ? '🎤 ضبط صدا' : '✏️ دستی'}</span>
                            ${resp.ai_confidence ? `<span>دقت AI: ${resp.ai_confidence}%</span>` : ''}
                            <button onclick="deleteAdminResponse('${resp.response_id}')" class="text-red-500 hover:text-red-700 mr-auto">حذف پاسخ</button>
                        </div>
                    </div>`).join('')}
            </div>`;
        document.getElementById('submission-detail').innerHTML = html;
        document.getElementById('submission-modal').classList.remove('hidden');
    } catch (e) { alert('خطا در بارگذاری جزئیات'); }
}

async function deleteAdminResponse(responseId) {
    if (!confirm('آیا از حذف این پاسخ اطمینان دارید؟')) return;
    try {
        const res = await fetch(`/api/admin/responses/${responseId}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.error) { alert(result.error); return; }
        const el = document.getElementById(`resp-${responseId}`);
        if (el) el.remove();
        alert('پاسخ با موفقیت حذف شد');
    } catch (e) { alert('خطا در حذف پاسخ'); }
}

function closeSubmissionModal() {
    document.getElementById('submission-modal').classList.add('hidden');
}

// ---------- Users Management ----------
async function loadAdminUsers(container) {
    container.innerHTML = '<div class="text-center py-20">در حال بارگذاری کاربران...</div>';
    try {
        const res = await fetch('/api/admin/users');
        const users = await res.json();
        let html = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold text-gray-800">مدیریت کاربران</h2>
                <p class="text-gray-500 mt-2">افزودن، ویرایش و حذف کاربران سیستم</p>
            </div>
            <div class="mb-6">
                <button onclick="showAddUserModal()" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl transition">+ افزودن کاربر جدید</button>
            </div>
            <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50 border-b">
                            <tr>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">کد ملی</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">نام</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">نام خانوادگی</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">نقش</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">تعداد پرسشنامه</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">عملیات</th>
                            </tr>
                        </thead>
                        <tbody>`;
        if (users.length === 0) {
            html += `<tr><td colspan="6" class="text-center p-8 text-gray-500">هیچ کاربری یافت نشد</td></tr>`;
        } else {
            users.forEach(user => {
                const roleLabel = user.role === 2 ? 'مدیر' : 'کاربر';
                html += `
                    <tr class="border-b hover:bg-gray-50 transition">
                        <td class="p-4 text-sm">${user.national_code}</td>
                        <td class="p-4 text-sm">${user.first_name || '-'}</td>
                        <td class="p-4 text-sm">${user.last_name || '-'}</td>
                        <td class="p-4 text-sm"><span class="px-2 py-1 rounded-full text-xs ${user.role === 2 ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">${roleLabel}</span></td>
                        <td class="p-4 text-sm">${user.submission_count}</td>
                        <td class="p-4 flex gap-2">
                            <button onclick="editAdminUser('${user.user_id}')" class="text-blue-600 hover:text-blue-800 text-sm">ویرایش</button>
                            <button onclick="deleteAdminUser('${user.user_id}')" class="text-red-600 hover:text-red-800 text-sm">حذف</button>
                        </td>
                    </tr>`;
            });
        }
        html += `</tbody></table></div></div>`;
        container.innerHTML = html;
    } catch (e) { container.innerHTML = '<div class="bg-red-50 text-red-600 p-4 rounded-xl">خطا در بارگذاری</div>'; }
}

function showAddUserModal(userData) {
    document.getElementById('user-modal-title').textContent = userData ? 'ویرایش کاربر' : 'افزودن کاربر جدید';
    document.getElementById('edit-user-id').value = userData?.user_id || '';
    document.getElementById('user-national').value = userData?.national_code || '';
    document.getElementById('user-first').value = userData?.first_name || '';
    document.getElementById('user-last').value = userData?.last_name || '';
    document.getElementById('user-phone').value = userData?.phone_number || '';
    document.getElementById('user-role').value = userData?.role || 1;
    document.getElementById('add-user-modal').classList.remove('hidden');
}

function editAdminUser(userId) {
    // We need to fetch user data first - reuse users endpoint
    fetch('/api/admin/users').then(r => r.json()).then(users => {
        const user = users.find(u => u.user_id === userId);
        if (user) showAddUserModal(user);
        else alert('کاربر یافت نشد');
    }).catch(() => alert('خطا در بارگذاری اطلاعات کاربر'));
}

document.getElementById('add-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('edit-user-id').value;
    const payload = {
        national_code: document.getElementById('user-national').value,
        first_name: document.getElementById('user-first').value,
        last_name: document.getElementById('user-last').value,
        phone_number: document.getElementById('user-phone').value,
        role: parseInt(document.getElementById('user-role').value),
    };
    try {
        let res;
        if (editId) {
            res = await fetch(`/api/admin/users/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        } else {
            res = await fetch('/api/admin/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        }
        const result = await res.json();
        if (result.error) { alert(result.error); return; }
        alert(editId ? 'کاربر با موفقیت ویرایش شد' : 'کاربر با موفقیت افزوده شد');
        closeAddUserModal();
        showAdminSection('users');
    } catch (e) { alert('خطا در ذخیره کاربر'); }
});

function closeAddUserModal() {
    document.getElementById('add-user-modal').classList.add('hidden');
}

async function deleteAdminUser(userId) {
    if (!confirm('آیا از حذف این کاربر اطمینان دارید؟')) return;
    try {
        const res = await fetch(`/api/admin/user/${userId}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.error) { alert(result.error); return; }
        alert('کاربر با موفقیت حذف شد');
        showAdminSection('users');
    } catch (e) { alert('خطا در حذف کاربر'); }
}

// ---------- Forms Management (Hierarchical with Sections & Questions) ----------
let selectedFormId = null;
let selectedSectionId = null;

async function loadAdminForms(container) {
    container.innerHTML = '<div class="text-center py-20">در حال بارگذاری...</div>';
    selectedFormId = null;
    selectedSectionId = null;
    try {
        const res = await fetch('/api/admin/forms');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const forms = await res.json();
        if (!Array.isArray(forms)) throw new Error(forms.error || 'پاسخ نامعتبر');
        renderFormsView(container, forms);
    } catch (e) { container.innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-xl">خطا در بارگذاری فرم‌ها: ${e.message}</div>`; }
}

function renderFormsView(container, forms) {
    container.innerHTML = `
        <div class="mb-8">
            <h2 class="text-3xl font-bold text-gray-800">مدیریت فرم‌ها</h2>
            <p class="text-gray-500 mt-2">مدیریت فرم‌ها، بخش‌ها و سوالات</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Forms column -->
            <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div class="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                    <h3 class="font-bold text-gray-800">فرم‌ها</h3>
                    <button onclick="showFormModal()" class="text-blue-600 hover:text-blue-800 text-sm font-bold">+ افزودن</button>
                </div>
                <div id="forms-list" class="divide-y max-h-[60vh] overflow-y-auto">
                    ${forms.length === 0 ? '<div class="p-4 text-gray-500 text-center">هیچ فرمی وجود ندارد</div>' :
                    forms.map(f => `
                        <div class="p-3 hover:bg-gray-50 cursor-pointer transition flex justify-between items-center ${selectedFormId === f.form_id ? 'bg-blue-50 border-r-4 border-blue-500' : ''}"
                             onclick="selectForm('${f.form_id}')">
                            <div>
                                <p class="font-bold text-gray-800 text-sm">${f.form_name}</p>
                                ${f.category ? `<p class="text-xs text-gray-500">${f.category}</p>` : ''}
                            </div>
                            <div class="flex gap-1">
                                <button onclick="event.stopPropagation(); editForm('${f.form_id}')" class="text-xs text-blue-600 hover:text-blue-800 p-1">✏️</button>
                                <button onclick="event.stopPropagation(); deleteForm('${f.form_id}')" class="text-xs text-red-600 hover:text-red-800 p-1">🗑️</button>
                            </div>
                        </div>`).join('')}
                </div>
            </div>

            <!-- Sections column -->
            <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div class="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                    <h3 class="font-bold text-gray-800">بخش‌ها</h3>
                    <button id="add-section-btn" onclick="showSectionModal()" class="text-blue-600 hover:text-blue-800 text-sm font-bold ${!selectedFormId ? 'opacity-50 pointer-events-none' : ''}">+ افزودن</button>
                </div>
                <div id="sections-list" class="divide-y max-h-[60vh] overflow-y-auto">
                    <div class="p-4 text-gray-500 text-center">${selectedFormId ? 'در حال بارگذاری...' : 'یک فرم را انتخاب کنید'}</div>
                </div>
            </div>

            <!-- Questions column -->
            <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div class="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                    <h3 class="font-bold text-gray-800">سوالات</h3>
                    <button id="add-question-btn" onclick="showQuestionModal()" class="text-blue-600 hover:text-blue-800 text-sm font-bold ${!selectedSectionId ? 'opacity-50 pointer-events-none' : ''}">+ افزودن</button>
                </div>
                <div id="questions-list" class="divide-y max-h-[60vh] overflow-y-auto">
                    <div class="p-4 text-gray-500 text-center">${selectedSectionId ? 'در حال بارگذاری...' : 'یک بخش را انتخاب کنید'}</div>
                </div>
            </div>
        </div>`;

    // Load sections/questions if previously selected
    if (selectedFormId) loadFormSections();
    if (selectedSectionId) loadSectionQuestions();
}

async function selectForm(formId) {
    selectedFormId = formId;
    selectedSectionId = null;
    // Re-render forms column to highlight selection, then load sections
    const res = await fetch('/api/admin/forms');
    const forms = await res.json();
    const container = document.getElementById('admin-content');
    renderFormsView(container, forms);
}

async function loadFormSections() {
    const list = document.getElementById('sections-list');
    list.innerHTML = '<div class="p-4 text-gray-500 text-center">در حال بارگذاری...</div>';
    if (!selectedFormId) return;
    try {
        const res = await fetch(`/api/admin/forms/${selectedFormId}/sections`);
        const sections = await res.json();
        if (sections.error) { list.innerHTML = `<div class="p-4 text-red-500 text-center">${sections.error}</div>`; return; }
        list.innerHTML = sections.length === 0 ? '<div class="p-4 text-gray-500 text-center">هیچ بخشی وجود ندارد</div>' :
            sections.map(s => `
                <div class="p-3 hover:bg-gray-50 cursor-pointer transition flex justify-between items-center ${selectedSectionId === s.section_id ? 'bg-blue-50 border-r-4 border-blue-500' : ''}"
                     onclick="selectSection('${s.section_id}')">
                    <div>
                        <p class="font-bold text-gray-800 text-sm">${s.name_fa}</p>
                        <p class="text-xs text-gray-500">${s.section_key} — ترتیب ${s.sort_order}</p>
                    </div>
                    <div class="flex gap-1">
                        <button onclick="event.stopPropagation(); editSection('${s.section_id}')" class="text-xs text-blue-600 hover:text-blue-800 p-1">✏️</button>
                        <button onclick="event.stopPropagation(); deleteSection('${s.section_id}')" class="text-xs text-red-600 hover:text-red-800 p-1">🗑️</button>
                    </div>
                </div>`).join('');
        document.getElementById('add-section-btn').classList.remove('opacity-50', 'pointer-events-none');
    } catch (e) { list.innerHTML = '<div class="p-4 text-red-500 text-center">خطا</div>'; }
}

async function selectSection(sectionId) {
    selectedSectionId = sectionId;
    // Reload sections to update highlighting
    await loadFormSections();
    await loadSectionQuestions();
}

async function loadSectionQuestions() {
    const list = document.getElementById('questions-list');
    list.innerHTML = '<div class="p-4 text-gray-500 text-center">در حال بارگذاری...</div>';
    if (!selectedSectionId) return;
    try {
        const res = await fetch(`/api/admin/sections/${selectedSectionId}/questions`);
        const questions = await res.json();
        if (questions.error) { list.innerHTML = `<div class="p-4 text-red-500 text-center">${questions.error}</div>`; return; }
        list.innerHTML = questions.length === 0 ? '<div class="p-4 text-gray-500 text-center">هیچ سوالی وجود ندارد</div>' :
            questions.map(q => `
                <div class="p-3 hover:bg-gray-50 transition">
                    <div class="flex justify-between items-start">
                        <div class="flex-1 min-w-0">
                            <p class="font-bold text-gray-800 text-sm truncate">${q.question_text_fa}</p>
                            <p class="text-xs text-gray-500">
                                <span class="font-mono">${q.v_code}</span>
                                <span class="mx-1">•</span>
                                ${q.response_type}
                                ${q.unit ? `<span class="mx-1">•</span> واحد: ${q.unit}` : ''}
                                ${q.variable_name ? `<span class="mx-1">•</span> ${q.variable_name}` : ''}
                            </p>
                            ${q.manual_prompt ? `<p class="text-xs text-orange-500 mt-1 truncate">📝 ${q.manual_prompt}</p>` : ''}
                        </div>
                        <div class="flex gap-1 mr-2 shrink-0">
                            <button onclick="editQuestion('${q.question_id}')" class="text-xs text-blue-600 hover:text-blue-800 p-1">✏️</button>
                            <button onclick="deleteQuestion('${q.question_id}')" class="text-xs text-red-600 hover:text-red-800 p-1">🗑️</button>
                        </div>
                    </div>
                </div>`).join('');
        document.getElementById('add-question-btn').classList.remove('opacity-50', 'pointer-events-none');
    } catch (e) { list.innerHTML = '<div class="p-4 text-red-500 text-center">خطا</div>'; }
}

// ---------- Form CRUD ----------
function showFormModal(formData) {
    document.getElementById('form-modal-title').textContent = formData ? 'ویرایش فرم' : 'افزودن فرم جدید';
    document.getElementById('edit-form-id').value = formData?.form_id || '';
    document.getElementById('form-name').value = formData?.form_name || '';
    document.getElementById('form-category').value = formData?.category || '';
    document.getElementById('form-modal').classList.remove('hidden');
}

async function editForm(formId) {
    const res = await fetch('/api/admin/forms');
    const forms = await res.json();
    const f = forms.find(f => f.form_id === formId);
    if (f) showFormModal(f);
    else alert('فرم یافت نشد');
}

function closeFormModal() { document.getElementById('form-modal').classList.add('hidden'); }

document.getElementById('form-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('edit-form-id').value;
    const payload = {
        form_name: document.getElementById('form-name').value,
        category: document.getElementById('form-category').value,
    };
    try {
        let res;
        if (editId) {
            res = await fetch(`/api/admin/forms/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        } else {
            res = await fetch('/api/admin/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        }
        const result = await res.json();
        if (result.error) { alert(result.error); return; }
        closeFormModal();
        showAdminSection('forms');
    } catch (e) { alert('خطا در ذخیره فرم'); }
});

async function deleteForm(formId) {
    if (!confirm('آیا از حذف این فرم و تمام بخش‌ها و سوالات آن اطمینان دارید؟')) return;
    try {
        const res = await fetch(`/api/admin/forms/${formId}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.error) { alert(result.error); return; }
        selectedFormId = (selectedFormId === formId) ? null : selectedFormId;
        showAdminSection('forms');
    } catch (e) { alert('خطا در حذف فرم'); }
}

// ---------- Section CRUD ----------
async function showSectionModal(sectionData) {
    document.getElementById('section-modal-title').textContent = sectionData ? 'ویرایش بخش' : 'افزودن بخش جدید';
    document.getElementById('edit-section-id').value = sectionData?.section_id || '';
    document.getElementById('section-key').value = sectionData?.section_key || '';
    document.getElementById('section-name').value = sectionData?.name_fa || '';
    document.getElementById('section-order').value = sectionData?.sort_order ?? 0;
    document.getElementById('section-dep-vcode').value = sectionData?.depends_on_vcode || '';
    document.getElementById('section-dep-value').value = sectionData?.depends_on_value || '';

    // Populate form dropdown
    const formSelect = document.getElementById('section-form-id');
    try {
        const res = await fetch('/api/admin/forms');
        const forms = await res.json();
        const selectedFormIdVal = sectionData?.form_id || selectedFormId || '';
        formSelect.innerHTML = `<option value="">انتخاب فرم...</option>` +
            forms.map(f => `<option value="${f.form_id}" ${f.form_id === selectedFormIdVal ? 'selected' : ''}>${f.form_name}${f.category ? ` (${f.category})` : ''}</option>`).join('');
    } catch (e) {
        formSelect.innerHTML = '<option value="">خطا در بارگذاری فرم‌ها</option>';
    }

    document.getElementById('section-modal').classList.remove('hidden');
}

async function editSection(sectionId) {
    if (!selectedFormId) {
        alert('لطفاً ابتدا یک فرم را انتخاب کنید');
        return;
    }
    const res = await fetch(`/api/admin/forms/${selectedFormId}/sections`);
    if (!res.ok) {
        alert('خطا در دریافت اطلاعات بخش');
        return;
    }
    const sections = await res.json();
    const s = sections.find(s => s.section_id === sectionId);
    if (s) {
        await showSectionModal(s);
    } else {
        alert('بخش یافت نشد');
    }
}

function closeSectionModal() { document.getElementById('section-modal').classList.add('hidden'); }

document.getElementById('section-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('edit-section-id').value;
    const payload = {
        form_id: document.getElementById('section-form-id').value,
        section_key: document.getElementById('section-key').value,
        name_fa: document.getElementById('section-name').value,
        sort_order: parseInt(document.getElementById('section-order').value) || 0,
        depends_on_vcode: document.getElementById('section-dep-vcode').value || null,
        depends_on_value: document.getElementById('section-dep-value').value || null,
    };
    try {
        let res;
        if (editId) {
            res = await fetch(`/api/admin/sections/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        } else {
            res = await fetch('/api/admin/sections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        }
        const result = await res.json();
        if (result.error) { alert(result.error); return; }
        closeSectionModal();
        selectedSectionId = null;
        showAdminSection('forms');
    } catch (e) { alert('خطا در ذخیره بخش'); }
});

async function deleteSection(sectionId) {
    if (!confirm('آیا از حذف این بخش و تمام سوالات آن اطمینان دارید؟')) return;
    try {
        const res = await fetch(`/api/admin/sections/${sectionId}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.error) { alert(result.error); return; }
        selectedSectionId = (selectedSectionId === sectionId) ? null : selectedSectionId;
        showAdminSection('forms');
    } catch (e) { alert('خطا در حذف بخش'); }
}

// ---------- Question CRUD ----------
async function showQuestionModal(questionData) {
    document.getElementById('question-modal-title').textContent = questionData ? 'ویرایش سوال' : 'افزودن سوال جدید';
    document.getElementById('edit-question-id').value = questionData?.question_id || '';
    document.getElementById('q-vcode').value = questionData?.v_code || '';
    document.getElementById('q-varname').value = questionData?.variable_name || '';
    document.getElementById('q-text').value = questionData?.question_text_fa || '';
    document.getElementById('q-type').value = questionData?.response_type || 'Text';
    document.getElementById('q-unit').value = questionData?.unit || '';
    document.getElementById('q-options').value = questionData?.coding_options ? JSON.stringify(questionData.coding_options, null, 2) : '';
    document.getElementById('q-prompt').value = questionData?.manual_prompt || '';
    document.getElementById('q-order').value = questionData?.sort_order ?? 0;

    // Populate section dropdown with all sections from the selected form
    const sectionSelect = document.getElementById('question-section-id');
    const targetFormId = selectedFormId;
    try {
        if (targetFormId) {
            const res = await fetch(`/api/admin/forms/${targetFormId}/sections`);
            const sections = await res.json();
            const selectedSectionIdVal = questionData?.section_id || selectedSectionId || '';
            sectionSelect.innerHTML = `<option value="">انتخاب بخش...</option>` +
                sections.map(s => `<option value="${s.section_id}" ${s.section_id === selectedSectionIdVal ? 'selected' : ''}>${s.name_fa} (${s.section_key})</option>`).join('');
        } else {
            sectionSelect.innerHTML = '<option value="">ابتدا یک فرم را انتخاب کنید</option>';
        }
    } catch (e) {
        sectionSelect.innerHTML = '<option value="">خطا در بارگذاری بخش‌ها</option>';
    }

    document.getElementById('question-modal').classList.remove('hidden');
}

async function editQuestion(questionId) {
    if (!selectedSectionId) {
        alert('لطفاً ابتدا یک بخش را انتخاب کنید');
        return;
    }
    const res = await fetch(`/api/admin/sections/${selectedSectionId}/questions`);
    if (!res.ok) {
        alert('خطا در دریافت اطلاعات سوال');
        return;
    }
    const questions = await res.json();
    const q = questions.find(q => q.question_id === questionId);
    if (q) {
        await showQuestionModal(q);
    } else {
        alert('سوال یافت نشد');
    }
}

function closeQuestionModal() { document.getElementById('question-modal').classList.add('hidden'); }

document.getElementById('question-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('edit-question-id').value;

    let codingOptions = null;
    const rawOptions = document.getElementById('q-options').value.trim();
    if (rawOptions) {
        try { codingOptions = JSON.parse(rawOptions); }
        catch (e) { alert('فرمت JSON گزینه‌ها نامعتبر است'); return; }
    }

    const payload = {
        section_id: document.getElementById('question-section-id').value,
        v_code: document.getElementById('q-vcode').value,
        variable_name: document.getElementById('q-varname').value,
        question_text_fa: document.getElementById('q-text').value,
        response_type: document.getElementById('q-type').value,
        coding_options: codingOptions,
        unit: document.getElementById('q-unit').value,
        manual_prompt: document.getElementById('q-prompt').value,
        sort_order: parseInt(document.getElementById('q-order').value) || 0,
    };
    try {
        let res;
        if (editId) {
            res = await fetch(`/api/admin/questions/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        } else {
            res = await fetch('/api/admin/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        }
        const result = await res.json();
        if (result.error) { alert(result.error); return; }
        closeQuestionModal();
        showAdminSection('forms');
    } catch (e) { alert('خطا در ذخیره سوال'); }
});

async function deleteQuestion(questionId) {
    if (!confirm('آیا از حذف این سوال اطمینان دارید؟')) return;
    try {
        const res = await fetch(`/api/admin/questions/${questionId}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.error) { alert(result.error); return; }
        showAdminSection('forms');
    } catch (e) { alert('خطا در حذف سوال'); }
}

// ---------- API Logs ----------
async function loadAdminApiLogs(container) {
    container.innerHTML = '<div class="text-center py-20">در حال بارگذاری لاگ‌ها...</div>';
    try {
        const res = await fetch('/api/admin/api-logs?limit=100');
        const logs = await res.json();
        let html = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold text-gray-800">لاگ‌های هوش مصنوعی</h2>
                <p class="text-gray-500 mt-2">مشاهده تمام درخواست‌های ارسال شده به API</p>
            </div>
            <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50 border-b">
                            <tr>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">زمان</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">بخش</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">مدل</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">توکن‌ها</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">پرامپت</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">پاسخ</th>
                            </tr>
                        </thead>
                        <tbody>`;
        if (logs.length === 0) {
            html += `<tr><td colspan="6" class="text-center p-8 text-gray-500">هیچ لاگی یافت نشد</td></tr>`;
        } else {
            logs.forEach(log => {
                html += `
                    <tr class="border-b hover:bg-gray-50 transition">
                        <td class="p-4 text-sm">${new Date(log.created_at).toLocaleString('fa-IR')}</td>
                        <td class="p-4 text-sm">${log.section_key || '-'}</td>
                        <td class="p-4 text-sm">${log.model_name || '-'}</td>
                        <td class="p-4 text-sm">${log.tokens_used || '-'}</td>
                        <td class="p-4 text-sm max-w-xs truncate" title="${log.prompt_preview || ''}">${log.prompt_preview || '-'}</td>
                        <td class="p-4 text-sm max-w-xs truncate" title="${log.response_preview || ''}">${log.response_preview || '-'}</td>
                    </tr>`;
            });
        }
        html += `</tbody></table></div></div>`;
        container.innerHTML = html;
    } catch (e) { container.innerHTML = '<div class="bg-red-50 text-red-600 p-4 rounded-xl">خطا در بارگذاری</div>'; }
}

// ---------- Settings ----------
function loadAdminSettings(container) {
    container.innerHTML = `
        <div class="mb-8">
            <h2 class="text-3xl font-bold text-gray-800">تنظیمات سیستم</h2>
            <p class="text-gray-500 mt-2">پیکربندی و تنظیمات عمومی سیستم</p>
        </div>
        <div class="bg-white rounded-2xl shadow-sm p-6">
            <div class="space-y-6">
                <div>
                    <h3 class="font-bold text-gray-800 mb-4">تنظیمات ضبط صدا</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-bold mb-2">حداقل مدت ضبط (میلی‌ثانیه)</label>
                            <input type="number" id="min_recording_ms" value="3000" class="w-full border rounded-xl p-2">
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-2">مدت سکوت برای توقف (میلی‌ثانیه)</label>
                            <input type="number" id="silence_duration_ms" value="4000" class="w-full border rounded-xl p-2">
                        </div>
                    </div>
                </div>
                <div class="pt-4 border-t">
                    <button onclick="saveAdminSettings()" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl transition">ذخیره تنظیمات</button>
                </div>
            </div>
        </div>`;
}

function saveAdminSettings() {
    localStorage.setItem('min_recording_ms', document.getElementById('min_recording_ms').value);
    localStorage.setItem('silence_duration_ms', document.getElementById('silence_duration_ms').value);
    alert('تنظیمات با موفقیت ذخیره شد');
}

// ---------- Expose to global scope ----------
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.showAdminSection = showAdminSection;
window.viewAdminSubmission = viewAdminSubmission;
window.closeSubmissionModal = closeSubmissionModal;
window.deleteAdminSubmission = deleteAdminSubmission;
window.deleteAdminResponse = deleteAdminResponse;
window.showAddUserModal = showAddUserModal;
window.editAdminUser = editAdminUser;
window.closeAddUserModal = closeAddUserModal;
window.deleteAdminUser = deleteAdminUser;
window.selectForm = selectForm;
window.showFormModal = showFormModal;
window.editForm = editForm;
window.closeFormModal = closeFormModal;
window.deleteForm = deleteForm;
window.showSectionModal = showSectionModal;
window.editSection = editSection;
window.closeSectionModal = closeSectionModal;
window.deleteSection = deleteSection;
window.selectSection = selectSection;
window.showQuestionModal = showQuestionModal;
window.editQuestion = editQuestion;
window.closeQuestionModal = closeQuestionModal;
window.deleteQuestion = deleteQuestion;
window.tryRestoreSession = tryRestoreSession;
window.saveAdminSettings = saveAdminSettings;

let currentSection = 'dashboard';

// Load dashboard on page load
document.addEventListener('DOMContentLoaded', () => {
    showSection('dashboard');
});

function showSection(section) {
    currentSection = section;
    
    // Update sidebar active state
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === section) {
            item.classList.add('active');
        }
    });
    
    // Load appropriate content
    const contentArea = document.getElementById('content-area');
    
    switch(section) {
        case 'dashboard':
            loadDashboard(contentArea);
            break;
        case 'submissions':
            loadSubmissions(contentArea);
            break;
        case 'users':
            loadUsers(contentArea);
            break;
        case 'questions':
            loadQuestions(contentArea);
            break;
        case 'api-logs':
            loadApiLogs(contentArea);
            break;
        case 'settings':
            loadSettings(contentArea);
            break;
    }
}

async function loadDashboard(container) {
    container.innerHTML = '<div class="text-center py-20">در حال بارگذاری آمار...</div>';
    
    try {
        const response = await fetch('/api/admin/stats');
        const stats = await response.json();
        
        container.innerHTML = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold text-gray-800">داشبورد مدیریتی</h2>
                <p class="text-gray-500 mt-2">خلاصه وضعیت سیستم</p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="stat-card bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm">کل پرسشنامه‌ها</p>
                            <p class="text-3xl font-bold text-gray-800 mt-2">${stats.total_submissions}</p>
                        </div>
                        <div class="bg-blue-100 p-3 rounded-full">
                            <span class="text-2xl">📋</span>
                        </div>
                    </div>
                </div>
                
                <div class="stat-card bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm">تکمیل شده</p>
                            <p class="text-3xl font-bold text-green-600 mt-2">${stats.completed_submissions}</p>
                        </div>
                        <div class="bg-green-100 p-3 rounded-full">
                            <span class="text-2xl">✅</span>
                        </div>
                    </div>
                </div>
                
                <div class="stat-card bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm">کاربران ثبت‌نام شده</p>
                            <p class="text-3xl font-bold text-gray-800 mt-2">${stats.total_users}</p>
                        </div>
                        <div class="bg-purple-100 p-3 rounded-full">
                            <span class="text-2xl">👥</span>
                        </div>
                    </div>
                </div>
                
                <div class="stat-card bg-white rounded-2xl p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm">درخواست‌های AI</p>
                            <p class="text-3xl font-bold text-gray-800 mt-2">${stats.total_api_calls}</p>
                        </div>
                        <div class="bg-orange-100 p-3 rounded-full">
                            <span class="text-2xl">🤖</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white rounded-2xl p-6 shadow-sm">
                    <h3 class="font-bold text-gray-800 mb-4">آمار تکمیل پرسشنامه</h3>
                    <div class="space-y-3">
                        <div>
                            <div class="flex justify-between text-sm mb-1">
                                <span>تکمیل شده</span>
                                <span>${stats.completed_submissions}</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div class="bg-green-500 rounded-full h-2" style="width: ${stats.total_submissions > 0 ? (stats.completed_submissions / stats.total_submissions * 100) : 0}%"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between text-sm mb-1">
                                <span>پیش‌نویس</span>
                                <span>${stats.draft_submissions}</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div class="bg-yellow-500 rounded-full h-2" style="width: ${stats.total_submissions > 0 ? (stats.draft_submissions / stats.total_submissions * 100) : 0}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-2xl p-6 shadow-sm">
                    <h3 class="font-bold text-gray-800 mb-4">اطلاعات سیستم</h3>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between py-2 border-b">
                            <span class="text-gray-600">میانگین دقت AI:</span>
                            <span class="font-bold">${stats.avg_confidence}%</span>
                        </div>
                        <div class="flex justify-between py-2 border-b">
                            <span class="text-gray-600">پرسشنامه‌های هفته اخیر:</span>
                            <span class="font-bold">${stats.recent_submissions}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading dashboard:', error);
        container.innerHTML = '<div class="bg-red-50 text-red-600 p-4 rounded-xl">خطا در بارگذاری اطلاعات</div>';
    }
}

async function loadSubmissions(container) {
    container.innerHTML = '<div class="text-center py-20">در حال بارگذاری پرسشنامه‌ها...</div>';
    
    try {
        const response = await fetch('/api/admin/submissions?limit=100');
        const submissions = await response.json();
        
        let html = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold text-gray-800">مدیریت پرسشنامه‌ها</h2>
                <p class="text-gray-500 mt-2">مشاهده و مدیریت کلیه پاسخ‌های ثبت شده</p>
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
                        <tbody>
        `;
        
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
                        <td class="p-4">
                            <button onclick="viewSubmission('${sub.submission_id}')" class="text-blue-600 hover:text-blue-800 text-sm">
                                مشاهده جزئیات
                            </button>
                        </td>
                    </tr>
                `;
            });
        }
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading submissions:', error);
        container.innerHTML = '<div class="bg-red-50 text-red-600 p-4 rounded-xl">خطا در بارگذاری پرسشنامه‌ها</div>';
    }
}

async function viewSubmission(submissionId) {
    try {
        const response = await fetch(`/api/admin/submission/${submissionId}`);
        const data = await response.json();
        
        if (data.error) {
            alert(data.error);
            return;
        }
        
        // Create modal for viewing submission details
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-4xl w-full max-h-[80vh] overflow-y-auto m-4">
                <div class="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
                    <h3 class="text-xl font-bold">جزئیات پرسشنامه</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
                        ✕
                    </button>
                </div>
                <div class="p-6">
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
                            <div class="border rounded-xl p-4">
                                <p class="font-bold text-gray-800 mb-2">${resp.question_text}</p>
                                <p class="text-gray-600"><strong>پاسخ:</strong> ${resp.extracted_value || '-'}</p>
                                ${resp.transcript ? `<p class="text-gray-500 text-sm mt-2"><strong>متن ضبط شده:</strong> ${resp.transcript}</p>` : ''}
                                <div class="flex gap-4 mt-2 text-xs text-gray-400">
                                    <span>${resp.is_voice ? '🎤 ضبط صدا' : '✏️ دستی'}</span>
                                    ${resp.ai_confidence ? `<span>دقت AI: ${resp.ai_confidence}%</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    } catch (error) {
        console.error('Error viewing submission:', error);
        alert('خطا در بارگذاری جزئیات پرسشنامه');
    }
}

async function loadUsers(container) {
    container.innerHTML = '<div class="text-center py-20">در حال بارگذاری کاربران...</div>';
    
    try {
        const response = await fetch('/api/admin/users');
        const users = await response.json();
        
        let html = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold text-gray-800">مدیریت کاربران</h2>
                <p class="text-gray-500 mt-2">مشاهده و مدیریت کاربران سیستم</p>
            </div>
            
            <div class="mb-6">
                <button onclick="showAddUserModal()" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl transition">
                    + افزودن کاربر جدید
                </button>
            </div>
            
            <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50 border-b">
                            <tr>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">کد ملی</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">نام</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">نام خانوادگی</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">شماره تماس</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">تعداد پرسشنامه</th>
                                <th class="text-right p-4 text-sm font-bold text-gray-600">عملیات</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        if (users.length === 0) {
            html += `<tr><td colspan="6" class="text-center p-8 text-gray-500">هیچ کاربری یافت نشد</td></tr>`;
        } else {
            users.forEach(user => {
                html += `
                    <tr class="border-b hover:bg-gray-50 transition">
                        <td class="p-4 text-sm">${user.national_code}</td>
                        <td class="p-4 text-sm">${user.first_name || '-'}</td>
                        <td class="p-4 text-sm">${user.last_name || '-'}</td>
                        <td class="p-4 text-sm">${user.phone_number || '-'}</td>
                        <td class="p-4 text-sm">${user.submission_count}</td>
                        <td class="p-4">
                            <button onclick="deleteUser('${user.user_id}')" class="text-red-600 hover:text-red-800 text-sm">
                                حذف
                            </button>
                        </td>
                    </tr>
                `;
            });
        }
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading users:', error);
        container.innerHTML = '<div class="bg-red-50 text-red-600 p-4 rounded-xl">خطا در بارگذاری کاربران</div>';
    }
}

function showAddUserModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-md w-full m-4">
            <div class="p-6">
                <h3 class="text-xl font-bold mb-4">افزودن کاربر جدید</h3>
                <form id="add-user-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-bold mb-2">کد ملی</label>
                        <input type="text" name="national_code" required class="w-full border rounded-xl p-2">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-2">نام</label>
                        <input type="text" name="first_name" class="w-full border rounded-xl p-2">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-2">نام خانوادگی</label>
                        <input type="text" name="last_name" class="w-full border rounded-xl p-2">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-2">شماره تماس</label>
                        <input type="text" name="phone_number" class="w-full border rounded-xl p-2">
                    </div>
                    <div class="flex gap-4">
                        <button type="submit" class="flex-1 bg-blue-600 text-white py-2 rounded-xl">افزودن</button>
                        <button type="button" onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-xl">انصراف</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('add-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const userData = Object.fromEntries(formData.entries());
        
        try {
            const response = await fetch('/api/admin/user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            const result = await response.json();
            
            if (result.error) {
                alert(result.error);
            } else {
                alert('کاربر با موفقیت افزوده شد');
                modal.remove();
                loadUsers(document.getElementById('content-area'));
            }
        } catch (error) {
            console.error('Error adding user:', error);
            alert('خطا در افزودن کاربر');
        }
    });
}

async function deleteUser(userId) {
    if (!confirm('آیا از حذف این کاربر اطمینان دارید؟')) return;
    
    try {
        const response = await fetch(`/api/admin/user/${userId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.error) {
            alert(result.error);
        } else {
            alert('کاربر با موفقیت حذف شد');
            loadUsers(document.getElementById('content-area'));
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('خطا در حذف کاربر');
    }
}

async function loadQuestions(container) {
    container.innerHTML = '<div class="text-center py-20">در حال بارگذاری سوالات...</div>';
    
    try {
        const response = await fetch('/api/admin/questions');
        const sections = await response.json();
        
        let html = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold text-gray-800">مدیریت سوالات</h2>
                <p class="text-gray-500 mt-2">ویرایش سوالات و گزینه‌های پاسخ</p>
            </div>
        `;
        
        sections.forEach(section => {
            html += `
                <div class="mb-8 bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div class="bg-gray-50 px-6 py-4 border-b">
                        <h3 class="text-xl font-bold text-gray-800">${section.section_name}</h3>
                        <p class="text-sm text-gray-500">کد بخش: ${section.section_key}</p>
                    </div>
                    <div class="divide-y">
            `;
            
            section.questions.forEach(question => {
                html += `
                    <div class="p-6 hover:bg-gray-50 transition">
                        <div class="flex justify-between items-start mb-4">
                            <div class="flex-1">
                                <span class="text-sm text-gray-500">کد: ${question.v_code}</span>
                                <p class="font-bold text-gray-800 mt-1">${question.question_text_fa}</p>
                            </div>
                            <button onclick="editQuestion('${question.question_id}')" class="text-blue-600 hover:text-blue-800">
                                ✏️ ویرایش
                            </button>
                        </div>
                        <div class="flex gap-4 text-sm text-gray-500">
                            <span>نوع پاسخ: ${question.response_type}</span>
                            ${question.unit ? `<span>واحد: ${question.unit}</span>` : ''}
                            <span>ترتیب: ${question.sort_order}</span>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading questions:', error);
        container.innerHTML = '<div class="bg-red-50 text-red-600 p-4 rounded-xl">خطا در بارگذاری سوالات</div>';
    }
}

function editQuestion(questionId) {
    alert('ویرایش سوالات در نسخه بعدی اضافه خواهد شد');
}

async function loadApiLogs(container) {
    container.innerHTML = '<div class="text-center py-20">در حال بارگذاری لاگ‌ها...</div>';
    
    try {
        const response = await fetch('/api/admin/api-logs?limit=100');
        const logs = await response.json();
        
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
                        <tbody>
        `;
        
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
                    </tr>
                `;
            });
        }
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading API logs:', error);
        container.innerHTML = '<div class="bg-red-50 text-red-600 p-4 rounded-xl">خطا در بارگذاری لاگ‌ها</div>';
    }
}

function loadSettings(container) {
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
                
                <div>
                    <h3 class="font-bold text-gray-800 mb-4">تنظیمات هوش مصنوعی</h3>
                    <div>
                        <label class="block text-sm font-bold mb-2">مدل AI</label>
                        <select id="ai_model" class="w-full border rounded-xl p-2">
                            <option>gpt-4</option>
                            <option>gpt-3.5-turbo</option>
                        </select>
                    </div>
                </div>
                
                <div class="pt-4 border-t">
                    <button onclick="saveSettings()" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl transition">
                        ذخیره تنظیمات
                    </button>
                </div>
            </div>
        </div>
    `;
}

function saveSettings() {
    // Save settings to localStorage or backend
    localStorage.setItem('min_recording_ms', document.getElementById('min_recording_ms').value);
    localStorage.setItem('silence_duration_ms', document.getElementById('silence_duration_ms').value);
    localStorage.setItem('ai_model', document.getElementById('ai_model').value);
    alert('تنظیمات با موفقیت ذخیره شد');
}
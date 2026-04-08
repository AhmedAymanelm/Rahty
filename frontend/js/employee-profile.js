/* ==========================================
   راحتي — Employee Profile Modal Logic
   ========================================== */

let profileUserId = null;
let profileData = null;

/**
 * Open the Employee Profile modal for a given user ID
 */
async function openEmployeeProfile(userId) {
  profileUserId = userId;
  profileData = null;

  // Reset tabs
  switchProfileTab('profile-tab-data');

  // Show modal with loading state
  const modal = document.getElementById('employeeProfileModal');
  if (!modal) return;

  document.getElementById('ep-name').textContent = '⏳ جاري التحميل...';
  document.getElementById('ep-role-badge').textContent = '';
  document.getElementById('ep-hotel-badge').textContent = '';
  document.getElementById('ep-status-badge').textContent = '';

  // Clear all tab content
  document.getElementById('ep-data-content').innerHTML = '<div class="dim" style="text-align:center;padding:30px">جاري تحميل البيانات...</div>';
  document.getElementById('ep-tasks-content').innerHTML = '';
  document.getElementById('ep-conversations-content').innerHTML = '';
  document.getElementById('ep-warnings-content').innerHTML = '';
  document.getElementById('ep-leaves-content').innerHTML = '';
  document.getElementById('ep-performance-content').innerHTML = '';

  openModal('employeeProfileModal');

  try {
    const data = await apiRequest(`/auth/users/${userId}/profile`);
    if (!data) return;
    profileData = data;
    renderProfileHeader(data);
    renderProfileData(data);
    renderProfileTasks(data.tasks);
    renderProfileConversations(data.conversations);
    renderProfileWarnings(data.warnings);
    renderProfileLeaves(data.leaves);
    renderProfilePerformance(data.performance);
  } catch (err) {
    console.error('Failed to load employee profile:', err);
    document.getElementById('ep-data-content').innerHTML = `<div style="text-align:center;color:var(--red);padding:30px">⚠️ ${err.message}</div>`;
  }
}

/**
 * Switch between profile tabs
 */
function switchProfileTab(tabId) {
  // Remove active from all tabs and tab contents
  document.querySelectorAll('#profile-tabs .tb').forEach(btn => btn.classList.remove('act'));
  document.querySelectorAll('.ep-tab-content').forEach(tc => tc.classList.remove('act'));

  // Activate the clicked tab
  const tabBtn = document.querySelector(`[data-ep-tab="${tabId}"]`);
  if (tabBtn) tabBtn.classList.add('act');

  const tabContent = document.getElementById(tabId);
  if (tabContent) tabContent.classList.add('act');
}

/**
 * Render the profile header (name, role, hotel, status)
 */
function renderProfileHeader(data) {
  const rd = ROLES[data.role] || { icon: '👤', label: data.role };

  document.getElementById('ep-name').textContent = data.full_name;
  document.getElementById('ep-role-badge').innerHTML = `${rd.icon} ${rd.label}`;
  document.getElementById('ep-hotel-badge').textContent = data.hotel_name || 'جميع الفنادق';
  
  const statusEl = document.getElementById('ep-status-badge');
  if (data.is_active) {
    statusEl.className = 'badge b-green';
    statusEl.textContent = '🟢 نشط';
  } else {
    statusEl.className = 'badge b-red';
    statusEl.textContent = '🔴 موقوف';
  }
}

/**
 * Render the "البيانات" tab
 */
function renderProfileData(data) {
  // Build Hotels Options
  let hotelsOpts = '<option value="">جميع الفنادق (إدارة عامة)</option>';
  if (typeof hotelsData !== 'undefined') {
    hotelsData.forEach(h => {
      hotelsOpts += `<option value="${h.id}" ${h.id === data.hotel_id ? 'selected' : ''}>${h.name}</option>`;
    });
  }

  // Build Roles Options
  let rolesOpts = '';
  for (const [k, v] of Object.entries(ROLES)) {
    rolesOpts += `<option value="${k}" ${k === data.role ? 'selected' : ''}>${v.icon} ${v.label}</option>`;
  }

  document.getElementById('ep-data-content').innerHTML = `
    <div class="fgrid">
      <div class="fg">
        <label>الاسم</label>
        <input type="text" id="ep-f-name" value="${data.full_name || ''}">
      </div>
      <div class="fg">
        <label>رقم الهوية</label>
        <input type="text" id="ep-f-nid" value="${data.national_id || ''}">
      </div>
      
      <div class="fg">
        <label>الدور</label>
        <select id="ep-f-role">${rolesOpts}</select>
      </div>
      <div class="fg">
        <label>الفندق</label>
        <select id="ep-f-hotel">${hotelsOpts}</select>
      </div>

      <div class="fg">
        <label>البريد الإلكتروني</label>
        <input type="email" id="ep-f-email" value="${data.email || ''}" dir="ltr" style="text-align:right" placeholder="اختياري">
      </div>
      <div class="fg">
        <label>رقم الجوال</label>
        <input type="text" id="ep-f-phone" value="${data.phone_number || ''}" dir="ltr" style="text-align:right">
      </div>

      <div class="fg">
        <label>نوع العقد</label>
        <select id="ep-f-contract">
          <option value="دوام كامل" ${data.contract_type === 'دوام كامل' ? 'selected' : ''}>دوام كامل</option>
          <option value="دوام جزئي" ${data.contract_type === 'دوام جزئي' ? 'selected' : ''}>دوام جزئي</option>
          <option value="عن بعد" ${data.contract_type === 'عن بعد' ? 'selected' : ''}>عن بعد</option>
          <option value="مستقل" ${data.contract_type === 'مستقل' ? 'selected' : ''}>مستقل</option>
        </select>
      </div>
      <div class="fg">
        <label>تاريخ التعيين</label>
        <input type="date" id="ep-f-hiring" value="${data.hiring_date || ''}">
      </div>

      <div class="fg">
        <label>الحالة</label>
        <select id="ep-f-active">
          <option value="true" ${data.is_active ? 'selected' : ''}>نشط</option>
          <option value="false" ${!data.is_active ? 'selected' : ''}>موقوف</option>
        </select>
      </div>
      <div class="fg">
        <label>الراتب الأساسي (ريال)</label>
        <input type="number" id="ep-f-salary" value="${data.basic_salary || ''}">
      </div>
      <div class="fg">
        <label>الجنسية</label>
        <input type="text" id="ep-f-nationality" value="${data.nationality || ''}">
      </div>
    </div>

    <!-- Quick Stats -->
    <div class="ep-quick-stats" style="margin-top:20px; border-top:1px solid rgba(255,255,255,.05); padding-top:15px">
      <div class="ep-qstat" style="--ac:var(--blue)">
        <div class="ep-qstat-val">${data.performance.total_tasks}</div>
        <div class="ep-qstat-lbl">إجمالي المهام</div>
      </div>
      <div class="ep-qstat" style="--ac:var(--green)">
        <div class="ep-qstat-val">${data.performance.completed_tasks}</div>
        <div class="ep-qstat-lbl">مكتملة</div>
      </div>
      <div class="ep-qstat" style="--ac:var(--orange)">
        <div class="ep-qstat-val">${data.performance.total_warnings}</div>
        <div class="ep-qstat-lbl">إنذارات</div>
      </div>
      <div class="ep-qstat" style="--ac:var(--purple)">
        <div class="ep-qstat-val">${data.performance.total_leaves}</div>
        <div class="ep-qstat-lbl">إجازات</div>
      </div>
    </div>

    <!-- Actions -->
    <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; justify-content:flex-end; padding-top:15px; border-top:1px solid rgba(255,255,255,.05);">
      <button class="btn" style="background:var(--dark4); border:1px solid rgba(201,168,76,.3); color:var(--text)" onclick="openWarningModal(${data.id})">⚠️ إصدار إنذار</button>
      <button class="btn bo" onclick="exportEmployeeExcel()">📊 تصدير Excel</button>
      <button class="btn br" onclick="deleteEmployeeProfile(${data.id})">🗑️ حذف الموظف</button>
      <button class="btn bgr" onclick="saveEmployeeProfile(${data.id})" id="btn-save-ep">💾 حفظ التعديلات</button>
    </div>
  `;
}

async function saveEmployeeProfile(userId) {
  const btn = document.getElementById('btn-save-ep');
  const oldTxt = btn.textContent;
  btn.textContent = '⏳ جاري الحفظ...';
  btn.disabled = true;

  const payload = {
    full_name: document.getElementById('ep-f-name').value.trim(),
    national_id: document.getElementById('ep-f-nid').value.trim() || null,
    role: document.getElementById('ep-f-role').value,
    hotel_id: document.getElementById('ep-f-hotel').value ? parseInt(document.getElementById('ep-f-hotel').value) : null,
    email: document.getElementById('ep-f-email').value.trim() || null,
    phone_number: document.getElementById('ep-f-phone').value.trim() || null,
    contract_type: document.getElementById('ep-f-contract').value,
    hiring_date: document.getElementById('ep-f-hiring').value || null,
    nationality: document.getElementById('ep-f-nationality').value.trim() || null,
    is_active: document.getElementById('ep-f-active').value === 'true',
    basic_salary: document.getElementById('ep-f-salary').value ? parseFloat(document.getElementById('ep-f-salary').value) : null,
  };

  try {
    const updated = await apiRequest(`/auth/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    
    if (typeof showToast === 'function') showToast('تم تحديث بيانات الموظف بنجاح 💾', 'success');
    
    // Refresh the table if fetchUsers exists
    if (typeof fetchUsers === 'function') {
      await fetchUsers();
    }
    
    // Refresh modal header
    document.getElementById('ep-name').textContent = updated.full_name;
    const rd = ROLES[updated.role] || { icon: '👤', label: updated.role };
    document.getElementById('ep-role-badge').innerHTML = `${rd.icon} ${rd.label}`;
    
    const statusEl = document.getElementById('ep-status-badge');
    if (updated.is_active) {
      statusEl.className = 'badge b-green';
      statusEl.textContent = '🟢 نشط';
    } else {
      statusEl.className = 'badge b-red';
      statusEl.textContent = '🔴 موقوف';
    }

  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  } finally {
    btn.textContent = oldTxt;
    btn.disabled = false;
  }
}

async function deleteEmployeeProfile(userId) {
  if (!confirm('⚠️ هل أنت متأكد من حذف الموظف بالكامل؟ لا يمكن التراجع عن هذا الإجراء.')) return;
  
  try {
    await apiRequest(`/auth/users/${userId}`, { method: 'DELETE' }, false); // false = no JSON parsing needed
    if (typeof showToast === 'function') showToast('🗑️ تم حذف الموظف بنجاح', 'success');
    closeModal('employeeProfileModal');
    
    if (typeof fetchUsers === 'function') {
      fetchUsers();
    }
  } catch(err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

function exportEmployeeExcel() {
  if (!profileData) return;
  
  let csv = 'الاسم,رقم الهوية,الدور,البريد الإلكتروني,الجوال,رقم المرجع,تاريخ التعيين,نوع العقد,الراتب الأساسي,إجمالي المهام,نسبة الإنجاز,الإنذارات,الإجازات\\n';
  
  const d = profileData;
  csv += `"${d.full_name}","${d.national_id || ''}","${ROLES[d.role]?.label || d.role}","${d.email || ''}","${d.phone_number || ''}","${d.id}","${d.hiring_date || ''}","${d.contract_type || ''}","${d.basic_salary || ''}","${d.performance.total_tasks}","${d.performance.completion_rate}%","${d.performance.total_warnings}","${d.performance.total_leaves}"`;
  
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Arabic Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `بيانات_الموظف_${d.full_name}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Render the "المهام" tab
 */
function renderProfileTasks(tasks) {
  const container = document.getElementById('ep-tasks-content');
  if (!tasks || tasks.length === 0) {
    container.innerHTML = '<div class="ep-empty">📌 لا توجد مهام مسندة لهذا الموظف</div>';
    return;
  }

  const priorityMap = {
    urgent: { label: '🔴 عاجل', cls: 'b-red' },
    high: { label: '🟠 مرتفع', cls: 'b-orange' },
    normal: { label: '🟡 عادي', cls: 'b-gold' },
    low: { label: '🟢 منخفض', cls: 'b-green' },
  };

  const statusMap = {
    pending: { label: 'قيد الانتظار', cls: 'b-orange' },
    in_progress: { label: 'قيد التنفيذ', cls: 'b-blue' },
    completed: { label: 'مكتملة', cls: 'b-green' },
    closed: { label: 'مغلقة', cls: 'b-green' },
  };

  let html = '<div class="ep-tasks-list">';
  tasks.forEach(t => {
    const pri = priorityMap[t.priority] || { label: t.priority, cls: 'b-gold' };
    const st = statusMap[t.status] || { label: t.status, cls: 'b-gold' };
    const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('ar-SA') : '—';
    const dateStr = new Date(t.created_at).toLocaleDateString('ar-SA');

    html += `
      <div class="ep-task-card">
        <div class="ep-task-head">
          <strong>${t.title}</strong>
          <span class="badge ${st.cls}">${st.label}</span>
        </div>
        <div class="ep-task-meta">
          <span><span class="badge ${pri.cls}" style="font-size:.65rem">${pri.label}</span></span>
          <span class="dim">من: ${t.creator_name || '—'}</span>
          <span class="dim">📅 ${dateStr}</span>
          ${t.due_date ? `<span class="dim">⏰ ${dueStr}</span>` : ''}
        </div>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

/**
 * Render the "محادثاته" tab
 */
async function loadDirectMessages() {
  const container = document.getElementById('ep-conversations-content');
  if (!profileUserId) return;
  
  container.innerHTML = `
    <div style="background:var(--dark3); border-radius:12px; border:1px solid rgba(255,255,255,0.05); display:flex; flex-direction:column; height: 400px; overflow:hidden;">
      <!-- Chat Header -->
      <div style="padding:15px; border-bottom:1px solid rgba(255,255,255,.05); display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2);">
        <span class="badge b-green" style="font-size:0.75rem;">مباشر</span>
        <strong style="font-size:1rem; display:flex; align-items:center; gap:8px;">
          💬 محادثات ${profileData ? profileData.full_name : 'الموظف'}
        </strong>
      </div>
      
      <!-- Messages Area -->
      <div id="ep-chat-messages" style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:16px;">
        <div class="dim" style="text-align:center; padding:20px;">جاري تحميل المحادثات...</div>
      </div>
      
      <!-- Input Area -->
      <div style="padding:15px; border-top:1px solid rgba(255,255,255,.05); display:flex; gap:10px; background:rgba(0,0,0,0.1);">
        <input type="text" id="ep-chat-input" placeholder="راسل الموظف مباشرة..." style="flex:1; background:var(--dark4); border:1px solid rgba(255,255,255,.1); border-radius:8px; padding:10px 15px; color:var(--text); outline:none;" onkeypress="if(event.key === 'Enter') sendDirectMessage()">
        <button class="btn bg" onclick="sendDirectMessage()" id="btn-send-dm" style="padding:0 25px; font-weight:bold; border-radius:8px;">إرسال</button>
      </div>
    </div>
  `;

  try {
    const msgs = await apiRequest(`/auth/users/${profileUserId}/messages`);
    const msgsContainer = document.getElementById('ep-chat-messages');
    
    if (!msgs || msgs.length === 0) {
      msgsContainer.innerHTML = '<div class="ep-empty" style="border:none; background:transparent;">💬 لا توجد رسائل سابقة. ابدأ المحادثة الآن.</div>';
      return;
    }

    let html = '';
    const currentUserId = (JSON.parse(sessionStorage.getItem('rahaty_user')) || {}).id;

    msgs.forEach(m => {
      // If we sent it, it's admin/mgmt. Admin bubbles go LEFT in RTL (as per screenshot)
      const isMe = m.sender_id === currentUserId;
      const align = isMe ? 'flex-end' : 'flex-start'; // Actually flex-end in RTL is LEFT
      const bgColor = isMe ? 'rgba(255,255,255,0.1)' : 'rgba(41,128,185,0.15)';
      const br = isMe ? '15px 15px 15px 4px' : '15px 15px 4px 15px'; // Adjust border radius
      
      const timeStr = new Date(m.created_at).toLocaleTimeString('ar-SA', {hour: '2-digit', minute:'2-digit'});
      const dateStr = new Date(m.created_at).toLocaleDateString('ar-SA');

      html += `
        <div style="display:flex; flex-direction:column; align-items:${align}; max-width:100%;">
          <div style="font-size:0.7rem; color:var(--dim); margin-bottom:4px; padding:0 5px;">${m.sender_name}</div>
          <div style="background:${bgColor}; padding:12px 16px; border-radius:${br}; max-width:80%; border:1px solid rgba(255,255,255,0.03);">
            <div style="font-size:0.9rem; line-height:1.5; word-wrap:break-word;">${m.message}</div>
          </div>
          <div style="font-size:0.65rem; color:var(--dim); margin-top:4px;">${timeStr}</div>
        </div>
      `;
    });

    msgsContainer.innerHTML = html;
    
    // Scroll to bottom
    setTimeout(() => {
      msgsContainer.scrollTop = msgsContainer.scrollHeight;
    }, 100);

  } catch (err) {
    document.getElementById('ep-chat-messages').innerHTML = `<div class="ep-empty">⚠️ خطأ في تحميل المحادثات</div>`;
  }
}

async function sendDirectMessage() {
  const input = document.getElementById('ep-chat-input');
  const btn = document.getElementById('btn-send-dm');
  const msgText = input.value.trim();
  
  if (!msgText || !profileUserId) return;
  
  input.disabled = true;
  btn.disabled = true;
  
  try {
    await apiRequest(`/auth/users/${profileUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: msgText })
    });
    
    input.value = '';
    await loadDirectMessages(); // Refresh chat
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  } finally {
    input.disabled = false;
    btn.disabled = false;
    input.focus();
  }
}

function renderProfileConversations() {
  loadDirectMessages();
}

/**
 * Render the "الإنذارات" tab
 */
function renderProfileWarnings(warnings) {
  const container = document.getElementById('ep-warnings-content');
  
  const typeMap = {
    verbal: { label: 'إنذار شفهي', cls: 'b-orange', icon: '🟡' },
    written: { label: 'إنذار كتابي', cls: 'b-red', icon: '🟠' },
    final: { label: 'إنذار نهائي', cls: 'b-red', icon: '🔴' },
  };

  let historyHtml = '';
  if (!warnings || warnings.length === 0) {
    historyHtml = '<div class="ep-empty" style="border:none;">⚠️ لا توجد إنذارات سابقة لهذا الموظف</div>';
  } else {
    historyHtml = '<div class="ep-warnings-history-list" style="display:flex; flex-direction:column; gap:10px;">';
    warnings.forEach(w => {
      const wt = typeMap[w.warning_type] || { label: w.warning_type, cls: 'b-orange', icon: '⚠️' };
      const dateStr = new Date(w.created_at).toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' });
      // Design matching the screenshot: Dark box, orange glow border
      historyHtml += `
        <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(230,126,34,0.3); border-radius: 8px; padding: 15px; color: var(--dim); display: flex; align-items: center; gap: 10px; font-size: 0.9rem;">
          <span style="color:var(--orange)">⚠️</span>
          <span>${wt.label} - ${w.reason} - ${dateStr}</span>
        </div>
      `;
    });
    historyHtml += '</div>';
  }

  const todayStr = new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <!-- Issue Warning Form -->
    <div style="background: var(--dark3); border-radius: 8px; padding: 0; margin-bottom: 25px;">
      <div class="fgrid">
        <div class="fg" style="grid-column: 1 / -1;">
          <label style="color:var(--text); font-size:0.85rem; margin-bottom:8px; display:block;">سبب الإنذار</label>
          <textarea id="ep-warn-reason" placeholder="سبب الإنذار..." rows="3" style="width:100%; background:var(--dark4); border:1px solid rgba(255,255,255,0.05); border-radius:8px; color:var(--text); padding:15px; resize:vertical; outline:none; font-family:inherit;"></textarea>
        </div>
        <div class="fg">
          <label style="color:var(--text); font-size:0.85rem; margin-bottom:8px; display:block;">التاريخ</label>
          <input type="date" id="ep-warn-date" value="${todayStr}" readonly style="width:100%; background:var(--dark4); border:1px solid rgba(255,255,255,0.05); border-radius:8px; color:var(--dim); padding:12px 15px; outline:none; font-family:inherit; cursor:not-allowed;">
        </div>
        <div class="fg">
          <label style="color:var(--text); font-size:0.85rem; margin-bottom:8px; display:block;">نوع الإنذار</label>
          <select id="ep-warn-type" style="width:100%; background:var(--dark4); border:1px solid rgba(255,255,255,0.05); border-radius:8px; color:var(--text); padding:12px 15px; outline:none; font-family:inherit; cursor:pointer;">
            <option value="verbal">إنذار شفهي</option>
            <option value="written">إنذار كتابي</option>
            <option value="final">إنذار نهائي</option>
          </select>
        </div>
        <div class="fg" style="grid-column: 1 / -1; margin-top: 10px;">
          <button id="btn-ep-submit-warn" style="width:100%; background:rgba(230,126,34,0.1); border:1px solid var(--orange); color:var(--orange); border-radius:8px; padding:12px; font-weight:bold; cursor:pointer; font-size:0.95rem; transition:0.2s;" onmouseover="this.style.background='var(--orange)'; this.style.color='#000';" onmouseout="this.style.background='rgba(230,126,34,0.1)'; this.style.color='var(--orange)';">⚠️ إصدار وإرسال الإنذار</button>
        </div>
        <div id="ep-warn-error" style="grid-column: 1 / -1; color: var(--red); display: none; margin-top: 10px; text-align: center; font-size:0.9rem;"></div>
      </div>
    </div>

    <!-- Warnings History -->
    <div>
      <h4 style="margin-bottom: 20px; color:var(--dim); font-size:0.9rem; font-weight:normal;">سجل الإنذارات</h4>
      ${historyHtml}
    </div>
  `;
}

async function submitProfileWarning() {
  if (!profileUserId) return;
  
  const reason = document.getElementById('ep-warn-reason').value.trim();
  const warningType = document.getElementById('ep-warn-type').value;
  const errDiv = document.getElementById('ep-warn-error');
  errDiv.style.display = 'none';

  if (!reason) {
    errDiv.textContent = '⚠️ يرجى إدخال سبب الإنذار';
    errDiv.style.display = 'block';
    return;
  }

  const btn = document.getElementById('btn-ep-submit-warn');
  const oldTxt = btn.textContent;
  btn.textContent = '⏳ جاري الإصدار...';
  btn.disabled = true;

  try {
    await apiRequest('/auth/warnings', {
      method: 'POST',
      body: JSON.stringify({
        user_id: profileUserId,
        warning_type: warningType,
        reason: reason,
        notes: null,
      }),
    });

    if (typeof showToast === 'function') showToast('تم إصدار الإنذار بنجاح', 'success');

    // Soft refresh profile and switch to warnings tab
    openEmployeeProfile(profileUserId);
    setTimeout(() => { switchProfileTab('profile-tab-warnings'); }, 600);
    
  } catch (err) {
    errDiv.textContent = `⚠️ ${err.message}`;
    errDiv.style.display = 'block';
    btn.textContent = oldTxt;
    btn.disabled = false;
  }
}

/**
 * Render the "الإجازات" tab
 */
function renderProfileLeaves(leaves) {
  const container = document.getElementById('ep-leaves-content');
  if (!leaves || leaves.length === 0) {
    container.innerHTML = '<div class="ep-empty">🏖️ لا توجد إجازات مسجلة لهذا الموظف</div>';
    return;
  }

  const typeMap = {
    annual: 'إجازة سنوية',
    sick: 'إجازة مرضية',
    emergency: 'إجازة طارئة',
    unpaid: 'إجازة بدون راتب',
  };

  const statusMap = {
    pending: { label: 'قيد المراجعة', cls: 'b-orange' },
    approved: { label: 'مقبولة', cls: 'b-green' },
    rejected: { label: 'مرفوضة', cls: 'b-red' },
  };

  let html = '<div class="ep-leaves-list">';
  leaves.forEach(lv => {
    const lt = typeMap[lv.leave_type] || lv.leave_type;
    const st = statusMap[lv.status] || { label: lv.status, cls: 'b-gold' };
    const startStr = new Date(lv.start_date).toLocaleDateString('ar-SA');
    const endStr = new Date(lv.end_date).toLocaleDateString('ar-SA');

    // Calculate days
    const start = new Date(lv.start_date);
    const end = new Date(lv.end_date);
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    html += `
      <div class="ep-leave-card">
        <div class="ep-leave-head">
          <strong>${lt}</strong>
          <span class="badge ${st.cls}">${st.label}</span>
        </div>
        <div class="ep-leave-dates">
          <span>📅 من: ${startStr}</span>
          <span>📅 إلى: ${endStr}</span>
          <span class="badge b-blue">${diffDays} يوم</span>
        </div>
        ${lv.reason ? `<div class="ep-leave-reason dim">السبب: ${lv.reason}</div>` : ''}
        ${lv.reviewed_by_name ? `<div class="ep-leave-reviewer dim">مراجعة: ${lv.reviewed_by_name}</div>` : ''}
        ${lv.review_notes ? `<div class="ep-leave-notes dim">ملاحظات: ${lv.review_notes}</div>` : ''}
        ${lv.status === 'pending' ? `
          <div class="ep-leave-actions">
            <button class="btn bgr bsm" onclick="reviewLeave(${lv.id}, 'approved')">✅ قبول</button>
            <button class="btn br bsm" onclick="reviewLeave(${lv.id}, 'rejected')">❌ رفض</button>
          </div>
        ` : ''}
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

/**
 * Render the "الأداء" tab
 */
function renderProfilePerformance(perf) {
  const container = document.getElementById('ep-performance-content');
  
  const rateColor = perf.completion_rate >= 80 ? 'var(--green)' :
                    perf.completion_rate >= 50 ? 'var(--orange)' : 'var(--red)';

  container.innerHTML = `
    <div class="ep-perf-section">
      <div class="ep-perf-title">📊 أداء المهام</div>
      <div class="ep-perf-ring-wrap">
        <div class="ep-perf-ring" style="--rate:${perf.completion_rate};--rate-color:${rateColor}">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="50" class="ep-ring-bg"/>
            <circle cx="60" cy="60" r="50" class="ep-ring-fill" style="stroke-dashoffset:${314 - (314 * perf.completion_rate / 100)}"/>
          </svg>
          <div class="ep-ring-text">
            <span class="ep-ring-val">${perf.completion_rate}%</span>
            <span class="ep-ring-lbl">نسبة الإنجاز</span>
          </div>
        </div>
      </div>
      <div class="ep-perf-grid">
        <div class="ep-perf-stat">
          <div class="ep-perf-stat-val" style="color:var(--blue)">${perf.total_tasks}</div>
          <div class="ep-perf-stat-lbl">إجمالي المهام</div>
        </div>
        <div class="ep-perf-stat">
          <div class="ep-perf-stat-val" style="color:var(--green)">${perf.completed_tasks}</div>
          <div class="ep-perf-stat-lbl">مكتملة</div>
        </div>
        <div class="ep-perf-stat">
          <div class="ep-perf-stat-val" style="color:var(--orange)">${perf.pending_tasks}</div>
          <div class="ep-perf-stat-lbl">قيد الانتظار</div>
        </div>
        <div class="ep-perf-stat">
          <div class="ep-perf-stat-val" style="color:var(--blue)">${perf.in_progress_tasks}</div>
          <div class="ep-perf-stat-lbl">قيد التنفيذ</div>
        </div>
      </div>
    </div>

    <div class="ep-perf-section">
      <div class="ep-perf-title">📋 ملخص السجل</div>
      <div class="ep-perf-grid">
        <div class="ep-perf-stat">
          <div class="ep-perf-stat-val" style="color:var(--orange)">${perf.total_warnings}</div>
          <div class="ep-perf-stat-lbl">إنذارات</div>
        </div>
        <div class="ep-perf-stat">
          <div class="ep-perf-stat-val" style="color:var(--purple)">${perf.total_leaves}</div>
          <div class="ep-perf-stat-lbl">طلبات إجازة</div>
        </div>
        <div class="ep-perf-stat">
          <div class="ep-perf-stat-val" style="color:var(--green)">${perf.approved_leaves}</div>
          <div class="ep-perf-stat-lbl">إجازات مقبولة</div>
        </div>
        <div class="ep-perf-stat">
          <div class="ep-perf-stat-val" style="color:var(--blue)">${perf.attendance_days}</div>
          <div class="ep-perf-stat-lbl">أيام حضور</div>
        </div>
      </div>
    </div>
  `;
}


// ============================================================
//  Warning Modal — إصدار إنذار
// ============================================================

function openWarningModal(userId) {
  const user = usersCache.find(u => u.id === userId);
  if (!user) return;

  const displayMode = document.getElementById('warn-user-display-mode');
  const selectMode = document.getElementById('warn-user-select-mode');
  
  if (displayMode) displayMode.style.display = 'block';
  if (selectMode) selectMode.style.display = 'none';

  document.getElementById('warn-user-name').textContent = user.full_name;
  document.getElementById('warn-user-id').value = userId;
  if(document.getElementById('warn-user-select')) document.getElementById('warn-user-select').value = '';
  document.getElementById('warn-type').value = 'verbal';
  document.getElementById('warn-reason').value = '';
  document.getElementById('warn-notes').value = '';
  document.getElementById('warn-error').classList.remove('show');

  openModal('warningModal');
}

async function submitWarning() {
  let userId = document.getElementById('warn-user-id').value;
  // If global mode
  if (!userId && document.getElementById('warn-user-select-mode').style.display !== 'none') {
    userId = document.getElementById('warn-user-select').value;
  }
  
  userId = parseInt(userId);
  const warningType = document.getElementById('warn-type').value;
  const reason = document.getElementById('warn-reason').value.trim();
  const notes = document.getElementById('warn-notes').value.trim();
  const errDiv = document.getElementById('warn-error');
  errDiv.classList.remove('show');

  if (!userId || isNaN(userId)) {
    errDiv.innerHTML = '⚠️ يرجى تحديد الموظف';
    void errDiv.offsetWidth;
    errDiv.classList.add('show');
    return;
  }

  if (!reason) {
    errDiv.innerHTML = '⚠️ يرجى إدخال سبب الإنذار';
    void errDiv.offsetWidth;
    errDiv.classList.add('show');
    return;
  }

  const btn = document.getElementById('btn-submit-warning');
  const oldTxt = btn.textContent;
  btn.textContent = '⏳ جاري الإصدار...';
  btn.disabled = true;

  try {
    await apiRequest('/auth/warnings', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        warning_type: warningType,
        reason: reason,
        notes: notes || null
      })
    });

    closeModal('warningModal');
    if (typeof showToast === 'function') showToast('تم إصدار الإنذار بنجاح', 'success');

    // If we're on the global page, refresh the list
    if (typeof fetchGlobalWarnings === 'function') {
      fetchGlobalWarnings();
    }
    
    // Refresh employee UI if open
    if (typeof fetchUsers === 'function') fetchUsers();
  } catch (err) {
    errDiv.innerHTML = `⚠️ ${err.message}`;
    void errDiv.offsetWidth;
    errDiv.classList.add('show');
  } finally {
    btn.textContent = oldTxt;
    btn.disabled = false;
  }
}


// ============================================================
//  Review Leave Request — مراجعة طلب إجازة
// ============================================================

async function reviewLeave(leaveId, status) {
  const confirmMsg = status === 'approved' ? 'هل تريد قبول هذا الطلب؟' : 'هل تريد رفض هذا الطلب؟';
  if (!confirm(confirmMsg)) return;

  try {
    await apiRequest(`/auth/leaves/${leaveId}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });

    if (typeof showToast === 'function') {
      showToast(status === 'approved' ? 'تم قبول طلب الإجازة' : 'تم رفض طلب الإجازة', 'success');
    }

    // Refresh profile
    if (profileUserId) {
      openEmployeeProfile(profileUserId);
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

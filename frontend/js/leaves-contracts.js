let allWarnings = [];
let allLeaves = [];
let allContracts = [];

async function loadLeavesContractsData() {
  await Promise.all([
    fetchGlobalWarnings(),
    fetchGlobalLeaves(),
    fetchGlobalContracts()
  ]);
  
  // Populate users in global warning select
  const userSelect = document.getElementById('warn-user-select');
  if (userSelect && typeof usersCache !== 'undefined') {
    let html = '<option value="">-- اختر الموظف --</option>';
    usersCache.forEach(u => {
      html += `<option value="${u.id}">${u.full_name} (${u.hotel_name || 'إدارة'})</option>`;
    });
    userSelect.innerHTML = html;
  }
}

function switchLcTab(tabId) {
  // Hide all tabs
  document.querySelectorAll('.lc-tab-content').forEach(tc => tc.style.display = 'none');
  document.querySelectorAll('.tb[data-lc-tab]').forEach(btn => btn.classList.remove('act'));
  
  // Activate selected tab
  document.getElementById(tabId).style.display = 'block';
  document.querySelector(`.tb[data-lc-tab="${tabId}"]`).classList.add('act');
}

async function fetchGlobalWarnings() {
  const tbody = document.getElementById('lc-warnings-tbody');
  try {
    let url = '/auth/warnings';
    if (typeof activeAdminHotelFilter !== 'undefined' && activeAdminHotelFilter && activeAdminHotelFilter !== 'all') {
      url += `?hotel_id=${encodeURIComponent(activeAdminHotelFilter)}`;
    }
    const data = await apiRequest(url);
    allWarnings = data || [];
    renderGlobalWarnings(allWarnings);
  } catch(err) {
    tbody.innerHTML = `<tr><td colspan="7" class="dim" style="text-align:center;color:var(--red);">⚠️ خطأ: ${err.message}</td></tr>`;
  }
}

async function fetchGlobalLeaves() {
  const tbody = document.getElementById('lc-leaves-tbody');
  try {
    let url = '/auth/leaves';
    if (typeof activeAdminHotelFilter !== 'undefined' && activeAdminHotelFilter && activeAdminHotelFilter !== 'all') {
      url += `?hotel_id=${encodeURIComponent(activeAdminHotelFilter)}`;
    }
    const data = await apiRequest(url);
    allLeaves = data || [];
    renderGlobalLeaves(allLeaves);
  } catch(err) {
    tbody.innerHTML = `<tr><td colspan="7" class="dim" style="text-align:center;color:var(--red);">⚠️ خطأ: ${err.message}</td></tr>`;
  }
}

async function fetchGlobalContracts() {
  const tbody = document.getElementById('lc-contracts-tbody');
  try {
    let url = '/auth/users?include_inactive=false';
    if (typeof activeAdminHotelFilter !== 'undefined' && activeAdminHotelFilter && activeAdminHotelFilter !== 'all') {
      url += `&hotel_id=${encodeURIComponent(activeAdminHotelFilter)}`;
    }
    const data = await apiRequest(url);
    allContracts = data || [];
    renderGlobalContracts(allContracts);
  } catch(err) {
    tbody.innerHTML = `<tr><td colspan="7" class="dim" style="text-align:center;color:var(--red);">⚠️ خطأ: ${err.message}</td></tr>`;
  }
}

function renderGlobalWarnings(warnings) {
  const tbody = document.getElementById('lc-warnings-tbody');
  if (warnings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="dim" style="text-align:center; padding:30px;">لا توجد إنذارات مسجلة</td></tr>';
    return;
  }
  
  const typeMap = {
    verbal: { label: 'إنذار شفهي', cls: 'b-orange' },
    written: { label: 'إنذار كتابي', cls: 'b-red' },
    final: { label: 'إنذار نهائي', cls: 'b-red' },
  };

  let html = '';
  warnings.forEach(w => {
    const wt = typeMap[w.warning_type] || { label: w.warning_type, cls: 'b-orange' };
    const dateStr = new Date(w.created_at).toLocaleDateString('ar-SA');
    html += `
      <tr>
        <td><strong>${w.user_name}</strong></td>
        <td class="dim">${w.hotel_name || '—'}</td>
        <td><span class="badge ${wt.cls}">${wt.label}</span></td>
        <td>${w.reason}</td>
        <td class="dim">${dateStr}</td>
        <td><span class="badge b-red">إنذار فعال</span></td>
        <td>
          <button class="btn br bsm" onclick="alert('حذف الإنذار غير متاح حاليا')">🗑️</button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderGlobalLeaves(leaves) {
  const tbody = document.getElementById('lc-leaves-tbody');
  if (leaves.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="dim" style="text-align:center; padding:30px;">لا توجد طلبات إجازة</td></tr>';
    return;
  }
  
  const typeMap = { annual: 'سنوية', sick: 'مرضية', emergency: 'طارئة', unpaid: 'بدون راتب' };
  const statusMap = {
    pending: { label: 'قيد المراجعة', cls: 'b-orange' },
    approved: { label: 'مقبولة', cls: 'b-green' },
    rejected: { label: 'مرفوضة', cls: 'b-red' },
  };

  let html = '';
  leaves.forEach(lv => {
    const lt = typeMap[lv.leave_type] || lv.leave_type;
    const st = statusMap[lv.status] || { label: lv.status, cls: 'b-gold' };
    const start = new Date(lv.start_date);
    const end = new Date(lv.end_date);
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    html += `
      <tr>
        <td><strong>${lv.user_name}</strong></td>
        <td class="dim">${lv.hotel_name || '—'}</td>
        <td>${lt}</td>
        <td><span class="badge b-blue">${diffDays} يوم</span></td>
        <td class="dim" style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${lv.reason || '—'}</td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
        <td>
          ${lv.status === 'pending' ? `
            <button class="btn bgr bsm" onclick="reviewGlobalLeave(${lv.id}, 'approved')">✅</button>
            <button class="btn br bsm" onclick="reviewGlobalLeave(${lv.id}, 'rejected')">❌</button>
          ` : '—'}
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderGlobalContracts(contracts) {
  const tbody = document.getElementById('lc-contracts-tbody');
  if (contracts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="dim" style="text-align:center; padding:30px;">لا يوجد موظفين مسجلين</td></tr>';
    return;
  }
  
  let html = '';
  contracts.forEach(c => {
    const rd = ROLES[c.role] || { label: c.role };
    const hd = c.hiring_date ? new Date(c.hiring_date).toLocaleDateString('ar-SA') : 'لم يحدد';
    const activeHTML = c.is_active ? '<span class="badge b-green">نشط</span>' : '<span class="badge b-red">موقوف</span>';
    
    html += `
      <tr>
        <td><strong>${c.full_name}</strong></td>
        <td class="dim">${c.hotel?.name || 'جميع الفنادق'}</td>
        <td class="dim">${rd.label}</td>
        <td><span class="badge" style="border:1px solid rgba(255,255,255,0.1);">${c.contract_type || '—'}</span></td>
        <td class="dim">${hd}</td>
        <td><strong style="color:var(--gold)">${c.basic_salary ? c.basic_salary + ' ريال' : '—'}</strong></td>
        <td>${activeHTML}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function openWarningModalGlobal() {
  document.getElementById('warn-user-display-mode').style.display = 'none';
  document.getElementById('warn-user-select-mode').style.display = 'block';
  document.getElementById('warn-user-id').value = '';
  document.getElementById('warn-user-select').value = '';
  document.getElementById('warn-type').value = 'verbal';
  document.getElementById('warn-reason').value = '';
  document.getElementById('warn-notes').value = '';
  document.getElementById('warn-error').classList.remove('show');
  
  openModal('warningModal');
}

async function reviewGlobalLeave(leaveId, status) {
  if (!confirm(status === 'approved' ? 'تأكيد قبول الإجازة؟' : 'تأكيد رفض الإجازة؟')) return;
  try {
    await apiRequest(`/auth/leaves/${leaveId}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    showToast('تم تحديث حالة الإجازة', 'success');
    fetchGlobalLeaves();
  } catch(err) {
    showToast(err.message, 'error');
  }
}

function exportLcTable(tbodyId) {
  // Simple table to CSV export
  const trs = document.querySelectorAll(`#${tbodyId} tr`);
  if (!trs || trs.length === 0) return;
  
  let csv = [];
  // Assuming standard headers
  if (tbodyId === 'lc-warnings-tbody') csv.push('الموظف,الفندق,نوع الإنذار,السبب,التاريخ,الحالة');
  if (tbodyId === 'lc-contracts-tbody') csv.push('الموظف,الفندق,الدور الوظيفي,نوع العقد,تاريخ التعيين,الراتب الأساسي,الحالة');
  if (tbodyId === 'lc-leaves-tbody') csv.push('الموظف,الفندق,نوع الإجازة,المدة,السبب,الحالة');

  trs.forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if (tds.length <= 1) return; // skip empty rows
    
    let row = [];
    tds.forEach((td, idx) => {
      if (idx === tds.length - 1) return; // ignore action column
      row.push(`"${td.innerText.replace(/"/g, '""')}"`);
    });
    csv.push(row.join(','));
  });

  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `تصدير_${tbodyId}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

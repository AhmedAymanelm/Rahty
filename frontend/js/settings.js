/* ==========================================
   راحتي — Settings (Comprehensive)
   ========================================== */

const DEFAULT_SETTINGS = {
  enableBadges: true,
  badgeIntervalSec: 45,
};

let __badgeRefreshTimer = null;
let _stChecklistItems = [];
let _stRoomTypes = [];

function getSettings() {
  try {
    const raw = localStorage.getItem('rahati_settings');
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(next) {
  localStorage.setItem('rahati_settings', JSON.stringify(next));
}

function applyUiSettings() {
  document.documentElement.style.fontSize = '100%';
}

/* =====================================================
   TAB SWITCHING
   ===================================================== */

function switchSettingsTab(tabId, btn) {
  document.querySelectorAll('.st-tab-content').forEach(t => { t.style.display = 'none'; t.classList.remove('act'); });
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('act'));
  const content = document.getElementById(tabId);
  if (content) { content.style.display = 'block'; content.classList.add('act'); }
  if (btn) btn.classList.add('act');

  // Load tab-specific data
  if (tabId === 'st-hotels') loadSettingsHotels();
  if (tabId === 'st-checklist') loadSettingsChecklist();
  if (tabId === 'st-room-types') loadSettingsRoomTypes();
  if (tabId === 'st-roles') renderSettingsRoles();
  if (tabId === 'st-shifts') loadSettingsShifts();
  if (tabId === 'st-notifications') syncNotificationFields();
}

function renderSettingsPage() {
  const page = document.getElementById('p-settings');
  if (!page) return;
  const st = getSettings();
  const enableEl = document.getElementById('st-enable-badges');
  const intervalEl = document.getElementById('st-badge-interval');
  if (enableEl) enableEl.value = st.enableBadges ? 'on' : 'off';
  if (intervalEl) intervalEl.value = String(st.badgeIntervalSec || 45);
  const user = getStoredUser();
  const userEl = document.getElementById('st-username');
  if (userEl) userEl.value = user?.username || '';
  ['st-current-password','st-new-password','st-confirm-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // 1. Determine Authorization
  // const user is already declared above around line 60
  const role = String(user?.role || '').toLowerCase();
  const isAuthorized = (role === 'admin' || role === 'supervisor');

  // 2. Control Tab Buttons Visibility
  const tabButtons = document.querySelectorAll('#settings-tab-bar .stab');
  tabButtons.forEach(btn => {
    const tabId = btn.getAttribute('data-stab');
    // Always show 'st-account', hide others if not authorized
    if (tabId !== 'st-account') {
      btn.style.setProperty('display', isAuthorized ? 'block' : 'none', 'important');
    }
  });

  // 3. Force Switch to 'Account' if current tab is unauthorized
  const activeBtn = document.querySelector('#settings-tab-bar .stab.act');
  if (activeBtn) {
    const activeTabId = activeBtn.getAttribute('data-stab');
    if (!isAuthorized && activeTabId !== 'st-account') {
       // Stop whatever is loading and switch
       switchSettingsTab('st-account', document.querySelector('[data-stab="st-account"]'));
    }
  }

  // 4. Double check Content Divs for non-authorized users
  if (!isAuthorized) {
    document.querySelectorAll('.st-tab-content').forEach(div => {
      if (div.id !== 'st-account') {
        div.style.setProperty('display', 'none', 'important');
        div.classList.remove('act');
      }
    });
    const accDiv = document.getElementById('st-account');
    if (accDiv) {
      accDiv.style.setProperty('display', 'block', 'important');
      accDiv.classList.add('act');
    }
  }
}

function syncNotificationFields() {
  const st = getSettings();
  const enableEl = document.getElementById('st-enable-badges');
  const intervalEl = document.getElementById('st-badge-interval');
  if (enableEl) enableEl.value = st.enableBadges ? 'on' : 'off';
  if (intervalEl) intervalEl.value = String(st.badgeIntervalSec || 45);
}

/* =====================================================
   HOTELS TAB
   ===================================================== */

async function loadSettingsHotels() {
  const listEl = document.getElementById('st-hotels-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="dim" style="text-align:center; padding:30px;">جاري تحميل قائمة الفنادق...</div>';
  
  try {
    const hotels = await apiRequest('/hotels');
    if (!hotels || hotels.length === 0) {
      listEl.innerHTML = '<div class="dim" style="text-align:center; padding:30px;">لا توجد فنادق مسجلة حالياً</div>';
      return;
    }
    
    listEl.innerHTML = hotels.map(h => {
      const starIcons = '⭐'.repeat(h.stars || 3);
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:15px 18px; background:var(--dark4); border-radius:12px; border:1px solid rgba(255,255,255,0.05); transition:0.2s;" onmouseover="this.style.borderColor='rgba(201,168,76,0.2)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.05)'">
          <div style="display:flex; align-items:center; gap:15px;">
            <div style="width:45px; height:45px; background:rgba(201,168,76,0.1); border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1.3rem; border:1px solid rgba(201,168,76,0.15);">🏨</div>
            <div>
              <div style="font-weight:bold; font-size:1rem; display:flex; align-items:center; gap:8px;">
                ${h.name} <span style="font-size:0.75rem; opacity:0.8;">${starIcons}</span>
              </div>
              <div class="dim" style="font-size:0.8rem; margin-top:4px;">
                📍 ${h.city || 'غير محدد'} — 🚪 ${h.total_rooms || 0} غرفة — 🏢 ${h.total_floors || 0} طوابق
              </div>
            </div>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn bsm bg" onclick="openAddHotelModal(${h.id})">✏️ تعديل</button>
            <button class="btn bsm br" onclick="deleteHotelSettings(${h.id}, '${h.name.replace(/'/g, "\\'")}')">🗑️ حذف</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="dim" style="color:var(--red); text-align:center; padding:30px;">⚠️ خطأ في التحميل: ${err.message}</div>`;
  }
}

async function openAddHotelModal(hotelId = null) {
  const modal = document.getElementById('modal-hotel');
  const title = document.getElementById('hotel-modal-title');
  const idHidden = document.getElementById('hotel-id-hidden');
  
  // Clear fields
  const fields = ['name', 'city', 'address', 'phone', 'rooms', 'floors', 'stars', 'manager', 'description'];
  fields.forEach(f => {
    const el = document.getElementById('hotel-' + f);
    if (el) el.value = (f === 'rooms' || f === 'floors') ? 0 : (f === 'stars' ? 3 : '');
  });
  
  idHidden.value = hotelId || '';
  title.textContent = hotelId ? '🏨 تعديل بيانات الفندق' : '🏨 إضافة فندق جديد';
  
  // Populate manager dropdown
  await populateHotelManagers();
  
  if (hotelId) {
    try {
      // Find hotel in cache or fetch (for simplicity we'll fetch list again or find in DOM)
      const hotels = await apiRequest('/hotels');
      const h = hotels.find(x => x.id === hotelId);
      if (h) {
        document.getElementById('hotel-name').value = h.name || '';
        document.getElementById('hotel-city').value = h.city || '';
        document.getElementById('hotel-address').value = h.address || '';
        document.getElementById('hotel-phone').value = h.phone || '';
        document.getElementById('hotel-rooms').value = h.total_rooms || 0;
        document.getElementById('hotel-floors').value = h.total_floors || 0;
        document.getElementById('hotel-stars').value = h.stars || 3;
        document.getElementById('hotel-manager').value = h.manager_id || '';
        document.getElementById('hotel-description').value = h.description || '';
      }
    } catch (e) {
      console.error("Failed to load hotel info", e);
    }
  }
  
  if (modal) modal.classList.add('show');
}

function closeHotelModal() {
  const modal = document.getElementById('modal-hotel');
  if (modal) modal.classList.remove('show');
}

async function populateHotelManagers() {
  const sel = document.getElementById('hotel-manager');
  if (!sel) return;
  
  try {
    // Fetch users with admin or supervisor roles
    const users = await apiRequest('/auth/users');
    const managers = users.filter(u => u.role === 'admin' || u.role === 'supervisor');
    
    let html = '<option value="">-- اختر المشرف --</option>';
    managers.forEach(m => {
      html += `<option value="${m.id}">${m.full_name} (${m.role === 'admin' ? 'إدارة' : 'مشرف'})</option>`;
    });
    sel.innerHTML = html;
  } catch (e) {
    console.error("Failed to load managers", e);
  }
}

async function saveHotel() {
  const hotelId = document.getElementById('hotel-id-hidden').value;
  const payload = {
    name: document.getElementById('hotel-name').value.trim(),
    city: document.getElementById('hotel-city').value.trim(),
    address: document.getElementById('hotel-address').value.trim(),
    phone: document.getElementById('hotel-phone').value.trim(),
    total_rooms: parseInt(document.getElementById('hotel-rooms').value) || 0,
    total_floors: parseInt(document.getElementById('hotel-floors').value) || 0,
    stars: parseInt(document.getElementById('hotel-stars').value) || 3,
    manager_id: parseInt(document.getElementById('hotel-manager').value) || null,
    description: document.getElementById('hotel-description').value.trim()
  };
  
  if (!payload.name) {
    if (typeof showToast === 'function') showToast('اسم الفندق مطلوب', 'warning');
    return;
  }
  
  try {
    const url = '/hotels';
    const method = hotelId ? 'PATCH' : 'POST';
    const finalUrl = hotelId ? `${url}/${hotelId}` : url;
    
    await apiRequest(finalUrl, {
      method: method,
      body: JSON.stringify(payload)
    });
    
    if (typeof showToast === 'function') showToast(hotelId ? 'تم تحديث الفندق' : 'تم إضافة الفندق بنجاح', 'success');
    closeHotelModal();
    loadSettingsHotels();
  } catch (err) {
    if (typeof showToast === 'function') showToast(`خطأ: ${err.message}`, 'error');
  }
}

async function deleteHotelSettings(id, name) {
  if (!confirm(`هل أنت متأكد من حذف فندق "${name}" نهائياً؟\nسيتم حذف جميع البيانات المرتبطة بهذا الفندق.`)) return;
  
  try {
    await apiRequest(`/hotels/${id}`, { method: 'DELETE' });
    if (typeof showToast === 'function') showToast('تم حذف الفندق', 'success');
    loadSettingsHotels();
  } catch (err) {
    if (typeof showToast === 'function') showToast(`فشل الحذف: ${err.message}`, 'error');
  }
}

/* =====================================================
   ROLES TAB
   ===================================================== */

function renderSettingsRoles() {
  const listEl = document.getElementById('st-roles-list');
  if (!listEl) return;

  const rows = [
    { 
      role: 'admin', 
      perms: [
        { lbl: 'الكل', cls: 'pb-green', icon: '✅' }, 
        { icon: '✅', cls: 'pb-check' }, 
        { lbl: 'الكل', cls: 'pb-green', icon: '✅' }, 
        { icon: '✅', cls: 'pb-check' }, 
        { icon: '✅', cls: 'pb-check' }, 
        { lbl: 'الكل', cls: 'pb-green', icon: '✅' }
      ] 
    },
    { 
      role: 'supervisor', 
      perms: [
        { lbl: 'فندقه', cls: 'pb-blue' }, 
        { icon: '✅', cls: 'pb-check' }, 
        { lbl: 'فندقه', cls: 'pb-blue' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: 'فندقه', cls: 'pb-blue' }, 
        { icon: '✅', cls: 'pb-check' }
      ] 
    },
    { 
      role: 'superfv', 
      perms: [
        { lbl: 'قسمه', cls: 'pb-blue' }, 
        { lbl: 'محدود', cls: 'pb-orange' }, 
        { lbl: 'قسمه', cls: 'pb-blue' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { icon: '✅', cls: 'pb-check' }
      ] 
    },
    { 
      role: 'cleaner', 
      perms: [
        { lbl: 'غرفة', cls: 'pb-purple' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: 'الإدارة فقط', cls: 'pb-red' }
      ] 
    },
    { 
      role: 'maintenance', 
      perms: [
        { lbl: 'مهامه', cls: 'pb-purple' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: 'المشرف فقط', cls: 'pb-gold' }
      ] 
    },
    { 
      role: 'reception', 
      perms: [
        { lbl: 'يوميته', cls: 'pb-purple' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: 'يوميته', cls: 'pb-orange' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: 'الإدارة فقط', cls: 'pb-red' }
      ] 
    },
    { 
      role: 'accountant', 
      perms: [
        { lbl: 'فندقه', cls: 'pb-blue' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: 'كاملة', cls: 'pb-green' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: '❌', cls: 'pb-none' }, 
        { lbl: 'الإدارة فقط', cls: 'pb-red' }
      ] 
    }
  ];

  let html = `
    <table style="width:100%; border-collapse: collapse; min-width: 600px;">
      <thead>
        <tr style="background: rgba(0,0,0,0.2);">
          <th style="padding: 12px; text-align: right; font-size: 0.75rem; color: var(--dim);">الدور</th>
          <th style="padding: 12px; text-align: center; font-size: 0.75rem; color: var(--dim);">الرؤية</th>
          <th style="padding: 12px; text-align: center; font-size: 0.75rem; color: var(--dim);">إنشاء مهام</th>
          <th style="padding: 12px; text-align: center; font-size: 0.75rem; color: var(--dim);">التقارير</th>
          <th style="padding: 12px; text-align: center; font-size: 0.75rem; color: var(--dim);">حذف البيانات</th>
          <th style="padding: 12px; text-align: center; font-size: 0.75rem; color: var(--dim);">رؤية المحادثات</th>
          <th style="padding: 12px; text-align: center; font-size: 0.75rem; color: var(--dim);">التواصل</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach(r => {
    const rd = ROLES[r.role] || { icon: '👤', label: r.role };
    html += `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
        <td style="padding: 14px 12px; display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.1rem;">${rd.icon}</span>
          <span style="font-weight: bold; font-size: 0.85rem;">${rd.label}</span>
        </td>
        ${r.perms.map(p => `
          <td style="padding: 12px; text-align: center;">
            <span class="pb ${p.cls}">${p.icon ? p.icon : ''} ${p.lbl || ''}</span>
          </td>
        `).join('')}
      </tr>
    `;
  });

  html += `</tbody></table>`;
  listEl.innerHTML = html;
}

/* =====================================================
   CHECKLIST TAB
   ===================================================== */

function loadSettingsChecklist() {
  const container = document.getElementById('st-checklist-container');
  if (!container) return;
  container.innerHTML = '<div class="dim" style="grid-column: 1 / -1; text-align:center; padding:30px;">جاري تحميل القائمة...</div>';

  apiRequest('/checklist')
    .then(items => {
      _stChecklistItems = items || [];
      renderChecklistItems(_stChecklistItems);
    })
    .catch(err => {
      container.innerHTML = `<div class="dim" style="grid-column: 1 / -1; text-align:center; padding:30px; color:var(--red);">⚠️ خطأ: ${err.message}</div>`;
    });
}

function renderChecklistItems(items) {
  const container = document.getElementById('st-checklist-container');
  if (!container) return;
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="dim" style="grid-column: 1 / -1; text-align:center; padding:30px;">لا توجد بنود فحص مسجلة</div>';
    return;
  }

  // Group by category
  const groups = {};
  items.forEach(it => {
    if (!groups[it.category]) groups[it.category] = [];
    groups[it.category].push(it);
  });

  let html = '';
  for (const [cat, list] of Object.entries(groups)) {
    html += `
      <div class="card" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 12px;">
        <div style="font-weight:bold; font-size:0.85rem; color:var(--gold); margin-bottom:10px; display:flex; justify-content:space-between;">
          <span>📂 ${cat}</span>
          <span style="opacity:0.5; font-size:0.7rem;">${list.length} بنود</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${list.map(it => `
            <div style="display:flex; align-items:center; gap:8px; padding:6px 8px; background:rgba(0,0,0,0.2); border-radius:6px; font-size:0.8rem;">
              <span style="flex:1;">${it.label}</span>
              <button class="btn br bsm" style="padding:2px 5px; font-size:0.7rem;" onclick="deleteChecklistItem(${it.id}, '${it.label.replace(/'/g,"\\'")}')">🗑️</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function openAddChecklistModal() {
  try {
    const modal = document.getElementById('modal-checklist-item');
    if (!modal) {
      alert('لم يتم العثور على modal-checklist-item');
      return;
    }
    
    if (modal.parentNode !== document.body) {
      document.body.appendChild(modal);
    }

    document.getElementById('checklist-id-hidden').value = '';
    document.getElementById('checklist-label').value = '';
    document.getElementById('checklist-modal-title').textContent = '✅ إضافة بند فحص جديد';
    
    modal.style.zIndex = '999999';
    modal.style.display = 'flex';
    modal.classList.add('show');
  } catch(e) {
    alert("خطأ: " + e.message);
  }
}

function closeChecklistModal() {
  const modal = document.getElementById('modal-checklist-item');
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
  }
}

async function saveChecklistItem() {
  const label = document.getElementById('checklist-label').value.trim();
  const category = document.getElementById('checklist-category').value;
  
  if (!label) {
    if (typeof showToast === 'function') showToast('يرجى كتابة وصف البند', 'warning');
    return;
  }

  try {
    await apiRequest('/checklist', {
      method: 'POST',
      body: JSON.stringify({ category, label })
    });
    if (typeof showToast === 'function') showToast('تمت إضافة البند بنجاح', 'success');
    closeChecklistModal();
    loadSettingsChecklist();
  } catch (err) {
    if (typeof showToast === 'function') showToast(`خطأ: ${err.message}`, 'error');
  }
}

async function deleteChecklistItem(id, label) {
  const confirmed = await fwOpenConfirmDialog({
    title: 'تأكيد الحذف',
    message: `هل أنت متأكد من حذف بند "${label}"؟`,
    confirmLabel: 'نعم، احذف',
    confirmClass: 'br'
  });
  if (!confirmed) return;
  try {
    await apiRequest(`/checklist/${id}`, { method: 'DELETE' });
    if (typeof showToast === 'function') showToast('تم حذف البند', 'success');
    loadSettingsChecklist();
  } catch (err) {
    if (typeof showToast === 'function') showToast(`خطأ: ${err.message}`, 'error');
  }
}

/* =====================================================
   ROOM TYPES TAB
   ===================================================== */

async function loadSettingsRoomTypes() {
  const tbody = document.getElementById('st-room-types-list');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--dim);">جاري التحميل...</td></tr>`;

  // Provide hotel options for admins
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin' || !user.hotel_id;
  const filterSelect = document.getElementById('rt-admin-hotel-filter');
  
  if (isAdmin && filterSelect.options.length <= 1) {
    filterSelect.style.display = 'inline-block';
    try {
      const hotels = await apiRequest('/hotels');
      hotels.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h.id;
        opt.textContent = h.name;
        filterSelect.appendChild(opt);
      });
    } catch(e) {}
  }

  let endpoint = '/room-types';
  if (isAdmin && filterSelect && filterSelect.value) {
    endpoint += `?hotel_id=${filterSelect.value}`;
  }

  try {
    const types = await apiRequest(endpoint);
    if (!types || types.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--dim);">لا يوجد أنواع غرف مضافة. اضغط "➕ إضافة نوع" للبدء.</td></tr>`;
      return;
    }

    tbody.innerHTML = types.map(t => `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.04); transition:0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
        <td style="padding:12px 12px; font-weight:600;">${t.name}</td>
        <td style="padding:12px 12px; color:var(--gold); font-weight:bold;">${t.base_price.toLocaleString('ar-SA')} ر.س</td>
        <td style="padding:12px 12px;">${t.capacity} أشخاص</td>
        <td style="padding:12px 12px;">${t.area > 0 ? t.area + ' م²' : '—'}</td>
        <td style="padding:12px 12px; color:var(--dim);">${t.hotel_name || '—'}</td>
        <td style="padding:12px 12px;">
          <span style="padding:3px 10px; border-radius:20px; font-size:0.78rem; background:${t.is_active ? 'rgba(50,200,100,0.15)' : 'rgba(255,60,60,0.12)'}; color:${t.is_active ? '#4dcc80' : '#ff5555'};">
            ${t.is_active ? '✅ متاح' : '🔴 غير متاح'}
          </span>
        </td>
        <td style="padding:12px 12px;">
          <div style="display:flex; gap:6px;">
            <button class="btn bsm" style="background:rgba(200,160,0,0.15); color:var(--gold);" onclick='editRoomType(${JSON.stringify(t)})'>✏️</button>
            <button class="btn bsm" style="background:rgba(255,50,50,0.1); color:#ff5555;" onclick="deleteRoomType(${t.id}, '${t.name}')">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#ff5555;">⚠️ ${err.message}</td></tr>`;
  }
}

function openRoomTypeModal() {
  const modal = document.getElementById('modal-room-type');
  if (!modal) return;
  if (modal.parentNode !== document.body) document.body.appendChild(modal);
  modal.style.zIndex = '999999';
  modal.style.display = 'flex';
  modal.classList.add('show');
}

function closeRoomTypeModal() {
  const modal = document.getElementById('modal-room-type');
  if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }
}

function addRoomType() {
  document.getElementById('rt-id-hidden').value = '';
  document.getElementById('rt-name').value = '';
  document.getElementById('rt-base-price').value = '0';
  document.getElementById('rt-capacity').value = '2';
  document.getElementById('rt-area').value = '0';
  document.getElementById('rt-is-active').value = 'true';
  
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin' || !user.hotel_id;
  const hotelFg = document.getElementById('rt-hotel-fg');
  if (isAdmin) {
    hotelFg.style.display = 'block';
    const filterSelect = document.getElementById('rt-admin-hotel-filter');
    const hotelIdSelect = document.getElementById('rt-hotel-id');
    hotelIdSelect.innerHTML = filterSelect.innerHTML;
    // Remove "All hotels" option if it's there
    for (let i = 0; i < hotelIdSelect.options.length; i++) {
      if (hotelIdSelect.options[i].value === '') {
        hotelIdSelect.remove(i);
        break;
      }
    }
  } else {
    hotelFg.style.display = 'none';
  }
  
  document.getElementById('room-type-modal-title').textContent = '🛏️ إضافة نوع غرفة';
  openRoomTypeModal();
}

function editRoomType(t) {
  document.getElementById('rt-id-hidden').value = t.id;
  document.getElementById('rt-name').value = t.name;
  document.getElementById('rt-base-price').value = t.base_price;
  document.getElementById('rt-capacity').value = t.capacity;
  document.getElementById('rt-area').value = t.area;
  document.getElementById('rt-is-active').value = String(t.is_active);
  
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin' || !user.hotel_id;
  const hotelFg = document.getElementById('rt-hotel-fg');
  if (isAdmin) {
    hotelFg.style.display = 'block';
    const filterSelect = document.getElementById('rt-admin-hotel-filter');
    const hotelIdSelect = document.getElementById('rt-hotel-id');
    hotelIdSelect.innerHTML = filterSelect.innerHTML;
    for (let i = 0; i < hotelIdSelect.options.length; i++) {
      if (hotelIdSelect.options[i].value === '') {
        hotelIdSelect.remove(i);
        break;
      }
    }
    if (t.hotel_id) {
        hotelIdSelect.value = t.hotel_id;
    }
  } else {
    hotelFg.style.display = 'none';
  }

  document.getElementById('room-type-modal-title').textContent = '✏️ تعديل بيانات النوع';
  openRoomTypeModal();
}

async function saveRoomType() {
  const id        = document.getElementById('rt-id-hidden').value;
  const name      = document.getElementById('rt-name').value.trim();
  const basePrice = parseFloat(document.getElementById('rt-base-price').value) || 0;
  const capacity  = parseInt(document.getElementById('rt-capacity').value) || 2;
  const area      = parseFloat(document.getElementById('rt-area').value) || 0;
  const isActive  = document.getElementById('rt-is-active').value === 'true';

  if (!name) {
    if (typeof showToast === 'function') showToast('يرجى كتابة اسم النوع', 'warning');
    return;
  }
  
  const payload = { name, base_price: basePrice, capacity, area, is_active: isActive };
  
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin' || !user.hotel_id;
  
  let endpoint = id ? `/room-types/${id}` : '/room-types';
  if (isAdmin) {
    const hotelId = document.getElementById('rt-hotel-id').value;
    if (hotelId) {
       endpoint += `?hotel_id=${encodeURIComponent(hotelId)}`;
    } else {
       if (typeof showToast === 'function') showToast('يرجى اختيار الفندق', 'warning');
       return;
    }
  }

  try {
    const method = id ? 'PATCH' : 'POST';
    await apiRequest(endpoint, {
      method,
      body: JSON.stringify(payload)
    });
    if (typeof showToast === 'function') showToast(id ? 'تم التحديث بنجاح' : 'تم إضافة النوع بنجاح', 'success');
    closeRoomTypeModal();
    loadSettingsRoomTypes();
  } catch (err) {
    if (typeof showToast === 'function') showToast(`خطأ: ${err.message}`, 'error');
  }
}

async function deleteRoomType(id, name) {
  const confirmed = await fwOpenConfirmDialog({
    title: 'تأكيد الحذف',
    message: `هل أنت متأكد من حذف نوع الغرفة "${name}"؟`,
    type: 'danger'
  });
  if (!confirmed) return;

  try {
    await apiRequest(`/room-types/${id}`, { method: 'DELETE' });
    if (typeof showToast === 'function') showToast('تم الحذف بنجاح', 'success');
    loadSettingsRoomTypes();
  } catch (err) {
    if (typeof showToast === 'function') showToast(`فشل الحذف: ${err.message}`, 'error');
  }
}

async function exportRoomTypesExcel() {
  try {
    const types = await apiRequest('/room-types');
    if (!types || types.length === 0) {
      if (typeof showToast === 'function') showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }

    // Build CSV content (works as Excel)
    const headers = ['النوع', 'السعر الليلي (SAR)', 'الطاقة (أشخاص)', 'المساحة (م²)', 'الفندق', 'الحالة'];
    const rows = types.map(t => [
      t.name,
      t.base_price,
      t.capacity,
      t.area,
      t.hotel_name || '',
      t.is_active ? 'متاح' : 'غير متاح'
    ]);

    const csvContent = '\uFEFF' + [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `أنواع_الغرف_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();

    if (typeof showToast === 'function') showToast('تم تصدير الملف بنجاح', 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast(`خطأ في التصدير: ${err.message}`, 'error');
  }
}

/* =====================================================
   ACCOUNT SETTINGS (existing logic kept)
   ===================================================== */

async function saveAccountSettings() {
  const userEl = document.getElementById('st-username');
  const currentPassEl = document.getElementById('st-current-password');
  const newPassEl = document.getElementById('st-new-password');
  const confirmPassEl = document.getElementById('st-confirm-password');
  const msgEl = document.getElementById('st-account-msg');

  const currentUser = getStoredUser();
  if (!currentUser) return;

  const username = (userEl?.value || '').trim();
  const current_password = (currentPassEl?.value || '').trim();
  const new_password = (newPassEl?.value || '').trim();
  const confirm_password = (confirmPassEl?.value || '').trim();

  if (new_password && new_password !== confirm_password) {
    if (typeof showToast === 'function') showToast('تأكيد كلمة المرور غير مطابق', 'warning');
    return;
  }

  const payload = {};
  if (username && username !== (currentUser.username || '')) payload.username = username;
  if (new_password) payload.new_password = new_password;
  if (payload.username || payload.new_password) payload.current_password = current_password;

  if (!Object.keys(payload).length) {
    if (typeof showToast === 'function') showToast('لا توجد تغييرات للحفظ', 'warning');
    return;
  }

  try {
    const user = await apiRequest('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) });
    if (!user) return;
    saveAuth(getToken(), user);
    const rd = ROLES[user.role] || { icon: '👤', label: user.role || '—' };
    const ucRole = document.getElementById('uc-role');
    const ucName = document.getElementById('uc-name');
    if (ucRole) ucRole.textContent = `${rd.icon} ${rd.label}`;
    if (ucName) ucName.textContent = user.full_name || '—';
    if (currentPassEl) currentPassEl.value = '';
    if (newPassEl) newPassEl.value = '';
    if (confirmPassEl) confirmPassEl.value = '';
    if (msgEl) msgEl.textContent = 'تم تحديث بيانات الحساب بنجاح';
    if (typeof showToast === 'function') showToast('تم تحديث بيانات الحساب', 'success');
  } catch (err) {
    if (msgEl) msgEl.textContent = `تعذر التحديث: ${err.message}`;
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

/* =====================================================
   NOTIFICATION / BADGE SETTINGS
   ===================================================== */

function restartBadgeTimer() {
  if (__badgeRefreshTimer) { clearInterval(__badgeRefreshTimer); __badgeRefreshTimer = null; }
  const st = getSettings();
  if (!st.enableBadges) return;
  const ms = Math.max(15, Number(st.badgeIntervalSec || 45)) * 1000;
  __badgeRefreshTimer = setInterval(() => { if (typeof refreshNavBadges === 'function') refreshNavBadges(); }, ms);
}

function saveSettings() {
  const enableEl = document.getElementById('st-enable-badges');
  const intervalEl = document.getElementById('st-badge-interval');
  const msgEl = document.getElementById('st-save-msg');

  const next = {
    enableBadges: (enableEl?.value || 'on') === 'on',
    badgeIntervalSec: Math.max(15, Number(intervalEl?.value || 45)),
  };

  persistSettings(next);
  applyUiSettings();
  restartBadgeTimer();
  if (typeof refreshNavBadges === 'function') refreshNavBadges();
  if (msgEl) msgEl.textContent = 'تم حفظ الإعدادات بنجاح';
  if (typeof showToast === 'function') showToast('تم حفظ الإعدادات', 'success');
}

function resetSettings() {
  persistSettings({ ...DEFAULT_SETTINGS });
  applyUiSettings();
  restartBadgeTimer();
  renderSettingsPage();
  syncNotificationFields();
  if (typeof refreshNavBadges === 'function') refreshNavBadges();
  if (typeof showToast === 'function') showToast('تمت إعادة الإعدادات الافتراضية', 'success');
}

function exportSystemInfo() {
  const user = getStoredUser();
  const info = JSON.stringify({ user: user?.full_name, role: user?.role, hotel: user?.hotel_id, timestamp: new Date().toISOString() }, null, 2);
  const blob = new Blob([info], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rahati-system-info-${Date.now()}.json`;
  a.click();
}

// Apply settings early on load.
applyUiSettings();

/* =====================================================
   SHIFTS TAB
   ===================================================== */

async function loadSettingsShifts() {
  const listEl = document.getElementById('st-shifts-list');
  if (!listEl) return;
  listEl.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px;" class="dim">جاري التحميل...</td></tr>';

  try {
    const shifts = await apiRequest('/shifts');
    if (!shifts || shifts.length === 0) {
      listEl.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px;" class="dim">لا توجد ورديات مسجلة</td></tr>';
      return;
    }

    listEl.innerHTML = shifts.map(s => {
      const rolesText = (s.roles === 'all') ? 'الكل' : s.roles.split(',').map(r => ROLES[r]?.label || r).join('، ');
      const startAmPm = formatTimeDisplay(s.start_time);
      const endAmPm = formatTimeDisplay(s.end_time);
      
      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
          <td style="padding:14px 12px; font-weight:bold;">${s.name}</td>
          <td style="padding:14px 12px; text-align:center; color:var(--gold);">${startAmPm}</td>
          <td style="padding:14px 12px; text-align:center; color:var(--gold);">${endAmPm}</td>
          <td style="padding:14px 12px; text-align:center;"><span class="badge b-blue">${rolesText}</span></td>
          <td style="padding:14px 12px; text-align:center;">
             <div style="display:flex; justify-content:center; gap:8px;">
               <button class="btn bsm bg" style="padding:5px 8px;" onclick="openAddShiftModal(${s.id})">✏️</button>
               <button class="btn bsm br" style="padding:5px 8px;" onclick="deleteShiftSettings(${s.id},'${s.name.replace(/'/g,"\\'")}')">🗑️</button>
             </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--red); padding:30px;">⚠️ خطأ: ${err.message}</td></tr>`;
  }
}

function formatTimeDisplay(timeStr) {
  if (!timeStr) return '--:--';
  const [h, m] = timeStr.split(':');
  const hourNum = parseInt(h);
  const amPm = hourNum >= 12 ? 'م' : 'ص';
  const displayHour = (hourNum % 12) || 12;
  return `${String(displayHour).padStart(2, '0')}:${m} ${amPm}`;
}

async function openAddShiftModal(shiftId = null) {
  try {
    const modal = document.getElementById('modal-shift');
    if (!modal) {
      alert("لم يتم العثور على عنصر النافذة (modal-shift) في الصفحة!");
      return;
    }
    
    // Force move to body to break out of any restricted layout containers
    if (modal.parentNode !== document.body) {
      document.body.appendChild(modal);
    }

    const title = document.getElementById('shift-modal-title');
    const idHidden = document.getElementById('shift-id-hidden');
    
    const select = document.getElementById('shift-name-select');
    const custom = document.getElementById('shift-name-custom');
    
    // Clear fields
    select.value = 'صباحية';
    custom.value = '';
    custom.style.display = 'none';
    
    document.getElementById('shift-start').value = '08:00';
    document.getElementById('shift-end').value = '16:00';
    
    idHidden.value = shiftId || '';
    title.textContent = shiftId ? '⏰ تعديل وردية عمـل' : '⏰ إضافة وردية جديدة';
    
    // Roles checkboxes
    populateShiftRolesChecks();
    
    if (shiftId) {
      const shifts = await apiRequest('/shifts');
      const s = shifts.find(x => x.id === shiftId);
      if (s) {
        
        const predefined = Array.from(select.options).map(opt => opt.value);
        if (predefined.includes(s.name) && s.name !== 'custom') {
          select.value = s.name;
          custom.style.display = 'none';
          custom.value = '';
        } else {
          select.value = 'custom';
          custom.style.display = 'block';
          custom.value = s.name;
        }

        document.getElementById('shift-start').value = s.start_time;
        document.getElementById('shift-end').value = s.end_time;
        const selectedRoles = (s.roles === 'all') ? [] : s.roles.split(',');
        document.querySelectorAll('.st-shift-role-cb').forEach(cb => {
          cb.checked = (s.roles === 'all') ? true : selectedRoles.includes(cb.value);
        });
      }
    }
    
    if (modal) {
      modal.style.zIndex = '999999';
      modal.style.display = 'flex';
      modal.classList.add('show');
    } else {
      alert("لم يتم العثور على عنصر النافذة (modal-shift) في الصفحة!");
    }
  } catch (error) {
    alert("خطأ برمجي: " + error.message);
  }
}


function closeShiftModal() {
  const modal = document.getElementById('modal-shift');
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
  }
}

function populateShiftRolesChecks() {
  const container = document.getElementById('shift-roles-checks');
  if (!container) return;
  
  let html = '';
  for (const [key, rd] of Object.entries(ROLES)) {
    html += `
      <label style="display:flex; align-items:center; gap:10px; font-size:0.9rem; cursor:pointer; background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.05); transition:0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
        <input type="checkbox" value="${key}" class="st-shift-role-cb" style="width:18px; height:18px; accent-color:var(--gold); cursor:pointer;">
        <span>${rd.icon} ${rd.label}</span>
      </label>
    `;
  }
  container.innerHTML = html;
}

async function saveShift() {
  const shiftId = document.getElementById('shift-id-hidden').value;
  const selVal = document.getElementById('shift-name-select').value;
  let name = selVal;
  if (selVal === 'custom') {
    name = document.getElementById('shift-name-custom').value.trim();
  }
  
  const start = document.getElementById('shift-start').value;
  const end = document.getElementById('shift-end').value;
  
  const checkedRoles = Array.from(document.querySelectorAll('.st-shift-role-cb:checked')).map(cb => cb.value);
  const totalRoles = Object.keys(ROLES).length;
  
  let rolesVal = 'all';
  if (checkedRoles.length > 0 && checkedRoles.length < totalRoles) {
    rolesVal = checkedRoles.join(',');
  } else if (checkedRoles.length === 0) {
    if (typeof showToast === 'function') showToast('يرجى اختيار دور واحد على الأقل أو "الكل"', 'warning');
    return;
  }
  
  if (!name || !start || !end) {
    if (typeof showToast === 'function') showToast('يرجى تعبئة كافة الحقول', 'warning');
    return;
  }
  
  const payload = { name, start_time: start, end_time: end, roles: rolesVal };
  
  try {
    const url = shiftId ? `/shifts/${shiftId}` : '/shifts';
    const method = shiftId ? 'PATCH' : 'POST';
    
    await apiRequest(url, { method, body: JSON.stringify(payload) });
    if (typeof showToast === 'function') showToast(shiftId ? 'تم تحديث الوردية' : 'تم إضافة الوردية بنجاح', 'success');
    closeShiftModal();
    loadSettingsShifts();
  } catch (err) {
    if (typeof showToast === 'function') showToast(`خطأ: ${err.message}`, 'error');
  }
}

async function deleteShiftSettings(id, name) {
  const confirmed = await fwOpenConfirmDialog({
    title: 'تأكيد الحذف',
    message: `هل أنت متأكد من حذف وردية "${name}"؟`,
    confirmLabel: 'نعم، احذف',
    confirmClass: 'br'
  });
  if (!confirmed) return;
  
  try {
    await apiRequest(`/shifts/${id}`, { method: 'DELETE' });
    if (typeof showToast === 'function') showToast('تم حذف الوردية', 'success');
    loadSettingsShifts();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

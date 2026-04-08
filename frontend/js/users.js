/* ==========================================
   راحتي — Users Management Logic
   ========================================== */

let usersCache = [];
let editingUserId = null;
let usersCurrentPage = 1;
let usersPageSize = 20;
let usersHotelSelection = '';

function normalize(v) {
  return (v || '').toString().trim().toLowerCase();
}

function activeBadge(isActive) {
  return isActive === false
    ? '<span class="badge b-red">موقوف</span>'
    : '<span class="badge b-green">نشط</span>';
}

function getUserHotelName(u) {
  return u.hotel ? u.hotel.name : (u.hotel_id ? `فندق ${u.hotel_id}` : 'جميع الفنادق');
}

function fillUsersHotelFilter(hotels, preferredHotelId) {
  const hotelFilter = document.getElementById('users-hotel-filter');
  if (!hotelFilter) return;

  const current = usersHotelSelection || hotelFilter.value || '';
  hotelFilter.innerHTML = '';

  const list = [...(hotels || [])].sort((a, b) => (a.name || '').localeCompare((b.name || ''), 'ar'));
  if (!list.length) {
    hotelFilter.innerHTML = '<option value="">لا توجد فنادق</option>';
    usersHotelSelection = '';
    return;
  }

  list.forEach((h) => {
    const op = document.createElement('option');
    op.value = String(h.id);
    op.textContent = h.name;
    hotelFilter.appendChild(op);
  });

  const target = String(preferredHotelId || current || list[0].id);
  hotelFilter.value = Array.from(hotelFilter.options).some((o) => o.value === target)
    ? target
    : String(list[0].id);
  usersHotelSelection = hotelFilter.value;
}

function renderUsersTable() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  const q = normalize(document.getElementById('users-search')?.value);
  const roleFilter = document.getElementById('users-role-filter')?.value || 'all';
  const hotelFilter = document.getElementById('users-hotel-filter')?.value || 'all';
  const activeFilter = document.getElementById('users-active-filter')?.value || 'all';
  const sortMode = document.getElementById('users-sort')?.value || 'name_asc';
  const pageInfoEl = document.getElementById('users-page-info');
  const prevBtn = document.getElementById('users-prev-btn');
  const nextBtn = document.getElementById('users-next-btn');

  let rows = [...usersCache];

  if (q) {
    rows = rows.filter((u) => {
      return normalize(u.full_name).includes(q) || normalize(u.username).includes(q);
    });
  }

  if (roleFilter !== 'all') {
    rows = rows.filter((u) => (u.role || '') === roleFilter);
  }

  if (hotelFilter !== 'all') {
    rows = rows.filter((u) => String(u.hotel_id || '') === hotelFilter);
  }

  if (activeFilter !== 'all') {
    const wantActive = activeFilter === 'active';
    rows = rows.filter((u) => (u.is_active !== false) === wantActive);
  }

  const byName = (a, b) => (a.full_name || '').localeCompare((b.full_name || ''), 'ar');
  const byRole = (a, b) => roleLabel(a.role || '').localeCompare(roleLabel(b.role || ''), 'ar');
  const byHotel = (a, b) => getUserHotelName(a).localeCompare(getUserHotelName(b), 'ar');
  const byStatus = (a, b) => {
    const aScore = a.is_active === false ? 1 : 0;
    const bScore = b.is_active === false ? 1 : 0;
    if (aScore !== bScore) return aScore - bScore;
    return byName(a, b);
  };

  if (sortMode === 'name_desc') {
    rows.sort((a, b) => byName(b, a));
  } else if (sortMode === 'role') {
    rows.sort((a, b) => {
      const cmp = byRole(a, b);
      return cmp !== 0 ? cmp : byName(a, b);
    });
  } else if (sortMode === 'hotel') {
    rows.sort((a, b) => {
      const cmp = byHotel(a, b);
      return cmp !== 0 ? cmp : byName(a, b);
    });
  } else if (sortMode === 'status') {
    rows.sort(byStatus);
  } else {
    rows.sort(byName);
  }

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--dim)">لا توجد نتائج مطابقة</td></tr>';
    if (pageInfoEl) pageInfoEl.textContent = '0 نتيجة';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / usersPageSize));
  if (usersCurrentPage > totalPages) usersCurrentPage = totalPages;
  if (usersCurrentPage < 1) usersCurrentPage = 1;

  const start = (usersCurrentPage - 1) * usersPageSize;
  const end = start + usersPageSize;
  const pagedRows = rows.slice(start, end);

  if (pageInfoEl) {
    pageInfoEl.textContent = `عرض ${start + 1}-${Math.min(end, totalRows)} من ${totalRows} (صفحة ${usersCurrentPage}/${totalPages})`;
  }
  if (prevBtn) prevBtn.disabled = usersCurrentPage <= 1;
  if (nextBtn) nextBtn.disabled = usersCurrentPage >= totalPages;

  tbody.innerHTML = '';
  pagedRows.forEach((u) => {
    const rd = ROLES[u.role] || { icon: '👤', label: u.role || '-' };
    const hotelName = getUserHotelName(u);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${u.full_name}</strong></td>
      <td dir="ltr" style="text-align:right" class="dim">${u.username}</td>
      <td><span class="badge" style="background:var(--dark3);color:var(--gold)">${rd.icon} ${rd.label}</span></td>
      <td class="dim" style="font-size:.85rem">${hotelName}</td>
      <td>${activeBadge(u.is_active)}</td>
      <td>
        <div class="ep-actions-row">
          <button class="btn br bsm" title="إنذار" onclick="openWarningModal(${u.id})">⚠️</button>
          <button class="btn bo bsm" title="محادثة" onclick="openEmployeeProfile(${u.id});setTimeout(()=>switchProfileTab('profile-tab-conversations'),200)">💬</button>
          <button class="btn bg bsm" title="عرض" onclick="openEmployeeProfile(${u.id})">👁️ عرض</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function onUsersFilterChanged() {
  const hotelFilter = document.getElementById('users-hotel-filter');
  const selectedHotel = hotelFilter?.value || '';
  if (typeof activeAdminHotelFilter !== 'undefined' && selectedHotel) {
    activeAdminHotelFilter = String(selectedHotel);
  }
  if (selectedHotel && selectedHotel !== usersHotelSelection) {
    usersHotelSelection = selectedHotel;
    usersCurrentPage = 1;
    if (typeof loadDashboardOverview === 'function') loadDashboardOverview();
    if (typeof loadAdminReportsData === 'function') loadAdminReportsData();
    loadUsers();
    return;
  }
  usersCurrentPage = 1;
  renderUsersTable();
}

function onUsersPageSizeChanged() {
  const size = parseInt(document.getElementById('users-page-size')?.value || '20', 10);
  usersPageSize = Number.isNaN(size) ? 20 : Math.max(1, size);
  usersCurrentPage = 1;
  renderUsersTable();
}

function previousUsersPage() {
  if (usersCurrentPage <= 1) return;
  usersCurrentPage -= 1;
  renderUsersTable();
}

function nextUsersPage() {
  usersCurrentPage += 1;
  renderUsersTable();
}

function roleLabel(role) {
  if (role === 'admin') return 'إدارة';
  if (role === 'supervisor') return 'مشرف';
  if (role === 'superfv') return 'سوبر فايزر';
  if (role === 'cleaner') return 'عامل نظافة';
  if (role === 'maintenance') return 'فني صيانة';
  if (role === 'reception') return 'استقبال';
  if (role === 'accountant') return 'محاسب';
  if (role === 'warehouse_manager') return 'مسؤول مستودع';
  return role;
}

/**
 * Fetch users and build the management table
 */
async function loadUsers() {
  try {
    const user = getStoredUser();
    if (!user) return;

    const hotelFilterEl = document.getElementById('users-hotel-filter');
    const selectedFromUI = hotelFilterEl?.value || '';

    const hotels = await apiRequest('/hotels');
    if (!hotels || hotels.length === 0) {
      usersCache = [];
      renderUsersTable();
      return;
    }

    let allowedHotels = hotels;
    if (user.role === 'supervisor') {
      allowedHotels = hotels.filter((h) => Number(h.id) === Number(user.hotel_id));
    }

    const preferredHotelId = (typeof activeAdminHotelFilter !== 'undefined' && activeAdminHotelFilter ? String(activeAdminHotelFilter) : '')
      || selectedFromUI
      || usersHotelSelection
      || (user.role === 'supervisor' ? String(user.hotel_id || '') : '')
      || (allowedHotels[0] ? String(allowedHotels[0].id) : '');

    fillUsersHotelFilter(allowedHotels, preferredHotelId);

    const selectedHotel = document.getElementById('users-hotel-filter')?.value || '';
    if (!selectedHotel) {
      usersCache = [];
      renderUsersTable();
      return;
    }

    const hotelQuery = (selectedHotel && selectedHotel !== 'all') ? `&hotel_id=${encodeURIComponent(selectedHotel)}` : '';
    const users = await apiRequest(`/auth/users?include_inactive=true${hotelQuery}`);
    if (!users) return;

    usersCache = users;
    usersCurrentPage = 1;
    usersHotelSelection = selectedHotel;
    if (typeof activeAdminHotelFilter !== 'undefined' && selectedHotel) {
      activeAdminHotelFilter = String(selectedHotel);
    }
    renderUsersTable();
  } catch (err) {
    console.error('Failed to load users:', err);
    const tbody = document.getElementById('users-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--red)">تعذر تحميل الموظفين: ${err.message}</td></tr>`;
    }
  }
}

async function openEditUserModal(userId) {
  const row = usersCache.find((u) => u.id === userId);
  if (!row) {
    if (typeof showToast === 'function') showToast('لم يتم العثور على المستخدم', 'error');
    return;
  }

  editingUserId = userId;
  const errDiv = document.getElementById('eu-error');
  if (errDiv) errDiv.classList.remove('show');

  const nameEl = document.getElementById('eu-fullname');
  const userEl = document.getElementById('eu-username');
  const roleEl = document.getElementById('eu-role');
  const hotelEl = document.getElementById('eu-hotel');
  const activeEl = document.getElementById('eu-active');

  if (nameEl) nameEl.value = row.full_name || '';
  if (userEl) userEl.value = row.username || '';
  if (roleEl) roleEl.value = row.role || 'reception';
  if (activeEl) activeEl.value = row.is_active === false ? 'inactive' : 'active';
  
  const extras = ['national-id', 'email', 'phone', 'contract-type', 'hiring-date', 'nationality', 'basic-salary'];
  const keys = ['national_id', 'email', 'phone_number', 'contract_type', 'hiring_date', 'nationality', 'basic_salary'];
  extras.forEach((id, i) => {
    const el = document.getElementById(`eu-${id}`);
    if (el) el.value = row[keys[i]] || '';
  });

  if (hotelEl) {
    hotelEl.innerHTML = '<option value="">جاري تحميل الفنادق...</option>';
    hotelEl.disabled = true;
  }

  openModal('editUserModal');

  try {
    const hotels = await apiRequest('/hotels');
    if (!hotels || !hotelEl) return;

    hotelEl.innerHTML = '';
    if (currentRole === 'admin') {
      hotelEl.innerHTML = '<option value="">جميع الفنادق (إدارة فقط)</option>';
    }

    hotels.forEach((h) => {
      hotelEl.innerHTML += `<option value="${h.id}">${h.name}</option>`;
    });

    hotelEl.disabled = false;
    hotelEl.value = row.hotel_id ? String(row.hotel_id) : '';
  } catch (err) {
    if (hotelEl) {
      hotelEl.innerHTML = '<option value="">خطأ في تحميل الفنادق</option>';
    }
  }
}

async function submitUserEdit() {
  if (!editingUserId) return;

  const errDiv = document.getElementById('eu-error');
  if (errDiv) errDiv.classList.remove('show');

  const fullName = document.getElementById('eu-fullname')?.value.trim() || '';
  const role = document.getElementById('eu-role')?.value || '';
  const hotelRaw = document.getElementById('eu-hotel')?.value || '';
  const activeRaw = document.getElementById('eu-active')?.value || 'active';

  if (!fullName || !role) {
    if (errDiv) {
      errDiv.innerHTML = '⚠️ يرجى إدخال الاسم واختيار الدور';
      void errDiv.offsetWidth;
      errDiv.classList.add('show');
    }
    return;
  }

  const hotel_id = hotelRaw === '' ? null : parseInt(hotelRaw, 10);
  if (Number.isNaN(hotel_id)) {
    if (errDiv) {
      errDiv.innerHTML = '⚠️ رقم الفندق غير صحيح';
      void errDiv.offsetWidth;
      errDiv.classList.add('show');
    }
    return;
  }

  const payload = {
    full_name: fullName,
    role,
    hotel_id,
    is_active: activeRaw !== 'inactive',
    national_id: document.getElementById('eu-national-id')?.value.trim() || null,
    email: document.getElementById('eu-email')?.value.trim() || null,
    phone_number: document.getElementById('eu-phone')?.value.trim() || null,
    contract_type: document.getElementById('eu-contract-type')?.value || "دوام كامل",
    hiring_date: document.getElementById('eu-hiring-date')?.value || null,
    nationality: document.getElementById('eu-nationality')?.value.trim() || null,
    basic_salary: document.getElementById('eu-basic-salary')?.value ? parseFloat(document.getElementById('eu-basic-salary').value) : null,
  };

  const btn = document.getElementById('btn-edit-user');
  const oldTxt = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ جاري الحفظ...';
  }

  try {
    await apiRequest(`/auth/users/${editingUserId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    closeModal('editUserModal');
    editingUserId = null;
    if (typeof showToast === 'function') {
      showToast(`تم تحديث المستخدم (${roleLabel(payload.role)}) بنجاح`, 'success');
    }
    await loadUsers();
  } catch (err) {
    if (errDiv) {
      errDiv.innerHTML = `⚠️ ${err.message}`;
      void errDiv.offsetWidth;
      errDiv.classList.add('show');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldTxt;
    }
  }
}

/**
 * Open the Add User modal and load hotels list
 */
async function openAddUserModal() {
  document.getElementById('u-error').classList.remove('show');
  document.getElementById('u-fullname').value = '';
  document.getElementById('u-username').value = '';
  document.getElementById('u-password').value = '';
  
  const extras = ['national-id', 'email', 'phone', 'hiring-date', 'nationality', 'basic-salary'];
  extras.forEach(id => { const el = document.getElementById(`u-${id}`); if (el) el.value = ''; });
  const cEl = document.getElementById('u-contract-type');
  if (cEl) cEl.value = 'دوام كامل';

  const hotelSel = document.getElementById('u-hotel');
  hotelSel.innerHTML = '<option value="">جاري تحميل الفنادق...</option>';
  hotelSel.disabled = true;

  document.getElementById('addUserModal').classList.add('show');

  try {
    const hotels = await apiRequest('/hotels');
    if (hotels) {
      hotelSel.innerHTML = '';
      if (currentRole === 'admin') {
        hotelSel.innerHTML = '<option value="">جميع الفنادق (إدارة فقط)</option>';
      }
      
      hotels.forEach(h => {
        hotelSel.innerHTML += `<option value="${h.id}">${h.name}</option>`;
      });
      hotelSel.disabled = false;
    }
  } catch (err) {
    hotelSel.innerHTML = '<option value="">خطأ في تحميل الفنادق</option>';
  }
}

/**
 * Submit new user to API
 */
async function submitNewUser() {
  const errDiv = document.getElementById('u-error');
  errDiv.classList.remove('show');

  const fullname = document.getElementById('u-fullname').value.trim();
  const username = document.getElementById('u-username').value.trim();
  const password = document.getElementById('u-password').value.trim();
  const role = document.getElementById('u-role').value;
  const hotel_id = document.getElementById('u-hotel').value;

  if (!fullname || !username || !password) {
    errDiv.innerHTML = `⚠️ يرجى تعبئة جميع الحقول الأساسية`;
    void errDiv.offsetWidth;
    errDiv.classList.add('show');
    return;
  }

  const btn = document.getElementById('btn-add-user');
  const oldTxt = btn.textContent;
  btn.textContent = '⏳ جاري الإضافة...';
  btn.disabled = true;

  try {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        full_name: fullname,
        role,
        hotel_id: hotel_id ? parseInt(hotel_id) : null,
        national_id: document.getElementById('u-national-id')?.value.trim() || null,
        email: document.getElementById('u-email')?.value.trim() || null,
        phone_number: document.getElementById('u-phone')?.value.trim() || null,
        contract_type: document.getElementById('u-contract-type')?.value || "دوام كامل",
        hiring_date: document.getElementById('u-hiring-date')?.value || null,
        nationality: document.getElementById('u-nationality')?.value.trim() || null,
        basic_salary: document.getElementById('u-basic-salary')?.value ? parseFloat(document.getElementById('u-basic-salary').value) : null
      }),
    });

    if (data) {
      closeModal('addUserModal');
      loadUsers(); // Refresh table
    }
  } catch (err) {
    errDiv.innerHTML = `⚠️ ${err.message}`;
    void errDiv.offsetWidth;
    errDiv.classList.add('show');
  } finally {
    btn.textContent = oldTxt;
    btn.disabled = false;
  }
}

// User page load is handled from navigation.js (showPg).

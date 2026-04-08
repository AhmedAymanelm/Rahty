/* ==========================================
   راحتي — Dashboard Metrics
   ========================================== */

let activeAdminHotelFilter = 'all';
let adminHotelPillsLoaded = false;
let dashboardPriceControlsBound = false;
let adminHotelsCache = [];
let adminUsersCache = [];
let adminUsersLoaded = false;
let attendancePolicyControlsBound = false;

async function loadAdminHotelPills(force = false) {
  const pills = document.getElementById('admin-hotel-filter');
  if (!pills) return;

  const user = getStoredUser();
  if (!user || user.role !== 'admin') return;

  if (adminHotelPillsLoaded && !force) {
    pills.querySelectorAll('.hp').forEach((node) => {
      const hid = node.dataset.hotelId || '';
      node.classList.toggle('act', hid && hid === String(activeAdminHotelFilter || ''));
    });
    return;
  }

  try {
    const hotels = await apiRequest('/hotels');
    if (!hotels) return;
    adminHotelsCache = hotels;

    pills.innerHTML = '';

    const hasCurrent = hotels.some((h) => String(h.id) === String(activeAdminHotelFilter));
    if (!hasCurrent) {
      activeAdminHotelFilter = hotels.length ? String(hotels[0].id) : '';
    }

    hotels.forEach((h) => {
      const hp = document.createElement('div');
      const hid = String(h.id);
      hp.className = `hp ${activeAdminHotelFilter === hid ? 'act' : ''}`;
      hp.dataset.hotelId = hid;
      hp.textContent = h.name;
      hp.onclick = () => filterHotel(hp, hid);
      pills.appendChild(hp);
    });

    adminHotelPillsLoaded = true;
  } catch (_) {
    // Keep existing fallback pills if loading fails.
  }
}

function dashboardRoleLabel(role) {
  if (role === 'admin') return 'إدارة';
  if (role === 'supervisor') return 'مشرف';
  if (role === 'superfv') return 'سوبر فايزر';
  if (role === 'cleaner') return 'عامل نظافة';
  if (role === 'maintenance') return 'فني صيانة';
  if (role === 'reception') return 'استقبال';
  if (role === 'accountant') return 'محاسب';
  return role || '-';
}

function getDashboardHotelName(hotelId) {
  const id = Number(hotelId || 0);
  const row = adminHotelsCache.find((h) => Number(h.id) === id);
  return row ? row.name : `فندق ${id}`;
}

async function ensureAdminUsersCache(force = false) {
  const user = getStoredUser();
  if (!user || user.role !== 'admin') return;
  if (adminUsersLoaded && !force) return;

  const rows = await apiRequest('/auth/users?include_inactive=true');
  if (!rows) return;
  adminUsersCache = rows;
  adminUsersLoaded = true;
}

function renderAdminHotelStaffList() {
  const listEl = document.getElementById('ad-hotel-staff-list');
  const metaEl = document.getElementById('ad-staff-meta');
  if (!listEl || !metaEl) return;

  const hotelScoped = adminUsersCache.filter((u) => Number(u.hotel_id || 0) > 0);
  if (hotelScoped.length === 0) {
    metaEl.textContent = 'لا توجد بيانات موظفين مرتبطة بالفنادق حاليًا.';
    listEl.innerHTML = '';
    return;
  }

  const group = new Map();
  hotelScoped.forEach((u) => {
    const key = String(u.hotel_id);
    if (!group.has(key)) group.set(key, []);
    group.get(key).push(u);
  });

  const renderGroup = (hotelId, users) => {
    const hotelName = getDashboardHotelName(hotelId);
    const chips = users
      .sort((a, b) => (a.full_name || '').localeCompare((b.full_name || ''), 'ar'))
      .map((u) => `<span class="ad-staff-chip">${u.full_name || '-'} <small>(${dashboardRoleLabel(u.role)})</small></span>`)
      .join('');

    return `
      <div class="ad-staff-hotel">
        <div class="ad-staff-hotel-head">
          <span>${hotelName}</span>
          <span class="badge">${users.length} موظف</span>
        </div>
        <div class="ad-staff-chips">${chips || '<span class="dim">لا يوجد موظفون</span>'}</div>
      </div>
    `;
  };

  if (!activeAdminHotelFilter) {
    metaEl.textContent = 'اختر فندقًا من القائمة لعرض الموظفين.';
    listEl.innerHTML = '';
    return;
  }

  const selected = group.get(String(activeAdminHotelFilter)) || [];
  const hotelName = getDashboardHotelName(activeAdminHotelFilter);
  metaEl.textContent = `عرض موظفي ${hotelName} فقط.`;
  listEl.innerHTML = renderGroup(activeAdminHotelFilter, selected);
}

function formatAvgMinutes(minutes) {
  if (minutes === null || minutes === undefined) return 'لا يوجد';
  return `${minutes} د`;
}

function uptimeBadgeClass(percent) {
  if (percent >= 90) return 'b-green';
  if (percent >= 75) return 'b-gold';
  if (percent >= 60) return 'b-orange';
  return 'b-red';
}

function uptimeLabel(percent) {
  if (percent >= 90) return 'ممتاز';
  if (percent >= 75) return 'جيد';
  if (percent >= 60) return 'متوسط';
  return 'يحتاج متابعة';
}

function renderAdminDashboardMetrics(overview) {
  const total = document.getElementById('ad-fault-total');
  const open = document.getElementById('ad-fault-open');
  const readyRooms = document.getElementById('ad-ready-rooms');
  const uptime = document.getElementById('ad-uptime');
  const fastestTech = document.getElementById('ad-fast-tech');
  const slowestHotel = document.getElementById('ad-slowest-hotel');
  const hotelsBody = document.getElementById('ad-hotels-body');

  if (total) total.textContent = overview.faults.total;
  if (open) open.textContent = overview.faults.open;
  if (readyRooms) readyRooms.textContent = overview.rooms_uptime.ready_rooms;
  if (uptime) uptime.textContent = `${overview.rooms_uptime.uptime_percent}%`;

  if (fastestTech) {
    if (overview.fastest_technician) {
      fastestTech.textContent = overview.fastest_technician.full_name;
      fastestTech.title = `متوسط الإصلاح: ${formatAvgMinutes(overview.fastest_technician.avg_repair_minutes)}`;
    } else {
      fastestTech.textContent = 'لا يوجد بعد';
      fastestTech.title = 'لا توجد بلاغات صيانة مكتملة كفاية لحساب أسرع فني';
    }
  }

  if (slowestHotel) {
    if (overview.slowest_hotel) {
      slowestHotel.textContent = overview.slowest_hotel.hotel_name;
      slowestHotel.title = `متوسط الإصلاح: ${formatAvgMinutes(overview.slowest_hotel.avg_repair_minutes)}`;
    } else {
      slowestHotel.textContent = 'لا يوجد بعد';
      slowestHotel.title = 'لا توجد بلاغات صيانة مكتملة كفاية لحساب أبطأ فندق';
    }
  }

  if (!hotelsBody) return;

  const rows = overview.hotels_uptime || [];
  if (rows.length === 0) {
    hotelsBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim)">لا توجد بيانات فنادق</td></tr>';
    return;
  }

  hotelsBody.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const badgeClass = uptimeBadgeClass(row.uptime_percent);
    const statusLabel = uptimeLabel(row.uptime_percent);

    tr.innerHTML = `
      <td>${row.hotel_name || '-'}</td>
      <td>${row.ready_rooms}</td>
      <td>${row.total_rooms}</td>
      <td>${row.uptime_percent}%</td>
      <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
    `;
    hotelsBody.appendChild(tr);
  });
}

function renderSupervisorDashboardMetrics(overview) {
  const open = document.getElementById('sup-fault-open');
  const waitingParts = document.getElementById('sup-waiting-parts');
  const readyRooms = document.getElementById('sup-ready-rooms');
  const uptime = document.getElementById('sup-uptime');
  const note = document.getElementById('sup-kpi-note');

  if (open) open.textContent = overview.faults.open;
  if (waitingParts) waitingParts.textContent = overview.faults.waiting_parts;
  if (readyRooms) readyRooms.textContent = overview.rooms_uptime.ready_rooms;
  if (uptime) uptime.textContent = `${overview.rooms_uptime.uptime_percent}%`;
  if (!note) return;

  const fastest = overview.fastest_technician
    ? `${overview.fastest_technician.full_name} (${formatAvgMinutes(overview.fastest_technician.avg_repair_minutes)})`
    : 'لا يوجد';

  note.innerHTML = `
    أسرع فني: <strong>${fastest}</strong>
    <br>
    البلاغات المُغلقة: <strong>${overview.faults.verified}</strong>
  `;
}

function dashboardPriceMetaText(row) {
  if (!row) return 'لا توجد بيانات حالياً';
  if (!row.updated_at) return 'قيمة افتراضية';
  return `آخر تحديث: ${new Date(row.updated_at).toLocaleString('ar-SA')}`;
}

async function loadDashboardOurPrice(panelType) {
  const user = getStoredUser();
  if (!user) return;

  const isAdminPanel = panelType === 'admin';
  const typeEl = document.getElementById(isAdminPanel ? 'ad-price-room-type' : 'sup-price-room-type');
  const valueEl = document.getElementById(isAdminPanel ? 'ad-price-value' : 'sup-price-value');
  const metaEl = document.getElementById(isAdminPanel ? 'ad-price-meta' : 'sup-price-meta');
  if (!typeEl || !valueEl || !metaEl) return;

  const params = new URLSearchParams({ room_type: typeEl.value || 'غرفة عادية' });
  if (isAdminPanel) {
    const hotelId = (activeAdminHotelFilter && activeAdminHotelFilter !== 'all')
      ? activeAdminHotelFilter
      : '';
    if (!hotelId) {
      valueEl.value = '';
      metaEl.textContent = 'اختر فندقًا من الفلاتر أعلى الصفحة لتحميل/تعديل السعر.';
      return;
    }
    params.set('hotel_id', hotelId);
  }

  try {
    const row = await apiRequest(`/finance/our-price?${params.toString()}`);
    if (!row) return;

    valueEl.value = Number(row.price || 0);
    metaEl.textContent = dashboardPriceMetaText(row);
  } catch (err) {
    metaEl.textContent = `تعذر تحميل السعر: ${err.message}`;
  }
}

async function saveDashboardOurPrice(panelType) {
  const user = getStoredUser();
  if (!user) return;

  const isAdminPanel = panelType === 'admin';
  const typeEl = document.getElementById(isAdminPanel ? 'ad-price-room-type' : 'sup-price-room-type');
  const valueEl = document.getElementById(isAdminPanel ? 'ad-price-value' : 'sup-price-value');
  const metaEl = document.getElementById(isAdminPanel ? 'ad-price-meta' : 'sup-price-meta');
  const btn = document.getElementById(isAdminPanel ? 'ad-price-save-btn' : 'sup-price-save-btn');
  if (!typeEl || !valueEl || !metaEl) return;

  const priceValue = Number(valueEl.value || 0);
  if (!Number.isFinite(priceValue) || priceValue <= 0) {
    if (typeof showToast === 'function') showToast('أدخل سعرًا صحيحًا أكبر من صفر', 'warning');
    return;
  }

  const payload = {
    room_type: typeEl.value || 'غرفة عادية',
    price: priceValue,
  };

  if (isAdminPanel) {
    const hotelId = (activeAdminHotelFilter && activeAdminHotelFilter !== 'all')
      ? Number(activeAdminHotelFilter)
      : null;
    if (!hotelId) {
      if (typeof showToast === 'function') showToast('اختر فندقًا أولاً من الفلاتر أعلى الصفحة', 'warning');
      return;
    }
    payload.hotel_id = hotelId;
  }

  const oldText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ جاري الحفظ...';
  }

  try {
    const row = await apiRequest('/finance/our-price', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!row) return;

    metaEl.textContent = dashboardPriceMetaText(row);
    if (typeof showToast === 'function') showToast('تم حفظ السعر المرجعي بنجاح', 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText || '💾 حفظ السعر';
    }
  }
}

async function initDashboardPriceControls() {
  const user = getStoredUser();
  if (!user) return;

  const adminPanel = document.getElementById('ad-room-price-panel');
  const supPanel = document.getElementById('sup-room-price-panel');

  if (adminPanel) adminPanel.style.display = user.role === 'admin' ? 'block' : 'none';
  if (supPanel) supPanel.style.display = ['supervisor', 'superfv'].includes(user.role) ? 'block' : 'none';

  if (!dashboardPriceControlsBound) {
    const adType = document.getElementById('ad-price-room-type');
    if (adType) adType.addEventListener('change', () => loadDashboardOurPrice('admin'));

    const supType = document.getElementById('sup-price-room-type');
    if (supType) supType.addEventListener('change', () => loadDashboardOurPrice('supervisor'));

    dashboardPriceControlsBound = true;
  }

  if (user.role === 'admin') {
    await loadDashboardOurPrice('admin');
  }
  if (['supervisor', 'superfv'].includes(user.role)) {
    await loadDashboardOurPrice('supervisor');
  }
}

function attendanceRoleLabel(role) {
  if (role === 'cleaner') return '🧹 نظافة';
  if (role === 'maintenance') return '🔧 صيانة';
  if (role === 'reception') return '🛎️ استقبال';
  if (role === 'supervisor') return '🏢 مشرف';
  if (role === 'superfv') return '🎯 سوبر فايزر';
  if (role === 'accountant') return '💼 محاسب';
  if (role === 'admin') return '👑 إدارة';
  return role || '-';
}

function attendanceLocationLabel(status) {
  if (status === 'in_range') return '📍 داخل النطاق';
  if (status === 'out_of_range') return '⚠️ خارج النطاق';
  return 'غير متاح';
}

function attendanceBadge(status, lateMinutes) {
  if (status === 'present') return '<span class="badge b-green">حاضر</span>';
  if (status === 'left_area') return '<span class="badge b-red">غادر النطاق</span>';
  if (status === 'checked_out') return '<span class="badge b-blue">أنهى الدوام</span>';
  if (status === 'late') {
    const h = Math.floor((lateMinutes || 0) / 60);
    const m = (lateMinutes || 0) % 60;
    const txt = h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m} دقيقة`;
    return `<span class="badge b-orange">تأخر ${txt}</span>`;
  }
  if (status === 'not_started') return '<span class="badge">لم يبدأ الدوام</span>';
  if (status === 'absent') return '<span class="badge b-red">غائب</span>';
  return '<span class="badge b-red">غائب</span>';
}

function attendanceWarningLabel(row) {
  if (!row) return '—';
  if (row.warning_text) return `⚠️ ${row.warning_text}`;
  if ((row.early_checkout_minutes || 0) > 0) return `أنهى مبكرًا (${row.early_checkout_minutes} دقيقة)`;
  return '—';
}

async function loadAttendancePolicy(panelType) {
  const user = getStoredUser();
  if (!user) return;

  const isAdminPanel = panelType === 'admin';
  const startEl = document.getElementById(isAdminPanel ? 'ad-att-start' : 'sup-att-start');
  const endEl = document.getElementById(isAdminPanel ? 'ad-att-end' : 'sup-att-end');
  const shiftEndEl = document.getElementById(isAdminPanel ? 'ad-att-shift-end' : 'sup-att-shift-end');
  const exportModeEl = document.getElementById(isAdminPanel ? 'ad-att-export-mode' : 'sup-att-export-mode');
  const metaEl = document.getElementById(isAdminPanel ? 'ad-att-policy-meta' : 'sup-att-policy-meta');
  if (!startEl || !endEl || !shiftEndEl || !exportModeEl || !metaEl) return;

  let endpoint = '/dashboard/attendance/policy';
  if (isAdminPanel) {
    const hotelId = activeAdminHotelFilter && activeAdminHotelFilter !== 'all' ? String(activeAdminHotelFilter) : '';
    if (!hotelId) {
      metaEl.textContent = 'اختر فندقًا أولًا لتحميل سياسة الحضور.';
      return;
    }
    endpoint += `?hotel_id=${encodeURIComponent(hotelId)}`;
  }

  try {
    const row = await apiRequest(endpoint);
    if (!row) return;
    startEl.value = row.checkin_start || '07:00';
    endEl.value = row.checkin_end || '10:00';
    shiftEndEl.value = row.shift_end || '19:00';
    exportModeEl.value = row.export_mode || 'weekly';
    metaEl.textContent = `نافذة الحضور: ${startEl.value} - ${endEl.value} | نهاية الدوام: ${shiftEndEl.value}`;
  } catch (err) {
    metaEl.textContent = `تعذر تحميل السياسة: ${err.message}`;
  }
}

async function saveAttendancePolicy(panelType) {
  const user = getStoredUser();
  if (!user) return;

  const isAdminPanel = panelType === 'admin';
  const startEl = document.getElementById(isAdminPanel ? 'ad-att-start' : 'sup-att-start');
  const endEl = document.getElementById(isAdminPanel ? 'ad-att-end' : 'sup-att-end');
  const shiftEndEl = document.getElementById(isAdminPanel ? 'ad-att-shift-end' : 'sup-att-shift-end');
  const exportModeEl = document.getElementById(isAdminPanel ? 'ad-att-export-mode' : 'sup-att-export-mode');
  const metaEl = document.getElementById(isAdminPanel ? 'ad-att-policy-meta' : 'sup-att-policy-meta');
  const btn = document.getElementById(isAdminPanel ? 'ad-att-policy-save-btn' : 'sup-att-policy-save-btn');
  if (!startEl || !endEl || !shiftEndEl || !exportModeEl || !metaEl) return;

  const payload = {
    checkin_start: (startEl.value || '').slice(0, 5),
    checkin_end: (endEl.value || '').slice(0, 5),
    shift_end: (shiftEndEl.value || '').slice(0, 5),
    export_mode: exportModeEl.value || 'weekly',
  };

  if (isAdminPanel) {
    const hotelId = activeAdminHotelFilter && activeAdminHotelFilter !== 'all' ? Number(activeAdminHotelFilter) : null;
    if (!hotelId) {
      if (typeof showToast === 'function') showToast('اختر فندقًا أولًا من الفلاتر أعلى الصفحة', 'warning');
      return;
    }
    payload.hotel_id = hotelId;
  }

  const oldText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ جاري الحفظ...';
  }

  try {
    const row = await apiRequest('/dashboard/attendance/policy', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!row) return;
    metaEl.textContent = `تم الحفظ. نافذة الحضور: ${row.checkin_start} - ${row.checkin_end} | نهاية الدوام: ${row.shift_end}`;
    if (typeof showToast === 'function') showToast('تم تحديث سياسة الحضور بنجاح', 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText || '💾 حفظ السياسة';
    }
  }
}

async function exportAttendanceXlsx(period, panelType) {
  const user = getStoredUser();
  if (!user) return;

  const isAdminPanel = panelType === 'admin';
  let endpoint = `/dashboard/attendance/export?period=${encodeURIComponent(period || 'weekly')}`;
  if (isAdminPanel) {
    const hotelId = activeAdminHotelFilter && activeAdminHotelFilter !== 'all' ? String(activeAdminHotelFilter) : '';
    if (hotelId) endpoint += `&hotel_id=${encodeURIComponent(hotelId)}`;
  }

  const token = getToken() || '';
  if (!token) {
    if (typeof showToast === 'function') showToast('يرجى تسجيل الدخول مرة أخرى', 'warning');
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      let msg = 'تعذر تصدير الملف';
      try {
        const body = await resp.json();
        msg = body.detail || msg;
      } catch (_) {
        // ignore parse errors
      }
      throw new Error(msg);
    }

    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${period || 'weekly'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast('تم تنزيل ملف الحضور بنجاح', 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message || 'تعذر التصدير', 'error');
  }
}

async function initAttendancePolicyControls() {
  const user = getStoredUser();
  if (!user) return;

  const adminPanel = document.getElementById('ad-att-policy-panel');
  const supPanel = document.getElementById('sup-att-policy-panel');
  if (adminPanel) adminPanel.style.display = user.role === 'admin' ? 'block' : 'none';
  if (supPanel) supPanel.style.display = ['supervisor', 'superfv'].includes(user.role) ? 'block' : 'none';

  if (!attendancePolicyControlsBound) {
    const adSave = document.getElementById('ad-att-policy-save-btn');
    if (adSave) adSave.addEventListener('click', () => saveAttendancePolicy('admin'));
    const supSave = document.getElementById('sup-att-policy-save-btn');
    if (supSave) supSave.addEventListener('click', () => saveAttendancePolicy('supervisor'));

    const adW = document.getElementById('ad-att-export-weekly-btn');
    const adM = document.getElementById('ad-att-export-monthly-btn');
    if (adW) adW.addEventListener('click', () => exportAttendanceXlsx('weekly', 'admin'));
    if (adM) adM.addEventListener('click', () => exportAttendanceXlsx('monthly', 'admin'));

    const supW = document.getElementById('sup-att-export-weekly-btn');
    const supM = document.getElementById('sup-att-export-monthly-btn');
    if (supW) supW.addEventListener('click', () => exportAttendanceXlsx('weekly', 'supervisor'));
    if (supM) supM.addEventListener('click', () => exportAttendanceXlsx('monthly', 'supervisor'));

    attendancePolicyControlsBound = true;
  }

  if (user.role === 'admin') {
    await loadAttendancePolicy('admin');
  }
  if (['supervisor', 'superfv'].includes(user.role)) {
    await loadAttendancePolicy('supervisor');
  }
}

let __attendanceHeartbeatTimer = null;
const ATTENDANCE_REQUIRED_ROLES = ['supervisor', 'superfv', 'cleaner', 'maintenance', 'reception', 'accountant'];
let __attendanceAlertCache = {};

function attendanceRequiredForRole(role) {
  return ATTENDANCE_REQUIRED_ROLES.includes(String(role || '').toLowerCase());
}

function getCurrentPositionAsync() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('المتصفح لا يدعم تحديد الموقع'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      }),
      () => reject(new Error('تعذر الوصول إلى الموقع')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
    );
  });
}

async function syncAttendanceWithLocation(mode = 'ping', silent = true) {
  const user = getStoredUser();
  if (!user || !attendanceRequiredForRole(user.role)) return null;

  try {
    const loc = await getCurrentPositionAsync();
    const endpoint = mode === 'check-in' ? '/dashboard/attendance/check-in' : '/dashboard/attendance/ping';
    return await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(loc),
    });
  } catch (err) {
    if (!silent && typeof showToast === 'function') {
      showToast(err.message || 'تعذر مزامنة الحضور بالموقع', 'warning');
    }
    throw err;
  }
}

function formatAttendanceStateText(snapshot) {
  if (!snapshot) return 'الحضور: غير متاح';
  if (snapshot.status === 'checked_out') return 'الحضور: تم إنهاء الدوام';
  if (!snapshot.checked_in) return 'الحضور: لم يبدأ الدوام';
  if (snapshot.status === 'left_area') return 'الحضور: خارج النطاق الآن';
  if (snapshot.status === 'late') return `الحضور: متأخر (${snapshot.late_minutes || 0}د)`;
  if (snapshot.status === 'present') return 'الحضور: داخل النطاق';
  return 'الحضور: —';
}

async function refreshAttendanceQuickState() {
  const box = document.getElementById('attendance-quick');
  const statusEl = document.getElementById('attendance-quick-status');
  const checkInBtn = document.getElementById('attendance-checkin-btn');
  const checkOutBtn = document.getElementById('attendance-checkout-btn');
  const user = getStoredUser();

  if (!box || !statusEl || !checkInBtn || !checkOutBtn) return;

  if (!user || !attendanceRequiredForRole(user.role)) {
    box.style.display = 'none';
    checkOutBtn.style.display = 'none';
    return;
  }

  box.style.display = 'block';
  checkOutBtn.style.display = '';
  try {
    const snapshot = await apiRequest('/dashboard/attendance/me');
    statusEl.textContent = formatAttendanceStateText(snapshot);

    const canCheckIn = !snapshot?.checked_in && snapshot?.status !== 'checked_out';
    const canCheckOut = !!snapshot?.checked_in;

    checkInBtn.disabled = !canCheckIn;
    checkOutBtn.disabled = !canCheckOut;
  } catch (err) {
    statusEl.textContent = `الحضور: ${err.message || 'تعذر التحديث'}`;
    checkInBtn.disabled = false;
    checkOutBtn.disabled = true;
  }
}

async function attendanceCheckInNow() {
  try {
    const current = await apiRequest('/dashboard/attendance/me');
    if (current?.checked_in && current?.status !== 'checked_out') {
      if (typeof showToast === 'function') showToast('أنت بالفعل داومت اليوم', 'warning');
      await refreshAttendanceQuickState();
      return;
    }

    await syncAttendanceWithLocation('check-in', false);
    await refreshAttendanceQuickState();
    if (typeof showToast === 'function') showToast('تم تسجيل حضورك بنجاح', 'success');
  } catch (_) {
    // message already shown in sync helper
  }
}

async function attendanceCheckOutNow() {
  try {
    const current = await apiRequest('/dashboard/attendance/me');
    if (!current?.checked_in) {
      if (typeof showToast === 'function') {
        if (current?.status === 'checked_out') {
          showToast('تم إنهاء دوامك بالفعل اليوم', 'warning');
        } else {
          showToast('لا يوجد دوام مفتوح لإنهائه الآن', 'warning');
        }
      }
      await refreshAttendanceQuickState();
      return;
    }

    await apiRequest('/dashboard/attendance/check-out', { method: 'POST' });
    if (typeof showToast === 'function') {
      showToast('أحسنت! تم إنهاء الدوام وتسجيل خروجك بنجاح', 'success');
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (typeof doLogout === 'function') {
      await doLogout({ skipAttendanceCheckout: true });
      return;
    }
    await refreshAttendanceQuickState();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

async function ensureAttendanceReadyForAction() {
  const user = getStoredUser();
  if (!user || !attendanceRequiredForRole(user.role)) return;

  let snapshot = await apiRequest('/dashboard/attendance/me');
  if (!snapshot) throw new Error('تعذر التحقق من الحضور');

  if (!snapshot.checked_in) {
    snapshot = await syncAttendanceWithLocation('check-in', false);
  } else {
    snapshot = await syncAttendanceWithLocation('ping', false);
  }

  if (!snapshot || snapshot.location_status !== 'in_range') {
    throw new Error('لا يمكن المتابعة: يجب التواجد داخل نطاق الدوام');
  }
}

async function startAttendanceHeartbeat() {
  stopAttendanceHeartbeat();

  const user = getStoredUser();
  if (!user || !attendanceRequiredForRole(user.role)) return;

  const kick = async () => {
    try {
      const snapshot = await apiRequest('/dashboard/attendance/me');
      if (snapshot?.checked_in) {
        await syncAttendanceWithLocation('ping', true);
      }
    } catch (_) {
      // Ignore silently.
    }

    await refreshAttendanceQuickState().catch(() => { });
  };

  await kick();
  __attendanceHeartbeatTimer = setInterval(kick, 3 * 60 * 1000);
}

function stopAttendanceHeartbeat() {
  if (__attendanceHeartbeatTimer) {
    clearInterval(__attendanceHeartbeatTimer);
    __attendanceHeartbeatTimer = null;
  }
}

function renderSupervisorAttendance(rows) {
  const body = document.getElementById('sup-attendance-body');
  if (!body) return;

  if (!rows || rows.length === 0) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--dim)">لا توجد بيانات حضور اليوم</td></tr>';
    return;
  }

  body.innerHTML = '';
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.full_name || '-'}</td>
      <td>${attendanceRoleLabel(r.role)}</td>
      <td>${r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
      <td>${attendanceLocationLabel(r.location_status)}</td>
      <td>${attendanceBadge(r.status, r.late_minutes)}</td>
      <td>${attendanceWarningLabel(r)}</td>
    `;
    body.appendChild(tr);

    if (r.status === 'left_area') {
      const prev = __attendanceAlertCache[r.user_id];
      if (prev !== 'left_area' && typeof showToast === 'function') {
        showToast(`تنبيه: ${r.full_name || 'موظف'} غادر نطاق الدوام`, 'warning');
      }
    }
    __attendanceAlertCache[r.user_id] = r.status;
  });
}

function renderAdminAttendance(rows) {
  const body = document.getElementById('ad-attendance-body');
  if (!body) return;

  if (!rows || rows.length === 0) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--dim)">لا توجد بيانات حضور لليوم</td></tr>';
    return;
  }

  body.innerHTML = '';
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.full_name || '-'}</td>
      <td>${attendanceRoleLabel(r.role)}</td>
      <td>${r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
      <td>${attendanceLocationLabel(r.location_status)}</td>
      <td>${attendanceBadge(r.status, r.late_minutes)}</td>
      <td>${attendanceWarningLabel(r)}</td>
    `;
    body.appendChild(tr);
  });
}

async function loadSupervisorAttendance() {
  const body = document.getElementById('sup-attendance-body');
  if (!body) return;

  try {
    const rows = await apiRequest('/dashboard/attendance');
    if (!rows) return;
    renderSupervisorAttendance(rows);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--red)">تعذر تحميل الحضور: ${err.message}</td></tr>`;
  }
}

async function loadAdminAttendance() {
  const body = document.getElementById('ad-attendance-body');
  if (!body) return;

  try {
    const hotelId = (activeAdminHotelFilter && activeAdminHotelFilter !== 'all')
      ? String(activeAdminHotelFilter)
      : '';
    const endpoint = hotelId
      ? `/dashboard/attendance?hotel_id=${encodeURIComponent(hotelId)}`
      : '/dashboard/attendance';
    const rows = await apiRequest(endpoint);
    if (!rows) return;
    renderAdminAttendance(rows);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--red)">تعذر تحميل الحضور: ${err.message}</td></tr>`;
  }
}

window.attendanceCheckInNow = attendanceCheckInNow;
window.attendanceCheckOutNow = attendanceCheckOutNow;
window.refreshAttendanceQuickState = refreshAttendanceQuickState;

async function loadDashboardOverview() {
  try {
    // Load hotel pills FIRST so activeAdminHotelFilter is set before room forms use it
    await loadAdminHotelPills();
    await ensureAdminUsersCache();
    renderAdminHotelStaffList();

    if (typeof initRoomCreateForms === 'function') {
      await initRoomCreateForms();
    }

    await initDashboardPriceControls();
    await initAttendancePolicyControls();

    let endpoint = '/dashboard/overview';
    if (getStoredUser()?.role === 'admin') {
      if (!activeAdminHotelFilter) {
        const hotelsBody = document.getElementById('ad-hotels-body');
        if (hotelsBody) {
          hotelsBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim)">اختر فندقًا أولاً لعرض البيانات</td></tr>';
        }
        return;
      }
      endpoint += `?hotel_id=${encodeURIComponent(activeAdminHotelFilter)}`;
    }

    const overview = await apiRequest(endpoint);
    if (!overview) return;

    renderAdminDashboardMetrics(overview);
    renderSupervisorDashboardMetrics(overview);
    if (getStoredUser()?.role === 'admin') {
      await loadAttendancePolicy('admin');
      await loadAdminAttendance();
    } else {
      if (['supervisor', 'superfv'].includes(getStoredUser()?.role)) {
        await loadAttendancePolicy('supervisor');
      }
      await loadSupervisorAttendance();
    }
  } catch (err) {
    const note = document.getElementById('sup-kpi-note');
    if (note) note.textContent = `تعذر تحميل المؤشرات: ${err.message}`;

    const hotelsBody = document.getElementById('ad-hotels-body');
    if (hotelsBody) {
      hotelsBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red)">تعذر تحميل البيانات: ${err.message}</td></tr>`;
    }
  }
}

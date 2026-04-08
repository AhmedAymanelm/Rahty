/* ==========================================
   راحتي — Navigation & Routing
   ========================================== */

/**
 * Build sidebar navigation based on current role
 */
function buildNav() {
  const nav = document.getElementById('sb-nav');
  nav.innerHTML = '';

  NAV[currentRole].forEach(sec => {
    const s = document.createElement('div');
    s.className = 'nav-sec';
    s.innerHTML = `<div class="nav-sec-t">${sec.sec}</div>`;

    sec.items.forEach(it => {
      const d = document.createElement('div');
      d.className = 'ni';
      d.id = 'ni-' + it.id;
      d.onclick = () => { showPg(it.id); closeSB(); };
      d.innerHTML = `<span class="ico">${it.ico}</span><span>${it.lbl}</span>`
        + (it.badge ? `<span class="nbadge">${it.badge}</span>` : '');
      s.appendChild(d);
    });

    nav.appendChild(s);
  });

  if (typeof refreshNavBadges === 'function') {
    refreshNavBadges();
  }
  if (typeof restartBadgeTimer === 'function') {
    restartBadgeTimer();
  }
}

/**
 * Show a specific page and highlight its nav item
 */
function showPg(id) {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('act'));
  const p = document.getElementById(id);
  if (p) p.classList.add('act');

  if (id === 'p-cl-report' && (!window.activeRoomId || !window.activeRoomNum)) {
    if (typeof showToast === 'function') {
      showToast('اختر غرفة أولاً من قسم الغرف', 'warning');
    }
    const fallback = document.getElementById('p-cl-rooms');
    if (p) p.classList.remove('act');
    if (fallback) fallback.classList.add('act');
    id = 'p-cl-rooms';
  }

  document.querySelectorAll('.ni').forEach(n => n.classList.remove('act'));
  const n = document.getElementById('ni-' + id);
  if (n) n.classList.add('act');

  if (id === 'p-users-mgmt' && typeof loadUsers === 'function') {
    if (typeof syncGlobalHotelSelectionUi === 'function') syncGlobalHotelSelectionUi();
    loadUsers();
  }
  if (id === 'p-leaves-contracts' && typeof loadLeavesContractsData === 'function') {
    if (typeof syncGlobalHotelSelectionUi === 'function') syncGlobalHotelSelectionUi();
    loadLeavesContractsData();
  }
  if ((id === 'p-admin-tasks' || id === 'p-sup-tasks') && typeof loadTasks === 'function') {
    if (typeof syncGlobalHotelSelectionUi === 'function') syncGlobalHotelSelectionUi();
    loadTasks();
  }
  if (id === 'p-mn-tasks' && typeof loadMaintenanceTasks === 'function') {
    loadMaintenanceTasks();
  }
  if (id === 'p-cl-rooms' && typeof loadRooms === 'function') {
    loadRooms();
  }
  if (id === 'p-admin-maint' && typeof loadMaintenanceReports === 'function') {
    loadMaintenanceReports();
  }
  if ((id === 'p-admin-dash' || id === 'p-sup-dash') && typeof loadDashboardOverview === 'function') {
    if (typeof syncGlobalHotelSelectionUi === 'function') syncGlobalHotelSelectionUi();
    loadDashboardOverview();
  }
  if (id === 'p-sup-dash') {
    const dateInput = document.getElementById('sup-shift-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
  }
  if (id === 'p-rc-report' && typeof loadReceptionReports === 'function') {
    loadReceptionReports();
  }
  if (id === 'p-rc-prices' && typeof loadCompetitorPrices === 'function') {
    loadCompetitorPrices();
  }
  if (id === 'p-ac-dash' && typeof loadAccountantDashboard === 'function') {
    loadAccountantDashboard();
  }
  if (id === 'p-admin-bc' && typeof loadBroadcastHistory === 'function') {
    if (typeof loadBroadcastHotels === 'function') {
      loadBroadcastHotels();
    }
    loadBroadcastHistory();
  }
  if (id === 'p-admin-reports' && typeof loadAdminReportsData === 'function') {
    loadAdminReportsData();
  }
  if (id === 'p-admin-income' && typeof loadAdminIncomePage === 'function') {
    loadAdminIncomePage();
  }
  if (id === 'p-expense-orders' && typeof loadExpenseOrdersPage === 'function') {
    loadExpenseOrdersPage();
  }
  if (id === 'p-supervisor-warehouse' && typeof loadSupervisorWarehousePage === 'function') {
    loadSupervisorWarehousePage();
  }
  if (id === 'p-warehouse-manager' && typeof loadWarehouseManagerPage === 'function') {
    loadWarehouseManagerPage();
  }
  if (id === 'p-settings' && typeof renderSettingsPage === 'function') {
    if (typeof applyUiSettings === 'function') applyUiSettings();
    renderSettingsPage();
  }
  if (id === 'p-communications' && typeof loadCommunicationContacts === 'function') {
    loadCommunicationContacts();
  }
  if (id === 'p-all-chats' && typeof loadAllChats === 'function') {
    loadAllChats();
  }

  // Dispatch global custom event so modules can observe page changes (e.g. communications polling)
  document.dispatchEvent(new CustomEvent('pageChanged', { detail: id }));

  if (typeof refreshNavBadges === 'function') {
    refreshNavBadges();
  }
}

/**
 * Switch tabs within a page
 */
function stab(grp, tab, btn) {
  document.querySelectorAll(`[id^="${grp}-"]`).forEach(c => c.classList.remove('act'));
  const t = document.getElementById(`${grp}-${tab}`);
  if (t) t.classList.add('act');

  btn.closest('.tab-row').querySelectorAll('.tb').forEach(b => b.classList.remove('act'));
  btn.classList.add('act');
}

function setNavBadge(pageId, count, title = '') {
  const navItem = document.getElementById(`ni-${pageId}`);
  if (!navItem) return;

  let badge = navItem.querySelector('.nbadge');
  const n = Number(count || 0);
  if (!Number.isFinite(n) || n <= 0) {
    if (badge) badge.remove();
    return;
  }

  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'nbadge';
    navItem.appendChild(badge);
  }
  badge.textContent = n > 99 ? '99+' : String(n);
  if (title) {
    badge.title = title;
    navItem.title = title;
  }
}

async function refreshNavBadges() {
  const user = getStoredUser();
  if (!user || !getToken()) return;

  const st = (typeof getSettings === 'function') ? getSettings() : { enableBadges: true };
  if (!st.enableBadges) {
    document.querySelectorAll('.ni .nbadge').forEach((b) => b.remove());
    return;
  }

  try {
    const role = user.role;
    const scopedHotelId = (typeof activeAdminHotelFilter !== 'undefined' && activeAdminHotelFilter && activeAdminHotelFilter !== 'all')
      ? String(activeAdminHotelFilter)
      : (user.hotel_id ? String(user.hotel_id) : '');

    if (role === 'admin') {
      const [tasks, maint, inbox, users, finance, warehouse, po] = await Promise.all([
        apiRequest(`/tasks${scopedHotelId ? `?hotel_id=${encodeURIComponent(scopedHotelId)}` : ''}`),
        apiRequest(`/maintenance/reports${scopedHotelId ? `?hotel_id=${encodeURIComponent(scopedHotelId)}` : ''}`),
        apiRequest('/broadcasts/inbox'),
        apiRequest(`/auth/users?include_inactive=true${scopedHotelId ? `&hotel_id=${encodeURIComponent(scopedHotelId)}` : ''}`),
        apiRequest(`/finance/shift-reports?status_filter=pending${scopedHotelId ? `&hotel_id=${encodeURIComponent(scopedHotelId)}` : ''}`),
        apiRequest(`/finance/warehouse-requests?status_filter=pending${scopedHotelId ? `&hotel_id=${encodeURIComponent(scopedHotelId)}` : ''}`),
        apiRequest(`/finance/purchase-orders?status_filter=pending${scopedHotelId ? `&hotel_id=${encodeURIComponent(scopedHotelId)}` : ''}`),
      ]);

      const openTasks = (tasks || []).filter((t) => !['completed', 'closed'].includes(t.status)).length;
      const openMaint = (maint || []).filter((r) => r.status !== 'verified').length;
      const unreadBc = (inbox || []).filter((m) => !m.is_read).length;
      const inactiveUsers = (users || []).filter((u) => u.is_active === false).length;
      const pendingFinance = (finance || []).length;
      const pendingWarehouse = (warehouse || []).length;
      const pendingPo = (po || []).length;

      setNavBadge('p-admin-tasks', openTasks, 'مهام مفتوحة');
      setNavBadge('p-admin-maint', openMaint, 'بلاغات صيانة غير مغلقة');
      setNavBadge('p-admin-bc', unreadBc, 'تعاميم غير مقروءة');
      setNavBadge('p-users-mgmt', inactiveUsers, 'موظفون موقوفون');
      setNavBadge('p-admin-reports', pendingFinance, 'تقارير بانتظار الاعتماد');
      setNavBadge('p-warehouse-manager', pendingWarehouse, 'طلبات مستودع بانتظار الاعتماد');
      setNavBadge('p-expense-orders', pendingPo, 'سندات شراء بانتظار الاعتماد');
    }

    if (role === 'supervisor' || role === 'superfv') {
      const [tasks, users, maint, warehouse, po] = await Promise.all([
        apiRequest('/tasks'),
        apiRequest('/auth/users?include_inactive=true'),
        apiRequest('/maintenance/reports'),
        apiRequest('/finance/warehouse-requests?status_filter=pending'),
        apiRequest('/finance/purchase-orders?status_filter=pending'),
      ]);
      setNavBadge('p-sup-tasks', (tasks || []).filter((t) => !['completed', 'closed'].includes(t.status)).length);
      setNavBadge('p-users-mgmt', (users || []).filter((u) => u.is_active === false).length);
      setNavBadge('p-admin-maint', (maint || []).filter((r) => r.status !== 'verified').length);
      setNavBadge('p-warehouse-manager', (warehouse || []).length);
      setNavBadge('p-expense-orders', (po || []).length);
    }

    if (role === 'maintenance') {
      const maint = await apiRequest('/maintenance/reports');
      setNavBadge('p-mn-tasks', (maint || []).filter((r) => !['completed', 'verified'].includes(r.status)).length);
    }

    if (role === 'reception') {
      const reports = await apiRequest('/finance/shift-reports?status_filter=pending');
      setNavBadge('p-rc-report', (reports || []).length);
    }

    if (role === 'accountant') {
      const [pending, warehouse, po] = await Promise.all([
        apiRequest('/finance/shift-reports?status_filter=pending'),
        apiRequest('/finance/warehouse-requests?status_filter=pending'),
        apiRequest('/finance/purchase-orders?status_filter=pending'),
      ]);
      setNavBadge('p-ac-dash', (pending || []).length, 'تقارير بانتظار المراجعة');
      setNavBadge('p-warehouse-manager', (warehouse || []).length, 'طلبات مستودع بانتظار الاعتماد');
      setNavBadge('p-expense-orders', (po || []).length, 'سندات شراء بانتظار الاعتماد');
    }
  } catch (_) {
    // Keep UI responsive if any endpoint fails.
  }
}

/**
 * Filter hotels via pill buttons
 */
function filterHotel(el, key) {
  el.closest('.hotel-pills').querySelectorAll('.hp').forEach(h => h.classList.remove('act'));
  el.classList.add('act');

  if (typeof activeAdminHotelFilter !== 'undefined') {
    if (typeof key === 'string' && key.startsWith('h')) {
      activeAdminHotelFilter = key.slice(1);
    } else if (key !== undefined && key !== null && String(key).trim() !== '') {
      activeAdminHotelFilter = String(key);
    } else {
      activeAdminHotelFilter = '';
    }
  }

  if (typeof syncGlobalHotelSelectionUi === 'function') {
    syncGlobalHotelSelectionUi();
  }

  if (typeof loadDashboardOverview === 'function') {
    loadDashboardOverview();
  }
  if (typeof loadUsers === 'function') {
    loadUsers();
  }
  if (typeof loadTasks === 'function') {
    loadTasks();
  }
  if (typeof loadAdminReportsData === 'function') {
    loadAdminReportsData();
  }
  if (typeof loadLeavesContractsData === 'function') {
    const p = document.getElementById('p-leaves-contracts');
    if (p && p.classList.contains('act')) {
      loadLeavesContractsData();
    }
  }
}

function syncGlobalHotelSelectionUi() {
  if (typeof activeAdminHotelFilter === 'undefined') return;
  const target = String(activeAdminHotelFilter || '');

  const pills = document.getElementById('admin-hotel-filter');
  if (pills) {
    pills.querySelectorAll('.hp').forEach((node) => {
      const hid = node.dataset.hotelId || '';
      node.classList.toggle('act', !!target && hid === target);
    });
  }

  const usersSelect = document.getElementById('users-hotel-filter');
  if (usersSelect && target) {
    const has = Array.from(usersSelect.options).some((o) => o.value === target);
    if (has) usersSelect.value = target;
  }

  const arSelect = document.getElementById('ar-filter-hotel');
  if (arSelect && target) {
    const has = Array.from(arSelect.options).some((o) => o.value === target);
    if (has) arSelect.value = target;
  }
}

/**
 * Open sidebar (mobile)
 */
function openSB() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sb-ov').classList.add('show');
}

/**
 * Close sidebar (mobile)
 */
function closeSB() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sb-ov').classList.remove('show');
}

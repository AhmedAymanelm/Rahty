/* ==========================================
   راحتي — Finance Workflows (Income, POs, Warehouse Requests)
   ========================================== */

let incomeFiltersReady = false;
let expenseFiltersReady = false;
let warehouseFiltersReady = false;
let warehouseManagerFiltersReady = false;
let wmLastInventory = [];

function fwWarehouseBadge(status) {
  if (status === 'ok') return '<span class="badge b-green">كافي</span>';
  if (status === 'low') return '<span class="badge b-orange">منخفض</span>';
  return '<span class="badge b-red">⚠️ أقل من الحد</span>';
}

function fwMoney(v) {
  return `${Number(v || 0).toLocaleString('en-US')} ر`;
}

function fwStatusBadge(status) {
  if (status === 'approved') return '<span class="badge b-green">معتمد</span>';
  if (status === 'rejected') return '<span class="badge b-red">مرفوض</span>';
  return '<span class="badge b-orange">معلق</span>';
}

async function fwEnsureHotelOptions(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  if (sel.dataset.loaded === '1') return;

  try {
    const hotels = await apiRequest('/hotels');
    sel.innerHTML = '<option value="all">كل الفنادق</option>';
    (hotels || []).forEach((h) => {
      const op = document.createElement('option');
      op.value = String(h.id);
      op.textContent = h.name;
      sel.appendChild(op);
    });
    sel.dataset.loaded = '1';
  } catch (_) {
    // Keep page usable even if hotel list fails.
  }
}

async function loadAdminIncomePage() {
  const body = document.getElementById('inc-employee-body');
  if (!body) return;

  const user = getStoredUser();
  if (!user || user.role !== 'admin') return;

  if (!incomeFiltersReady) {
    const hotelWrap = document.getElementById('inc-hotel-wrap');
    if (hotelWrap) hotelWrap.style.display = 'block';
    await fwEnsureHotelOptions('inc-hotel');
    incomeFiltersReady = true;
  }

  const range = document.getElementById('inc-range')?.value || 'month';
  const hotelVal = document.getElementById('inc-hotel')?.value || 'all';

  let endpoint = `/finance/income/dashboard?range=${encodeURIComponent(range)}`;
  if (hotelVal !== 'all') endpoint += `&hotel_id=${encodeURIComponent(hotelVal)}`;

  try {
    const data = await apiRequest(endpoint);
    if (!data) return;

    const totals = data.totals || {};
    const selected = data.selected_range || {};

    const tToday = document.getElementById('inc-total-today');
    const tWeek = document.getElementById('inc-total-week');
    const tMonth = document.getElementById('inc-total-month');
    const tYear = document.getElementById('inc-total-year');

    if (tToday) tToday.textContent = fwMoney(totals.today);
    if (tWeek) tWeek.textContent = fwMoney(totals.week);
    if (tMonth) tMonth.textContent = fwMoney(totals.month);
    if (tYear) tYear.textContent = fwMoney(totals.year);

    const rows = selected.by_employee || [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--dim)">لا توجد بيانات ضمن هذا النطاق</td></tr>';
      return;
    }

    body.innerHTML = '';
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.full_name || '-'}</td>
        <td>${r.hotel_name || '-'}</td>
        <td>${Number(r.reports_count || 0).toLocaleString('en-US')}</td>
        <td>${fwMoney(r.total_revenue)}</td>
      `;
      body.appendChild(tr);
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--red)">${err.message}</td></tr>`;
  }
}

async function downloadIncomeExcel() {
  const range = document.getElementById('inc-range')?.value || 'month';
  const hotelVal = document.getElementById('inc-hotel')?.value || 'all';

  let endpoint = `/api/finance/income/export?range=${encodeURIComponent(range)}`;
  if (hotelVal !== 'all') endpoint += `&hotel_id=${encodeURIComponent(hotelVal)}`;

  try {
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || 'تعذر التصدير');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `income-${range}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') showToast('تم تنزيل ملف Excel', 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

async function loadExpenseOrdersPage() {
  const body = document.getElementById('po-body');
  if (!body) return;

  const user = getStoredUser();
  if (!user) return;
  const role = user.role;

  if (!expenseFiltersReady) {
    const createCard = document.getElementById('po-create-card');
    if (createCard) createCard.style.display = ['admin', 'supervisor', 'superfv'].includes(role) ? 'block' : 'none';

    const hotelWrap = document.getElementById('po-hotel-wrap');
    const hotelSel = document.getElementById('po-hotel');
    if (role === 'admin' && hotelWrap && hotelSel) {
      hotelWrap.style.display = 'block';
      const hotels = await apiRequest('/hotels').catch(() => []);
      hotelSel.innerHTML = '<option value="">اختر الفندق</option>';
      (hotels || []).forEach((h) => {
        const op = document.createElement('option');
        op.value = String(h.id);
        op.textContent = h.name;
        hotelSel.appendChild(op);
      });
    }

    const filterHotelWrap = document.getElementById('po-filter-hotel-wrap');
    const filterHotelSel = document.getElementById('po-filter-hotel');
    if (role === 'admin' && filterHotelWrap && filterHotelSel) {
      filterHotelWrap.style.display = 'block';
      const hotels = await apiRequest('/hotels').catch(() => []);
      filterHotelSel.innerHTML = '<option value="all">كل الفنادق</option>';
      (hotels || []).forEach((h) => {
        const op = document.createElement('option');
        op.value = String(h.id);
        op.textContent = h.name;
        filterHotelSel.appendChild(op);
      });
    }
    expenseFiltersReady = true;
  }

  const status = document.getElementById('po-status-filter')?.value || 'all';
  const fromDate = document.getElementById('po-from-date')?.value || '';
  const toDate = document.getElementById('po-to-date')?.value || '';
  const hotelFilter = document.getElementById('po-filter-hotel')?.value || 'all';
  const search = (document.getElementById('po-search')?.value || '').trim();
  const minAmount = document.getElementById('po-min-amount')?.value || '';
  const maxAmount = document.getElementById('po-max-amount')?.value || '';

  let endpoint = '/finance/purchase-orders';
  const params = [];
  if (status !== 'all') params.push(`status_filter=${encodeURIComponent(status)}`);
  if (fromDate) params.push(`from_date=${encodeURIComponent(fromDate)}`);
  if (toDate) params.push(`to_date=${encodeURIComponent(toDate)}`);
  if (hotelFilter !== 'all') params.push(`hotel_id=${encodeURIComponent(hotelFilter)}`);
  if (search) params.push(`search=${encodeURIComponent(search)}`);
  if (minAmount) params.push(`min_amount=${encodeURIComponent(minAmount)}`);
  if (maxAmount) params.push(`max_amount=${encodeURIComponent(maxAmount)}`);
  if (params.length) endpoint += `?${params.join('&')}`;

  let reportEndpoint = '/finance/purchase-orders/report';
  const reportParams = [];
  if (fromDate) reportParams.push(`from_date=${encodeURIComponent(fromDate)}`);
  if (toDate) reportParams.push(`to_date=${encodeURIComponent(toDate)}`);
  if (hotelFilter !== 'all') reportParams.push(`hotel_id=${encodeURIComponent(hotelFilter)}`);
  if (reportParams.length) reportEndpoint += `?${reportParams.join('&')}`;

  try {
    const [rows, report] = await Promise.all([
      apiRequest(endpoint),
      apiRequest(reportEndpoint),
    ]);

    const totalCount = document.getElementById('po-total-count');
    const totalAmount = document.getElementById('po-total-amount');
    const approvedCount = document.getElementById('po-approved-count');
    const rejectedCount = document.getElementById('po-rejected-count');

    if (totalCount) totalCount.textContent = Number(report?.total_count || 0).toLocaleString('en-US');
    if (totalAmount) totalAmount.textContent = fwMoney(report?.total_amount || 0);
    if (approvedCount) approvedCount.textContent = Number(report?.approved_count || 0).toLocaleString('en-US');
    if (rejectedCount) rejectedCount.textContent = Number(report?.rejected_count || 0).toLocaleString('en-US');

    if (!rows || !rows.length) {
      body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--dim)">لا توجد سندات حالياً</td></tr>';
      return;
    }

    body.innerHTML = '';
    rows.forEach((r) => {
      const canReview = (role === 'accountant' || role === 'admin') && r.status === 'pending';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.request_date || '-'}</td>
        <td>${r.hotel_name || '-'}</td>
        <td>${r.requester_name || '-'}</td>
        <td>${r.title || '-'}</td>
        <td>${fwMoney(r.amount)}</td>
        <td>${fwStatusBadge(r.status)}</td>
        <td>${r.review_note || '-'}</td>
        <td>
          ${canReview
            ? `<button class="btn bgr bsm" onclick="reviewPurchaseOrder(${r.id}, 'approved')">اعتماد</button>
               <button class="btn br bsm" onclick="reviewPurchaseOrder(${r.id}, 'rejected')">رفض</button>`
            : '<span class="dim" style="font-size:.8rem">عرض</span>'}
        </td>
      `;
      body.appendChild(tr);
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red)">${err.message}</td></tr>`;
  }
}

async function exportCombinedFinanceReport() {
  const fromDate = document.getElementById('po-from-date')?.value || '';
  const toDate = document.getElementById('po-to-date')?.value || '';
  const hotelFilter = document.getElementById('po-filter-hotel')?.value || 'all';

  const params = [];
  if (fromDate) params.push(`from_date=${encodeURIComponent(fromDate)}`);
  if (toDate) params.push(`to_date=${encodeURIComponent(toDate)}`);
  if (hotelFilter !== 'all') params.push(`hotel_id=${encodeURIComponent(hotelFilter)}`);

  let endpoint = '/api/finance/combined-report/export';
  if (params.length) endpoint += `?${params.join('&')}`;

  try {
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || 'تعذر تنزيل التقرير الموحد');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'combined-finance-warehouse.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast('تم تنزيل التقرير الموحد', 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

async function createPurchaseOrder() {
  const title = (document.getElementById('po-title')?.value || '').trim();
  const description = (document.getElementById('po-desc')?.value || '').trim();
  const amount = Number(document.getElementById('po-amount')?.value || 0);
  const request_date = document.getElementById('po-date')?.value || null;
  const hotel_id = document.getElementById('po-hotel')?.value || null;

  if (!title || !description || amount < 0) {
    if (typeof showToast === 'function') showToast('يرجى تعبئة البيانات بشكل صحيح', 'warning');
    return;
  }

  const payload = { title, description, amount, request_date };
  if (hotel_id) payload.hotel_id = Number(hotel_id);

  try {
    await apiRequest('/finance/purchase-orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (typeof showToast === 'function') showToast('تم إرسال سند الشراء بنجاح', 'success');

    ['po-title', 'po-desc', 'po-amount'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    await loadExpenseOrdersPage();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

async function reviewPurchaseOrder(orderId, status) {
  let review_note = null;

  if (status === 'rejected') {
    review_note = await fwOpenInputDialog({
      title: '📝 سبب الرفض',
      subtitle: 'يرجى كتابة سبب الرفض بشكل واضح.',
      placeholder: 'اكتب السبب هنا...',
      confirmLabel: 'تأكيد الرفض',
      confirmClass: 'br',
      required: true,
    });
    if (review_note === null) return;

    if (!String(review_note || '').trim()) {
      if (typeof showToast === 'function') showToast('سبب الرفض مطلوب', 'warning');
      return;
    }
  } else {
    review_note = await fwOpenInputDialog({
      title: '📝 ملاحظة الاعتماد',
      subtitle: 'يمكنك كتابة ملاحظة اختيارية قبل الاعتماد.',
      placeholder: 'ملاحظات الاعتماد (اختياري)...',
      confirmLabel: 'تأكيد الاعتماد',
      confirmClass: 'bgr',
      required: false,
    });
    if (review_note === null) return;
  }

  try {
    await apiRequest(`/finance/purchase-orders/${orderId}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status, review_note }),
    });
    if (typeof showToast === 'function') showToast('تمت المراجعة بنجاح', 'success');
    await loadExpenseOrdersPage();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

async function loadSupervisorWarehousePage() {
  const body = document.getElementById('sw-body');
  const itemSel = document.getElementById('sw-item');
  if (!body || !itemSel) return;

  if (!warehouseFiltersReady) {
    const items = await apiRequest('/finance/warehouse-items').catch(() => []);
    itemSel.innerHTML = '';
    (items || []).forEach((i) => {
      const op = document.createElement('option');
      op.value = String(i.id);
      op.textContent = `${i.item_name} (${Number(i.quantity || 0).toLocaleString('en-US')} ${i.unit || ''})`;
      itemSel.appendChild(op);
    });
    warehouseFiltersReady = true;
  }

  const fromDate = document.getElementById('sw-from')?.value || '';
  const toDate = document.getElementById('sw-to')?.value || '';

  let endpoint = '/finance/warehouse-requests';
  const params = [];
  if (fromDate) params.push(`from_date=${encodeURIComponent(fromDate)}`);
  if (toDate) params.push(`to_date=${encodeURIComponent(toDate)}`);
  if (params.length) endpoint += `?${params.join('&')}`;

  try {
    const rows = await apiRequest(endpoint);
    if (!rows || !rows.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--dim)">لا توجد طلبات</td></tr>';
      return;
    }

    body.innerHTML = '';
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${new Date(r.created_at).toLocaleDateString('en-CA')}</td>
        <td>${r.item_name || '-'}</td>
        <td>${Number(r.quantity_requested || 0).toLocaleString('en-US')} ${r.unit || ''}</td>
        <td>${r.quantity_approved ? `${Number(r.quantity_approved).toLocaleString('en-US')} ${r.unit || ''}` : '-'}</td>
        <td>${fwStatusBadge(r.status)}</td>
        <td>${r.review_note || r.note || '-'}</td>
      `;
      body.appendChild(tr);
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--red)">${err.message}</td></tr>`;
  }
}

async function createWarehouseRequest() {
  const item_id = Number(document.getElementById('sw-item')?.value || 0);
  const quantity_requested = Number(document.getElementById('sw-qty')?.value || 0);
  const note = (document.getElementById('sw-note')?.value || '').trim() || null;

  if (!item_id || quantity_requested <= 0) {
    if (typeof showToast === 'function') showToast('يرجى اختيار الصنف وتحديد كمية صحيحة', 'warning');
    return;
  }

  try {
    await apiRequest('/finance/warehouse-requests', {
      method: 'POST',
      body: JSON.stringify({ item_id, quantity_requested, note }),
    });
    if (typeof showToast === 'function') showToast('تم إرسال الطلب لمسؤول المستودع', 'success');

    const qty = document.getElementById('sw-qty');
    const noteEl = document.getElementById('sw-note');
    if (qty) qty.value = 1;
    if (noteEl) noteEl.value = '';

    await loadSupervisorWarehousePage();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

async function loadWarehouseManagerPage() {
  const body = document.getElementById('wm-body');
  const invBody = document.getElementById('wm-inv-body');
  if (!body && !invBody) return; // Must have at least one to proceed

  const user = getStoredUser();

  // 1. Load Central Inventory Independently
  if (invBody) {
    invBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim)">جاري التحميل...</td></tr>';
    apiRequest('/finance/warehouse-items')
      .then(items => {
        wmLastInventory = Array.isArray(items) ? items : [];
        invBody.innerHTML = '';
        if (wmLastInventory.length === 0) {
          invBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim)">لا توجد أصناف حالياً</td></tr>';
        } else {
          wmLastInventory.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>${r.item_name}</td>
              <td>${Number(r.quantity || 0).toLocaleString()} ${r.unit || ''}</td>
              <td>${Number(r.reorder_level || 0).toLocaleString()} ${r.unit || ''}</td>
              <td>${fwWarehouseBadge(r.status)}</td>
              <td>
                <button class="btn bb bsm" onclick="wmEditItem(${r.id})">✏️ تعديل</button>
                <button class="btn bo bsm" onclick="wmConsumeItem(${r.id})">📤 صرف</button>
              </td>
            `;
            invBody.appendChild(tr);
          });
        }
      })
      .catch(err => {
        invBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red)">⚠️ فشل التحميل: ${err.message}</td></tr>`;
      });
  }

  // 2. Load Filters if needed
  if (!warehouseManagerFiltersReady && body) {
    const requesterSel = document.getElementById('wm-requester');
    const itemSel = document.getElementById('wm-item');
    
    // items for filter
    apiRequest('/finance/warehouse-items').then(items => {
        if (itemSel && Array.isArray(items)) {
          itemSel.innerHTML = '<option value="all">كل الأصناف</option>';
          items.forEach((i) => {
            const op = document.createElement('option');
            op.value = String(i.id);
            op.textContent = i.item_name;
            itemSel.appendChild(op);
          });
        }
    }).catch(() => {});

    if (requesterSel && user?.role === 'admin') {
      apiRequest('/auth/users').then(users => {
          if (Array.isArray(users)) {
            requesterSel.innerHTML = '<option value="all">كل المشرفين</option>';
            users.filter((u) => u.role === 'supervisor' || u.role === 'superfv')
              .forEach((u) => {
                const op = document.createElement('option');
                op.value = String(u.id);
                op.textContent = `${u.full_name} (${u.username})`;
                requesterSel.appendChild(op);
              });
          }
      }).catch(() => {});
    }
    warehouseManagerFiltersReady = true;
  }

  // 3. Load Requests
  if (body) {
    if (user?.role === 'admin') {
      const hotelWrap = document.getElementById('wm-hotel-wrap');
      const hotelSel = document.getElementById('wm-hotel');
      if (hotelWrap && hotelSel && hotelSel.dataset.loaded !== '1') {
        hotelWrap.style.display = 'block';
        apiRequest('/hotels').then(hotels => {
            if (Array.isArray(hotels)) {
              hotelSel.innerHTML = '<option value="all">كل الفنادق</option>';
              hotels.forEach((h) => {
                const op = document.createElement('option');
                op.value = String(h.id);
                op.textContent = h.name;
                hotelSel.appendChild(op);
              });
              hotelSel.dataset.loaded = '1';
            }
        }).catch(() => {});
      }
    }

    let status = document.getElementById('wm-status')?.value || 'pending';
    if (status === 'pending' && user?.role === 'warehouse_manager') {
      status = 'supervisor_approved'; // Default for warehouse manager
    }
    const fromDate = document.getElementById('wm-from')?.value || '';
    const toDate = document.getElementById('wm-to')?.value || '';
    const hotel = document.getElementById('wm-hotel')?.value || 'all';
    const requester = document.getElementById('wm-requester')?.value || 'all';
    const item = document.getElementById('wm-item')?.value || 'all';
    const search = (document.getElementById('wm-search')?.value || '').trim();

    let endpoint = '/finance/warehouse-requests';
    const params = [];
    if (status !== 'all') params.push(`status_filter=${encodeURIComponent(status)}`);
    if (fromDate) params.push(`from_date=${encodeURIComponent(fromDate)}`);
    if (toDate) params.push(`to_date=${encodeURIComponent(toDate)}`);
    if (hotel !== 'all') params.push(`hotel_id=${encodeURIComponent(hotel)}`);
    if (requester !== 'all') params.push(`requester_id=${encodeURIComponent(requester)}`);
    if (item !== 'all') params.push(`item_id=${encodeURIComponent(item)}`);
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (params.length) endpoint += `?${params.join('&')}`;

    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--dim)">جاري تحميل الطلبات...</td></tr>';
    
    apiRequest(endpoint)
      .then(rows => {
        const canReviewWarehouseManager = user && (user.role === 'admin' || user.role === 'warehouse_manager');
        const canReviewSupervisor = user && (user.role === 'admin' || user.role === 'supervisor');
        body.innerHTML = '';
        if (!rows || !rows.length) {
          const hint = status === 'pending' ? 'لا توجد طلبات معلقة حالياً.' : 'لا توجد طلبات مطابقة.';
          body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--dim)">${hint}</td></tr>`;
          return;
        }

        rows.forEach((r) => {
          let actions = '<span class="dim" style="font-size:.8rem">عرض</span>';
          if (r.status === 'pending' && canReviewSupervisor) {
             actions = `<button class="btn bgr bsm" onclick="reviewWarehouseRequest(${r.id}, 'supervisor_approved')">موافقة مبدئية</button>
                        <button class="btn br bsm" onclick="reviewWarehouseRequest(${r.id}, 'rejected')">رفض</button>`;
          } else if (r.status === 'supervisor_approved' && canReviewWarehouseManager) {
             actions = `<button class="btn bgr bsm" onclick="reviewWarehouseRequest(${r.id}, 'approved')">تأكيد الصرف</button>
                        <button class="btn br bsm" onclick="reviewWarehouseRequest(${r.id}, 'rejected')">رفض</button>`;
          }

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${new Date(r.created_at).toLocaleDateString('en-CA')}</td>
            <td>${r.requester_name || '-'}</td>
            <td>${r.item_name || '-'}</td>
            <td>${Number(r.quantity_requested || 0).toLocaleString()} ${r.unit || ''}</td>
            <td>${r.quantity_approved ? `${Number(r.quantity_approved).toLocaleString()} ${r.unit || ''}` : '-'}</td>
            <td>${fwStatusBadge(r.status)}</td>
            <td>${actions}</td>
          `;
          body.appendChild(tr);
        });
      })
      .catch(err => {
        body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red)">⚠️ فشل تحميل الطلبات: ${err.message}</td></tr>`;
      });
  }
}

function resetWarehouseManagerFilters() {
  const wmHotel = document.getElementById('wm-hotel');
  const wmRequester = document.getElementById('wm-requester');
  const wmItem = document.getElementById('wm-item');
  const wmStatus = document.getElementById('wm-status');
  const wmSearch = document.getElementById('wm-search');
  const wmFrom = document.getElementById('wm-from');
  const wmTo = document.getElementById('wm-to');

  if (wmHotel) wmHotel.value = 'all';
  if (wmRequester) wmRequester.value = 'all';
  if (wmItem) wmItem.value = 'all';
  if (wmStatus) wmStatus.value = 'all';
  if (wmSearch) wmSearch.value = '';
  if (wmFrom) wmFrom.value = '';
  if (wmTo) wmTo.value = '';

  loadWarehouseManagerPage();
}

function fwOpenInputDialog({ title, subtitle = '', placeholder = '', defaultValue = '', confirmLabel = 'تأكيد', confirmClass = 'bgr', required = false }) {
  return new Promise((resolve) => {
    const existing = document.getElementById('fw-dialog-ov');
    if (existing) existing.remove();

    const ov = document.createElement('div');
    ov.id = 'fw-dialog-ov';
    ov.className = 'modal-ov show';

    ov.innerHTML = `
      <div class="modal-box" style="max-width:560px" onclick="event.stopPropagation()">
        <div class="modal-head">
          <h3>${title}</h3>
          <button class="modal-close" id="fw-dialog-close">✕</button>
        </div>
        ${subtitle ? `<div class="dim" style="font-size:.85rem;line-height:1.8;margin-bottom:10px">${subtitle}</div>` : ''}
        <div class="fg" style="margin-bottom:12px">
          <input id="fw-dialog-input" type="text" value="${String(defaultValue || '').replace(/"/g, '&quot;')}" placeholder="${placeholder.replace(/"/g, '&quot;')}" />
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn bb" id="fw-dialog-cancel">إلغاء</button>
          <button class="btn ${confirmClass}" id="fw-dialog-confirm">${confirmLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(ov);

    const done = (value) => {
      ov.remove();
      resolve(value);
    };

    ov.addEventListener('click', (e) => {
      if (e.target === ov) done(null);
    });

    const input = document.getElementById('fw-dialog-input');
    const closeBtn = document.getElementById('fw-dialog-close');
    const cancelBtn = document.getElementById('fw-dialog-cancel');
    const confirmBtn = document.getElementById('fw-dialog-confirm');

    if (input) {
      input.focus();
      input.select();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (confirmBtn) confirmBtn.click();
        }
      });
    }

    if (closeBtn) closeBtn.onclick = () => done(null);
    if (cancelBtn) cancelBtn.onclick = () => done(null);
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        const value = (input?.value || '').trim();
        if (required && !value) {
          if (typeof showToast === 'function') showToast('هذا الحقل مطلوب', 'warning');
          return;
        }
        done(value);
      };
    }
  });
}

async function reviewWarehouseRequest(requestId, status) {
  let quantity_approved = null;
  let review_note = null;

  if (status === 'approved' || status === 'supervisor_approved') {
    if (status === 'approved') {
      const qty = await fwOpenInputDialog({
        title: '✨ اعتماد طلب الصرف نهائياً',
        subtitle: 'اكتب الكمية التي تريد صرفها من المستودع الآن.\\nللاعتماد بنفس الكمية المطلوبة اترك الحقل فارغًا.',
        placeholder: 'مثال: 120',
        confirmLabel: 'تأكيد الصرف',
        confirmClass: 'bgr',
        required: false,
      });
      if (qty === null) return;

      if (String(qty || '').trim()) {
        quantity_approved = Number(qty);
        if (!Number.isFinite(quantity_approved) || quantity_approved <= 0) {
          if (typeof showToast === 'function') showToast('الكمية المعتمدة غير صحيحة', 'warning');
          return;
        }
      }
    } else {
      // Supervisor passing approval
      const note = await fwOpenInputDialog({
        title: '✅ موافقة مبدئية',
        subtitle: 'يرجى تأكيد الموافقة ليتم إرسال الطلب إلى مسؤول المستودع للصرف.',
        placeholder: 'ملاحظة (اختياري)...',
        confirmLabel: 'موافق',
        confirmClass: 'bgr',
        required: false,
      });
      if (note === null) return;
      if (String(note || '').trim()) review_note = note;
    }
  } else {
    review_note = await fwOpenInputDialog({
      title: '📝 سبب الرفض',
      subtitle: 'اكتب سببًا واضحًا للمشرف حتى يتمكن من تعديل الطلب بسرعة.',
      placeholder: 'اكتب السبب هنا...',
      confirmLabel: 'تأكيد الرفض',
      confirmClass: 'br',
      required: true,
    });
    if (review_note === null) return;

    if (!String(review_note || '').trim()) {
      if (typeof showToast === 'function') showToast('سبب الرفض مطلوب', 'warning');
      return;
    }
  }

  const payload = { status };
  if (quantity_approved) payload.quantity_approved = quantity_approved;
  if (review_note) payload.review_note = review_note;

  try {
    await apiRequest(`/finance/warehouse-requests/${requestId}/review`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (typeof showToast === 'function') showToast('تم تحديث الطلب', 'success');
    await loadWarehouseManagerPage();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}



async function wmCreateItem() {
  const nameEl = document.getElementById('wm-inv-name');
  const qtyEl = document.getElementById('wm-inv-qty');
  const reorderEl = document.getElementById('wm-inv-reorder');
  const unitEl = document.getElementById('wm-inv-unit');

  const item_name = (nameEl?.value || '').trim();
  const quantity = Number(qtyEl?.value || 0);
  const reorder_level = Number(reorderEl?.value || 0);
  const unit = (unitEl?.value || '').trim() || 'قطعة';

  if (!item_name) {
    if (typeof showToast === 'function') showToast('يرجى إدخال اسم الصنف', 'warning');
    return;
  }

  try {
    await apiRequest('/finance/warehouse-items', {
      method: 'POST',
      body: JSON.stringify({ item_name, quantity, reorder_level, unit }),
    });
    if (nameEl) nameEl.value = '';
    if (qtyEl) qtyEl.value = '';
    if (reorderEl) reorderEl.value = '';
    if (unitEl) unitEl.value = '';
    if (typeof showToast === 'function') showToast('تمت إضافة الصنف بنجاح', 'success');
    await loadWarehouseManagerPage();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

async function wmEditItem(itemId) {
  const row = (wmLastInventory || []).find(r => r.id === itemId);
  if (!row) return;

  const qty = await fwOpenInputDialog({
    title: `✏️ تعديل الكمية: ${row.item_name}`,
    subtitle: `الكمية الحالية: ${row.quantity}`,
    placeholder: 'الكمية الجديدة...',
    defaultValue: row.quantity,
    confirmLabel: 'حفظ',
    required: true
  });
  if (qty === null) return;

  try {
    await apiRequest(`/finance/warehouse-items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: Number(qty) }),
    });
    if (typeof showToast === 'function') showToast('تم التحديث', 'success');
    await loadWarehouseManagerPage();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

async function wmConsumeItem(itemId) {
  const row = (wmLastInventory || []).find(r => r.id === itemId);
  if (!row) return;

  const qty = await fwOpenInputDialog({
    title: `📤 صرف من الصنف: ${row.item_name}`,
    subtitle: `المتاح: ${row.quantity}`,
    placeholder: 'الكمية المصروفة...',
    confirmLabel: 'تأكيد الصرف',
    confirmClass: 'br',
    required: true
  });
  if (qty === null) return;

  try {
    await apiRequest(`/finance/warehouse-items/${itemId}/consume`, {
      method: 'POST',
      body: JSON.stringify({ quantity: Number(qty) }),
    });
    if (typeof showToast === 'function') showToast('تم الصرف بنجاح', 'success');
    await loadWarehouseManagerPage();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

function wmExportCsv() {
  if (!wmLastInventory.length) {
    if (typeof showToast === 'function') showToast('لا توجد بيانات للتصدير', 'warning');
    return;
  }
  const headers = ['الصنف', 'الكمية', 'الوحدة', 'حد إعادة الطلب', 'الحالة'];
  const rows = wmLastInventory.map(r => [
    r.item_name,
    r.quantity,
    r.unit,
    r.reorder_level,
    r.status
  ]);
  
  const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `warehouse-inventory-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

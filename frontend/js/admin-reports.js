/* ==========================================
   راحتي — Admin Reports
   ========================================== */

let arFiltersInited = false;
let arLastData = null;

function arIsAdmin() {
  const user = getStoredUser();
  return user?.role === 'admin';
}

function arCanAddWarehouse() {
  const user = getStoredUser();
  return ['admin', 'supervisor', 'superfv'].includes(user?.role);
}

async function initAdminReportsFilters() {
  if (arFiltersInited) return;

  const user = getStoredUser();
  const role = user?.role;
  const hotelWrap = document.getElementById('ar-filter-hotel-wrap');
  const hotelSelect = document.getElementById('ar-filter-hotel');

  if (!hotelSelect) {
    arFiltersInited = true;
    return;
  }

  if (role === 'admin') {
    if (hotelWrap) hotelWrap.style.display = 'block';
    try {
      const hotels = await apiRequest('/hotels');
      if (hotels && Array.isArray(hotels)) {
        hotelSelect.innerHTML = '<option value="all">كل الفنادق</option>';
        hotels.forEach((h) => {
          const op = document.createElement('option');
          op.value = String(h.id);
          op.textContent = h.name;
          hotelSelect.appendChild(op);
        });

        if (typeof activeAdminHotelFilter !== 'undefined' && activeAdminHotelFilter !== 'all') {
          hotelSelect.value = String(activeAdminHotelFilter);
        }
      }
    } catch (e) {
      // Keep default option when hotels loading fails.
    }
  } else {
    if (hotelWrap) hotelWrap.style.display = 'none';
  }

  const whForm = document.getElementById('ar-wh-form');
  if (whForm) {
    whForm.style.display = ['admin', 'supervisor', 'superfv'].includes(role) ? 'grid' : 'none';
  }

  arFiltersInited = true;
}

function arMoney(v) {
  return `${Number(v || 0).toLocaleString('en-US')} ر`;
}

function arShiftLabel(v) {
  if (v === 'morning') return 'صباحية';
  if (v === 'evening') return 'مسائية';
  if (v === 'night') return 'ليلية';
  return v || '-';
}

function arRoleLabel(role) {
  if (role === 'maintenance') return '🔧 صيانة';
  if (role === 'cleaner') return '🧹 نظافة';
  if (role === 'reception') return '🛎️ استقبال';
  if (role === 'supervisor') return '🏢 مشرف';
  if (role === 'superfv') return '🎯 سوبر فايزر';
  if (role === 'accountant') return '💼 محاسب';
  if (role === 'admin') return '👑 إدارة';
  return role || '-';
}

function arStatusBadge(status) {
  if (status === 'approved') return '<span class="badge b-green">معتمد</span>';
  if (status === 'rejected') return '<span class="badge b-red">مرفوض</span>';
  return '<span class="badge b-orange">بانتظار</span>';
}

function arScoreBadge(score) {
  if (score >= 90) return 'b-green';
  if (score >= 75) return 'b-gold';
  if (score >= 60) return 'b-orange';
  return 'b-red';
}

function arWarehouseBadge(status) {
  if (status === 'ok') return '<span class="badge b-green">كافي</span>';
  if (status === 'low') return '<span class="badge b-orange">منخفض</span>';
  return '<span class="badge b-red">⚠️ أقل من الحد</span>';
}

function arOpenWarehouseDialog({ title, subtitle = '', submitLabel = 'حفظ', fields = [] }) {
  return new Promise((resolve) => {
    const existing = document.getElementById('ar-wh-dialog-ov');
    if (existing) existing.remove();

    const ov = document.createElement('div');
    ov.id = 'ar-wh-dialog-ov';
    ov.className = 'modal-ov show';

    const fieldHtml = fields.map((f) => {
      const type = f.type || 'text';
      const value = f.value === undefined || f.value === null ? '' : String(f.value);
      const placeholder = f.placeholder || '';
      const minAttr = type === 'number' && f.min !== undefined ? `min="${f.min}"` : '';
      return `
        <div class="fg" style="margin:0">
          <label>${f.label}</label>
          ${f.multiline
            ? `<textarea id="ar-dlg-${f.key}" placeholder="${placeholder}">${value}</textarea>`
            : `<input id="ar-dlg-${f.key}" type="${type}" ${minAttr} value="${value}" placeholder="${placeholder}">`}
        </div>
      `;
    }).join('');

    ov.innerHTML = `
      <div class="modal-box ar-wh-dialog-box" onclick="event.stopPropagation()">
        <div class="modal-head">
          <h3>${title}</h3>
          <button class="modal-close" id="ar-wh-dialog-close">✕</button>
        </div>
        ${subtitle ? `<div class="dim" style="font-size:.82rem;margin-bottom:10px">${subtitle}</div>` : ''}
        <div class="ar-wh-dialog-grid">${fieldHtml}</div>
        <div class="ar-wh-dialog-actions">
          <button class="btn bb" id="ar-wh-dialog-cancel">إلغاء</button>
          <button class="btn bg" id="ar-wh-dialog-submit">${submitLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(ov);

    const closeAndResolve = (payload) => {
      ov.remove();
      resolve(payload);
    };

    ov.addEventListener('click', (e) => {
      if (e.target === ov) closeAndResolve(null);
    });

    const closeBtn = document.getElementById('ar-wh-dialog-close');
    const cancelBtn = document.getElementById('ar-wh-dialog-cancel');
    const submitBtn = document.getElementById('ar-wh-dialog-submit');

    if (closeBtn) closeBtn.onclick = () => closeAndResolve(null);
    if (cancelBtn) cancelBtn.onclick = () => closeAndResolve(null);

    if (submitBtn) {
      submitBtn.onclick = () => {
        const payload = {};
        fields.forEach((f) => {
          const el = document.getElementById(`ar-dlg-${f.key}`);
          if (!el) return;
          payload[f.key] = el.value;
        });
        closeAndResolve(payload);
      };
    }
  });
}

async function createWarehouseItem() {
  if (!arCanAddWarehouse()) {
    if (typeof showToast === 'function') showToast('هذه العملية متاحة للإدارة والمشرفين فقط', 'warning');
    return;
  }

  const nameEl = document.getElementById('ar-wh-name');
  const qtyEl = document.getElementById('ar-wh-qty');
  const reorderEl = document.getElementById('ar-wh-reorder');
  const unitEl = document.getElementById('ar-wh-unit');

  const item_name = (nameEl?.value || '').trim();
  const quantity = Number(qtyEl?.value || 0);
  const reorder_level = Number(reorderEl?.value || 0);
  const unit = (unitEl?.value || '').trim() || 'قطعة';

  if (!item_name) {
    if (typeof showToast === 'function') showToast('يرجى إدخال اسم الصنف', 'warning');
    return;
  }
  if (Number.isNaN(quantity) || quantity < 0 || Number.isNaN(reorder_level) || reorder_level < 0) {
    if (typeof showToast === 'function') showToast('الكمية وحد إعادة الطلب يجب أن يكونا أرقامًا صحيحة', 'warning');
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
    await loadAdminReportsData();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

async function editWarehouseItem(itemId) {
  if (!arIsAdmin()) return;

  const row = (arLastData?.warehouse_items || []).find((r) => r.id === itemId);
  if (!row) return;

  const payload = await arOpenWarehouseDialog({
    title: `✏️ تعديل الصنف: ${row.item_name}`,
    subtitle: 'عدّل القيم المطلوبة ثم اضغط حفظ التعديلات.',
    submitLabel: '💾 حفظ التعديلات',
    fields: [
      { key: 'quantity', label: 'الكمية الحالية', type: 'number', min: 0, value: row.quantity ?? 0 },
      { key: 'reorder_level', label: 'حد إعادة الطلب', type: 'number', min: 0, value: row.reorder_level ?? 0 },
      { key: 'unit', label: 'الوحدة', type: 'text', value: row.unit || 'قطعة', placeholder: 'قطعة / لتر' },
    ],
  });
  if (!payload) return;

  const quantity = Number(payload.quantity);
  const reorder_level = Number(payload.reorder_level);
  const unit = String(payload.unit || '').trim() || 'قطعة';

  if (Number.isNaN(quantity) || quantity < 0 || Number.isNaN(reorder_level) || reorder_level < 0) {
    if (typeof showToast === 'function') showToast('القيم المدخلة غير صحيحة', 'warning');
    return;
  }

  try {
    await apiRequest(`/finance/warehouse-items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity, reorder_level, unit }),
    });
    if (typeof showToast === 'function') showToast('تم تحديث الصنف', 'success');
    await loadAdminReportsData();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

async function consumeWarehouseItem(itemId) {
  if (!arIsAdmin()) return;

  const row = (arLastData?.warehouse_items || []).find((r) => r.id === itemId);
  if (!row) return;

  const payload = await arOpenWarehouseDialog({
    title: `📤 صرف من الصنف: ${row.item_name}`,
    subtitle: `المتاح حالياً: ${row.quantity} ${row.unit || ''}`,
    submitLabel: '✅ تأكيد الصرف',
    fields: [
      { key: 'quantity', label: 'الكمية المصروفة', type: 'number', min: 1, value: 1 },
      { key: 'note', label: 'ملاحظة (اختياري)', multiline: true, placeholder: 'مثال: صرف لوردية النظافة' },
    ],
  });
  if (!payload) return;

  const quantity = Number(payload.quantity);
  if (Number.isNaN(quantity) || quantity <= 0) {
    if (typeof showToast === 'function') showToast('الكمية المصروفة غير صحيحة', 'warning');
    return;
  }

  try {
    await apiRequest(`/finance/warehouse-items/${itemId}/consume`, {
      method: 'POST',
      body: JSON.stringify({ quantity, note: payload.note || null }),
    });
    if (typeof showToast === 'function') showToast('تم صرف الكمية بنجاح', 'success');
    await loadAdminReportsData();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

function arCsvEscape(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

function arDownloadCsv(filename, headers, rows) {
  const lines = [headers.map(arCsvEscape).join(',')];
  rows.forEach((row) => {
    lines.push(row.map(arCsvEscape).join(','));
  });

  const csv = `\uFEFF${lines.join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function arHtmlEscape(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function arTodayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function arRequireDataForExport() {
  if (!arLastData) {
    if (typeof showToast === 'function') showToast('حمّل البيانات أولاً قبل التصدير', 'warning');
    return false;
  }
  return true;
}

function exportAdminFinancialCsv() {
  if (!arRequireDataForExport()) return;

  const rows = (arLastData.recent_shift_reports || []).map((r) => [
    r.shift_date || '',
    r.hotel_name || '',
    arShiftLabel(r.shift_type),
    r.reporter_name || '',
    Number(r.network_revenue || 0),
    Number(r.cash_revenue || 0),
    Number(r.network_revenue || 0) + Number(r.cash_revenue || 0),
    r.rooms_sold || 0,
    r.status || '',
  ]);

  if (rows.length === 0) {
    if (typeof showToast === 'function') showToast('لا توجد بيانات مالية للتصدير', 'warning');
    return;
  }

  arDownloadCsv(
    `admin-finance-${arTodayStamp()}.csv`,
    ['التاريخ', 'الفندق', 'الوردية', 'موظف الاستقبال', 'شبكة', 'كاش', 'الإجمالي', 'عدد الغرف', 'الحالة'],
    rows,
  );

  if (typeof showToast === 'function') showToast('تم تصدير ملف المالية بنجاح', 'success');
}

function exportAdminPerformanceCsv() {
  if (!arRequireDataForExport()) return;

  const rows = (arLastData.staff_performance || []).map((r) => [
    r.full_name || '',
    r.hotel_name || '',
    arRoleLabel(r.role || ''),
    r.tasks_total || 0,
    r.tasks_completed || 0,
    `${r.completion_rate || 0}%`,
    `${r.quality_score || 0}%`,
    `${r.discipline_score || 0}%`,
    `${r.overall_score || 0}%`,
  ]);

  if (rows.length === 0) {
    if (typeof showToast === 'function') showToast('لا توجد بيانات أداء للتصدير', 'warning');
    return;
  }

  arDownloadCsv(
    `admin-performance-${arTodayStamp()}.csv`,
    ['الموظف', 'الفندق', 'الدور', 'إجمالي المهام', 'المهام المكتملة', 'الإنجاز', 'الجودة', 'الانضباط', 'التقييم'],
    rows,
  );

  if (typeof showToast === 'function') showToast('تم تصدير ملف أداء الموظفين بنجاح', 'success');
}

function exportAdminRoomsCsv() {
  if (!arRequireDataForExport()) return;

  const rooms = arLastData.rooms || {};
  const total = Number(rooms.total || 0);
  const ready = Number(rooms.ready || 0);
  const cleaning = Number(rooms.cleaning || 0);
  const maintenance = Number(rooms.maintenance || 0);
  const dirty = Number(rooms.dirty || 0);
  const occupied = Number(rooms.occupied || 0);
  const available = Math.max(0, total - occupied);

  const rows = [
    ['إجمالي الغرف', total],
    ['جاهزة', ready],
    ['قيد التنظيف', cleaning],
    ['صيانة', maintenance],
    ['متسخة', dirty],
    ['مشغولة', occupied],
    ['متاحة', available],
  ];

  arDownloadCsv(
    `admin-rooms-${arTodayStamp()}.csv`,
    ['المؤشر', 'القيمة'],
    rows,
  );

  if (typeof showToast === 'function') showToast('تم تصدير ملف الغرف بنجاح', 'success');
}

function exportAdminWarehouseCsv() {
  if (!arRequireDataForExport()) return;

  const rows = (arLastData.warehouse_items || []).map((r) => [
    r.item_name || '',
    Number(r.quantity || 0),
    r.unit || '',
    Number(r.reorder_level || 0),
    r.status || '',
  ]);

  if (rows.length === 0) {
    if (typeof showToast === 'function') showToast('لا توجد بيانات مستودع للتصدير', 'warning');
    return;
  }

  arDownloadCsv(
    `admin-warehouse-${arTodayStamp()}.csv`,
    ['الصنف', 'الكمية', 'الوحدة', 'حد إعادة الطلب', 'الحالة'],
    rows,
  );

  if (typeof showToast === 'function') showToast('تم تصدير ملف المستودع بنجاح', 'success');
}

function exportAdminAllCsv() {
  if (!arRequireDataForExport()) return;

  exportAdminFinancialCsv();
  setTimeout(() => exportAdminPerformanceCsv(), 150);
  setTimeout(() => exportAdminRoomsCsv(), 300);
  setTimeout(() => exportAdminWarehouseCsv(), 450);

  if (typeof showToast === 'function') {
    setTimeout(() => showToast('تم بدء تنزيل جميع ملفات CSV', 'success'), 500);
  }
}

function exportAdminReportPdf() {
  if (!arRequireDataForExport()) return;

  const generatedAt = new Date().toLocaleString('ar-SA');
  const days = document.getElementById('ar-filter-days')?.value || '30';
  const hotelLabel = document.getElementById('ar-filter-hotel')?.selectedOptions?.[0]?.textContent || 'كل الفنادق';

  const financialRows = (arLastData.recent_shift_reports || []).map((r) => `
    <tr>
      <td>${arHtmlEscape(r.shift_date || '-')}</td>
      <td>${arHtmlEscape(r.hotel_name || '-')}</td>
      <td>${arHtmlEscape(arShiftLabel(r.shift_type || '-'))}</td>
      <td>${arHtmlEscape(r.reporter_name || '-')}</td>
      <td>${arHtmlEscape(arMoney(r.network_revenue))}</td>
      <td>${arHtmlEscape(arMoney(r.cash_revenue))}</td>
      <td>${arHtmlEscape(r.status || '-')}</td>
    </tr>
  `).join('');

  const performanceRows = (arLastData.staff_performance || []).map((r) => `
    <tr>
      <td>${arHtmlEscape(r.full_name || '-')}</td>
      <td>${arHtmlEscape(r.hotel_name || '-')}</td>
      <td>${arHtmlEscape(arRoleLabel(r.role || '-'))}</td>
      <td>${arHtmlEscape(`${r.tasks_completed || 0}/${r.tasks_total || 0}`)}</td>
      <td>${arHtmlEscape(`${r.overall_score || 0}%`)}</td>
    </tr>
  `).join('');

  const rooms = arLastData.rooms || {};
  const roomsSummary = [
    ['إجمالي الغرف', Number(rooms.total || 0)],
    ['جاهزة', Number(rooms.ready || 0)],
    ['قيد التنظيف', Number(rooms.cleaning || 0)],
    ['صيانة', Number(rooms.maintenance || 0)],
    ['مشغولة', Number(rooms.occupied || 0)],
  ].map(([label, val]) => `<tr><td>${arHtmlEscape(label)}</td><td>${arHtmlEscape(val)}</td></tr>`).join('');

  const warehouseRows = (arLastData.warehouse_items || []).map((r) => `
    <tr>
      <td>${arHtmlEscape(r.item_name || '-')}</td>
      <td>${arHtmlEscape(`${Number(r.quantity || 0)} ${r.unit || ''}`)}</td>
      <td>${arHtmlEscape(`${Number(r.reorder_level || 0)} ${r.unit || ''}`)}</td>
      <td>${arHtmlEscape(r.status || '-')}</td>
    </tr>
  `).join('');

  const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>تقرير الإدارة</title>
  <style>
    body { font-family: Tahoma, Arial, sans-serif; color: #111; margin: 24px; }
    h1, h2 { margin: 0 0 10px 0; }
    h1 { font-size: 22px; }
    h2 { font-size: 16px; margin-top: 24px; }
    .meta { margin: 10px 0 18px; font-size: 13px; color: #444; }
    .cards { display: flex; gap: 10px; margin: 12px 0 20px; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 10px; min-width: 160px; }
    .label { font-size: 12px; color: #666; }
    .value { font-size: 16px; font-weight: 700; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: right; }
    th { background: #f3f3f3; }
    .empty { color: #777; font-size: 12px; margin-top: 8px; }
    @media print { body { margin: 10mm; } }
  </style>
</head>
<body>
  <h1>تقرير الإدارة - راحتي</h1>
  <div class="meta">تم الإنشاء: ${arHtmlEscape(generatedAt)} | الفترة: آخر ${arHtmlEscape(days)} يوم | الفندق: ${arHtmlEscape(hotelLabel)}</div>

  <div class="cards">
    <div class="card"><div class="label">إيرادات اليوم</div><div class="value">${arHtmlEscape(arMoney(arLastData.financial_cards?.today_revenue))}</div></div>
    <div class="card"><div class="label">مصروفات اليوم</div><div class="value">${arHtmlEscape(arMoney(arLastData.financial_cards?.today_expenses))}</div></div>
    <div class="card"><div class="label">صافي الربح</div><div class="value">${arHtmlEscape(arMoney(arLastData.financial_cards?.today_profit))}</div></div>
  </div>

  <h2>تقارير الاستقبال</h2>
  ${financialRows ? `<table><thead><tr><th>التاريخ</th><th>الفندق</th><th>الوردية</th><th>الموظف</th><th>شبكة</th><th>كاش</th><th>الحالة</th></tr></thead><tbody>${financialRows}</tbody></table>` : '<div class="empty">لا توجد بيانات</div>'}

  <h2>أداء الموظفين</h2>
  ${performanceRows ? `<table><thead><tr><th>الموظف</th><th>الفندق</th><th>الدور</th><th>المهام</th><th>التقييم</th></tr></thead><tbody>${performanceRows}</tbody></table>` : '<div class="empty">لا توجد بيانات</div>'}

  <h2>ملخص الغرف</h2>
  <table><thead><tr><th>المؤشر</th><th>القيمة</th></tr></thead><tbody>${roomsSummary}</tbody></table>

  <h2>المستودع</h2>
  ${warehouseRows ? `<table><thead><tr><th>الصنف</th><th>الكمية</th><th>حد إعادة الطلب</th><th>الحالة</th></tr></thead><tbody>${warehouseRows}</tbody></table>` : '<div class="empty">لا توجد بيانات</div>'}
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) {
    if (typeof showToast === 'function') showToast('المتصفح منع فتح نافذة الطباعة', 'warning');
    return;
  }

  w.document.open();
  w.document.write(html);
  w.document.close();

  setTimeout(() => {
    w.focus();
    w.print();
  }, 250);
}

function renderAdminReports(data) {
  const finRev = document.getElementById('ar-fin-rev');
  const finExp = document.getElementById('ar-fin-exp');
  const finProfit = document.getElementById('ar-fin-profit');
  const finBody = document.getElementById('ar-fin-body');
  const perfBody = document.getElementById('ar-perf-body');
  const roomReady = document.getElementById('ar-room-ready');
  const roomCleaning = document.getElementById('ar-room-cleaning');
  const roomMaint = document.getElementById('ar-room-maint');
  const roomAvailable = document.getElementById('ar-room-available');
  const whBody = document.getElementById('ar-wh-body');

  if (!finBody || !perfBody || !whBody) return;

  if (finRev) finRev.textContent = arMoney(data.financial_cards?.today_revenue);
  if (finExp) finExp.textContent = arMoney(data.financial_cards?.today_expenses);
  if (finProfit) finProfit.textContent = arMoney(data.financial_cards?.today_profit);

  const recentRows = data.recent_shift_reports || [];
  if (recentRows.length === 0) {
    finBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--dim)">لا توجد تقارير استقبال حالياً</td></tr>';
  } else {
    finBody.innerHTML = '';
    recentRows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.hotel_name || '-'}</td>
        <td>${arShiftLabel(row.shift_type)}</td>
        <td>${row.reporter_name || '-'}</td>
        <td>${arMoney(row.network_revenue)}</td>
        <td>${arMoney(row.cash_revenue)}</td>
        <td>${row.rooms_sold || 0}</td>
        <td>${arStatusBadge(row.status)}</td>
      `;
      finBody.appendChild(tr);
    });
  }

  const perfRows = data.staff_performance || [];
  if (perfRows.length === 0) {
    perfBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--dim)">لا توجد بيانات أداء كافية</td></tr>';
  } else {
    perfBody.innerHTML = '';
    perfRows.forEach((row) => {
      const tr = document.createElement('tr');
      const scoreClass = arScoreBadge(row.overall_score || 0);
      tr.innerHTML = `
        <td>${row.full_name || '-'}</td>
        <td>${row.hotel_name || '-'}</td>
        <td>${arRoleLabel(row.role)}</td>
        <td>${row.tasks_completed || 0}/${row.tasks_total || 0}</td>
        <td>${row.completion_rate || 0}%</td>
        <td>${row.quality_score || 0}%</td>
        <td>${row.discipline_score || 0}%</td>
        <td><span class="badge ${scoreClass}">${row.overall_score || 0}%</span></td>
      `;
      perfBody.appendChild(tr);
    });
  }

  if (roomReady) roomReady.textContent = data.rooms?.ready ?? 0;
  if (roomCleaning) roomCleaning.textContent = data.rooms?.cleaning ?? 0;
  if (roomMaint) roomMaint.textContent = data.rooms?.maintenance ?? 0;
  if (roomAvailable) {
    const total = data.rooms?.total ?? 0;
    const occupied = data.rooms?.occupied ?? 0;
    roomAvailable.textContent = Math.max(0, total - occupied);
  }

  const whRows = data.warehouse_items || [];
  if (whRows.length === 0) {
    whBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim)">لا توجد بيانات مستودع</td></tr>';
  } else {
    whBody.innerHTML = '';
    const canManageWarehouse = arIsAdmin();
    whRows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.item_name}</td>
        <td>${Number(row.quantity || 0).toLocaleString('en-US')} ${row.unit || ''}</td>
        <td>${Number(row.reorder_level || 0).toLocaleString('en-US')} ${row.unit || ''}</td>
        <td>${arWarehouseBadge(row.status)}</td>
        <td>
          ${canManageWarehouse
            ? `<button class="btn bb bsm" onclick="editWarehouseItem(${row.id})">✏️ تعديل</button>
               <button class="btn bo bsm" onclick="consumeWarehouseItem(${row.id})">📤 صرف</button>`
            : '<span class="dim" style="font-size:.78rem">عرض فقط</span>'}
        </td>
      `;
      whBody.appendChild(tr);
    });
  }
}

async function loadAdminReportsData() {
  const finBody = document.getElementById('ar-fin-body');
  const perfBody = document.getElementById('ar-perf-body');
  const whBody = document.getElementById('ar-wh-body');
  if (!finBody || !perfBody || !whBody) return;

  await initAdminReportsFilters();

  const daysSelect = document.getElementById('ar-filter-days');
  const hotelSelect = document.getElementById('ar-filter-hotel');
  const days = Number(daysSelect?.value || 30);
  const selectedHotel = hotelSelect?.value || 'all';

  try {
    let endpoint = `/finance/admin-reports/overview?days=${encodeURIComponent(days)}`;
    if (selectedHotel !== 'all') {
      endpoint += `&hotel_id=${encodeURIComponent(selectedHotel)}`;
    } else if (typeof activeAdminHotelFilter !== 'undefined' && activeAdminHotelFilter !== 'all') {
      endpoint += `&hotel_id=${encodeURIComponent(activeAdminHotelFilter)}`;
    }

    const data = await apiRequest(endpoint);
    if (!data) return;
    arLastData = data;
    renderAdminReports(data);
  } catch (err) {
    const msg = `تعذر تحميل البيانات: ${err.message}`;
    finBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red)">${msg}</td></tr>`;
    perfBody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red)">${msg}</td></tr>`;
    whBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red)">${msg}</td></tr>`;
  }
}

/* ==========================================
   راحتي — Reception (Reports + Pricing)
   ========================================== */

function fmtMoney(v) {
  return `${Number(v || 0).toLocaleString('en-US')} ر`;
}

function shiftLabel(v) {
  if (v === 'morning') return 'صباحية';
  if (v === 'evening') return 'مسائية';
  if (v === 'night') return 'ليلية';
  return v || '-';
}

function reportStatusBadge(status) {
  if (status === 'approved') return '<span class="badge b-green">معتمد</span>';
  if (status === 'rejected') return '<span class="badge b-red">مرفوض</span>';
  return '<span class="badge b-orange">بانتظار المحاسب</span>';
}

function shiftStatusText(status) {
  if (status === 'approved') return 'معتمد';
  if (status === 'rejected') return 'مرفوض';
  return 'بانتظار الاعتماد';
}

let accountantReportsCache = [];
let rcEditingReportId = null;
let rcEditingDeadline = null;
let rcEditingPhotoUrl = null;
const DEFAULT_OUR_PRICE_FALLBACK = (typeof OUR_PRICE === 'number' && OUR_PRICE > 0) ? OUR_PRICE : 450;
let ourReferencePrice = DEFAULT_OUR_PRICE_FALLBACK;
let ourReferenceRoomType = 'غرفة عادية';
let ourReferenceUpdatedAt = null;
let DYNAMIC_ROOM_TYPES = [];
let ourReferenceByType = {};

function relativeTime(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

function canEditReceptionReport(report) {
  if (!report || report.status !== 'pending' || !report.submitted_at) return false;
  const submitted = new Date(report.submitted_at).getTime();
  if (Number.isNaN(submitted)) return false;
  const deadline = submitted + (15 * 60 * 1000);
  return Date.now() <= deadline;
}

function setRCEditMode(report) {
  const modeBox = document.getElementById('rc-edit-mode');
  const modeText = document.getElementById('rc-edit-text');
  const submitBtn = document.getElementById('btn-rc-submit');

  rcEditingReportId = report?.id || null;
  rcEditingDeadline = report?.submitted_at
    ? new Date(new Date(report.submitted_at).getTime() + (15 * 60 * 1000))
    : null;
  rcEditingPhotoUrl = report?.photo_url || null;

  if (!report) {
    if (modeBox) modeBox.style.display = 'none';
    if (submitBtn) submitBtn.textContent = '📤 إرسال للإدارة والمحاسب';
    return;
  }

  if (modeBox) modeBox.style.display = 'block';
  if (modeText) {
    const deadlineLabel = rcEditingDeadline ? rcEditingDeadline.toLocaleTimeString('ar-SA') : '—';
    modeText.textContent = `تعديل تقرير #${report.id} متاح حتى ${deadlineLabel}`;
  }
  if (submitBtn) submitBtn.textContent = '💾 حفظ التعديلات';

  document.getElementById('rc-net').value = Number(report.network_revenue || 0);
  document.getElementById('rc-cash').value = Number(report.cash_revenue || 0);
  document.getElementById('rc-rooms').value = Number(report.rooms_sold || 0);
  document.getElementById('rc-date').value = report.shift_date || '';
  document.getElementById('rc-shift').value = report.shift_type || 'morning';
  document.getElementById('rc-pricing').value = report.pricing_notes || '';
  document.getElementById('rc-notes').value = report.notes || '';
  const photoHint = document.getElementById('rc-photo-hint');
  if (photoHint) {
    photoHint.textContent = rcEditingPhotoUrl
      ? 'الصورة الحالية مرفقة. اختر صورة جديدة فقط إذا أردت استبدالها.'
      : 'الصورة ستظهر للمحاسب داخل معاينة PDF قبل الاعتماد.';
  }
}

function beginRCEdit(reportId) {
  if (!window.__rcReportsMap || !window.__rcReportsMap[reportId]) {
    if (typeof showToast === 'function') showToast('لم يتم العثور على التقرير', 'error');
    return;
  }

  const report = window.__rcReportsMap[reportId];
  if (!canEditReceptionReport(report)) {
    if (typeof showToast === 'function') showToast('انتهت مهلة التعديل أو التقرير لم يعد pending', 'warning');
    return;
  }

  setRCEditMode(report);
}

function cancelRCEdit() {
  setRCEditMode(null);
  document.getElementById('rc-net').value = '';
  document.getElementById('rc-cash').value = '';
  document.getElementById('rc-rooms').value = '';
  document.getElementById('rc-pricing').value = '';
  document.getElementById('rc-notes').value = '';
  const photoEl = document.getElementById('rc-photo');
  if (photoEl) photoEl.value = '';
  const photoPreview = document.getElementById('rc-photo-preview');
  if (photoPreview) photoPreview.innerHTML = '';
  const photoHint = document.getElementById('rc-photo-hint');
  if (photoHint) photoHint.textContent = 'الصورة ستظهر للمحاسب داخل معاينة PDF قبل الاعتماد.';
}

async function uploadReceptionReportPhotoIfSelected() {
  const input = document.getElementById('rc-photo');
  const file = input?.files?.[0];
  if (!file) return null;

  const fd = new FormData();
  fd.append('file', file);
  const uploaded = await apiMultipartRequest('/finance/shift-reports/upload-photo', fd);
  if (!uploaded?.url) {
    throw new Error('تعذر رفع صورة التقرير');
  }
  return uploaded.url;
}

/**
 * Submit reception daily report
 */
async function submitRC() {
  const net = Number(document.getElementById('rc-net').value || 0);
  const cash = Number(document.getElementById('rc-cash').value || 0);
  const rooms = Number(document.getElementById('rc-rooms').value || 0);
  const shift = document.getElementById('rc-shift').value;
  const reportDate = document.getElementById('rc-date').value || null;
  const pricing = document.getElementById('rc-pricing').value.trim();
  const notes = document.getElementById('rc-notes').value.trim();

  const btn = document.getElementById('btn-rc-submit');
  const old = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ جاري الإرسال...';
  }

  try {
    if (typeof ensureAttendanceReadyForAction === 'function') {
      await ensureAttendanceReadyForAction();
    }

    const uploadedPhotoUrl = await uploadReceptionReportPhotoIfSelected();
    const photo_url = uploadedPhotoUrl || rcEditingPhotoUrl || null;

    if (rcEditingReportId) {
      if (rcEditingDeadline && Date.now() > rcEditingDeadline.getTime()) {
        throw new Error('انتهت مهلة التعديل (15 دقيقة)');
      }

      await apiRequest(`/finance/shift-reports/${rcEditingReportId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          shift_date: reportDate,
          shift_type: shift,
          network_revenue: net,
          cash_revenue: cash,
          rooms_sold: rooms,
          pricing_notes: pricing || null,
          notes: notes || null,
          photo_url,
        }),
      });
    } else {
      await apiRequest('/finance/shift-reports', {
        method: 'POST',
        body: JSON.stringify({
          shift_date: reportDate,
          shift_type: shift,
          network_revenue: net,
          cash_revenue: cash,
          rooms_sold: rooms,
          pricing_notes: pricing || null,
          notes: notes || null,
          photo_url,
        }),
      });
    }

    if (typeof showToast === 'function') {
      showToast(rcEditingReportId ? 'تم تحديث التقرير بنجاح' : 'تم إرسال التقرير بنجاح وبحالة pending', 'success');
    }

    document.getElementById('rc-net').value = '';
    document.getElementById('rc-cash').value = '';
    document.getElementById('rc-rooms').value = '';
    document.getElementById('rc-pricing').value = '';
    document.getElementById('rc-notes').value = '';
    const photoEl = document.getElementById('rc-photo');
    if (photoEl) photoEl.value = '';
    const photoPreview = document.getElementById('rc-photo-preview');
    if (photoPreview) photoPreview.innerHTML = '';
    const photoHint = document.getElementById('rc-photo-hint');
    if (photoHint) photoHint.textContent = 'الصورة ستظهر للمحاسب داخل معاينة PDF قبل الاعتماد.';

    cancelRCEdit();
    await loadReceptionReports();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = old;
    }
  }
}

async function loadReceptionReports() {
  const body = document.getElementById('rc-reports-body');
  if (!body) return;

  const dateInput = document.getElementById('rc-date');
  if (dateInput && !dateInput.value && !rcEditingReportId) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  try {
    const rows = await apiRequest('/finance/shift-reports');
    if (!rows) return;

    window.__rcReportsMap = {};
    rows.forEach((r) => {
      window.__rcReportsMap[r.id] = r;
    });

    if (rows.length === 0) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim)">لا توجد تقارير حتى الآن</td></tr>';
      return;
    }

    body.innerHTML = '';
    rows.slice(0, 10).forEach((r) => {
      const tr = document.createElement('tr');
      const total = Number(r.network_revenue || 0) + Number(r.cash_revenue || 0);
      const canEdit = canEditReceptionReport(r);
      const actionHtml = canEdit
        ? `<button class="btn bgr bsm" onclick="beginRCEdit(${r.id})">تعديل</button>`
        : '<span class="dim" style="font-size:.75rem">غير متاح</span>';
      tr.innerHTML = `
        <td>${r.shift_date}</td>
        <td>${shiftLabel(r.shift_type)}</td>
        <td>${fmtMoney(total)}</td>
        <td>${reportStatusBadge(r.status)}</td>
        <td>${actionHtml}</td>
      `;
      body.appendChild(tr);
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red)">تعذر التحميل: ${err.message}</td></tr>`;
  }
}

async function reviewShiftReport(reportId, status) {
  const reviewNote = await openReviewNoteDialog(status);
  if (reviewNote === null) return;
  if (status === 'rejected' && !String(reviewNote || '').trim()) {
    if (typeof showToast === 'function') showToast('يرجى كتابة سبب الرفض', 'warning');
    return;
  }

  try {
    await apiRequest(`/finance/shift-reports/${reportId}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status, review_note: reviewNote || null }),
    });

    if (typeof showToast === 'function') showToast('تم تحديث حالة التقرير', 'success');
    await loadAccountantDashboard();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

function openReviewNoteDialog(status) {
  return new Promise((resolve) => {
    const isReject = status === 'rejected';
    const existing = document.getElementById('ac-review-dialog-ov');
    if (existing) existing.remove();

    const ov = document.createElement('div');
    ov.id = 'ac-review-dialog-ov';
    ov.className = 'modal-ov show';

    const title = isReject ? '📝 سبب رفض التقرير' : '📝 ملاحظة الاعتماد';
    const subtitle = isReject
      ? 'اكتب سبب الرفض بشكل واضح قبل المتابعة.'
      : 'يمكنك كتابة ملاحظة اختيارية قبل الاعتماد.';
    const primaryLabel = isReject ? 'تأكيد الرفض' : 'تأكيد الاعتماد';
    const primaryClass = isReject ? 'br' : 'bgr';

    ov.innerHTML = `
      <div class="modal-box ac-review-dialog" onclick="event.stopPropagation()">
        <div class="modal-head" style="margin-bottom:10px;">
          <h3>${title}</h3>
          <button class="modal-close" id="ac-review-close">✕</button>
        </div>
        <div style="color:var(--dim);font-size:.9rem;line-height:1.6;margin-bottom:10px;">${subtitle}</div>
        <textarea id="ac-review-note" rows="4" placeholder="${isReject ? 'اكتب سبب الرفض...' : 'اكتب ملاحظة (اختياري)...'}" style="width:100%;resize:vertical;background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:10px 12px;color:var(--text);font-family:'Tajawal',sans-serif;font-size:.95rem;"></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
          <button class="btn bb" id="ac-review-cancel">إلغاء</button>
          <button class="btn ${primaryClass}" id="ac-review-ok">${primaryLabel}</button>
        </div>
      </div>
    `;

    const escHandler = (ev) => {
      if (ev.key === 'Escape') {
        cleanup(null);
      }
    };

    const cleanup = (value) => {
      document.removeEventListener('keydown', escHandler);
      ov.remove();
      resolve(value);
    };

    ov.addEventListener('click', (e) => {
      if (e.target === ov) cleanup(null);
    });

    document.body.appendChild(ov);

    const noteEl = document.getElementById('ac-review-note');
    const closeEl = document.getElementById('ac-review-close');
    const cancelEl = document.getElementById('ac-review-cancel');
    const okEl = document.getElementById('ac-review-ok');

    if (noteEl) noteEl.focus();
    if (closeEl) closeEl.onclick = () => cleanup(null);
    if (cancelEl) cancelEl.onclick = () => cleanup(null);
    if (okEl) {
      okEl.onclick = () => {
        const value = noteEl ? noteEl.value.trim() : '';
        cleanup(value);
      };
    }

    document.addEventListener('keydown', escHandler);
  });
}

function escapeReportHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildShiftReportPrintableHtml(report) {
  const total = Number(report.network_revenue || 0) + Number(report.cash_revenue || 0);
  const safeShift = escapeReportHtml(shiftLabel(report.shift_type));
  const safeDate = escapeReportHtml(report.shift_date || '-');
  const safeStatus = escapeReportHtml(shiftStatusText(report.status));
  const safePricingNote = escapeReportHtml(report.pricing_notes || '-');
  const safeNote = escapeReportHtml(report.notes || '-');
  const safePhotoUrl = escapeReportHtml(report.photo_url || '');
  const rawShift = String(shiftLabel(report.shift_type) || 'وردية').replace(/\s+/g, '-');
  const rawDate = String(report.shift_date || new Date().toISOString().slice(0, 10)).replace(/\//g, '-');
  const printableFileTitle = `تقرير-الاستقبال-${rawShift}-${rawDate}-#${report.id}`;

  return `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${printableFileTitle}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            font-family: 'Tajawal', Arial, sans-serif;
            background: #f4f7fb;
            color: #122032;
          }
          .sheet {
            background: #fff;
            border-radius: 12px;
            padding: 22px;
            border: 1px solid #dbe4ef;
            max-width: 900px;
            margin: 0 auto;
          }
          .head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #ecf2fa;
            padding-bottom: 12px;
            margin-bottom: 14px;
          }
          .title {
            font-size: 1.35rem;
            font-weight: 800;
          }
          .meta {
            color: #52657a;
            font-size: .95rem;
            margin-top: 6px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(180px, 1fr));
            gap: 10px;
            margin-top: 12px;
          }
          .box {
            border: 1px solid #dde7f2;
            border-radius: 10px;
            padding: 10px 12px;
            background: #fbfdff;
          }
          .lbl {
            font-size: .86rem;
            color: #5f738a;
            margin-bottom: 4px;
          }
          .val {
            font-size: 1.05rem;
            font-weight: 800;
          }
          .note {
            margin-top: 12px;
            padding: 10px 12px;
            border-radius: 10px;
            border: 1px dashed #d5e0ee;
            background: #f8fbff;
            min-height: 58px;
            white-space: pre-wrap;
          }
          .photo {
            margin-top: 12px;
            padding: 10px 12px;
            border-radius: 10px;
            border: 1px dashed #d5e0ee;
            background: #f8fbff;
          }
          .photo img {
            display: block;
            max-width: 100%;
            max-height: 360px;
            border-radius: 10px;
            border: 1px solid #dde7f2;
            background: #fff;
          }
          @media print {
            body { padding: 0; background: #fff; }
            .sheet { border: 0; border-radius: 0; max-width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="head">
            <div>
              <div class="title">تقرير الاستقبال - ${safeShift}</div>
              <div class="meta">التاريخ: ${safeDate} | الحالة: ${safeStatus}</div>
            </div>
            <div class="meta">رقم التقرير: #${report.id}</div>
          </div>

          <div class="grid">
            <div class="box"><div class="lbl">إيراد الشبكة</div><div class="val">${fmtMoney(report.network_revenue)}</div></div>
            <div class="box"><div class="lbl">إيراد الكاش</div><div class="val">${fmtMoney(report.cash_revenue)}</div></div>
            <div class="box"><div class="lbl">الإجمالي</div><div class="val">${fmtMoney(total)}</div></div>
            <div class="box"><div class="lbl">عدد الغرف المباعة</div><div class="val">${report.rooms_sold || 0}</div></div>
          </div>

          <div class="note">
            <div class="lbl">ملاحظات التسعير</div>
            <div>${safePricingNote}</div>
          </div>

          <div class="note">
            <div class="lbl">ملاحظات الاستقبال</div>
            <div>${safeNote}</div>
          </div>

          ${safePhotoUrl ? `
          <div class="photo">
            <div class="lbl">الصورة المرفقة</div>
            <img src="${safePhotoUrl}" alt="مرفق التقرير" loading="eager" referrerpolicy="no-referrer" />
          </div>
          ` : ''}
        </div>
      </body>
    </html>
  `;
}

function closeShiftReportPdfPreview() {
  const existing = document.getElementById('ac-shift-pdf-ov');
  if (existing) existing.remove();
}

function printShiftReportPdfPreview() {
  const frame = document.getElementById('ac-shift-pdf-frame');
  if (!frame || !frame.contentWindow) {
    if (typeof showToast === 'function') showToast('تعذر تجهيز الطباعة الآن', 'warning');
    return;
  }
  frame.contentWindow.focus();
  frame.contentWindow.print();
}

function openShiftReportPdf(reportId) {
  const report = accountantReportsCache.find((r) => Number(r.id) === Number(reportId));
  if (!report) {
    if (typeof showToast === 'function') showToast('تعذر العثور على التقرير', 'error');
    return;
  }

  closeShiftReportPdfPreview();

  const ov = document.createElement('div');
  ov.id = 'ac-shift-pdf-ov';
  ov.className = 'modal-ov show';
  ov.innerHTML = `
    <div class="modal-box" style="max-width:min(96vw,1100px);height:min(90vh,860px);display:flex;flex-direction:column;padding:14px;">
      <div class="modal-head" style="margin-bottom:10px;">
        <h3 style="font-size:1rem;">📄 معاينة التقرير قبل الاعتماد</h3>
        <button class="modal-close" id="ac-shift-pdf-close">✕</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <button class="btn bgr bsm" id="ac-shift-pdf-print">🖨️ حفظ/طباعة PDF</button>
        <button class="btn bb bsm" id="ac-shift-pdf-close2">إغلاق</button>
      </div>
      <iframe id="ac-shift-pdf-frame" title="معاينة تقرير الوردية" style="width:100%;flex:1;border:1px solid var(--line);border-radius:12px;background:#fff;"></iframe>
    </div>
  `;

  ov.addEventListener('click', (e) => {
    if (e.target === ov) closeShiftReportPdfPreview();
  });
  document.body.appendChild(ov);

  const frame = document.getElementById('ac-shift-pdf-frame');
  if (frame) frame.srcdoc = buildShiftReportPrintableHtml(report);

  const closeBtn = document.getElementById('ac-shift-pdf-close');
  const closeBtn2 = document.getElementById('ac-shift-pdf-close2');
  const printBtn = document.getElementById('ac-shift-pdf-print');
  if (closeBtn) closeBtn.onclick = closeShiftReportPdfPreview;
  if (closeBtn2) closeBtn2.onclick = closeShiftReportPdfPreview;
  if (printBtn) printBtn.onclick = printShiftReportPdfPreview;
}

async function loadAccountantDashboard() {
  const revenueEl = document.getElementById('ac-revenue');
  const expensesEl = document.getElementById('ac-expenses');
  const profitEl = document.getElementById('ac-profit');
  const pendingList = document.getElementById('ac-pending-list');
  const expensesBody = document.getElementById('ac-expenses-body');

  if (!pendingList || !expensesBody) return;

  const historyBody = document.getElementById('ac-history-body');

  try {
    const [finance, allReports, expenses] = await Promise.all([
      apiRequest('/finance/dashboard/overview?days=7'),
      apiRequest('/finance/shift-reports'),
      apiRequest('/finance/expenses'),
    ]);

    accountantReportsCache = allReports || [];
    const pendingReports = accountantReportsCache.filter((r) => r.status === 'pending');

    if (finance) {
      if (revenueEl) revenueEl.textContent = fmtMoney(finance.total_revenue);
      if (expensesEl) expensesEl.textContent = fmtMoney(finance.total_expenses);
      if (profitEl) profitEl.textContent = fmtMoney(finance.net_profit);
    }

    if (historyBody) {
      renderAccountantHistory();
    }

    if (!pendingReports || pendingReports.length === 0) {
      pendingList.innerHTML = '<div class="dim">لا توجد تقارير pending حالياً</div>';
    } else {
      pendingList.innerHTML = '';
      pendingReports.forEach((r) => {
        const total = Number(r.network_revenue || 0) + Number(r.cash_revenue || 0);
        const card = document.createElement('div');
        card.className = 'tkc';
        card.style.setProperty('--tc-color', 'var(--orange)');
        card.innerHTML = `
          <div class="tkh">
            <div>
              <div class="tktitle">تقرير ${shiftLabel(r.shift_type)} — ${r.shift_date}</div>
              <div class="tkmeta">
                <span>شبكة: ${fmtMoney(r.network_revenue)}</span>
                <span>كاش: ${fmtMoney(r.cash_revenue)}</span>
                <span>الإجمالي: ${fmtMoney(total)}</span>
                <span>غرف: ${r.rooms_sold}</span>
              </div>
            </div>
            <span class="badge b-orange">pending</span>
          </div>
          <div class="tkact">
            <button class="btn bsm" onclick="openShiftReportPdf(${r.id})">📄 عرض PDF</button>
            <button class="btn bgr bsm" onclick="reviewShiftReport(${r.id}, 'approved')">✅ اعتماد</button>
            <button class="btn br bsm" onclick="reviewShiftReport(${r.id}, 'rejected')">❌ رفض</button>
          </div>
        `;
        pendingList.appendChild(card);
      });
    }

    if (!expenses || expenses.length === 0) {
      expensesBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--dim)">لا توجد مصروفات</td></tr>';
    } else {
      expensesBody.innerHTML = '';
      expenses.slice(0, 10).forEach((e) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${e.category}</td>
          <td>${e.description}</td>
          <td>${fmtMoney(e.amount)}</td>
          <td>${e.expense_date}</td>
        `;
        expensesBody.appendChild(tr);
      });
    }
  } catch (err) {
    pendingList.innerHTML = `<div class="login-error show">⚠️ ${err.message}</div>`;
    expensesBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--red)">تعذر التحميل</td></tr>`;
  }
}

function renderAccountantHistory() {
  const historyBody = document.getElementById('ac-history-body');
  if (!historyBody) return;

  const statusFilter = document.getElementById('ac-history-status')?.value || 'all';
  const dateFilter = document.getElementById('ac-history-date')?.value || '';

  let rows = accountantReportsCache.filter((r) => r.status === 'approved' || r.status === 'rejected');
  if (statusFilter !== 'all') {
    rows = rows.filter((r) => r.status === statusFilter);
  }
  if (dateFilter) {
    rows = rows.filter((r) => r.shift_date === dateFilter);
  }

  if (rows.length === 0) {
    historyBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim)">لا توجد بيانات مطابقة</td></tr>';
    return;
  }

  historyBody.innerHTML = '';
  rows.slice(0, 20).forEach((r) => {
    const total = Number(r.network_revenue || 0) + Number(r.cash_revenue || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.shift_date}</td>
      <td>${shiftLabel(r.shift_type)}</td>
      <td>${fmtMoney(total)}</td>
      <td>${reportStatusBadge(r.status)}</td>
      <td>${r.review_note || '-'}</td>
    `;
    historyBody.appendChild(tr);
  });
}

function renderCompetitorPrices(rows) {
  const tableBody = document.getElementById('cp-table-body');
  const grid = document.getElementById('price-comp-grid');
  if (!tableBody || !grid) return;

  const updatedLabel = ourReferenceUpdatedAt ? `آخر تحديث: ${relativeTime(ourReferenceUpdatedAt)}` : 'قيمة افتراضية';
  const canManage = ['admin', 'supervisor', 'superfv'].includes(currentRole);
  const selectedType = ourReferenceRoomType || 'غرفة عادية';
  const selectedValue = Number(ourReferenceByType[selectedType]?.price || DEFAULT_OUR_PRICE_FALLBACK);
  const typeOptions = DYNAMIC_ROOM_TYPES
    .map((rt) => `<option value="${rt}" ${rt === selectedType ? 'selected' : ''}>${rt}</option>`)
    .join('');
  const manageHtml = canManage
    ? `
      <div class="pc-our-actions">
        <select id="cp-our-type" onchange="syncOurPriceEditor()" style="padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--soft);color:var(--text);">
          ${typeOptions}
        </select>
        <input id="cp-our-price" type="number" min="1" step="1" value="${Math.round(selectedValue)}" style="width:120px;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--soft);color:var(--text);">
        <button class="btn bgr bsm" onclick="saveOurReferencePrice()">💾 حفظ السعر</button>
      </div>
    `
    : '';

  // keep "our" card only
  const ourRows = DYNAMIC_ROOM_TYPES.map((roomType) => {
    const row = ourReferenceByType[roomType] || { price: DEFAULT_OUR_PRICE_FALLBACK, updated_at: null };
    const p = Number(row.price || DEFAULT_OUR_PRICE_FALLBACK);
    return `<div class="pc-room-row"><span class="pc-room-type">${roomType}</span><strong class="pc-room-price">${fmtMoney(p)}</strong></div>`;
  }).join('');

  grid.innerHTML = `
    <div class="pc ours pc-hero">
      <div class="pname">🏨 راحتي (نحن)</div>
      <div class="pdiff" style="color:var(--dim);">أسعارنا المرجعية حسب نوع الغرفة</div>
      <div class="pdiff" style="color:var(--dim);font-size:.78rem;">${updatedLabel}</div>
      <div class="pc-room-list">
        <div class="pc-room-head"><span>نوع الغرفة</span><span>سعرنا</span></div>
        ${ourRows}
      </div>
      ${manageHtml}
    </div>
  `;

  if (!rows || rows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim)">لا توجد أسعار منافسين بعد</td></tr>';
    return;
  }

  tableBody.innerHTML = '';

  rows.forEach((r) => {
    const price = Number(r.price || 0);
    const ourRowPrice = Number(ourReferenceByType[r.room_type]?.price || DEFAULT_OUR_PRICE_FALLBACK);
    const safeOurRoomPrice = ourRowPrice > 0 ? ourRowPrice : DEFAULT_OUR_PRICE_FALLBACK;
    const diff = price - safeOurRoomPrice;
    const diffAbs = Math.abs(diff).toFixed(0);
    const diffPct = ((Math.abs(diff) / safeOurRoomPrice) * 100).toFixed(1);
    let diffBadge = `<span class="badge b-orange">مماثل تقريبًا</span>`;
    if (diff > 0) {
      diffBadge = `<span class="badge b-green">نحن أرخص ${diffAbs} ر</span>`;
    } else if (diff < 0) {
      diffBadge = `<span class="badge b-red">هم أرخص ${diffAbs} ر</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.competitor_name}</td>
      <td>${r.room_type}</td>
      <td>${fmtMoney(price)}</td>
      <td>${diffBadge}</td>
      <td>${relativeTime(r.captured_at)}</td>
    `;
    tableBody.appendChild(tr);

  });

  const groupedHotels = new Map();
  const orderedRows = [...rows].sort((a, b) => {
    const ta = new Date(a.captured_at || 0).getTime();
    const tb = new Date(b.captured_at || 0).getTime();
    if (tb !== ta) return tb - ta;
    return Number(b.id || 0) - Number(a.id || 0);
  });

  orderedRows.forEach((r) => {
    const rawName = (r.competitor_name || 'فندق غير معروف').trim();
    const hotelKey = rawName.toLowerCase();
    if (!groupedHotels.has(hotelKey)) {
      groupedHotels.set(hotelKey, {
        name: rawName,
        roomPrices: new Map(),
        latestAt: r.captured_at,
      });
    }

    const hotel = groupedHotels.get(hotelKey);
    const roomType = (r.room_type || 'غير محدد').trim();
    const current = hotel.roomPrices.get(roomType);
    // orderedRows is newest first; keep the first value encountered per room type.
    if (!current) {
      hotel.roomPrices.set(roomType, { price: Number(r.price || 0), captured_at: r.captured_at });
    }

    if (!hotel.latestAt || new Date(r.captured_at).getTime() > new Date(hotel.latestAt).getTime()) {
      hotel.latestAt = r.captured_at;
    }
  });

  groupedHotels.forEach((hotel) => {
    const card = document.createElement('div');
    card.className = 'pc pc-hotel';

    let summary = '<span style="color:var(--dim)">المقارنة محسوبة لكل نوع غرفة بشكل مستقل</span>';

    const roomRows = Array.from(hotel.roomPrices.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'ar'))
      .map(([roomType, row]) => {
        const ourRoomPrice = Number(ourReferenceByType[roomType]?.price || DEFAULT_OUR_PRICE_FALLBACK);
        const diff = Number(row.price || 0) - ourRoomPrice;
        const diffLabel = diff === 0
          ? '<span style="color:var(--dim)">مماثل</span>'
          : (diff > 0
            ? `<span class="diff-pos">+${Math.abs(diff).toFixed(0)} ر</span>`
            : `<span class="diff-neg">-${Math.abs(diff).toFixed(0)} ر</span>`);

        return `
        <div class="pc-room-row">
          <span class="pc-room-type">${roomType}</span>
          <strong class="pc-room-price">${fmtMoney(row.price)}</strong>
          <span>${diffLabel}</span>
        </div>
      `;
      })
      .join('');

    const roomCount = hotel.roomPrices.size;
    const hotelDataJson = encodeURIComponent(JSON.stringify(Object.fromEntries(hotel.roomPrices)));

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div class="pname">${hotel.name}</div>
        <button class="btn bb bsm" style="padding:4px 8px; font-size:12px;" onclick="fillCompetitorForm('${hotel.name.replace(/'/g, "\\'")}', '${hotelDataJson}')">✏️ تعديل</button>
      </div>
      <div class="pdiff">${summary}</div>
      <div class="pc-room-count">الأنواع المسجلة: ${roomCount}</div>
      <div class="pc-room-list">
        <div class="pc-room-head">
          <span>نوع الغرفة</span>
          <span>السعر</span>
          <span>الفرق عن سعرنا</span>
        </div>
        ${roomRows}
      </div>
      <div class="pdiff" style="color:var(--dim);font-size:.74rem;margin-top:6px">آخر تحديث: ${relativeTime(hotel.latestAt)}</div>
    `;
    grid.appendChild(card);
  });
}

window.fillCompetitorForm = function(hotelName, pricesJsonRaw) {
  const nameEl = document.getElementById('cp-name');
  if (nameEl) nameEl.value = hotelName;

  try {
    const prices = JSON.parse(decodeURIComponent(pricesJsonRaw));
    const inputs = document.querySelectorAll('.cp-dynamic-price');
    inputs.forEach(input => {
      const rt = input.dataset.rt;
      if (prices[rt]) {
        input.value = prices[rt].price;
      } else {
        input.value = '';
      }
    });

    const addBtn = document.querySelector('#p-rc-prices .card button.btn.bg');
    if (addBtn) addBtn.textContent = '💾 تحديث السعر';

    // Scroll to the form
    nameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    console.error('Error parsing prices', err);
  }
};

async function loadOurReferencePrice(roomType = 'غرفة عادية') {
  const endpoint = `/finance/our-price?room_type=${encodeURIComponent(roomType)}`;
  const row = await apiRequest(endpoint);
  if (!row) return;

  const parsed = Number(row.price);
  if (Number.isFinite(parsed) && parsed > 0) {
    ourReferencePrice = parsed;
    ourReferenceByType[roomType] = {
      price: parsed,
      updated_at: row.updated_at || null,
    };
  }
  ourReferenceRoomType = row.room_type || roomType;
  ourReferenceUpdatedAt = row.updated_at || null;
}

async function loadDynamicRoomTypesForReception() {
  DYNAMIC_ROOM_TYPES = [];
  ourReferenceByType = {};
  const user = getStoredUser();
  const hotelId = user?.hotel_id;
  const endpoint = hotelId ? `/room-types?hotel_id=${hotelId}` : '/room-types';

  try {
    const types = await apiRequest(endpoint);
    if (types && types.length > 0) {
      DYNAMIC_ROOM_TYPES = types.map(t => t.name);
      
      DYNAMIC_ROOM_TYPES.forEach(rt => {
        ourReferenceByType[rt] = { price: DEFAULT_OUR_PRICE_FALLBACK, updated_at: null };
      });

      types.forEach(t => {
        if (t.base_price > 0) {
          ourReferenceByType[t.name] = { price: t.base_price, updated_at: t.updated_at };
        }
      });
    }
  } catch (err) {
    console.error('Failed to load room types for reception', err);
  }

  if (DYNAMIC_ROOM_TYPES.length === 0) {
    DYNAMIC_ROOM_TYPES = ['غرفة عادية']; // fallback
    DYNAMIC_ROOM_TYPES.forEach(rt => {
      ourReferenceByType[rt] = { price: DEFAULT_OUR_PRICE_FALLBACK, updated_at: null };
    });
  }

  const container = document.getElementById('cp-dynamic-inputs');
  if (container) {
    let ht = `<div class="fg" style="grid-column: 1 / -1;"><label>اسم الفندق المنافس</label><input type="text" id="cp-name" placeholder="مثال: فندق هيلتون"></div>`;
    DYNAMIC_ROOM_TYPES.forEach((rt) => {
      ht += `<div class="fg"><label>سعر ${rt} (ريال)</label><input type="number" data-rt="${rt}" class="cp-dynamic-price" placeholder="0"></div>`;
    });
    container.innerHTML = ht;
  }
}

async function loadAllOurReferencePrices() {
  await loadDynamicRoomTypesForReception();
}

function syncOurPriceEditor() {
  const typeEl = document.getElementById('cp-our-type');
  const priceEl = document.getElementById('cp-our-price');
  if (!typeEl || !priceEl) return;

  const selectedType = typeEl.value || (DYNAMIC_ROOM_TYPES[0] || 'غرفة عادية');
  const selectedPrice = Number(ourReferenceByType[selectedType]?.price || DEFAULT_OUR_PRICE_FALLBACK);
  ourReferenceRoomType = selectedType;
  priceEl.value = String(Math.round(selectedPrice));
}

async function saveOurReferencePrice() {
  const input = document.getElementById('cp-our-price');
  const typeEl = document.getElementById('cp-our-type');
  if (!input) return;

  const parsed = Number(input.value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    if (typeof showToast === 'function') showToast('يرجى إدخال سعر صحيح أكبر من صفر', 'warning');
    return;
  }

  const roomTypeToSave = typeEl?.value || ourReferenceRoomType || 'غرفة عادية';

  try {
    const row = await apiRequest('/finance/our-price', {
      method: 'PUT',
      body: JSON.stringify({
        room_type: roomTypeToSave,
        price: parsed,
      }),
    });

    if (row) {
      ourReferencePrice = Number(row.price || parsed);
      ourReferenceRoomType = row.room_type || roomTypeToSave;
      ourReferenceByType[ourReferenceRoomType] = {
        price: ourReferencePrice,
        updated_at: row.updated_at || null,
      };
      ourReferenceUpdatedAt = row.updated_at || null;
      if (typeof showToast === 'function') showToast('تم تحديث سعرنا المرجعي بنجاح', 'success');
      await loadCompetitorPrices();
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

async function loadCompetitorPrices() {
  const tableBody = document.getElementById('cp-table-body');
  if (!tableBody) return;

  try {
    const rows = await apiRequest('/finance/competitor-prices?limit=200');
    await loadAllOurReferencePrices().catch(() => {
      ourReferencePrice = DEFAULT_OUR_PRICE_FALLBACK;
      ourReferenceRoomType = 'غرفة عادية';
      ourReferenceUpdatedAt = null;
    });
    if (!rows) return;
    renderCompetitorPrices(rows);
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red)">تعذر تحميل الأسعار: ${err.message}</td></tr>`;
  }
}

/**
 * Add a competitor price entry
 */
async function addCompPrice() {
  const name = document.getElementById('cp-name')?.value.trim();
  const note = document.getElementById('cp-note')?.value.trim();

  if (!name) {
    if (typeof showToast === 'function') showToast('يرجى إدخال اسم الفندق', 'warning');
    return;
  }

  const payloads = [];
  const inputs = document.querySelectorAll('.cp-dynamic-price');
  inputs.forEach(input => {
    const price = parseFloat(input.value || '0');
    if (price > 0) {
      payloads.push({ room_type: input.dataset.rt, price: price });
    }
  });

  if (payloads.length === 0) {
    if (typeof showToast === 'function') showToast('أدخل سعرًا واحدًا على الأقل لأي نوع غرفة', 'warning');
    return;
  }

  try {
    await Promise.all(payloads.map((row) => apiRequest('/finance/competitor-prices', {
      method: 'POST',
      body: JSON.stringify({
        competitor_name: name,
        room_type: row.room_type,
        price: row.price,
        note: note || null,
      }),
    })));

    if (document.getElementById('cp-name')) document.getElementById('cp-name').value = '';
    inputs.forEach(input => input.value = '');
    if (document.getElementById('cp-note')) document.getElementById('cp-note').value = '';
    
    const addBtn = document.querySelector('#p-rc-prices .card button.btn.bg');
    if (addBtn) addBtn.textContent = '+ إضافة السعر';

    if (typeof showToast === 'function') showToast('تم حفظ أسعار المنافس بنجاح', 'success');
    await loadCompetitorPrices();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

async function submitSupervisorShiftReport() {
  const net = Number(document.getElementById('sup-shift-net')?.value || 0);
  const cash = Number(document.getElementById('sup-shift-cash')?.value || 0);
  const rooms = Number(document.getElementById('sup-shift-rooms')?.value || 0);
  const expenses = Number(document.getElementById('sup-shift-expenses')?.value || 0);
  const shiftDate = document.getElementById('sup-shift-date')?.value || null;
  const shiftType = document.getElementById('sup-shift-type')?.value || 'morning';
  const notes = document.getElementById('sup-shift-notes')?.value.trim() || null;
  const invoiceInput = document.getElementById('sup-expense-invoice');
  const invoiceFile = invoiceInput && invoiceInput.files ? invoiceInput.files[0] : null;

  if (net < 0 || cash < 0 || rooms < 0 || expenses < 0) {
    if (typeof showToast === 'function') showToast('يرجى إدخال قيم صحيحة', 'warning');
    return;
  }

  const btn = document.getElementById('sup-shift-submit-btn');
  const old = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ جاري الرفع...';
  }

  try {
    if (typeof ensureAttendanceReadyForAction === 'function') {
      await ensureAttendanceReadyForAction();
    }

    let invoiceUrl = null;
    if (invoiceFile) {
      const fd = new FormData();
      fd.append('file', invoiceFile);
      const uploadedInvoice = await apiMultipartRequest('/finance/shift-reports/upload-photo', fd);
      invoiceUrl = uploadedInvoice.url;
    }

    await apiRequest('/finance/shift-reports', {
      method: 'POST',
      body: JSON.stringify({
        shift_date: shiftDate,
        shift_type: shiftType,
        network_revenue: net,
        cash_revenue: cash,
        rooms_sold: rooms,
        notes,
        photo_url: invoiceUrl,
      }),
    });

    if (expenses > 0) {
      const expenseDescription = invoiceUrl
        ? `مصروفات نثرية لوردية ${shiftLabel(shiftType)} | فاتورة: ${invoiceUrl}`
        : `مصروفات نثرية لوردية ${shiftLabel(shiftType)}`;

      await apiRequest('/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category: 'daily',
          amount: expenses,
          description: expenseDescription,
          expense_date: shiftDate,
        }),
      });
    }

    if (typeof showToast === 'function') showToast('تم رفع تقرير الوردية بنجاح', 'success');

    const ids = [
      'sup-shift-net',
      'sup-shift-cash',
      'sup-shift-rooms',
      'sup-shift-expenses',
      'sup-shift-notes',
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    if (invoiceInput) {
      invoiceInput.value = '';
      delete invoiceInput.dataset.photoUrl;
    }
    const invoicePreview = document.getElementById('sup-expense-invoice-preview');
    if (invoicePreview) {
      invoicePreview.innerHTML = '';
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = old;
    }
  }
}

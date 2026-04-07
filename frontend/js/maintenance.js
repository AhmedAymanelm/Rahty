/* ==========================================
   راحتي — Maintenance
   ========================================== */

let activeMaintenanceReport = null;
let maintenanceReportsCache = [];

function escText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function uploadMaintenancePhoto(file) {
  if (!file) {
    throw new Error('لم يتم اختيار ملف الصورة');
  }

  const fd = new FormData();
  fd.append('file', file);
  const result = await apiMultipartRequest('/maintenance/upload-photo', fd);
  if (!result || !result.url) {
    throw new Error('تعذر رفع الصورة');
  }
  return result;
}

function maintenanceStatusMeta(status) {
  const m = {
    reported: { label: 'مبلغ', badge: 'b-red' },
    assigned: { label: 'مسند', badge: 'b-blue' },
    in_progress: { label: 'قيد التنفيذ', badge: 'b-orange' },
    waiting_parts: { label: 'بانتظار قطع', badge: 'b-gold' },
    completed: { label: 'مكتمل', badge: 'b-green' },
    verified: { label: 'تم التحقق', badge: 'b-green' },
  };
  return m[status] || { label: status, badge: 'b-blue' };
}

function fmtDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(start, end) {
  if (!start || !end) return '—';
  const ms = new Date(end) - new Date(start);
  if (Number.isNaN(ms) || ms <= 0) return '—';
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}س ${m}د` : `${m}د`;
}

function openImageLightbox(url) {
  const ov = document.getElementById('img-lightbox');
  const img = document.getElementById('img-lightbox-photo');
  if (!ov || !img) return;

  img.src = url;
  ov.classList.add('show');
}

function closeImageLightbox() {
  const ov = document.getElementById('img-lightbox');
  const img = document.getElementById('img-lightbox-photo');
  if (ov) ov.classList.remove('show');
  if (img) img.removeAttribute('src');
}

function openMaintenanceImage(event, url) {
  if (event) event.preventDefault();
  if (!url) return false;
  openImageLightbox(url);
  return false;
}

function resetMaintenanceJobForm() {
  const diagnosis = document.getElementById('mn-diagnosis');
  const repairNotes = document.getElementById('mn-repair-notes');
  const parts = document.getElementById('mn-parts-name');
  const afterInput = document.getElementById('mn-after-input');
  const afterPreview = document.getElementById('mn-after');

  if (diagnosis) diagnosis.value = '';
  if (repairNotes) repairNotes.value = '';
  if (parts) parts.value = '';
  if (afterInput) afterInput.value = '';
  if (afterPreview) afterPreview.innerHTML = '';
}

function syncMaintenanceJobUi(report) {
  const startBtn = document.getElementById('mn-start-work-btn');
  const requestBtn = document.getElementById('mn-request-parts-btn');
  const subtitle = document.getElementById('mn-job-subtitle');

  if (!report) return;

  const meta = maintenanceStatusMeta(report.status);
  if (subtitle) subtitle.textContent = `${report.title} • الحالة: ${meta.label}`;

  if (startBtn) {
    const hideStart = ['in_progress', 'waiting_parts', 'completed', 'verified'].includes(report.status);
    startBtn.style.display = hideStart ? 'none' : 'inline-flex';
  }

  if (requestBtn) {
    const hideRequest = ['completed', 'verified'].includes(report.status);
    requestBtn.style.display = hideRequest ? 'none' : 'inline-flex';
  }
}

function openMaintenanceJob(reportId) {
  const report = maintenanceReportsCache.find(r => r.id === reportId);
  if (!report) {
    showToast('تعذر العثور على البلاغ', 'error');
    return;
  }

  activeMaintenanceReport = report;

  const title = document.getElementById('mn-job-title');
  const subtitle = document.getElementById('mn-job-subtitle');
  const roomNumber = document.getElementById('mn-room-number');
  const diagnosis = document.getElementById('mn-diagnosis');
  const repairNotes = document.getElementById('mn-repair-notes');
  const parts = document.getElementById('mn-parts-name');
  const afterPreview = document.getElementById('mn-after');
  const afterInput = document.getElementById('mn-after-input');

  if (title) title.textContent = `🔧 معالجة بلاغ غرفة ${report.room_id}`;
  if (subtitle) subtitle.textContent = `${report.title} • الحالة: ${maintenanceStatusMeta(report.status).label}`;
  if (roomNumber) roomNumber.value = report.room_id;
  if (diagnosis) diagnosis.value = report.diagnosis || '';
  if (repairNotes) repairNotes.value = report.verification_notes || '';
  if (parts) parts.value = report.parts_notes || '';
  if (afterPreview) afterPreview.innerHTML = '';
  if (afterInput) {
    afterInput.value = '';
    delete afterInput.dataset.photoUrl;
  }

  syncMaintenanceJobUi(report);

  showPg('p-mn-job');
}

function renderMaintenanceTasks(reports) {
  const container = document.getElementById('mn-reports-container');
  const archiveWrap = document.getElementById('mn-archive-wrap');
  const archiveContainer = document.getElementById('mn-archive-container');
  if (!container) return;

  const openCount = document.getElementById('mn-open-count');
  const progressCount = document.getElementById('mn-progress-count');
  const completedCount = document.getElementById('mn-completed-count');

  if (openCount) {
    openCount.textContent = reports.filter(r => ['reported', 'assigned', 'waiting_parts'].includes(r.status)).length;
  }
  if (progressCount) {
    progressCount.textContent = reports.filter(r => r.status === 'in_progress').length;
  }
  if (completedCount) {
    completedCount.textContent = reports.filter(r => ['completed', 'verified'].includes(r.status)).length;
  }

  const archiveReports = reports.filter(r => ['completed', 'verified'].includes(r.status));
  const activeReports = reports.filter(r => !['completed', 'verified'].includes(r.status));

  if (activeReports.length === 0) {
    container.innerHTML = '<div class="dim" style="text-align:center">لا توجد بلاغات صيانة حالياً.</div>';
  } else {
    container.innerHTML = '';
  }

  activeReports.forEach((r) => {
    const meta = maintenanceStatusMeta(r.status);
    const card = document.createElement('div');
    card.className = 'mn-ticket';

    const hasLocalUploadPhoto = !!(r.before_photo_url && String(r.before_photo_url).includes('/uploads/maintenance/'));
    const beforePhoto = hasLocalUploadPhoto
      ? `<a class="mn-ticket-photo-link" href="${escText(r.before_photo_url)}" onclick="return openMaintenanceImage(event, '${escText(r.before_photo_url)}')" title="اضغط لعرض الصورة بالحجم الكامل"><img class="mn-ticket-photo" src="${escText(r.before_photo_url)}" alt="صورة العطل قبل الإصلاح" loading="lazy" onerror="this.parentElement.outerHTML='<div class=\'mn-ticket-photo-fallback\'>📷 تعذر تحميل الصورة</div>'"></a>`
      : '<div class="mn-ticket-photo-fallback">📷 الصورة غير متاحة للمعاينة</div>';

    const subtitle = r.description ? escText(r.description) : 'لا يوجد وصف إضافي من المبلّغ';

    card.innerHTML = `
      <div class="mn-ticket-bar"></div>
      <div class="mn-ticket-body">
        <div class="mn-ticket-main">
          <div class="mn-ticket-head">
            <div>
              <h3 class="mn-ticket-title">${escText(r.title)}</h3>
              <p class="mn-ticket-sub">${subtitle}</p>
            </div>
            <span class="badge ${meta.badge}">${meta.label}</span>
          </div>

          <div class="mn-ticket-meta">
            <span class="mn-chip">🏨 الغرفة ${r.room_id}</span>
            <span class="mn-chip">🧹 مرسل البلاغ: #${r.reported_by_id}</span>
            <span class="mn-chip">🕒 ${fmtDateTime(r.reported_at)}</span>
          </div>

          <div class="mn-ticket-actions">
            <button class="btn bg bsm" onclick="openMaintenanceJob(${r.id})">🛠️ متابعة العمل الآن</button>
          </div>
        </div>

        <div class="mn-ticket-media">
          <div class="mn-ticket-media-title">صورة العطل قبل الإصلاح</div>
          ${beforePhoto}
          ${!hasLocalUploadPhoto && r.before_photo_url ? `<a class="mn-ticket-link" href="${escText(r.before_photo_url)}">🔗 فتح الصورة</a>` : ''}
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  if (!archiveWrap || !archiveContainer) return;

  if (archiveReports.length === 0) {
    archiveWrap.style.display = 'none';
    archiveContainer.innerHTML = '';
    return;
  }

  archiveWrap.style.display = 'block';
  archiveContainer.innerHTML = '';
  archiveReports.forEach((r) => {
    const meta = maintenanceStatusMeta(r.status);
    const row = document.createElement('div');
    row.className = 'chk-item';
    row.style.marginBottom = '8px';
    row.innerHTML = `
      <span class="chk-label">#${r.id} • غرفة ${r.room_id} • ${escText(r.title)}</span>
      <span class="badge ${meta.badge}">${meta.label}</span>
    `;
    archiveContainer.appendChild(row);
  });
}

function renderAdminMaintenanceReports(reports) {
  const body = document.getElementById('maint-admin-body');
  if (!body) return;

  if (reports.length === 0) {
    body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--dim)">لا توجد بلاغات صيانة.</td></tr>';
    return;
  }

  body.innerHTML = '';
  reports.forEach((r) => {
    const meta = maintenanceStatusMeta(r.status);
    const duration = fmtDuration(r.reported_at, r.completed_at);
    const closeAt = fmtDateTime(r.completed_at || r.verified_at);
    const verifiedBy = r.verified_by_name || (r.verified_by_id ? `#${r.verified_by_id}` : '—');
    const canVerify = ['supervisor', 'superfv', 'admin'].includes(currentRole) && r.status === 'completed';
    const canDelete = ['supervisor', 'superfv', 'admin'].includes(currentRole);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.room_id}</td>
      <td>${r.hotel_id}</td>
      <td>${r.title}</td>
      <td>${fmtDateTime(r.reported_at)}</td>
      <td>${closeAt}</td>
      <td>${verifiedBy}</td>
      <td style="color:var(--green)">${duration}</td>
      <td><span class="badge ${meta.badge}">${meta.label}</span></td>
      <td>
        <button class="btn bb bsm" onclick="showMaintenanceDetails(${r.id})">👁️ عرض</button>
        ${canVerify ? `<button class="btn bgr bsm" onclick="verifyMaintenanceReport(${r.id})">✅ اعتماد</button>` : ''}
        ${canDelete ? `<button class="btn br bsm" onclick="deleteMaintenanceReport(${r.id})">🗑️ حذف</button>` : ''}
      </td>
    `;
    body.appendChild(tr);
  });
}

async function deleteMaintenanceReport(reportId) {
  const ok = window.confirm('سيتم حذف البلاغ والصور المرتبطة به نهائياً. هل أنت متأكد؟');
  if (!ok) return;

  try {
    await apiRequest(`/maintenance/reports/${reportId}`, {
      method: 'DELETE',
    });
    showToast('تم حذف البلاغ والصور بنجاح', 'success');
    await loadMaintenanceReports();
    await loadMaintenanceTasks();
    await loadDashboardOverview();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showMaintenanceDetails(reportId) {
  const report = maintenanceReportsCache.find(r => r.id === reportId);
  if (!report) return;

  const roomEl = document.getElementById('mm-room');
  const titleEl = document.getElementById('mm-title');
  const timelineEl = document.getElementById('mm-timeline');
  const statusEl = document.getElementById('mm-status-badge');
  const durationEl = document.getElementById('mm-duration');

  if (!timelineEl || !statusEl || !durationEl) return;

  if (roomEl) roomEl.textContent = report.room_id;
  if (titleEl) titleEl.textContent = report.title;

  const statusMeta = maintenanceStatusMeta(report.status);
  statusEl.className = `badge ${statusMeta.badge}`;
  statusEl.textContent = statusMeta.label;
  durationEl.textContent = fmtDuration(report.reported_at, report.completed_at || report.verified_at);

  const timelineBlocks = [];

  timelineBlocks.push(`
    <div class="mrt" style="--tc:var(--orange)">
      <div class="mrt-title">🧹 تم رفع البلاغ</div>
      <div class="mrt-content">${report.description || report.title}</div>
      <div style="font-size:.72rem;color:var(--dim);margin-top:4px;">⏰ ${fmtDateTime(report.reported_at)}</div>
      ${report.before_photo_url ? `<img class="mrt-img" src="${report.before_photo_url}" alt="before">` : ''}
    </div>
  `);

  if (report.assigned_at || report.assigned_to_id) {
    timelineBlocks.push(`
      <div class="mrt" style="--tc:var(--blue)">
        <div class="mrt-title">🔧 تم التعيين</div>
        <div class="mrt-content">الفني: ${report.assigned_to_id || 'غير محدد'}</div>
        <div style="font-size:.72rem;color:var(--dim);margin-top:4px;">⏰ ${fmtDateTime(report.assigned_at)}</div>
      </div>
    `);
  }

  if (report.diagnosis || report.started_at) {
    timelineBlocks.push(`
      <div class="mrt" style="--tc:var(--purple)">
        <div class="mrt-title">🧠 التشخيص</div>
        <div class="mrt-content">${report.diagnosis || '—'}</div>
        <div style="font-size:.72rem;color:var(--dim);margin-top:4px;">⏰ ${fmtDateTime(report.started_at || report.waiting_parts_at)}</div>
      </div>
    `);
  }

  if (report.parts_required) {
    timelineBlocks.push(`
      <div class="mrt" style="--tc:var(--gold)">
        <div class="mrt-title">📦 انتظار قطع غيار</div>
        <div class="mrt-content">${report.parts_notes || 'تم تسجيل طلب قطع غيار'}</div>
        <div style="font-size:.72rem;color:var(--dim);margin-top:4px;">⏰ ${fmtDateTime(report.waiting_parts_at)}</div>
      </div>
    `);
  }

  if (report.completed_at || report.after_photo_url) {
    timelineBlocks.push(`
      <div class="mrt" style="--tc:var(--green)">
        <div class="mrt-title">✅ اكتمل الإصلاح</div>
        <div class="mrt-content">${report.verification_notes || 'تم إنهاء أعمال الإصلاح'}</div>
        <div style="font-size:.72rem;color:var(--dim);margin-top:4px;">⏰ ${fmtDateTime(report.completed_at)}</div>
        ${report.after_photo_url ? `<img class="mrt-img" src="${report.after_photo_url}" alt="after">` : ''}
      </div>
    `);
  }

  if (report.verified_at) {
    timelineBlocks.push(`
      <div class="mrt" style="--tc:var(--blue)">
        <div class="mrt-title">👨‍💼 تم التحقق من المشرف</div>
        <div class="mrt-content">حالة الغرفة النهائية: ${report.closure_room_status || 'ready'}</div>
        <div style="font-size:.72rem;color:var(--dim);margin-top:4px;">⏰ ${fmtDateTime(report.verified_at)}</div>
      </div>
    `);
  }

  timelineEl.innerHTML = timelineBlocks.join('');
  openModal('maintModal');
}

async function verifyMaintenanceReport(reportId) {
  try {
    await apiRequest(`/maintenance/reports/${reportId}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ room_status: 'ready', verification_notes: 'تم اعتماد الإصلاح من الواجهة.' })
    });
    showToast('تم اعتماد البلاغ وإعادة الغرفة للوضع الجاهز', 'success');
    await loadMaintenanceReports();
    await loadDashboardOverview();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadMaintenanceReports() {
  try {
    const reports = await apiRequest('/maintenance/reports');
    if (!reports) return;

    maintenanceReportsCache = reports;
    renderAdminMaintenanceReports(reports);
  } catch (err) {
    const body = document.getElementById('maint-admin-body');
    if (body) {
      body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red)">تعذر تحميل البلاغات: ${err.message}</td></tr>`;
    }
  }
}

async function loadMaintenanceTasks() {
  try {
    const reports = await apiRequest('/maintenance/reports');
    if (!reports) return;

    maintenanceReportsCache = reports;
    renderMaintenanceTasks(reports);
  } catch (err) {
    const container = document.getElementById('mn-reports-container');
    if (container) {
      container.innerHTML = `<div class="login-error show" style="text-align:center">⚠️ ${err.message}</div>`;
    }
  }
}

async function startMaintenanceWork() {
  if (!activeMaintenanceReport) {
    showToast('اختر بلاغ أولاً من مهام الصيانة', 'warning');
    return;
  }

  try {
    const updated = await apiRequest(`/maintenance/reports/${activeMaintenanceReport.id}/start`, {
      method: 'PATCH',
      body: JSON.stringify({})
    });
    if (updated) {
      activeMaintenanceReport = updated;
      syncMaintenanceJobUi(updated);
    }
    showToast('تم تحويل البلاغ إلى قيد التنفيذ', 'success');
    await loadMaintenanceTasks();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function requestMaintenanceParts() {
  if (!activeMaintenanceReport) {
    showToast('اختر بلاغ أولاً من مهام الصيانة', 'warning');
    return;
  }

  const diagnosis = document.getElementById('mn-diagnosis');
  const partsName = document.getElementById('mn-parts-name');

  const diagnosisValue = diagnosis ? diagnosis.value.trim() : '';
  const partsValue = partsName ? partsName.value.trim() : '';

  if (!diagnosisValue) {
    showToast('يرجى إدخال التشخيص قبل طلب القطعة', 'warning');
    return;
  }

  try {
    const updated = await apiRequest(`/maintenance/reports/${activeMaintenanceReport.id}/diagnose`, {
      method: 'PATCH',
      body: JSON.stringify({
        diagnosis: diagnosisValue,
        parts_required: true,
        parts_notes: partsValue || 'تم طلب قطعة غيار من الفني.',
      })
    });
    if (updated) {
      activeMaintenanceReport = updated;
      syncMaintenanceJobUi(updated);
    }
    showToast('تم تحديث البلاغ إلى بانتظار قطع غيار', 'success');
    resetMaintenanceJobForm();
    activeMaintenanceReport = null;
    await loadMaintenanceTasks();
    showPg('p-mn-tasks');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Close a maintenance job and notify supervisor
 */
async function closeMnJob() {
  if (!activeMaintenanceReport) {
    showToast('اختر بلاغ أولاً من مهام الصيانة', 'warning');
    return;
  }

  const diagnosis = document.getElementById('mn-diagnosis');
  const repairNotes = document.getElementById('mn-repair-notes');
  const afterInput = document.getElementById('mn-after-input');
  const closeBtn = document.getElementById('mn-close-btn');

  const diagnosisValue = diagnosis ? diagnosis.value.trim() : '';
  const notesValue = repairNotes ? repairNotes.value.trim() : '';
  const finalDiagnosis = diagnosisValue || notesValue;
  const afterFile = afterInput && afterInput.files ? afterInput.files[0] : null;

  if (!finalDiagnosis) {
    showToast('يرجى إدخال التشخيص أو تفاصيل الإصلاح قبل الإغلاق', 'warning');
    return;
  }

  if (!afterFile) {
    showToast('يرجى رفع صورة ما بعد الإصلاح قبل الإغلاق', 'warning');
    const uploadArea = afterInput ? afterInput.closest('.upa') : null;
    if (uploadArea) {
      uploadArea.style.borderColor = 'var(--red)';
      uploadArea.style.boxShadow = '0 0 0 1px rgba(231,76,60,.35) inset';
      setTimeout(() => {
        uploadArea.style.borderColor = '';
        uploadArea.style.boxShadow = '';
      }, 1400);
    }
    if (afterInput) {
      afterInput.click();
    }
    return;
  }

  try {
    if (closeBtn) {
      closeBtn.disabled = true;
      closeBtn.textContent = '⏳ جاري الإرسال...';
    }

    const uploaded = await uploadMaintenancePhoto(afterFile);
    const afterPhoto = uploaded.url;

    await apiRequest(`/maintenance/reports/${activeMaintenanceReport.id}/diagnose`, {
      method: 'PATCH',
      body: JSON.stringify({
        diagnosis: finalDiagnosis,
        parts_required: false,
        parts_notes: notesValue || null,
      })
    });

    await apiRequest(`/maintenance/reports/${activeMaintenanceReport.id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({
        after_photo_url: afterPhoto,
      })
    });

    showToast('✅ تم إغلاق المهمة وإرسالها للمشرف', 'success');
    await loadMaintenanceTasks();
    await loadMaintenanceReports();
    await loadDashboardOverview();
    showPg('p-mn-tasks');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (closeBtn) {
      closeBtn.disabled = false;
      closeBtn.textContent = '✅ إغلاق وإرسال للمشرف';
    }
  }
}

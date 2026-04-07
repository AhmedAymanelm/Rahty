/* ==========================================
   راحتي — Room Checklist (42 Items)
   ========================================== */

let issueItems = [];
let issueIndexToLabel = {};
let checklistAnswers = {};
let activeRoomId = null;
let activeRoomNum = null;

window.activeRoomId = null;
window.activeRoomNum = null;

/**
 * Build the 42-item room inspection checklist
 */
function buildChecklist() {
  const c = document.getElementById('chk-list');
  if (!c) return;

  let html = '<div class="ct">✅ قائمة الفحص (42 بند)</div>';
  let idx = 0;
  issueIndexToLabel = {};
  checklistAnswers = {};

  CHECKLIST.forEach(cat => {
    html += `<div style="font-size:.78rem;color:var(--gold);font-weight:700;margin:12px 0 6px">${cat.cat}</div>`;

    cat.items.forEach(item => {
      issueIndexToLabel[idx] = item;
      checklistAnswers[idx] = null;
      html += `
        <div class="chk-item" id="chk-row-${idx}">
          <span class="chk-label">${item}</span>
          <div class="chk-opts">
            <button class="chk-opt opt-yes" onclick="chkAnswer(this,${idx},'yes')">نعم</button>
            <button class="chk-opt opt-no" onclick="chkAnswer(this,${idx},'no','${item}')">لا</button>
          </div>
        </div>
        <div class="issue-upload" id="iu-${idx}">
          <div style="font-size:.78rem;color:var(--red);margin-bottom:6px;">📷 إرفاق صورة للمشكلة (إلزامي)</div>
          <div class="upa" style="padding:12px" onclick="this.querySelector('input').click()">
            <span>📷 التقط أو أرفق صورة للعطل في: ${item}</span>
            <input type="file" id="issue-photo-${idx}" accept="image/*" style="display:none" onchange="prevPhoto(this,'ph-${idx}')">
          </div>
          <div class="photo-row" id="ph-${idx}"></div>
        </div>`;
      idx++;
    });
  });

  c.innerHTML = html;
  issueItems = [];
}

/**
 * Handle checklist answer (yes/no)
 */
function chkAnswer(btn, idx, ans, item) {
  const row = btn.closest('.chk-opts');
  row.querySelectorAll('.chk-opt').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  checklistAnswers[idx] = ans;

  const iu = document.getElementById('iu-' + idx);
  if (ans === 'no') {
    iu.classList.add('show');
    const exists = issueItems.some(i => i.idx === idx);
    if (!exists) {
      issueItems.push({ idx: idx, label: item || issueIndexToLabel[idx] || 'عطل غير محدد' });
    }
  } else {
    iu.classList.remove('show');
    issueItems = issueItems.filter(i => i.idx !== idx);
  }
  updateIssueSummary();
}

/**
 * Update the issue summary section
 */
function updateIssueSummary() {
  const sec = document.getElementById('issue-summary');
  const lst = document.getElementById('issue-list');

  if (issueItems.length > 0) {
    if (sec) sec.style.display = 'block';
    if (lst) {
      lst.innerHTML = issueItems.map(i =>
        `<div class="chk-item"><span class="chk-label">❌ ${i.label}</span><span class="badge b-red">بلاغ صيانة</span></div>`
      ).join('');
    }
  } else {
    if (sec) sec.style.display = 'none';
  }
}

/**
 * Navigate to clean a specific room
 */
function goCleanRoom(n, id) {
  activeRoomId = id;
  activeRoomNum = n;
  window.activeRoomId = id;
  window.activeRoomNum = n;
  document.getElementById('cl-room-num').textContent = n;
  issueItems = [];
  buildChecklist();
  showPg('p-cl-report');
}

/**
 * Finalize room cleaning and submit results
 */
async function doneRoom() {
  if (!activeRoomId) {
    if (typeof showToast === 'function') {
      showToast('اختر غرفة أولاً من صفحة الغرف قبل إغلاق التقرير', 'warning');
    }
    showPg('p-cl-rooms');
    return;
  }

  const unansweredIndexes = Object.keys(checklistAnswers)
    .map((k) => parseInt(k, 10))
    .filter((i) => checklistAnswers[i] !== 'yes' && checklistAnswers[i] !== 'no');

  if (unansweredIndexes.length > 0) {
    const first = unansweredIndexes[0];
    const firstRow = document.getElementById(`chk-row-${first}`);
    if (firstRow) {
      firstRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstRow.style.boxShadow = '0 0 0 1px var(--red) inset';
      setTimeout(() => {
        firstRow.style.boxShadow = '';
      }, 1500);
    }

    if (typeof showToast === 'function') {
      showToast(`لازم تجاوب على كل بنود الفحص قبل الإغلاق (المتبقي: ${unansweredIndexes.length})`, 'warning');
    }
    return;
  }

  const btn = document.querySelector('[onclick="doneRoom()"]');
  const oldText = btn ? btn.textContent : 'إغلاق التقرير';
  if (btn) {
    btn.textContent = '⏳ جاري الحفظ...';
    btn.disabled = true;
  }

  try {
    // 1. Create a maintenance report for each failed checklist item.
    if (issueItems.length > 0) {
      for (const issue of issueItems) {
        const photoInput = document.getElementById(`issue-photo-${issue.idx}`);
        const issueFile = photoInput && photoInput.files ? photoInput.files[0] : null;

        if (!issueFile) {
          throw new Error(`يرجى إرفاق صورة للمشكلة: ${issue.label}`);
        }

        const uploaded = await uploadMaintenancePhoto(issueFile);
        const beforePhoto = uploaded.url;

        await apiRequest('/maintenance/reports', {
          method: 'POST',
          body: JSON.stringify({
            title: `عطل في غرفة ${activeRoomNum}: ${issue.label}`,
            description: `تم الإبلاغ عنه بواسطة عامل النظافة أثناء فحص الغرفة ${activeRoomNum}.`,
            room_id: activeRoomId,
            before_photo_url: beforePhoto,
          })
        });
      }
    }

    // 2. If no issues found keep room as ready.
    if (issueItems.length === 0) {
      await apiRequest(`/rooms/${activeRoomId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ready' })
      });
    }

    if (typeof showToast === 'function') {
        showToast(`✅ تم إغلاق التقرير. ${issueItems.length > 0 ? 'تم إنشاء بلاغات صيانة وتحويل الغرفة للصيانة.' : 'الغرفة جاهزة.'}`, 'success');
    } else {
        alert('✅ تم إغلاق التقرير بنجاح');
    }

    showPg('p-cl-rooms');
    activeRoomId = null;
    activeRoomNum = null;
    window.activeRoomId = null;
    window.activeRoomNum = null;
    if (typeof loadRooms === 'function') loadRooms();

  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
    else alert('حدث خطأ: ' + err.message);
  } finally {
    if (btn) {
      btn.textContent = oldText;
      btn.disabled = false;
    }
  }
}

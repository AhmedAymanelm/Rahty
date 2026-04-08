/* ==========================================
   راحتي — Modals & Notifications
   ========================================== */

/**
 * Open a modal by ID
 */
function openModal(id) {
  document.getElementById(id).classList.add('show');
}

/**
 * Close a modal by ID
 */
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

/**
 * Close notification overlay
 */
function closeNov() {
  const nov = document.getElementById('nov');
  const id = nov ? nov.dataset.broadcastId : null;
  if (id) {
    markBroadcastRead(parseInt(id, 10));
  }
  document.getElementById('nov').classList.remove('show');
}

/**
 * Send broadcast — shows notification
 */
async function sendBC() {
  const titleEl = document.getElementById('bc-title');
  const messageEl = document.getElementById('bc-message');
  const roleEl = document.getElementById('bc-target-role');
  const hotelEl = document.getElementById('bc-hotel-id');
  const sendBtn = document.getElementById('bc-send-btn');
  const user = getStoredUser();

  const title = titleEl ? titleEl.value.trim() : '';
  const message = messageEl ? messageEl.value.trim() : '';
  const targetRole = roleEl ? roleEl.value : 'all';
  const hotelValue = hotelEl ? hotelEl.value : '';

  if (!title || !message) {
    if (typeof showToast === 'function') showToast('يرجى إدخال عنوان ونص التعميم', 'warning');
    return;
  }

  const oldText = sendBtn ? sendBtn.textContent : '';
  if (sendBtn) {
    sendBtn.textContent = '⏳ جاري الإرسال...';
    sendBtn.disabled = true;
  }

  try {
    await apiRequest('/broadcasts', {
      method: 'POST',
      body: JSON.stringify({
        title,
        message,
        target_role: targetRole,
        hotel_id: (user?.role === 'admin' && hotelValue) ? parseInt(hotelValue, 10) : null,
      }),
    });

    document.getElementById('nov-title').textContent = '✅ تم الإرسال';
    document.getElementById('nov-text').textContent = 'تم إرسال التعميم بنجاح.';
    document.getElementById('nov').classList.add('show');

    if (titleEl) titleEl.value = '';
    if (messageEl) messageEl.value = '';
    if (roleEl) roleEl.value = 'all';
    if (hotelEl && user?.role === 'admin') hotelEl.value = '';

    await loadBroadcastHistory();
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  } finally {
    if (sendBtn) {
      sendBtn.textContent = oldText || '📢 إرسال التعميم';
      sendBtn.disabled = false;
    }
  }
}

function targetRoleLabel(role) {
  const labels = {
    all: 'الجميع',
    supervisor: 'المشرفون',
    superfv: 'سوبر فايزر',
    maintenance: 'الصيانة',
    cleaner: 'النظافة',
    reception: 'الاستقبال',
    accountant: 'المحاسبة',
  };
  return labels[role] || role;
}

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

async function loadBroadcastHotels() {
  const hotelEl = document.getElementById('bc-hotel-id');
  if (!hotelEl) return;

  const user = getStoredUser();
  const role = user?.role;

  if (role !== 'admin') {
    hotelEl.innerHTML = `<option value="">${user?.hotel_name || 'فندق المستخدم الحالي'}</option>`;
    hotelEl.disabled = true;
    return;
  }

  try {
    const hotels = await apiRequest('/hotels');
    if (!hotels) return;

    hotelEl.innerHTML = '<option value="">جميع الفنادق</option>';
    hotelEl.disabled = false;
    hotels.forEach((h) => {
      const op = document.createElement('option');
      op.value = String(h.id);
      op.textContent = h.name;
      hotelEl.appendChild(op);
    });
  } catch (_) {
    // Keep default option on failure.
  }
}

async function loadBroadcastHistory() {
  const body = document.getElementById('bc-history-body');
  if (!body) return;

  try {
    const rows = await apiRequest('/broadcasts');
    if (!rows || rows.length === 0) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim)">لا توجد تعاميم بعد</td></tr>';
      return;
    }

    body.innerHTML = '';
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const hotelText = r.hotel_id ? (r.hotel_name || `فندق ${r.hotel_id}`) : 'الكل';
      const ratio = `${r.read_count}/${r.recipients_count}`;
      const badge = r.recipients_count > 0 && r.read_count >= r.recipients_count ? 'b-green' : 'b-orange';
      tr.innerHTML = `
        <td>${r.title}</td>
        <td>${targetRoleLabel(r.target_role)}</td>
        <td>${hotelText}</td>
        <td>${relativeTime(r.created_at)}</td>
        <td><span class="badge ${badge}">${ratio}</span></td>
      `;
      body.appendChild(tr);
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red)">تعذر تحميل السجل: ${err.message}</td></tr>`;
  }
}

async function markBroadcastRead(id) {
  try {
    await apiRequest(`/broadcasts/${id}/read`, { method: 'POST' });
  } catch (_) {
    // Non-blocking UI action.
  }
}

async function showLatestBroadcastIfAny() {
  try {
    const rows = await apiRequest('/broadcasts/inbox');
    if (!rows || rows.length === 0) return;

    const unread = rows.find((r) => !r.is_read);
    if (!unread) return;

    const nov = document.getElementById('nov');
    if (!nov) return;

    nov.dataset.broadcastId = unread.id;
    document.getElementById('nov-title').textContent = unread.title;
    document.getElementById('nov-text').textContent = unread.message;
    nov.classList.add('show');
  } catch (_) {
    // Silent fail to avoid blocking login flow.
  }
}

/**
 * Preview uploaded photos
 */
function prevPhoto(input, previewId) {
  const pr = document.getElementById(previewId);
  if (!pr) return;

  const file = input.files[0];
  if (file) {
    // Keep a short-lived object URL for API payloads without huge base64 strings.
    const blobUrl = URL.createObjectURL(file);
    input.dataset.photoUrl = blobUrl;

    const rd = new FileReader();
    rd.onload = e => {
      pr.innerHTML = '';
      const img = document.createElement('img');
      img.src = e.target.result;
      img.className = 'pt';
      pr.appendChild(img);
    };
    rd.readAsDataURL(file);
  }
}

/**
 * Open a customized, visually appealing confirm dialog.
 */
function fwOpenConfirmDialog({ title, message, confirmLabel = 'نعم، أوافق', cancelLabel = 'إلغاء', confirmClass = 'br' }) {
  return new Promise((resolve) => {
    // Basic modal overlay
    const ov = document.createElement('div');
    ov.className = 'modal-ov show';
    ov.style.zIndex = '9999';

    // Modal box
    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.maxWidth = '400px';
    box.style.textAlign = 'center';
    
    // Icon/Title
    const titleEl = document.createElement('h3');
    titleEl.style.fontSize = '1.2rem';
    titleEl.style.color = 'var(--gold)';
    titleEl.style.marginBottom = '12px';
    titleEl.textContent = title;

    // Message
    const msgEl = document.createElement('p');
    msgEl.style.color = 'var(--dim)';
    msgEl.style.fontSize = '0.95rem';
    msgEl.style.marginBottom = '24px';
    msgEl.style.lineHeight = '1.5';
    msgEl.textContent = message;

    // Actions
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '10px';
    actions.style.justifyContent = 'center';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn';
    btnCancel.style.background = 'transparent';
    btnCancel.style.border = '1px solid rgba(255,255,255,0.1)';
    btnCancel.textContent = cancelLabel;

    const btnConfirm = document.createElement('button');
    btnConfirm.className = `btn ${confirmClass}`;
    btnConfirm.textContent = confirmLabel;

    actions.appendChild(btnCancel);
    actions.appendChild(btnConfirm);

    box.appendChild(titleEl);
    box.appendChild(msgEl);
    box.appendChild(actions);
    ov.appendChild(box);
    document.body.appendChild(ov);

    const cleanup = () => {
      ov.remove();
    };

    btnCancel.onclick = () => {
      cleanup();
      resolve(false);
    };

    btnConfirm.onclick = () => {
      cleanup();
      resolve(true);
    };
  });
}

/* ==========================================
   راحتي — Task Management
   ========================================== */

/**
 * Show a beautiful, creative UI Toast Notification
 * @param {string} msg The message to display
 * @param {string} type 'success', 'error', 'warning'
 */
function showToast(msg, type = 'error') {
  const existing = document.getElementById('rahati-toast');
  if (existing) existing.remove();

  const t = document.createElement('div');
  t.id = 'rahati-toast';
  
  // Choose beautiful colors
  let bg = 'rgba(30, 30, 35, 0.9)';
  let accent = 'var(--red)';
  let icon = '⚠️';
  
  if (type === 'success') {
    accent = 'var(--green)';
    icon = '✅';
  } else if (type === 'warning') {
    accent = 'var(--orange)';
    icon = '🔔';
  }

  t.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="font-size:1.5rem;animation:bounce 1s infinite alternate">${icon}</div>
      <div>
        <div style="font-weight:700;font-size:1.05rem;color:#fff">${type === 'success' ? 'نجاح!' : 'تنبيه!'}</div>
        <div style="font-size:0.9rem;color:rgba(255,255,255,0.8);margin-top:4px;">${msg}</div>
      </div>
    </div>
  `;

  // Base Styling
  Object.assign(t.style, {
    position: 'fixed',
    bottom: '-100px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: bg,
    backdropFilter: 'blur(10px)',
    borderBottom: `4px solid ${accent}`,
    borderTop: '1px solid rgba(255,255,255,0.1)',
    borderLeft: '1px solid rgba(255,255,255,0.1)',
    borderRight: '1px solid rgba(255,255,255,0.1)',
    padding: '16px 24px',
    borderRadius: '16px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 20px rgba(0,0,0,0.2)',
    zIndex: '9999',
    transition: 'all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    pointerEvents: 'none',
    minWidth: '300px'
  });

  document.body.appendChild(t);

  // Animate In
  requestAnimationFrame(() => {
    t.style.bottom = '40px';
  });

  // Animate Out after 4 seconds
  setTimeout(() => {
    t.style.bottom = '-100px';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 500);
  }, 4000);
}

function escHtml(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTaskMsgTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

let taskAssignableUsersCache = [];

async function loadAssignableUsersByHotel(hotelId = null) {
  let endpoint = '/auth/users';
  if (hotelId) {
    endpoint += `?hotel_id=${encodeURIComponent(hotelId)}`;
  }
  const users = await apiRequest(endpoint);
  taskAssignableUsersCache = (users || []).filter(u => u.role !== 'admin' && u.role !== 'supervisor');
  return taskAssignableUsersCache;
}

function taskRoleLabel(role) {
  if (typeof ROLES !== 'undefined' && ROLES[role] && ROLES[role].label) {
    return ROLES[role].label;
  }
  return role || 'غير محدد';
}

function renderTaskRecipientsByRole(selectedRole) {
  const assignSel = document.getElementById('tm-to');
  if (!assignSel) return;

  if (!selectedRole) {
    assignSel.innerHTML = '<option value="">-- اختر الوظيفة أولاً --</option>';
    assignSel.disabled = true;
    return;
  }

  const filtered = taskAssignableUsersCache.filter(u => u.role === selectedRole);
  assignSel.innerHTML = '<option value="">-- اختر موظف (اختياري) --</option>';

  filtered.forEach(u => {
    assignSel.innerHTML += `<option value="${u.id}">${u.full_name}</option>`;
  });

  assignSel.disabled = filtered.length === 0;
  if (filtered.length === 0) {
    assignSel.innerHTML = '<option value="">لا يوجد موظفون نشطون بهذه الوظيفة</option>';
  }
}

/**
 * Open task modal and fetch active staff
 */
async function openTaskModal() {
  document.getElementById('tm-title').value = '';
  document.getElementById('tm-desc').value = '';
  const roleSel = document.getElementById('tm-to-role');
  const assignSel = document.getElementById('tm-to');
  
  document.getElementById('taskModal').classList.add('show');
  
  // Load staff/hotels for assignment
  if (roleSel) {
    roleSel.innerHTML = '<option value="">جاري تحميل الوظائف...</option>';
    roleSel.disabled = true;
  }
  assignSel.innerHTML = '<option value="">جاري تحميل الموظفين...</option>';
  assignSel.disabled = true;
  const hotelSel = document.getElementById('tm-hotel');
  const hotelBox = document.getElementById('tm-hotel-box');
  
  if (hotelBox) {
    hotelBox.style.display = (currentRole === 'admin') ? 'block' : 'none';
  }
  if (hotelSel) hotelSel.innerHTML = '<option value="">جاري تحميل الفنادق...</option>';

  try {
    const hotels = currentRole === 'admin' && hotelSel ? await apiRequest('/hotels') : null;

    if (hotels && hotelSel) {
      hotelSel.innerHTML = '';
      hotels.forEach(h => {
        hotelSel.innerHTML += `<option value="${h.id}">${h.name}</option>`;
      });

      if (typeof activeAdminHotelFilter !== 'undefined' && activeAdminHotelFilter) {
        const hasScoped = hotels.some((h) => String(h.id) === String(activeAdminHotelFilter));
        if (hasScoped) {
          hotelSel.value = String(activeAdminHotelFilter);
        }
      }

      hotelSel.onchange = async () => {
        if (roleSel) {
          roleSel.innerHTML = '<option value="">جاري تحديث الوظائف...</option>';
          roleSel.disabled = true;
        }
        assignSel.innerHTML = '<option value="">جاري تحديث الموظفين...</option>';
        assignSel.disabled = true;

        try {
          await loadAssignableUsersByHotel(hotelSel.value || null);
          const roles = [...new Set(taskAssignableUsersCache.map(u => u.role))];
          if (roleSel) {
            roleSel.innerHTML = '<option value="">-- اختر نوع المستلم --</option>';
            roles.forEach(role => {
              roleSel.innerHTML += `<option value="${role}">${taskRoleLabel(role)}</option>`;
            });
            roleSel.disabled = false;
          }
          renderTaskRecipientsByRole('');
        } catch (_) {
          if (roleSel) {
            roleSel.innerHTML = '<option value="">خطأ في تحميل الوظائف</option>';
            roleSel.disabled = true;
          }
          assignSel.innerHTML = '<option value="">خطأ في التحميل</option>';
          assignSel.disabled = true;
        }
      };
    }

    const selectedHotelId = (currentRole === 'admin' && hotelSel && hotelSel.value)
      ? hotelSel.value
      : null;

    await loadAssignableUsersByHotel(selectedHotelId);

    const uniqueRoles = [...new Set(taskAssignableUsersCache.map(u => u.role))];
    if (roleSel) {
      roleSel.innerHTML = '<option value="">-- اختر نوع المستلم --</option>';
      uniqueRoles.forEach(role => {
        roleSel.innerHTML += `<option value="${role}">${taskRoleLabel(role)}</option>`;
      });
      roleSel.disabled = false;
      roleSel.onchange = () => renderTaskRecipientsByRole(roleSel.value);
    }

    renderTaskRecipientsByRole('');
  } catch (err) {
    if (roleSel) {
      roleSel.innerHTML = '<option value="">خطأ في تحميل الوظائف</option>';
      roleSel.disabled = true;
    }
    assignSel.innerHTML = '<option value="">خطأ في التحميل</option>';
    assignSel.disabled = true;
  }
}

/**
 * Submit a new task from the task modal
 */
async function submitTask() {
  const title = document.getElementById('tm-title').value.trim();
  const desc = document.getElementById('tm-desc').value.trim();
  const priority = document.getElementById('tm-pri').value;
  const assigned_id = document.getElementById('tm-to').value;
  const dueDate = document.getElementById('tm-due')?.value || '';
  const dueTime = document.getElementById('tm-time')?.value || '';

  let dueDateTime = null;
  if (dueDate) {
    dueDateTime = dueTime ? `${dueDate}T${dueTime}:00` : `${dueDate}T23:59:00`;
  }
  
  // Only admins need to send hotel_id explicitly, others are inferred backend-side
  const hotelEl = document.getElementById('tm-hotel');
  const hotel_id = hotelEl ? hotelEl.value : null;

  // Extremely robust check to ensure hotel_id is a number before passing it
  let final_hotel_id = null;
  if (hotel_id && hotel_id !== "جميع الفنادق" && !isNaN(parseInt(hotel_id))) {
      final_hotel_id = parseInt(hotel_id);
  }

  if (!title) {
    showToast('يرجى إدخال عنوان المهمة أولاً', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-task');
  const oldTxt = btn ? btn.textContent : 'إرسال المهمة';
  if (btn) {
    btn.textContent = '⏳ جاري الإرسال...';
    btn.disabled = true;
  }

  try {
    const data = await apiRequest('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: title,
        description: desc,
        priority: priority,
        assigned_to_id: assigned_id ? parseInt(assigned_id) : null,
        hotel_id: final_hotel_id,
        due_date: dueDateTime,
      })
    });

    if (data) {
      closeModal('taskModal');
      showToast('تم إرسال المهمة بنجاح!', 'success');
      
      // refresh lists
      if (typeof loadTasks === 'function') loadTasks();
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.textContent = oldTxt;
      btn.disabled = false;
    }
  }
}

/**
 * Load tasks dynamically for dashboard
 */
async function loadTasks() {
  const container =
    document.querySelector('#p-admin-tasks.act #admin-tasks-container') ||
    document.querySelector('#p-sup-tasks.act #sup-tasks-container') ||
    document.getElementById('admin-tasks-container') ||
    document.getElementById('sup-tasks-container') ||
    document.getElementById('tasks-container');
  if (!container) return; // Might be on a different page

  container.innerHTML = '<div class="dim mt10">جاري التحميل...</div>';

  try {
    let endpoint = '/tasks';
    if (currentRole === 'admin' && typeof activeAdminHotelFilter !== 'undefined' && activeAdminHotelFilter) {
      endpoint += `?hotel_id=${encodeURIComponent(activeAdminHotelFilter)}`;
    }
    const tasks = await apiRequest(endpoint);
    if (!tasks) return;

    const allCountEl = document.getElementById('tk-count-all');
    const pendingCountEl = document.getElementById('tk-count-pending');
    const progressCountEl = document.getElementById('tk-count-progress');
    const completeCountEl = document.getElementById('tk-count-complete');

    const pendingCount = tasks.filter(t => t.status === 'pending').length;
    const progressCount = tasks.filter(t => t.status === 'in_progress').length;
    const completeCount = tasks.filter(t => t.status === 'completed' || t.status === 'closed').length;

    if (allCountEl) allCountEl.textContent = tasks.length;
    if (pendingCountEl) pendingCountEl.textContent = pendingCount;
    if (progressCountEl) progressCountEl.textContent = progressCount;
    if (completeCountEl) completeCountEl.textContent = completeCount;

    container.innerHTML = '';
    
    if (tasks.length === 0) {
      container.innerHTML = '<div class="card" style="text-align:center"><div style="font-size:1.3rem">🗂️</div><div class="dim mt8">لا توجد مهام حالياً</div><div class="dim" style="font-size:.78rem">ابدأ بإنشاء مهمة جديدة لتنظيم العمل اليومي.</div></div>';
      return;
    }

    // Role specific rendering logic could go here, but for now just list them
    tasks.forEach(t => {
      const isClosed = t.status === 'closed';
      const c = document.createElement('div');
      c.className = `task-card-modern ${isClosed ? 'is-closed' : ''}`;

      let barColor = 'var(--gold)';
      if (t.priority === 'urgent') barColor = 'var(--red)';
      if (t.status === 'in_progress') barColor = 'var(--blue)';
      if (t.status === 'completed') barColor = 'var(--green)';
      if (t.status === 'closed') barColor = 'var(--dim)';

      let statusLabel = 'بانتظار البدء';
      let statusClass = 'task-status-pending';
      if (t.status === 'in_progress') { statusLabel = 'قيد العمل'; statusClass = 'task-status-progress'; }
      if (t.status === 'completed') { statusLabel = 'مكتملة - بإنتظار الاعتماد'; statusClass = 'task-status-done'; }
      if (t.status === 'closed') { statusLabel = 'مغلقة'; statusClass = 'task-status-closed'; }

      let priorityLabel = 'عادي';
      if (t.priority === 'urgent') priorityLabel = 'عاجلة';
      if (t.priority === 'low') priorityLabel = 'منخفضة';

      const dueText = t.due_date
        ? new Date(t.due_date).toLocaleString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'غير محدد';

      const actions = (!isClosed)
        ? `<button class="btn bb bsm" onclick="updateTaskStatus(${t.id}, 'completed')">✅ إكمال</button>`
        : '';

      c.innerHTML = `
        <div class="task-card-bar" style="--bar-color:${barColor}"></div>
        <div class="task-card-body">
          <div class="task-card-head">
            <div class="task-title" style="${isClosed ? 'text-decoration:line-through' : ''}">${t.title}</div>
            <span class="task-status-chip ${statusClass}">${statusLabel}</span>
          </div>
          <div class="task-sub">${t.description || 'بدون وصف إضافي'}</div>
          <div class="task-meta-row">
            <span class="task-meta-pill">👤 ${t.assigned_to ? t.assigned_to.full_name : 'غير مسندة'}</span>
            <span class="task-meta-pill">🏷️ أولوية: ${priorityLabel}</span>
            <span class="task-meta-pill">🗓️ استحقاق: ${dueText}</span>
            <span class="task-meta-pill">#${t.id}</span>
          </div>
          <div class="task-actions">
            ${actions}
            <button class="btn bsm" onclick="toggleTaskChat(${t.id})">💬 المحادثة</button>
          </div>
          <div id="task-chat-wrap-${t.id}" style="display:none;width:100%;margin-top:10px">
            <div class="chat-panel" style="margin-bottom:0">
              <div class="cp-head"><span>💬 محادثة المهمة #${t.id}</span></div>
              <div class="cbox" id="task-chat-box-${t.id}">
                <div class="dim">جاري تحميل الرسائل...</div>
              </div>
              <div class="cinp">
                <input id="task-chat-input-${t.id}" type="text" placeholder="اكتب رسالة..." onkeydown="if(event.key==='Enter'){sendTaskMessage(${t.id})}">
                <button class="btn bg bsm" onclick="sendTaskMessage(${t.id})">إرسال</button>
              </div>
            </div>
          </div>
        </div>
      `;
      container.appendChild(c);
    });
  } catch (err) {
    container.innerHTML = `<div class="login-error show" style="text-align:center">⚠️ خطأ في تحميل المهام<br><span style="font-size:0.8rem">${err.message}</span></div>`;
  }
}

/**
 * Update task status
 */
async function updateTaskStatus(taskId, newStatus) {
  try {
    const effectiveStatus = newStatus === 'completed' ? 'closed' : newStatus;
    const data = await apiRequest(`/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: effectiveStatus })
    });
    if (data) {
      showToast(effectiveStatus === 'closed' ? 'تم الإكمال والإغلاق تلقائياً' : 'تم تحديث حالة المهمة', 'success');
      loadTasks();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleTaskChat(taskId) {
  const wrap = document.getElementById(`task-chat-wrap-${taskId}`);
  if (!wrap) return;

  const isHidden = wrap.style.display === 'none' || wrap.style.display === '';
  wrap.style.display = isHidden ? 'block' : 'none';

  if (isHidden) {
    await loadTaskMessages(taskId);
  }
}

async function loadTaskMessages(taskId) {
  const box = document.getElementById(`task-chat-box-${taskId}`);
  if (!box) return;

  try {
    const rows = await apiRequest(`/tasks/${taskId}/messages`);
    if (!rows) return;

    if (rows.length === 0) {
      box.innerHTML = '<div class="dim">لا توجد رسائل بعد. ابدأ المحادثة.</div>';
      return;
    }

    const me = getStoredUser();
    const myId = me ? me.id : null;

    box.innerHTML = '';
    rows.forEach((r) => {
      const mine = myId && r.sender_id === myId;
      const msg = document.createElement('div');
      msg.className = `msg ${mine ? 'mo' : 'mi'}`;
      msg.innerHTML = `
        <div class="ms">${escHtml(r.sender_full_name)} • ${escHtml(formatTaskMsgTime(r.created_at))}</div>
        ${escHtml(r.message)}
      `;
      box.appendChild(msg);
    });

    box.scrollTop = box.scrollHeight;
  } catch (err) {
    box.innerHTML = `<div class="login-error show">⚠️ ${escHtml(err.message)}</div>`;
  }
}

async function sendTaskMessage(taskId) {
  const input = document.getElementById(`task-chat-input-${taskId}`);
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  try {
    await apiRequest(`/tasks/${taskId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: text }),
    });

    input.value = '';
    await loadTaskMessages(taskId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Trigger page specific logic is now handled strictly cleanly in navigation.js

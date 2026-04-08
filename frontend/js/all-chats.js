/* =====================================================
   كل المحادثات — All Chats Manager
   ===================================================== */

let allChatsThreads = [];
let allChatsActiveUserId = null;
let allChatsActiveUserName = null;
let allChatsPollInterval = null;
let allChatsHotelFilter = 'all';

/**
 * Main init - called when page activates
 */
async function loadAllChats() {
  allChatsActiveUserId = null;
  allChatsPollInterval && clearInterval(allChatsPollInterval);

  const threadsEl = document.getElementById('all-chats-threads');
  if (threadsEl) threadsEl.innerHTML = '<div class="dim" style="text-align:center;padding:30px;">جاري التحميل...</div>';

  try {
    const data = await apiRequest('/auth/messages/threads');
    allChatsThreads = data || [];
    buildAllChatsHotelTabs();
    renderAllChatsThreads();
    // Poll for new threads every 15s
    allChatsPollInterval = setInterval(async () => {
      const fresh = await apiRequest('/auth/messages/threads').catch(() => null);
      if (fresh) {
        allChatsThreads = fresh;
        renderAllChatsThreads();
        if (allChatsActiveUserId) refreshAllChatsMessages();
      }
    }, 15000);
  } catch (err) {
    if (threadsEl) threadsEl.innerHTML = `<div class="dim" style="color:var(--red);text-align:center;padding:30px;">⚠️ ${err.message}</div>`;
  }
}

/**
 * Build hotel filter tabs at top of thread list
 */
function buildAllChatsHotelTabs() {
  const tabsEl = document.getElementById('all-chats-hotel-tabs');
  if (!tabsEl) return;

  // Collect unique hotels from threads
  const hotels = new Map(); // id -> name
  allChatsThreads.forEach(t => {
    if (t.hotel_id) hotels.set(t.hotel_id, t.hotel_name);
  });

  const tabStyle = (active) => `
    padding:10px 14px; font-size:0.8rem; font-weight:bold; cursor:pointer; white-space:nowrap;
    border:none; background:transparent; font-family:inherit;
    border-bottom: 2px solid ${active ? 'var(--gold)' : 'transparent'};
    color: ${active ? 'var(--gold)' : 'var(--dim)'};
    transition:0.15s;
  `;

  let html = `<button style="${tabStyle(allChatsHotelFilter === 'all')}" onclick="setAllChatsHotelFilter('all', this)">الكل</button>`;
  hotels.forEach((name, id) => {
    const isActive = allChatsHotelFilter == id;
    html += `<button style="${tabStyle(isActive)}" onclick="setAllChatsHotelFilter('${id}', this)">${name}</button>`;
  });
  tabsEl.innerHTML = html;
}

function setAllChatsHotelFilter(val, btn) {
  allChatsHotelFilter = val;
  // Re-style all tab buttons
  const tabsEl = document.getElementById('all-chats-hotel-tabs');
  tabsEl?.querySelectorAll('button').forEach(b => {
    b.style.borderBottom = '2px solid transparent';
    b.style.color = 'var(--dim)';
  });
  if (btn) {
    btn.style.borderBottom = '2px solid var(--gold)';
    btn.style.color = 'var(--gold)';
  }
  renderAllChatsThreads();
}

/**
 * Render thread cards in the sidebar list
 */
function renderAllChatsThreads() {
  const threadsEl = document.getElementById('all-chats-threads');
  if (!threadsEl) return;

  let filtered = allChatsThreads;
  if (allChatsHotelFilter !== 'all') {
    filtered = allChatsThreads.filter(t => String(t.hotel_id) === String(allChatsHotelFilter));
  }

  if (filtered.length === 0) {
    threadsEl.innerHTML = '<div class="dim" style="text-align:center;padding:40px;">لا توجد محادثات</div>';
    return;
  }

  const currentUserId = getStoredUser()?.id;
  let html = '';
  filtered.forEach(t => {
    const rd = ROLES[t.role] || { icon: '👤', label: t.role };
    const isActive = t.user_id === allChatsActiveUserId;
    const hasUnread = t.unread_count > 0;

    // Relative time
    const mins = Math.round((Date.now() - new Date(t.last_message_time)) / 60000);
    let timeLabel;
    if (mins < 1) timeLabel = 'الآن';
    else if (mins < 60) timeLabel = `منذ ${mins} دقيقة`;
    else if (mins < 1440) timeLabel = `منذ ${Math.round(mins/60)} ساعة`;
    else timeLabel = `منذ ${Math.round(mins/1440)} يوم`;

    const preview = (t.is_last_mine ? 'أنت: ' : '') + t.last_message;
    const previewTrimmed = preview.length > 38 ? preview.slice(0, 38) + '...' : preview;

    const activeBg = isActive ? 'background:rgba(201,168,76,0.1); border-right:3px solid var(--gold);' : '';
    const unreadBadge = hasUnread
      ? `<span style="background:var(--red);color:#fff;font-size:0.65rem;font-weight:bold;border-radius:50%;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;padding:0 4px;flex-shrink:0;">${t.unread_count}</span>`
      : '';

    html += `
      <div
        style="padding:12px 14px; border-bottom:1px solid rgba(255,255,255,0.04); display:flex; align-items:center; gap:12px; cursor:pointer; transition:0.15s; ${activeBg}"
        onclick="openAllChatsThread(${t.user_id}, '${t.full_name.replace(/'/g, "\\'")}', '${rd.icon} ${rd.label}')"
        onmouseover="if(${!isActive}) this.style.background='rgba(255,255,255,0.03)'"
        onmouseout="if(${!isActive}) this.style.background='transparent'"
      >
        <div style="width:40px;height:40px;background:var(--dark4);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.15rem;border:1px solid rgba(255,255,255,0.07);flex-shrink:0;">
          ${rd.icon}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <span style="font-weight:${hasUnread ? 'bold' : 'normal'};font-size:0.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.full_name}</span>
            <span class="dim" style="font-size:0.68rem;flex-shrink:0;">${timeLabel}</span>
          </div>
          <div class="dim" style="font-size:0.75rem;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${hasUnread ? 'color:var(--text);' : ''}">${previewTrimmed}</div>
          <div class="dim" style="font-size:0.68rem;margin-top:2px;">${rd.label} • ${t.hotel_name}</div>
        </div>
        ${unreadBadge}
      </div>
    `;
  });
  threadsEl.innerHTML = html;
}

/**
 * Open a thread and load messages
 */
async function openAllChatsThread(userId, userName, roleLabel) {
  allChatsActiveUserId = userId;
  allChatsActiveUserName = userName;

  // Update title
  const titleEl = document.getElementById('all-chats-view-title');
  if (titleEl) titleEl.innerHTML = `<span style="opacity:0.65;font-size:0.85em;margin-left:6px;">${roleLabel}</span> <strong>${userName}</strong>`;

  // Enable reply input
  const inputEl = document.getElementById('all-chats-input');
  const sendBtn = document.getElementById('all-chats-send');
  if (inputEl) { inputEl.disabled = false; inputEl.placeholder = `رسالة للموظف ${userName}...`; inputEl.focus(); }
  if (sendBtn) sendBtn.disabled = false;

  // Mark as read
  try {
    await apiRequest(`/auth/users/${userId}/messages/read`, { method: 'POST' });
    const thread = allChatsThreads.find(t => t.user_id === userId);
    if (thread) thread.unread_count = 0;
    renderAllChatsThreads();
    // Sync unread map in comm module
    if (typeof commUnreadMap !== 'undefined') {
      delete commUnreadMap[userId];
      if (typeof updateCommNavBadge === 'function') updateCommNavBadge();
    }
  } catch (_) {}

  await refreshAllChatsMessages();
}

async function refreshAllChatsMessages() {
  if (!allChatsActiveUserId) return;
  const msgPane = document.getElementById('all-chats-messages');
  if (!msgPane) return;

  const isAtBottom = msgPane.scrollHeight - msgPane.scrollTop <= msgPane.clientHeight + 80;

  try {
    const data = await apiRequest(`/auth/users/${allChatsActiveUserId}/messages`);
    if (!data || data.length === 0) {
      msgPane.innerHTML = `<div class="dim" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;">
        <span style="font-size:3rem;opacity:0.4;">📭</span>
        <span>لا توجد رسائل بعد</span>
      </div>`;
      return;
    }

    const currentUserId = getStoredUser()?.id;
    let html = '';
    data.forEach(msg => {
      const isMe = msg.sender_id === currentUserId;
      const align = isMe ? 'flex-end' : 'flex-start';
      const bg = isMe ? 'background:var(--gold); color:#000;' : 'background:var(--dark4); border:1px solid rgba(255,255,255,0.07); color:var(--text);';
      const radius = isMe ? '12px 12px 0 12px' : '12px 12px 12px 0';
      const fd = new Date(msg.created_at).toLocaleString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const senderLabel = !isMe ? `<div style="font-size:0.7rem;opacity:0.6;margin-bottom:4px;">${msg.sender_name}</div>` : '';
      html += `
        <div style="display:flex;flex-direction:column;align-items:${align};width:100%;">
          ${senderLabel}
          <div style="${bg} padding:10px 14px;border-radius:${radius};max-width:72%;word-wrap:break-word;font-size:0.92rem;line-height:1.55;">${msg.message}</div>
          <div class="dim" style="font-size:0.68rem;margin-top:4px;opacity:0.55;">${fd}</div>
        </div>`;
    });

    if (msgPane.innerHTML !== html) {
      msgPane.innerHTML = html;
      if (isAtBottom) msgPane.scrollTop = msgPane.scrollHeight;
    }
  } catch (err) {
    console.error('All chats refresh error:', err);
  }
}

/**
 * Reply from all-chats view
 */
async function sendAllChatReply() {
  if (!allChatsActiveUserId) return;
  const inputEl = document.getElementById('all-chats-input');
  const txt = inputEl.value.trim();
  if (!txt) return;

  const btn = document.getElementById('all-chats-send');
  inputEl.value = '';
  btn.disabled = true;

  try {
    await apiRequest(`/auth/users/${allChatsActiveUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: txt })
    });
    await refreshAllChatsMessages();
    setTimeout(() => {
      const p = document.getElementById('all-chats-messages');
      if (p) p.scrollTop = p.scrollHeight;
    }, 80);
    // Refresh thread list to update last message preview
    const fresh = await apiRequest('/auth/messages/threads').catch(() => null);
    if (fresh) { allChatsThreads = fresh; renderAllChatsThreads(); }
  } catch (err) {
    if (typeof showToast === 'function') showToast(`فشل الإرسال: ${err.message}`, 'error');
    inputEl.value = txt;
  } finally {
    btn.disabled = false;
    inputEl.focus();
  }
}

function exportAllChats() {
  if (typeof showToast === 'function') showToast('ميزة التصدير قريباً', 'info');
}

// Cleanup on page switch
document.addEventListener('pageChanged', (e) => {
  if (e.detail !== 'p-all-chats' && allChatsPollInterval) {
    clearInterval(allChatsPollInterval);
    allChatsPollInterval = null;
  }
});

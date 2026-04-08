let commContactsCache = [];
let activeCommContactId = null;
let commActivePollInterval = null;
let commInboxPollInterval = null;
let commUnreadMap = {}; // { sender_id: count }

/* =====================================================
   POLLING — Background inbox check (runs always)
   ===================================================== */

function startCommInboxPolling() {
  // Fire immediately then every 12 seconds
  checkCommInbox();
  if (!commInboxPollInterval) {
    commInboxPollInterval = setInterval(checkCommInbox, 12000);
  }
}

function stopCommInboxPolling() {
  if (commInboxPollInterval) {
    clearInterval(commInboxPollInterval);
    commInboxPollInterval = null;
  }
}

async function checkCommInbox() {
  try {
    const data = await apiRequest('/auth/messages/inbox');
    if (!data) return;

    // Build a map { sender_id -> count }
    const newMap = {};
    data.forEach(row => { newMap[row.sender_id] = row.count; });

    // Check if anything changed
    const hasChanges = JSON.stringify(newMap) !== JSON.stringify(commUnreadMap);
    commUnreadMap = newMap;

    if (hasChanges) {
      // Re-render contacts sidebar with badges
      const searchVal = document.getElementById('comm-contact-search')?.value.trim();
      if (searchVal) filterCommunicationContacts();
      else renderCommunicationContacts(commContactsCache);

      // Update nav badge for Communications icon
      updateCommNavBadge();
    }
  } catch (err) {
    // Silently fail — background polling shouldn't show errors
  }
}

function updateCommNavBadge() {
  const total = Object.values(commUnreadMap).reduce((a, b) => a + b, 0);
  // The nav item element has id="ni-p-communications" (set by buildNav)
  const navItem = document.getElementById('ni-p-communications');
  if (!navItem) return;

  let badge = navItem.querySelector('.nbadge');
  if (total > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nbadge';
      navItem.appendChild(badge);
    }
    badge.textContent = total;
  } else {
    badge?.remove();
  }
}

/* =====================================================
   CHAT POLLING — Active conversation polling
   ===================================================== */

function clearCommPolling() {
  if (commActivePollInterval) {
    clearInterval(commActivePollInterval);
    commActivePollInterval = null;
  }
}

/* =====================================================
   CONTACTS — Load & Render
   ===================================================== */

async function loadCommunicationContacts() {
  const listEl = document.getElementById('comm-contacts-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="dim" style="text-align:center; padding:30px;">جاري تحميل جهات التواصل...</div>';

  try {
    const data = await apiRequest('/auth/users?include_inactive=false');
    commContactsCache = (data || []).sort((a, b) => a.full_name.localeCompare(b.full_name));
    renderCommunicationContacts(commContactsCache);
    // Start background inbox polling when page opens
    startCommInboxPolling();
  } catch (err) {
    listEl.innerHTML = `<div class="dim" style="text-align:center; color:var(--red); padding:30px;">⚠️ خطأ: ${err.message}</div>`;
  }
}

function renderCommunicationContacts(contacts) {
  const listEl = document.getElementById('comm-contacts-list');
  if (!listEl) return;

  if (contacts.length === 0) {
    listEl.innerHTML = '<div class="dim" style="text-align:center; padding:30px;">لا يوجد موظفين متاحين</div>';
    return;
  }

  const currentUserId = getStoredUser()?.id;

  let html = '';
  contacts.forEach(c => {
    if (c.id === currentUserId) return;

    const rd = ROLES[c.role] || { icon: '👤', label: c.role };
    const hotelName = c.hotel ? c.hotel.name : 'الإدارة العامة';
    const subtitle = `${rd.label} - ${hotelName}`;
    const isActive = (activeCommContactId === c.id);
    const activeBorder = isActive ? 'border-right:3px solid var(--gold);' : '';
    const activeBg = isActive ? 'background:rgba(201,168,76,0.1);' : '';

    // Unread badge for this contact
    const unreadCount = commUnreadMap[c.id] || 0;
    const unreadBadge = unreadCount > 0
      ? `<span style="background:var(--gold);color:#000;font-size:0.72rem;font-weight:bold;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${unreadCount}</span>`
      : '';

    // Sort contacts with unread first
    html += `
      <div
        class="comm-contact-item"
        data-user-id="${c.id}"
        style="padding:12px 15px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; align-items:center; gap:12px; cursor:pointer; transition:background 0.15s; ${activeBg}${activeBorder}"
        onclick="selectCommunicationContact(${c.id}, '${c.full_name.replace(/'/g, "\\'")}', '${rd.icon} ${rd.label}')"
        onmouseover="if(${!isActive}) this.style.background='rgba(255,255,255,0.03)'"
        onmouseout="if(${!isActive}) this.style.background='${isActive ? 'rgba(201,168,76,0.1)' : 'transparent'}'"
      >
        <div style="width:38px; height:38px; background:var(--dark4); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.1rem; border:1px solid rgba(255,255,255,0.07); flex-shrink:0;">
          ${rd.icon}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:${unreadCount > 0 ? 'bold' : 'normal'}; font-size:0.9rem; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.full_name}</div>
          <div class="dim" style="font-size:0.72rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${subtitle}</div>
        </div>
        ${unreadBadge}
      </div>
    `;
  });
  listEl.innerHTML = html;
}

function filterCommunicationContacts() {
  const query = document.getElementById('comm-contact-search')?.value.trim().toLowerCase() || '';
  if (!query) {
    renderCommunicationContacts(commContactsCache);
    return;
  }
  const filtered = commContactsCache.filter(c =>
    c.full_name.toLowerCase().includes(query) ||
    (c.role && c.role.toLowerCase().includes(query)) ||
    (c.hotel && c.hotel.name && c.hotel.name.toLowerCase().includes(query))
  );
  renderCommunicationContacts(filtered);
}

/* =====================================================
   CHAT — Select contact & load messages
   ===================================================== */

async function selectCommunicationContact(userId, userName, userRoleLabel) {
  activeCommContactId = userId;

  // Update header
  const titleEl = document.getElementById('comm-chat-title');
  if (titleEl) {
    titleEl.innerHTML = `<span style="opacity:0.7;font-size:0.85em;margin-left:8px;">${userRoleLabel}</span> <strong>${userName}</strong>`;
  }

  // Enable chat input
  const inputEl = document.getElementById('comm-chat-input');
  const sendBtn = document.getElementById('comm-chat-send');
  if (inputEl) { inputEl.disabled = false; inputEl.focus(); }
  if (sendBtn) sendBtn.disabled = false;

  // Mark messages from this contact as read
  try {
    await apiRequest(`/auth/users/${userId}/messages/read`, { method: 'POST' });
    // Remove from unread map immediately for instant UI update
    delete commUnreadMap[userId];
    updateCommNavBadge();
  } catch (_) {}

  // Re-render contacts (removes badge)
  const searchVal = document.getElementById('comm-contact-search')?.value.trim();
  if (searchVal) filterCommunicationContacts();
  else renderCommunicationContacts(commContactsCache);

  // Load messages immediately
  await refreshCommunicationMessages();

  // Start per-conversation polling
  clearCommPolling();
  commActivePollInterval = setInterval(async () => {
    await refreshCommunicationMessages();
    // Also mark new messages as read while chat is open
    try {
      await apiRequest(`/auth/users/${userId}/messages/read`, { method: 'POST' });
      if (commUnreadMap[userId]) {
        delete commUnreadMap[userId];
        updateCommNavBadge();
        renderCommunicationContacts(commContactsCache);
      }
    } catch (_) {}
  }, 8000);
}

async function refreshCommunicationMessages() {
  if (!activeCommContactId) return;
  const msgPane = document.getElementById('comm-chat-messages');
  if (!msgPane) return;

  const isAtBottom = msgPane.scrollHeight - msgPane.scrollTop <= msgPane.clientHeight + 80;

  try {
    const data = await apiRequest(`/auth/users/${activeCommContactId}/messages`);

    if (!data || data.length === 0) {
      if (!document.getElementById('comm-msg-empty-placeholder')) {
        msgPane.innerHTML = `
          <div id="comm-msg-empty-placeholder" class="dim" style="text-align:center;padding:50px;display:flex;flex-direction:column;align-items:center;gap:10px;height:100%;justify-content:center;">
            <span style="font-size:3rem;opacity:0.5;">📭</span>
            <span>لا توجد رسائل سابقة. ابدأ المحادثة الآن!</span>
          </div>`;
      }
      return;
    }

    const currentUserId = getStoredUser()?.id;
    let html = '';

    data.forEach(msg => {
      const isMe = (msg.sender_id === currentUserId);
      const align = isMe ? 'flex-end' : 'flex-start';
      const bg = isMe
        ? 'background:var(--gold); color:#000;'
        : 'background:var(--dark4); border:1px solid rgba(255,255,255,0.07); color:var(--text);';
      const radius = isMe ? '12px 12px 0px 12px' : '12px 12px 12px 0px';
      const fd = new Date(msg.created_at).toLocaleString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const senderLabel = !isMe ? `<div style="font-size:0.72rem;opacity:0.6;margin-bottom:4px;">${msg.sender_name}</div>` : '';

      html += `
        <div style="display:flex;flex-direction:column;align-items:${align};width:100%;">
          ${senderLabel}
          <div style="${bg} padding:10px 15px;border-radius:${radius};max-width:72%;word-wrap:break-word;font-size:0.93rem;line-height:1.55;">
            ${msg.message}
          </div>
          <div class="dim" style="font-size:0.68rem;margin-top:4px;opacity:0.55;">${fd}</div>
        </div>
      `;
    });

    if (msgPane.innerHTML !== html) {
      msgPane.innerHTML = html;
      if (isAtBottom) msgPane.scrollTop = msgPane.scrollHeight;
    }

  } catch (err) {
    console.error('Communication Polling error:', err);
  }
}

/* =====================================================
   SEND MESSAGE
   ===================================================== */

async function sendCommunicationMessage() {
  if (!activeCommContactId) return;

  const inputEl = document.getElementById('comm-chat-input');
  const txt = inputEl.value.trim();
  if (!txt) return;

  const btn = document.getElementById('comm-chat-send');
  inputEl.value = '';
  btn.disabled = true;

  try {
    await apiRequest(`/auth/users/${activeCommContactId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: txt })
    });
    await refreshCommunicationMessages();
    setTimeout(() => {
      const msgPane = document.getElementById('comm-chat-messages');
      if (msgPane) msgPane.scrollTop = msgPane.scrollHeight;
    }, 80);
  } catch (err) {
    if (typeof showToast === 'function') showToast(`فشل الإرسال: ${err.message}`, 'error');
    inputEl.value = txt;
  } finally {
    btn.disabled = false;
    inputEl.focus();
  }
}

/* =====================================================
   PAGE LIFECYCLE
   ===================================================== */

document.addEventListener('pageChanged', (e) => {
  if (e.detail !== 'p-communications') {
    clearCommPolling();
    stopCommInboxPolling();
  }
});

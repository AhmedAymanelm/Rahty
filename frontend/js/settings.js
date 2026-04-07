/* ==========================================
   راحتي — Settings
   ========================================== */

const DEFAULT_SETTINGS = {
  enableBadges: true,
  badgeIntervalSec: 45,
};

let __badgeRefreshTimer = null;

function getSettings() {
  try {
    const raw = localStorage.getItem('rahati_settings');
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(next) {
  localStorage.setItem('rahati_settings', JSON.stringify(next));
}

function applyUiSettings() {
  // Keep hook for future UI settings; currently no display settings are exposed.
  document.documentElement.style.fontSize = '100%';
}

function renderSettingsPage() {
  const page = document.getElementById('p-settings');
  if (!page) return;

  const st = getSettings();
  const enableEl = document.getElementById('st-enable-badges');
  const intervalEl = document.getElementById('st-badge-interval');

  if (enableEl) enableEl.value = st.enableBadges ? 'on' : 'off';
  if (intervalEl) intervalEl.value = String(st.badgeIntervalSec || 45);

  const user = getStoredUser();
  const userEl = document.getElementById('st-username');
  const currentPassEl = document.getElementById('st-current-password');
  const newPassEl = document.getElementById('st-new-password');
  const confirmPassEl = document.getElementById('st-confirm-password');

  if (userEl) userEl.value = user?.username || '';
  if (currentPassEl) currentPassEl.value = '';
  if (newPassEl) newPassEl.value = '';
  if (confirmPassEl) confirmPassEl.value = '';
}

async function saveAccountSettings() {
  const userEl = document.getElementById('st-username');
  const currentPassEl = document.getElementById('st-current-password');
  const newPassEl = document.getElementById('st-new-password');
  const confirmPassEl = document.getElementById('st-confirm-password');
  const msgEl = document.getElementById('st-account-msg');

  const currentUser = getStoredUser();
  if (!currentUser) return;

  const username = (userEl?.value || '').trim();
  const current_password = (currentPassEl?.value || '').trim();
  const new_password = (newPassEl?.value || '').trim();
  const confirm_password = (confirmPassEl?.value || '').trim();

  if (new_password && new_password !== confirm_password) {
    if (typeof showToast === 'function') showToast('تأكيد كلمة المرور غير مطابق', 'warning');
    return;
  }

  const payload = {};
  if (username && username !== (currentUser.username || '')) payload.username = username;
  if (new_password) payload.new_password = new_password;
  if (payload.username || payload.new_password) {
    payload.current_password = current_password;
  }

  if (!Object.keys(payload).length) {
    if (typeof showToast === 'function') showToast('لا توجد تغييرات للحفظ', 'warning');
    return;
  }

  try {
    const user = await apiRequest('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (!user) return;

    saveAuth(getToken(), user);

    const rd = ROLES[user.role] || { icon: '👤', label: user.role || '—' };
    const ucRole = document.getElementById('uc-role');
    const ucName = document.getElementById('uc-name');
    const ucHotel = document.getElementById('uc-hotel');
    const mobRole = document.getElementById('mob-role');
    if (ucRole) ucRole.textContent = `${rd.icon} ${rd.label}`;
    if (ucName) ucName.textContent = user.full_name || '—';
    if (ucHotel) ucHotel.textContent = getUserHotelLabel(user);
    if (mobRole) mobRole.textContent = rd.label;

    if (currentPassEl) currentPassEl.value = '';
    if (newPassEl) newPassEl.value = '';
    if (confirmPassEl) confirmPassEl.value = '';

    if (msgEl) msgEl.textContent = 'تم تحديث بيانات الحساب بنجاح';
    if (typeof showToast === 'function') showToast('تم تحديث بيانات الحساب', 'success');
  } catch (err) {
    if (msgEl) msgEl.textContent = `تعذر التحديث: ${err.message}`;
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

function restartBadgeTimer() {
  if (__badgeRefreshTimer) {
    clearInterval(__badgeRefreshTimer);
    __badgeRefreshTimer = null;
  }

  const st = getSettings();
  if (!st.enableBadges) return;

  const ms = Math.max(15, Number(st.badgeIntervalSec || 45)) * 1000;
  __badgeRefreshTimer = setInterval(() => {
    if (typeof refreshNavBadges === 'function') refreshNavBadges();
  }, ms);
}

function saveSettings() {
  const enableEl = document.getElementById('st-enable-badges');
  const intervalEl = document.getElementById('st-badge-interval');
  const msgEl = document.getElementById('st-save-msg');

  const next = {
    enableBadges: (enableEl?.value || 'on') === 'on',
    badgeIntervalSec: Math.max(15, Number(intervalEl?.value || 45)),
  };

  persistSettings(next);
  applyUiSettings();
  restartBadgeTimer();

  if (typeof refreshNavBadges === 'function') refreshNavBadges();

  if (msgEl) {
    msgEl.textContent = 'تم حفظ الإعدادات بنجاح';
  }
  if (typeof showToast === 'function') showToast('تم حفظ الإعدادات', 'success');
}

function resetSettings() {
  persistSettings({ ...DEFAULT_SETTINGS });
  applyUiSettings();
  restartBadgeTimer();
  renderSettingsPage();
  if (typeof refreshNavBadges === 'function') refreshNavBadges();
  if (typeof showToast === 'function') showToast('تمت إعادة الإعدادات الافتراضية', 'success');
}

// Apply settings early on load.
applyUiSettings();

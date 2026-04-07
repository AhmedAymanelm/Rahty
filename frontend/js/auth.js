/* ==========================================
   راحتي — Authentication (Login / Logout)
   ========================================== */

let currentRole = null;
const ATTENDANCE_LOGOUT_ROLES = ['supervisor', 'superfv', 'cleaner', 'maintenance', 'reception', 'accountant'];

function normalizeRole(role) {
  if (!role) return '';
  const raw = String(role).trim();
  const base = raw.includes('.') ? raw.split('.').pop() : raw;
  return base.toLowerCase();
}

function roleRequiresAttendance(role) {
  return ATTENDANCE_LOGOUT_ROLES.includes(normalizeRole(role));
}

function updateLogoutButtonVisibility(role) {
  const logoutBtn = document.querySelector('.btn-out');
  if (!logoutBtn) return;
  logoutBtn.style.display = '';
}

async function tryAttendanceCheckoutBeforeLogout(role) {
  if (!roleRequiresAttendance(role)) return;
  try {
    const snapshot = await apiRequest('/dashboard/attendance/me');
    if (snapshot?.checked_in) {
      await apiRequest('/dashboard/attendance/check-out', { method: 'POST' });
    }
  } catch (_) {
    // Ignore checkout errors on logout to avoid blocking logout flow.
  }
}

/**
 * Select a role on the login screen — auto-fills credentials
 */
function selRole(r) {
  document.querySelectorAll('.rb').forEach(b => b.classList.remove('sel'));
  document.getElementById('r-' + r).classList.add('sel');
  currentRole = r;
  // Hotel is now automatically derived from the database after login
  document.getElementById('hotel-sel').style.display = 'none';
}

/**
 * Show login error
 */
function showLoginError(msg) {
  const errDiv = document.getElementById('login-error');
  errDiv.innerHTML = `⚠️ ${msg}`;
  errDiv.classList.remove('show');
  
  // Trigger reflow to restart animation
  void errDiv.offsetWidth;
  
  errDiv.classList.add('show');
}

/**
 * Perform login via API
 */
async function doLogin() {
  const errDiv = document.getElementById('login-error');
  errDiv.classList.remove('show');

  if (!currentRole) {
    showLoginError('يرجى اختيار الدور الوظيفي لتسجيل الدخول');
    return;
  }

  const username = document.getElementById('l-name').value.trim();
  const password = document.getElementById('l-pass').value.trim();
  const selectedRole = normalizeRole(currentRole);

  if (!username || !password) {
    showLoginError('يرجى إدخال اسم المستخدم وكلمة المرور');
    return;
  }

  // Show loading state
  const loginBtn = document.querySelector('.btn-login');
  const originalText = loginBtn.textContent;
  loginBtn.textContent = '⏳ جاري تسجيل الدخول...';
  loginBtn.disabled = true;

  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    if (!data) {
      loginBtn.textContent = originalText;
      loginBtn.disabled = false;
      return;
    }

    const actualRole = normalizeRole(data?.user?.role);
    if (!actualRole) {
      showLoginError('تعذر التحقق من دور المستخدم');
      return;
    }

    if (actualRole !== selectedRole) {
      const selectedLabel = ROLES[selectedRole]?.label || selectedRole;
      const actualLabel = ROLES[actualRole]?.label || actualRole;
      showLoginError(`الدور المختار (${selectedLabel}) لا يطابق الحساب. هذا الحساب يتبع (${actualLabel}).`);
      return;
    }

    // Save token and user data
    saveAuth(data.access_token, data.user);

    // Update current role from API response
    currentRole = actualRole;

    // Update UI with user data from server
    const rd = ROLES[currentRole] || { icon: '👤', label: currentRole };
    document.getElementById('uc-role').textContent = rd.icon + ' ' + rd.label;
    document.getElementById('uc-name').textContent = data.user.full_name;
    document.getElementById('uc-hotel').textContent = getUserHotelLabel(data.user);
    document.getElementById('mob-role').textContent = rd.label;

    if (document.getElementById('sup-hotel-name')) {
      document.getElementById('sup-hotel-name').textContent = getUserHotelLabel(data.user);
    }

    // Build sidebar navigation
    buildNav();
    updateLogoutButtonVisibility(currentRole);

    // Set today's date
    document.getElementById('today-date').textContent = new Date().toLocaleDateString('ar-SA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Switch screens
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('appScreen').classList.add('active');

    // Show first page for the role
    showPg(NAV[currentRole][0].items[0].id);

    // Show latest unread broadcast for this user if any.
    if (typeof showLatestBroadcastIfAny === 'function') {
      setTimeout(() => showLatestBroadcastIfAny(), 800);
    }

    // Build checklist
    buildChecklist();

    if (typeof startAttendanceHeartbeat === 'function') {
      startAttendanceHeartbeat();
    }
    if (typeof refreshAttendanceQuickState === 'function') {
      refreshAttendanceQuickState();
    }

  } catch (err) {
    showLoginError(err.message);
  } finally {
    loginBtn.textContent = originalText;
    loginBtn.disabled = false;
  }
}

/**
 * Auto-login if token exists
 */
async function tryAutoLogin() {
  const token = getToken();
  const user = getStoredUser();

  if (!token || !user) return;

  try {
    const data = await apiRequest('/auth/me');
    if (!data) return;

    currentRole = data.role;
    const rd = ROLES[currentRole] || { icon: '👤', label: currentRole };

    document.getElementById('uc-role').textContent = rd.icon + ' ' + rd.label;
    document.getElementById('uc-name').textContent = data.full_name;
    document.getElementById('uc-hotel').textContent = getUserHotelLabel(data);
    document.getElementById('mob-role').textContent = rd.label;

    if (document.getElementById('sup-hotel-name')) {
      document.getElementById('sup-hotel-name').textContent = getUserHotelLabel(data);
    }

    buildNav();
    updateLogoutButtonVisibility(currentRole);

    document.getElementById('today-date').textContent = new Date().toLocaleDateString('ar-SA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('appScreen').classList.add('active');
    showPg(NAV[currentRole][0].items[0].id);
    if (typeof showLatestBroadcastIfAny === 'function') {
      setTimeout(() => showLatestBroadcastIfAny(), 800);
    }
    buildChecklist();

    if (typeof startAttendanceHeartbeat === 'function') {
      startAttendanceHeartbeat();
    }
    if (typeof refreshAttendanceQuickState === 'function') {
      refreshAttendanceQuickState();
    }

  } catch (e) {
    clearAuth();
  }
}

/**
 * Logout — optionally auto-checkout attendance roles, then clear token and return to login
 */
async function doLogout(options = {}) {
  const skipAttendanceCheckout = !!options.skipAttendanceCheckout;
  const user = getStoredUser();
  const role = normalizeRole(user?.role || currentRole);

  if (!skipAttendanceCheckout) {
    await tryAttendanceCheckoutBeforeLogout(role);
  }

  if (typeof stopAttendanceHeartbeat === 'function') {
    stopAttendanceHeartbeat();
  }
  clearAuth();
  document.getElementById('appScreen').classList.remove('active');
  document.getElementById('loginScreen').classList.add('active');
  document.querySelectorAll('.rb').forEach(b => b.classList.remove('sel'));
  document.getElementById('l-name').value = '';
  document.getElementById('l-pass').value = '';
  document.getElementById('login-error').classList.remove('show');
  currentRole = null;
  updateLogoutButtonVisibility(null);
}

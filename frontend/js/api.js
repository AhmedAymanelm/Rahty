/* ==========================================
   راحتي — API Configuration
   ========================================== */

const API_BASE = '/api';

const AUTH_TOKEN_KEY = 'rahaty_token';
const AUTH_USER_KEY = 'rahaty_user';

// Enforce tab-scoped auth: clear legacy persistent login values if present.
(function clearLegacyPersistentAuth() {
  try {
    if (localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_USER_KEY)) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    }
  } catch (_) {
    // Ignore storage access issues; app will still function with sessionStorage.
  }
})();

/**
 * Get stored auth token
 */
function getToken() {
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Get stored user data
 */
function getStoredUser() {
  const data = sessionStorage.getItem(AUTH_USER_KEY);
  return data ? JSON.parse(data) : null;
}

/**
 * Save auth data to localStorage
 */
function saveAuth(token, user) {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

/**
 * Resolve display hotel name for the signed-in user.
 * - Admin has no bound hotel.
 * - Other roles should show hotel name; fallback to hotel id when name is missing.
 */
function getUserHotelLabel(user) {
  if (!user) return '—';
  const role = String(user.role || '').trim().toLowerCase();
  if (role === 'admin') return '—';

  const nestedName = String(user?.hotel?.name || '').trim();
  const flatName = String(user?.hotel_name || '').trim();
  if (nestedName) return nestedName;
  if (flatName) return flatName;

  if (user.hotel_id) return `فندق #${user.hotel_id}`;
  return '—';
}

/**
 * Clear auth data
 */
function clearAuth() {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
  // Defensive cleanup for any pre-existing old behavior.
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

/**
 * Make authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && endpoint !== '/auth/login') {
    clearAuth();
    document.getElementById('appScreen').classList.remove('active');
    document.getElementById('loginScreen').classList.add('active');
    if (typeof showError === 'function') showError('انتهت الجلسة، يرجى تسجيل الدخول مجدداً');
    return null;
  }

  if (!res.ok) {
    throw new Error(data.detail || 'حدث خطأ في الطلب');
  }

  return data;
}

/**
 * Make authenticated multipart/form-data API request.
 */
async function apiMultipartRequest(endpoint, formData, options = {}) {
  const token = getToken();
  const headers = {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    method: options.method || 'POST',
    headers,
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    clearAuth();
    document.getElementById('appScreen').classList.remove('active');
    document.getElementById('loginScreen').classList.add('active');
    if (typeof showError === 'function') showError('انتهت الجلسة، يرجى تسجيل الدخول مجدداً');
    return null;
  }

  if (!res.ok) {
    throw new Error(data.detail || 'حدث خطأ في رفع الملف');
  }

  return data;
}

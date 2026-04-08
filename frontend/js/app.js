/* ==========================================
   راحتي — App Entry Point
   ========================================== */

/**
 * Close modals when clicking on overlay background
 */
window.onclick = (e) => {
  if (e.target.classList.contains('modal-ov')) {
    e.target.classList.remove('show');
    e.target.style.display = 'none';
  }
};

/**
 * On page load — try auto-login with stored token
 */
window.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for pages to load then try auto-login
  setTimeout(() => {
    tryAutoLogin();
  }, 500);
});

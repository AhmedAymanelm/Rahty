/* ==========================================
   راحتي — Room Management
   ========================================== */

/**
 * Load rooms from server and render the grid
 */
async function loadRooms() {
  const container = document.querySelector('#p-cl-rooms .rg');
  if (!container) return;

  container.innerHTML = '<div class="dim">جاري تحميل الغرف...</div>';

  try {
    const rooms = await apiRequest('/rooms');
    if (!rooms) return;

    container.innerHTML = '';

    // Update stats
    const readyCount = rooms.filter(r => r.status === 'ready').length;
    const dirtyCount = rooms.filter(r => r.status === 'dirty' || r.status === 'cleaning').length;
    const maintCount = rooms.filter(r => r.status === 'maintenance').length;

    const stats = document.querySelectorAll('#p-cl-rooms .sv');
    if (stats.length >= 3) {
      stats[0].textContent = readyCount;
      stats[1].textContent = rooms.filter(r => r.status === 'cleaning').length;
      stats[2].textContent = rooms.filter(r => r.status === 'dirty').length;
    }

    rooms.forEach(r => {
      const rc = document.createElement('div');

      // Map status to CSS classes and labels
      let statusClass = '';
      let statusLabel = '';
      let statusColor = 'var(--dim)';

      if (r.status === 'ready') {
        statusClass = 'cl';
        statusLabel = '✅ نظيفة';
        statusColor = 'var(--green)';
      } else if (r.status === 'dirty') {
        statusClass = '';
        statusLabel = '⬜ لم تبدأ';
      } else if (r.status === 'cleaning') {
        statusClass = 'dt';
        statusLabel = '🧹 جارية';
        statusColor = 'var(--orange)';
      } else if (r.status === 'maintenance') {
        statusClass = 'mn';
        statusLabel = '🔧 صيانة';
        statusColor = 'var(--red)';
      } else if (r.status === 'occupied') {
        statusClass = 'mn'; // reuse maintenance styling for occupied
        statusLabel = '👤 مشغولة';
        statusColor = 'var(--blue)';
      }

      const canOpenChecklist = (r.status === 'dirty' || r.status === 'cleaning');

      rc.className = `rc ${statusClass}`;
      rc.style.cursor = canOpenChecklist ? 'pointer' : 'not-allowed';
      rc.title = canOpenChecklist ? 'افتح تقرير التنظيف' : 'هذه الغرفة غير متاحة للتنظيف الآن';

      if (canOpenChecklist) {
        rc.onclick = () => {
          // When clicking a dirty room, mark it as "cleaning" then open checklist
          if (r.status === 'dirty') {
            updateRoomStatus(r.id, 'cleaning');
          }
          goCleanRoom(r.number, r.id);
        };
      }

      rc.innerHTML = `
        <div class="rn">${r.number}</div>
        <div class="rs" style="color:${statusColor}">${statusLabel}</div>
      `;
      container.appendChild(rc);
    });
  } catch (err) {
    container.innerHTML = `<div class="login-error show">⚠️ خطأ: ${err.message}</div>`;
  }
}

/**
 * Update room status on the server
 */
async function updateRoomStatus(roomId, newStatus) {
  try {
    await apiRequest(`/rooms/${roomId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
  } catch (err) {
    console.error('Failed to update room status:', err);
  }
}

function canCreateRooms() {
  const user = getStoredUser();
  return ['admin', 'supervisor', 'superfv'].includes(user?.role);
}

async function populateRoomTypesSelect(selectId, hotelId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  try {
    const endpoint = hotelId ? `/room-types?hotel_id=${hotelId}` : '/room-types';
    const types = await apiRequest(endpoint);

    select.innerHTML = '';

    if (types && types.length > 0) {
      types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.name;
        opt.textContent = t.name;
        select.appendChild(opt);
      });
    } else {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'يرجى تعريف أنواع الغرف أولاً في الإعدادات';
      select.appendChild(opt);
    }
  } catch (err) {
    console.error('Failed to load room types:', err);
    const select2 = document.getElementById(selectId);
    if (select2) select2.innerHTML = '<option value="">تعذر التحميل</option>';
  }
}

async function initRoomCreateForms() {
  const user = getStoredUser();
  if (!user) return;

  const adminPanel = document.getElementById('ad-room-create-panel');
  const supPanel = document.getElementById('sup-room-create-panel');

  if (adminPanel) {
    adminPanel.style.display = user.role === 'admin' ? 'block' : 'none';
  }

  if (supPanel) {
    supPanel.style.display = ['supervisor', 'superfv'].includes(user.role) ? 'block' : 'none';
  }

  if (!canCreateRooms()) return;

  await bindAdminRoomCreateForm(user);
  await bindSupervisorRoomCreateForm(user);
}

async function bindAdminRoomCreateForm(user) {
  const form = document.getElementById('ad-room-create-form');
  if (!form || user.role !== 'admin') return;

  const hotelSelect = document.getElementById('ad-room-hotel');
  const typeSelect = document.getElementById('ad-room-type');

  // Load hotel list if not already done (only once)
  if (hotelSelect && hotelSelect.options.length <= 1) {
    try {
      const hotels = await apiRequest('/hotels');
      if (hotels && hotels.length > 0) {
        hotels.forEach((h) => {
          const op = document.createElement('option');
          op.value = String(h.id);
          op.textContent = h.name;
          hotelSelect.appendChild(op);
        });
      }
    } catch (_) {
      // ignore
    }
  }

  if (hotelSelect && typeSelect) {
    // Bind change listener only once
    if (!hotelSelect.dataset.listenerBound) {
      hotelSelect.addEventListener('change', async () => {
        const hid = hotelSelect.value;
        if (hid) {
          await populateRoomTypesSelect('ad-room-type', hid);
        } else {
          typeSelect.innerHTML = '<option value="">اختر الفندق أولاً</option>';
        }
      });
      hotelSelect.dataset.listenerBound = '1';
    }

    // ALWAYS sync hotel selection with active dashboard filter
    const activeFilter = (typeof activeAdminHotelFilter !== 'undefined' && activeAdminHotelFilter && activeAdminHotelFilter !== 'all')
      ? String(activeAdminHotelFilter) : '';
    if (activeFilter) {
      const matchingOption = Array.from(hotelSelect.options).find(o => o.value === activeFilter);
      if (matchingOption) hotelSelect.value = activeFilter;
    }

    // ALWAYS load room types for currently selected hotel
    if (hotelSelect.value) {
      await populateRoomTypesSelect('ad-room-type', hotelSelect.value);
    } else {
      typeSelect.innerHTML = '<option value="">اختر الفندق أولاً</option>';
    }
  }

  // Bind submit listener only once
  if (form.dataset.bound === '1') return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('ad-room-submit');
    const oldText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ جاري الإضافة...';
    }

    const hotelId = parseInt(document.getElementById('ad-room-hotel')?.value || '', 10);
    try {
      const payload = {
        number: (document.getElementById('ad-room-number')?.value || '').trim(),
        room_type: document.getElementById('ad-room-type')?.value || '',
        status: document.getElementById('ad-room-status')?.value || 'ready',
        hotel_id: hotelId,
      };

      if (!payload.number || Number.isNaN(payload.hotel_id)) {
        throw new Error('يرجى تعبئة رقم الغرفة والفندق');
      }
      if (!payload.room_type) {
        throw new Error('يرجى اختيار نوع الغرفة');
      }

      await apiRequest('/rooms', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      showToast('✅ تم إضافة الغرفة بنجاح', 'success');
      form.reset();
      // Re-select the hotel and reload types after form reset
      if (hotelId) {
        const hotelSelectEl = document.getElementById('ad-room-hotel');
        if (hotelSelectEl) hotelSelectEl.value = String(hotelId);
        await populateRoomTypesSelect('ad-room-type', hotelId);
      }
      if (typeof loadDashboardOverview === 'function') {
        await loadDashboardOverview();
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText || '💾 إضافة الغرفة';
      }
    }
  });

  form.dataset.bound = '1';
}

async function bindSupervisorRoomCreateForm(user) {
  const form = document.getElementById('sup-room-create-form');
  if (!form || form.dataset.bound === '1' || !['supervisor', 'superfv'].includes(user.role)) return;

  const hotelName = document.getElementById('sup-room-hotel-name');
  if (hotelName) hotelName.value = user.hotel_name || `فندق #${user.hotel_id || '-'}`;

  // Load room types dynamically for this supervisor's hotel
  if (user.hotel_id) {
    await populateRoomTypesSelect('sup-room-type', user.hotel_id);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('sup-room-submit');
    const oldText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ جاري الإضافة...';
    }

    try {
      const payload = {
        number: (document.getElementById('sup-room-number')?.value || '').trim(),
        room_type: document.getElementById('sup-room-type')?.value || '',
        status: document.getElementById('sup-room-status')?.value || 'ready',
        hotel_id: user.hotel_id,
      };

      if (!payload.number || !payload.hotel_id) {
        throw new Error('بيانات الغرفة غير مكتملة');
      }
      if (!payload.room_type) {
        throw new Error('يرجى اختيار نوع الغرفة أولاً من الإعدادات');
      }

      await apiRequest('/rooms', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      showToast('✅ تم إضافة الغرفة لفندقك بنجاح', 'success');
      form.reset();
      if (hotelName) hotelName.value = user.hotel_name || `فندق #${user.hotel_id || '-'}`;
      // Reload types after reset
      if (user.hotel_id) await populateRoomTypesSelect('sup-room-type', user.hotel_id);
      if (typeof loadDashboardOverview === 'function') {
        await loadDashboardOverview();
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText || '💾 إضافة الغرفة';
      }
    }
  });

  form.dataset.bound = '1';
}

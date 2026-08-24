/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — ORGANISER ADMIN LOGIC
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  const config = window.CLP_CONFIG || {};
  let supabaseClient = null;
  let registrationsData = [];
  let currentUser = null;

  // Initialize Supabase Client
  if (window.supabase && config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
    try {
      supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    } catch (e) {
      console.error("Supabase Init Error in Admin Console:", e);
    }
  }

  // DOM Elements
  const loginModal = document.getElementById('login-modal');
  const loginForm = document.getElementById('login-form');
  const loginErr = document.getElementById('login-error-msg');
  const loginSubmitBtn = document.getElementById('btn-login-submit');

  const mainContent = document.getElementById('admin-main-content');
  const logoutBtn = document.getElementById('btn-logout-admin');
  const tableBody = document.getElementById('admin-table-body');
  const searchInput = document.getElementById('admin-search');
  const filterStatus = document.getElementById('admin-filter-status');
  const playerModal = document.getElementById('player-modal');
  const playerForm = document.getElementById('player-form');
  const modalTitle = document.getElementById('modal-title');

  // 1. Session Check & Auth Guard
  async function checkSession() {
    if (!supabaseClient) return false;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      currentUser = session.user;
      showAdminView();
      return true;
    } else {
      showLoginView();
      return false;
    }
  }

  function showLoginView() {
    if (loginModal) loginModal.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'none';
  }

  function showAdminView() {
    if (loginModal) loginModal.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
    loadData();
    setupRealtime();
  }

  // Password Visibility Toggle Handler
  const togglePasswordBtn = document.getElementById('btn-toggle-password');
  const passwordInput = document.getElementById('login_password');
  const passwordEyeIcon = document.getElementById('password-eye-icon');

  if (togglePasswordBtn && passwordInput && passwordEyeIcon) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
      if (isPassword) {
        passwordEyeIcon.classList.remove('fa-eye');
        passwordEyeIcon.classList.add('fa-eye-slash');
      } else {
        passwordEyeIcon.classList.remove('fa-eye-slash');
        passwordEyeIcon.classList.add('fa-eye');
      }
    });
  }

  // Handle Login Submission (Password Only)
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('login_password').value;
      const email = "ishanvashistha.1993@gmail.com";

      if (!password) return;

      if (loginErr) loginErr.style.display = 'none';
      if (loginSubmitBtn) {
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AUTHENTICATING...';
      }

      try {
        if (!supabaseClient) {
          throw new Error("Supabase client is not configured properly.");
        }

        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        currentUser = data.user;
        showAdminView();
      } catch (err) {
        if (loginErr) {
          loginErr.textContent = err.message || "Invalid organiser password.";
          loginErr.style.display = 'block';
        }
      } finally {
        if (loginSubmitBtn) {
          loginSubmitBtn.disabled = false;
          loginSubmitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> SIGN IN';
        }
      }
    });
  }

  // Logout Action
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (supabaseClient) await supabaseClient.auth.signOut();
      currentUser = null;
      showLoginView();
    });
  }

  // 2. Fetch Registration Records from Supabase
  async function loadData() {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
      .from('registrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error loading data:", error);
    } else {
      registrationsData = data;
      renderStats();
      renderTable();
    }
  }

  // 3. Supabase Realtime Listener
  function setupRealtime() {
    if (!supabaseClient) return;
    supabaseClient
      .channel('public:registrations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, (payload) => {
        console.log("Realtime payload received:", payload);
        loadData();
      })
      .subscribe();
  }

  // 4. Render Stats Summary
  function renderStats() {
    const total = registrationsData.length;
    let debutCount = 0;
    let previousCount = 0;

    registrationsData.forEach(r => {
      if (r.tournament_status === 'Debut') debutCount++;
      else previousCount++;
    });

    const statTotal = document.getElementById('stat-total');
    const statDebut = document.getElementById('stat-debut');
    const statPrevious = document.getElementById('stat-previous');

    if (statTotal) statTotal.textContent = total;
    if (statDebut) statDebut.textContent = debutCount;
    if (statPrevious) statPrevious.textContent = previousCount;
  }

  // 5. Render Data Table with Individual Sports Ratings
  function renderTable() {
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const query = (searchInput?.value || '').toLowerCase().trim();
    const statusFilter = filterStatus?.value || 'ALL';

    const filtered = registrationsData.filter(r => {
      const matchQuery = !query || 
        r.full_name?.toLowerCase().includes(query) ||
        r.jersey_name?.toLowerCase().includes(query) ||
        r.reg_code?.toLowerCase().includes(query);

      const matchStatus = statusFilter === 'ALL' || r.tournament_status === statusFilter;
      return matchQuery && matchStatus;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:2.5rem; color:var(--text-muted);">No registration records found.</td></tr>`;
      return;
    }

    filtered.forEach(r => {
      const tr = document.createElement('tr');
      const photoHtml = r.profile_pic_url 
        ? `<img src="${r.profile_pic_url}" class="player-avatar-sm" alt="Photo">`
        : `<i class="fa-solid fa-circle-user" style="font-size:2rem; color:var(--text-muted);"></i>`;

      const statusBadge = r.tournament_status === 'Debut'
        ? `<span style="background:rgba(0,229,255,0.15); color:var(--primary-cyan); border:1px solid var(--primary-cyan); padding:0.2rem 0.6rem; border-radius:12px; font-size:0.75rem; font-weight:700;">DEBUT</span>`
        : `<span style="background:rgba(245,197,24,0.15); color:var(--primary-gold); border:1px solid var(--primary-gold); padding:0.2rem 0.6rem; border-radius:12px; font-size:0.75rem; font-weight:700;">VETERAN</span>`;

      // 7 Individual Sports Ratings Badge Display
      const ratingsBadge = `
        <div style="font-size:0.75rem; line-height:1.45;">
          🏓 <b>${parseFloat(r.rating_pickleball || 0).toFixed(1)}</b> &nbsp;|&nbsp;
          ♠️ <b>${parseFloat(r.rating_poker || 0).toFixed(1)}</b> &nbsp;|&nbsp;
          🏏 <b>${parseFloat(r.rating_cricket || 0).toFixed(1)}</b> &nbsp;|&nbsp;
          🏃 <b>${parseFloat(r.rating_triathlon || 0).toFixed(1)}</b> <br>
          🎯 <b>${parseFloat(r.rating_archery_shooting || 0).toFixed(1)}</b> &nbsp;|&nbsp;
          🏸 <b>${parseFloat(r.rating_badminton || 0).toFixed(1)}</b> &nbsp;|&nbsp;
          🏓 <b>${parseFloat(r.rating_table_tennis || 0).toFixed(1)}</b>
        </div>
      `;

      tr.innerHTML = `
        <td style="font-family:monospace; font-weight:700; color:var(--primary-cyan);">${r.reg_code || '-'}</td>
        <td>${photoHtml}</td>
        <td style="font-weight:700;">${r.full_name || '-'}</td>
        <td>${r.age || '-'} / ${r.sex || '-'}</td>
        <td>${statusBadge}</td>
        <td style="font-family:var(--font-heading); font-weight:800;">${r.jersey_name || '-'}</td>
        <td style="font-weight:800; color:var(--primary-gold);">#${r.jersey_number || '-'}</td>
        <td><strong style="color:var(--primary-red);">${r.jersey_size || '-'}</strong></td>
        <td>${ratingsBadge}</td>
        <td style="font-size:0.8rem; color:var(--text-muted);">${r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}</td>
        <td>
          <button class="action-btn-sm btn-edit" data-id="${r.id}" title="Edit Player"><i class="fa-solid fa-pen"></i></button>
          <button class="action-btn-sm btn-delete" data-id="${r.id}" title="Delete Player"><i class="fa-solid fa-trash"></i></button>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    // Attach Event Listeners to Edit and Delete buttons
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => openEditModal(e.currentTarget.getAttribute('data-id')));
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => deletePlayer(e.currentTarget.getAttribute('data-id')));
    });
  }

  if (searchInput) searchInput.addEventListener('input', renderTable);
  if (filterStatus) filterStatus.addEventListener('change', renderTable);

  // 6. Add & Edit Modal Logic
  const openAddBtn = document.getElementById('btn-open-add-modal');
  const cancelModalBtn = document.getElementById('btn-cancel-modal');

  if (openAddBtn) {
    openAddBtn.addEventListener('click', () => {
      if (playerForm) playerForm.reset();
      document.getElementById('player_edit_id').value = '';
      if (modalTitle) modalTitle.textContent = "ADD NEW PLAYER REGISTRATION";
      if (playerModal) playerModal.classList.add('active');
    });
  }

  if (cancelModalBtn) {
    cancelModalBtn.addEventListener('click', () => {
      if (playerModal) playerModal.classList.remove('active');
    });
  }

  function openEditModal(id) {
    const player = registrationsData.find(r => r.id === id);
    if (!player) return;

    document.getElementById('player_edit_id').value = player.id;
    document.getElementById('modal_full_name').value = player.full_name || '';
    document.getElementById('modal_age').value = player.age || 24;
    document.getElementById('modal_sex').value = player.sex || 'Male';
    document.getElementById('modal_status').value = player.tournament_status || 'Debut';
    document.getElementById('modal_jersey_name').value = player.jersey_name || '';
    document.getElementById('modal_jersey_number').value = player.jersey_number || '';
    document.getElementById('modal_jersey_size').value = player.jersey_size || 'L';

    if (modalTitle) modalTitle.textContent = `EDIT PLAYER — ${player.reg_code}`;
    if (playerModal) playerModal.classList.add('active');
  }

  if (playerForm) {
    playerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('player_edit_id').value;
      const fullName = document.getElementById('modal_full_name').value.trim();
      const age = parseInt(document.getElementById('modal_age').value);
      const sex = document.getElementById('modal_sex').value;
      const status = document.getElementById('modal_status').value;
      const jerseyName = document.getElementById('modal_jersey_name').value.trim();
      const jerseyNumber = document.getElementById('modal_jersey_number').value.trim();
      const jerseySize = document.getElementById('modal_jersey_size').value;

      if (!fullName || !age || !jerseyName || !jerseyNumber) {
        alert("Please fill in all required fields.");
        return;
      }

      if (editId) {
        // Update existing record
        const { error } = await supabaseClient
          .from('registrations')
          .update({
            full_name: fullName,
            age: age,
            sex: sex,
            tournament_status: status,
            jersey_name: jerseyName,
            jersey_number: jerseyNumber,
            jersey_size: jerseySize
          })
          .eq('id', editId);

        if (error) alert("Error updating player: " + error.message);
      } else {
        // Insert new record
        const regCode = 'CLP-' + Math.floor(1000 + Math.random() * 9000);
        const { error } = await supabaseClient
          .from('registrations')
          .insert([{
            reg_code: regCode,
            full_name: fullName,
            age: age,
            sex: sex,
            tournament_status: status,
            jersey_name: jerseyName,
            jersey_number: jerseyNumber,
            jersey_size: jerseySize,
            created_at: new Date().toISOString()
          }]);

        if (error) alert("Error adding player: " + error.message);
      }

      if (playerModal) playerModal.classList.remove('active');
      loadData();
    });
  }

  // 7. Delete Player
  async function deletePlayer(id) {
    const player = registrationsData.find(r => r.id === id);
    if (!player) return;

    if (confirm(`Are you sure you want to delete registration ${player.reg_code} (${player.full_name})?`)) {
      const { error } = await supabaseClient
        .from('registrations')
        .delete()
        .eq('id', id);

      if (error) alert("Error deleting player: " + error.message);
      else loadData();
    }
  }

  // 8. Export CSV with Individual Sports Ratings
  const exportBtn = document.getElementById('btn-export-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!registrationsData.length) {
        alert("No registration data available to export.");
        return;
      }

      const headers = [
        "Reg Code", "Full Name", "Age", "Sex", "Status", 
        "Jersey Name", "Jersey Number", "Jersey Size", 
        "Pickleball", "Poker", "Cricket", "Triathlon", "Archery Shooting", "Badminton", "Table Tennis", 
        "Created At"
      ];

      const rows = registrationsData.map(r => [
        `"${r.reg_code || ''}"`,
        `"${r.full_name || ''}"`,
        r.age || '',
        `"${r.sex || ''}"`,
        `"${r.tournament_status || ''}"`,
        `"${r.jersey_name || ''}"`,
        `"${r.jersey_number || ''}"`,
        `"${r.jersey_size || ''}"`,
        r.rating_pickleball || 0,
        r.rating_poker || 0,
        r.rating_cricket || 0,
        r.rating_triathlon || 0,
        r.rating_archery_shooting || 0,
        r.rating_badminton || 0,
        r.rating_table_tennis || 0,
        `"${r.created_at || ''}"`
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `1727_Champion_League_2.0_Registrations_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // Run Session Check on Load
  await checkSession();
});

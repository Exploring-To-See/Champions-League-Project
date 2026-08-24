/* ============================================================
   1727 CHAMPION'S LEAGUE — ADMIN CONSOLE LOGIC
   Features: Supabase Auth Login, Realtime Listener, Full CRUD
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
      console.error("Supabase admin initialization failed", e);
    }
  }

  const loginModal = document.getElementById('login-modal');
  const loginForm = document.getElementById('login-form');
  const loginErr = document.getElementById('login-error-msg');
  const loginSubmitBtn = document.getElementById('btn-login-submit');

  const mainContent = document.getElementById('admin-main-content');
  const userEmailDisplay = document.getElementById('admin-email-display');
  const logoutBtn = document.getElementById('btn-logout-admin');

  const tableBody = document.getElementById('admin-table-body');
  const searchInput = document.getElementById('admin-search');
  const filterStatus = document.getElementById('admin-filter-status');

  const playerModal = document.getElementById('player-modal');
  const playerForm = document.getElementById('player-form');
  const modalTitle = document.getElementById('modal-title');

  // 1. Session Check & Auth Logic
  async function checkSession() {
    if (!supabaseClient) return false;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      currentUser = session.user;
      showAdminView(currentUser.email);
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

  function showAdminView(email) {
    if (loginModal) loginModal.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
    if (userEmailDisplay) userEmailDisplay.innerHTML = `<i class="fa-solid fa-user-shield"></i> ${email}`;
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

  // Handle Login Submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login_email').value.trim();
      const password = document.getElementById('login_password').value;

      if (!email || !password) return;

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
        showAdminView(currentUser.email);
      } catch (err) {
        if (loginErr) {
          loginErr.textContent = err.message || "Invalid email or password.";
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

  // 2. Fetch Data from Supabase
  async function loadData() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
      .from('registrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      registrationsData = data;
      renderStats();
      renderTable();
    }
  }

  // 3. Supabase Realtime Listener (Updates Table Instantly)
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

  // 4. Render Stats
  function renderStats() {
    const total = registrationsData.length;
    let sumRating = 0;
    let debutCount = 0;
    let previousCount = 0;

    registrationsData.forEach(r => {
      sumRating += parseFloat(r.combined_rating || 0);
      if (r.tournament_status === 'Debut') debutCount++;
      else previousCount++;
    });

    const avg = total > 0 ? (sumRating / total).toFixed(1) : "0.0";

    const statTotal = document.getElementById('stat-total');
    const statAvg = document.getElementById('stat-avg');
    const statDebut = document.getElementById('stat-debut');
    const statPrevious = document.getElementById('stat-previous');

    if (statTotal) statTotal.textContent = total;
    if (statAvg) statAvg.textContent = avg;
    if (statDebut) statDebut.textContent = debutCount;
    if (statPrevious) statPrevious.textContent = previousCount;
  }

  // 5. Render Data Table
  function renderTable() {
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const query = (searchInput?.value || '').toLowerCase().trim();
    const statusFilter = filterStatus?.value || 'ALL';

    const filtered = registrationsData.filter(r => {
      const matchQuery = !query || 
        r.full_name?.toLowerCase().includes(query) ||
        r.jersey_name?.toLowerCase().includes(query) ||
        r.previous_competition_name?.toLowerCase().includes(query) ||
        r.reg_code?.toLowerCase().includes(query);

      const matchStatus = statusFilter === 'ALL' || r.tournament_status === statusFilter;
      return matchQuery && matchStatus;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:2.5rem; color:var(--text-muted);">No registration records found.</td></tr>`;
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

      tr.innerHTML = `
        <td style="font-family:monospace; font-weight:700; color:var(--primary-cyan);">${r.reg_code || '-'}</td>
        <td>${photoHtml}</td>
        <td style="font-weight:700;">${r.full_name || '-'}</td>
        <td>${r.age || '-'} / ${r.sex || '-'}</td>
        <td>${statusBadge}</td>
        <td style="font-size:0.85rem; color:var(--text-muted);">${r.previous_competition_name || 'N/A'}</td>
        <td style="font-family:var(--font-heading); font-weight:800;">${r.jersey_name || '-'}</td>
        <td style="font-weight:800; color:var(--primary-gold);">#${r.jersey_number || '-'}</td>
        <td><strong style="color:var(--primary-red);">${r.jersey_size || '-'}</strong></td>
        <td style="font-weight:900; color:var(--primary-cyan);">${parseFloat(r.combined_rating || 0).toFixed(1)} / 10</td>
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
    document.getElementById('modal_previous_comp').value = player.previous_competition_name || '';
    document.getElementById('modal_jersey_name').value = player.jersey_name || '';
    document.getElementById('modal_jersey_number').value = player.jersey_number || '';
    document.getElementById('modal_jersey_size').value = player.jersey_size || 'L';
    document.getElementById('modal_combined_rating').value = player.combined_rating || 0.0;

    if (modalTitle) modalTitle.textContent = `EDIT PLAYER (${player.reg_code})`;
    if (playerModal) playerModal.classList.add('active');
  }

  // Handle Add/Edit Form Save
  if (playerForm) {
    playerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('player_edit_id').value;
      const fullName = document.getElementById('modal_full_name').value.trim();
      const age = parseInt(document.getElementById('modal_age').value);
      const sex = document.getElementById('modal_sex').value;
      const status = document.getElementById('modal_status').value;
      const prevComp = document.getElementById('modal_previous_comp')?.value.trim() || null;
      const jerseyName = document.getElementById('modal_jersey_name').value.trim();
      const jerseyNumber = document.getElementById('modal_jersey_number')?.value.trim() || null;
      const jerseySize = document.getElementById('modal_jersey_size').value;
      const combinedRating = parseFloat(document.getElementById('modal_combined_rating').value || 0);

      if (!fullName || !jerseyName) return;

      if (editId) {
        // Update existing record
        const { error } = await supabaseClient
          .from('registrations')
          .update({
            full_name: fullName,
            age: age,
            sex: sex,
            tournament_status: status,
            previous_competition_name: prevComp,
            jersey_name: jerseyName,
            jersey_number: jerseyNumber,
            jersey_size: jerseySize,
            combined_rating: combinedRating
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
            previous_competition_name: prevComp,
            jersey_name: jerseyName,
            jersey_number: jerseyNumber,
            jersey_size: jerseySize,
            combined_rating: combinedRating,
            rating_pickleball: combinedRating,
            rating_poker: combinedRating,
            rating_cricket: combinedRating,
            rating_triathlon: combinedRating,
            rating_archery_shooting: combinedRating,
            rating_badminton: combinedRating,
            rating_table_tennis: combinedRating,
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

  // 8. Export CSV
  const exportBtn = document.getElementById('btn-export-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!registrationsData.length) {
        alert("No registration data available to export.");
        return;
      }

      const headers = ["Reg Code", "Full Name", "Age", "Sex", "Status", "Prev Competition", "Jersey Name", "Jersey Number", "Jersey Size", "Combined Rating", "Created At"];
      const rows = registrationsData.map(r => [
        `"${r.reg_code || ''}"`,
        `"${r.full_name || ''}"`,
        r.age || '',
        `"${r.sex || ''}"`,
        `"${r.tournament_status || ''}"`,
        `"${r.previous_competition_name || ''}"`,
        `"${r.jersey_name || ''}"`,
        `"${r.jersey_number || ''}"`,
        `"${r.jersey_size || ''}"`,
        r.combined_rating || '',
        `"${r.created_at || ''}"`
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `1727_Champion_League_Registrations_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // Run Session Check on Load
  await checkSession();
});

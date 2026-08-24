/* ============================================================
   CHAMPIONS LEAGUE SPORTS TOURNAMENT — ADMIN CONSOLE SCRIPT
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  const config = window.CLP_CONFIG || {};
  let registrations = [];
  let supabaseClient = null;

  if (window.supabase && config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes("your-supabase-project")) {
    try {
      supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    } catch (e) {
      console.warn("Supabase admin init error", e);
    }
  }

  const tableBody = document.getElementById('admin-table-body');
  const searchInput = document.getElementById('admin-search-input');
  const filterStatus = document.getElementById('admin-filter-status');
  const exportBtn = document.getElementById('btn-export-csv');

  async function loadData() {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('registrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        registrations = data;
      }
    } else {
      // Mock data for demo view
      registrations = [
        {
          reg_code: 'CLP-1001',
          full_name: 'Alex Morgan',
          age: 24,
          sex: 'Female',
          tournament_status: 'Previous Participant',
          jersey_name: 'MORGAN',
          jersey_size: 'M',
          combined_rating: 8.4,
          created_at: new Date().toISOString(),
          profile_pic_url: null
        },
        {
          reg_code: 'CLP-1002',
          full_name: 'Carlos Vela',
          age: 28,
          sex: 'Male',
          tournament_status: 'Debut',
          jersey_name: 'VELA',
          jersey_size: 'L',
          combined_rating: 7.2,
          created_at: new Date().toISOString(),
          profile_pic_url: null
        }
      ];
    }

    updateStats();
    renderTable();
  }

  function updateStats() {
    const total = registrations.length;
    let sumRating = 0;
    let debutCount = 0;
    let previousCount = 0;

    registrations.forEach(r => {
      sumRating += parseFloat(r.combined_rating || 0);
      if (r.tournament_status === 'Debut') debutCount++;
      else previousCount++;
    });

    const avg = total > 0 ? (sumRating / total).toFixed(1) : "0.0";

    document.getElementById('stat-total-players').textContent = total;
    document.getElementById('stat-avg-rating').textContent = avg;
    document.getElementById('stat-debut-players').textContent = debutCount;
    document.getElementById('stat-previous-players').textContent = previousCount;
  }

  function renderTable() {
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const query = (searchInput?.value || '').toLowerCase().trim();
    const statusFilter = filterStatus?.value || 'ALL';

    const filtered = registrations.filter(r => {
      const matchQuery = !query || 
        r.full_name?.toLowerCase().includes(query) ||
        r.jersey_name?.toLowerCase().includes(query) ||
        r.reg_code?.toLowerCase().includes(query);

      const matchStatus = statusFilter === 'ALL' || r.tournament_status === statusFilter;
      return matchQuery && matchStatus;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-muted);">No player registrations found.</td></tr>`;
      return;
    }

    filtered.forEach(r => {
      const tr = document.createElement('tr');
      const photoHtml = r.profile_pic_url 
        ? `<img src="${r.profile_pic_url}" class="player-thumb" alt="Photo">`
        : `<i class="fa-solid fa-user-circle" style="font-size:1.8rem; color:var(--text-muted);"></i>`;

      const statusBadgeClass = r.tournament_status === 'Debut' ? 'badge-debut' : 'badge-previous';

      tr.innerHTML = `
        <td style="font-family:monospace; font-weight:700; color:var(--primary-gold);">${r.reg_code || '-'}</td>
        <td>${photoHtml}</td>
        <td style="font-weight:700;">${r.full_name || '-'}</td>
        <td>${r.age || '-'} / ${r.sex || '-'}</td>
        <td><span class="badge-status ${statusBadgeClass}">${r.tournament_status || 'Debut'}</span></td>
        <td style="font-family:var(--font-heading); font-weight:700;">${r.jersey_name || '-'}</td>
        <td><strong style="color:var(--primary-cyan);">${r.jersey_size || '-'}</strong></td>
        <td style="font-weight:900; color:var(--primary-gold);">${parseFloat(r.combined_rating || 0).toFixed(1)} / 10</td>
        <td style="font-size:0.8rem; color:var(--text-muted);">${r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  if (searchInput) searchInput.addEventListener('input', renderTable);
  if (filterStatus) filterStatus.addEventListener('change', renderTable);

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!registrations.length) {
        alert("No registration data available to export.");
        return;
      }

      const headers = ["Reg Code", "Full Name", "Age", "Sex", "Status", "Jersey Name", "Jersey Size", "Combined Rating", "Pickleball", "Poker", "Cricket", "Triathlon", "Archery & Shooting", "Badminton", "Table Tennis", "Football", "Created At"];
      
      const rows = registrations.map(r => [
        `"${r.reg_code || ''}"`,
        `"${r.full_name || ''}"`,
        r.age || '',
        `"${r.sex || ''}"`,
        `"${r.tournament_status || ''}"`,
        `"${r.jersey_name || ''}"`,
        `"${r.jersey_size || ''}"`,
        r.combined_rating || '',
        r.rating_pickleball || '',
        r.rating_poker || '',
        r.rating_cricket || '',
        r.rating_triathlon || '',
        r.rating_archery_shooting || '',
        r.rating_badminton || '',
        r.rating_table_tennis || '',
        r.rating_football || '',
        `"${r.created_at || ''}"`
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Champions_League_Registrations_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  await loadData();
});

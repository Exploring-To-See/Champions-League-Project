/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — FRONTEND APPLICATION LOGIC
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const config = window.CLP_CONFIG || {};
  let supabaseClient = null;
  let compressedPhotoBlob = null;

  // 1. Initialize Supabase if credentials are provided
  if (window.supabase && config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes("your-supabase-project")) {
    try {
      supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
      console.log("Supabase Client Initialized Successfully");
    } catch (e) {
      console.warn("Supabase init error, running in demo mode", e);
    }
  } else {
    console.log("Running in DEMO mode (Supabase URL/Key pending)");
  }

  // 2. Render 7 Sports Sliders dynamically (Single Emoji per Sport)
  const sportsContainer = document.getElementById('sports-ratings-grid');
  const sportsList = config.SPORTS || [];

  if (sportsContainer) {
    sportsContainer.innerHTML = '';
    sportsList.forEach(sport => {
      const sportEl = document.createElement('div');
      sportEl.className = 'sport-rating-item';
      sportEl.innerHTML = `
        <div class="sport-info">
          <span class="sport-name"><span style="font-style:normal; margin-right:8px; font-size:1.15rem;">${sport.emoji || ''}</span> ${sport.name}</span>
          <span class="sport-score" id="score-val-${sport.id}">0.0 / 10</span>
        </div>
        <input type="range" id="rating-${sport.id}" name="rating_${sport.id}" min="0" max="10" step="0.5" value="0">
      `;
      sportsContainer.appendChild(sportEl);
    });
  }

  // 3. Dynamic Rating Calculation
  function updateRatings() {
    sportsList.forEach(sport => {
      const slider = document.getElementById(`rating-${sport.id}`);
      const valDisplay = document.getElementById(`score-val-${sport.id}`);
      if (slider && valDisplay) {
        const val = parseFloat(slider.value).toFixed(1);
        valDisplay.textContent = `${val} / 10`;
      }
    });
  }

  // Attach event listeners to all sport sliders
  sportsList.forEach(sport => {
    const slider = document.getElementById(`rating-${sport.id}`);
    if (slider) {
      slider.addEventListener('input', updateRatings);
    }
  });
  updateRatings();

  // 4. Live Jersey Customizer Preview Listeners
  const jerseyNameInput = document.getElementById('jersey_name');
  const jerseyNumberInput = document.getElementById('jersey_number');
  const jerseyNamePreview = document.getElementById('jersey-name-preview');
  const jerseyNumPreview = document.getElementById('jersey-num-preview');

  if (jerseyNameInput && jerseyNamePreview) {
    jerseyNameInput.addEventListener('input', () => {
      const val = jerseyNameInput.value.trim();
      jerseyNamePreview.textContent = val ? val.toUpperCase() : "YOUR NAME";
    });
  }

  if (jerseyNumberInput && jerseyNumPreview) {
    jerseyNumberInput.addEventListener('input', () => {
      const val = jerseyNumberInput.value.trim();
      jerseyNumPreview.textContent = val !== "" ? val : "00";
    });
  }

  // 5. Drag & Drop Photo Upload Handler
  const dropZone = document.getElementById('photo-drop-zone');
  const photoInput = document.getElementById('photo-input');
  const previewImg = document.getElementById('avatar-preview-img');
  const previewIcon = document.getElementById('avatar-preview-icon');

  if (dropZone && photoInput) {
    dropZone.addEventListener('click', () => photoInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--primary-cyan)';
      dropZone.style.background = 'rgba(0, 229, 255, 0.12)';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'rgba(0, 229, 255, 0.4)';
      dropZone.style.background = 'rgba(10, 18, 36, 0.6)';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'rgba(0, 229, 255, 0.4)';
      dropZone.style.background = 'rgba(10, 18, 36, 0.6)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handlePhotoFile(e.dataTransfer.files[0]);
      }
    });

    photoInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handlePhotoFile(e.target.files[0]);
      }
    });
  }

  function handlePhotoFile(file) {
    const maxMB = config.MAX_UPLOAD_MB || 8;
    if (file.size > maxMB * 1024 * 1024) {
      alert(`File size exceeds ${maxMB}MB limit.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewImg && previewIcon) {
        previewImg.src = e.target.result;
        previewImg.style.display = 'block';
        previewIcon.style.display = 'none';
      }
    };
    reader.readAsDataURL(file);
    compressedPhotoBlob = file;

    if (dropZone) {
      dropZone.style.borderColor = 'rgba(0, 229, 255, 0.4)';
    }
  }

  // 6. Handle Registration Form Submission
  const regForm = document.getElementById('registration-form');
  const submitBtn = document.getElementById('submit-btn');

  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const fullName = document.getElementById('full_name').value.trim();
      const age = parseInt(document.getElementById('age').value);
      const sex = document.querySelector('input[name="sex"]:checked')?.value || 'Male';
      const tournamentStatus = document.querySelector('input[name="tournament_status"]:checked')?.value || 'Debut';
      const jerseyName = document.getElementById('jersey_name').value.trim();
      const jerseyNumber = document.getElementById('jersey_number')?.value.trim() || null;
      const jerseySize = document.getElementById('jersey_size').value;

      if (!fullName || !age || !jerseyName || !jerseyNumber || !jerseySize) {
        alert("Please fill in all required fields.");
        return;
      }

      if (!compressedPhotoBlob) {
        alert("Please upload a player photo to complete registration.");
        if (dropZone) {
          dropZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
          dropZone.style.borderColor = 'var(--primary-red)';
        }
        return;
      }

      // Collect 7 sports ratings
      const sportsRatings = {};
      let totalRating = 0;
      sportsList.forEach(sport => {
        const val = parseFloat(document.getElementById(`rating-${sport.id}`)?.value || 0);
        sportsRatings[sport.id] = val;
        totalRating += val;
      });
      const combinedRating = parseFloat((totalRating / sportsList.length).toFixed(1));

      // Generate unique Reg Code e.g. CLP-8492
      const regCode = 'CLP-' + Math.floor(1000 + Math.random() * 9000);

      // Disable button during submission
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> REGISTERING...';
      }

      let profilePicUrl = null;

      try {
        // Upload photo if Supabase client is connected and blob exists
        if (supabaseClient && compressedPhotoBlob) {
          const filePath = `profile/${regCode}_${Date.now()}.jpg`;
          const { data: uploadData, error: uploadErr } = await supabaseClient.storage
            .from(config.STORAGE_BUCKET || 'registrations')
            .upload(filePath, compressedPhotoBlob, { contentType: 'image/jpeg' });

          if (uploadErr) {
            console.error("Storage upload error:", uploadErr);
          } else {
            const { data: publicUrlData } = supabaseClient.storage
              .from(config.STORAGE_BUCKET || 'registrations')
              .getPublicUrl(filePath);
            profilePicUrl = publicUrlData?.publicUrl || null;
          }
        }

        // Insert record into Supabase table
        if (supabaseClient) {
          const recordPayload = {
            reg_code: regCode,
            full_name: fullName,
            age: age,
            sex: sex,
            profile_pic_url: profilePicUrl,
            rating_pickleball: sportsRatings['pickleball'] || 0,
            rating_poker: sportsRatings['poker'] || 0,
            rating_cricket: sportsRatings['cricket'] || 0,
            rating_triathlon: sportsRatings['triathlon'] || 0,
            rating_archery_shooting: sportsRatings['archery_shooting'] || 0,
            rating_badminton: sportsRatings['badminton'] || 0,
            rating_table_tennis: sportsRatings['table_tennis'] || 0,
            combined_rating: combinedRating,
            tournament_status: tournamentStatus,
            jersey_name: jerseyName,
            jersey_number: jerseyNumber,
            jersey_size: jerseySize
          };

          const { error: insertErr } = await supabaseClient
            .from('registrations')
            .insert([recordPayload]);

          if (insertErr) throw insertErr;
        }

        // Redirect to the confirmation page
        const confirmationParams = new URLSearchParams({ name: fullName, code: regCode });
        window.location.href = `confirmation.html?${confirmationParams.toString()}`;
        return;

      } catch (err) {
        console.error("Registration error:", err);
        const errDiv = document.getElementById('form-error-msg');
        if (errDiv) {
          errDiv.textContent = err.message || "Failed to submit registration. Please try again.";
          errDiv.style.display = 'block';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-trophy"></i> COMPLETE REGISTRATION';
        }
      }
    });
  }

  /* ---------------------------------------------------------
     Section progress rail — ticks off each of the three form
     sections as its required fields are filled, so a player on
     a phone can see how much is left without scrolling back.
     --------------------------------------------------------- */
  (function initStepRail() {
    const rail = document.getElementById('reg-steps');
    if (!rail) return;

    const filled = (id) => {
      const el = document.getElementById(id);
      return !!(el && String(el.value || '').trim());
    };
    const anyChecked = (name) =>
      !!document.querySelector(`input[name="${name}"]:checked`);

    const steps = {
      1: () => filled('full_name') && filled('age') && anyChecked('sex') &&
               !!document.getElementById('avatar-preview-img')?.getAttribute('src'),
      2: () => true,   /* sliders always carry a value */
      3: () => anyChecked('tournament_status') && filled('jersey_name') &&
               filled('jersey_number') && filled('jersey_size')
    };

    function refresh() {
      Object.keys(steps).forEach((n) => {
        const el = rail.querySelector(`.clp-step[data-step="${n}"]`);
        if (!el) return;
        const done = steps[n]();
        el.classList.toggle('done', done);
        const badge = el.querySelector('b');
        if (badge) badge.textContent = done ? '\u2713' : n;
      });
    }

    document.addEventListener('input', refresh);
    document.addEventListener('change', refresh);
    refresh();
  })();

});

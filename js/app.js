/* ============================================================
   1727 CHAMPION'S LEAGUE — FRONTEND APPLICATION LOGIC
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

  // 2. Render 7 Sports Sliders dynamically with default 0 rating
  const sportsContainer = document.getElementById('sports-ratings-grid');
  const sportsList = config.SPORTS || [];

  if (sportsContainer) {
    sportsContainer.innerHTML = '';
    sportsList.forEach(sport => {
      const sportEl = document.createElement('div');
      sportEl.className = 'sport-rating-item';
      sportEl.innerHTML = `
        <div class="sport-info">
          <span class="sport-name"><span style="font-style:normal; margin-right:5px; font-size:1.05rem;">${sport.emoji || ''}</span> <i class="${sport.icon}"></i> ${sport.name}</span>
          <span class="sport-score" id="score-val-${sport.id}">0.0 / 10</span>
        </div>
        <input type="range" id="rating-${sport.id}" name="rating_${sport.id}" min="0" max="10" step="0.5" value="0">
      `;
      sportsContainer.appendChild(sportEl);
    });
  }

  // 3. Dynamic Rating Calculation (Starts at 0.0)
  function updateCombinedRating() {
    let totalScore = 0;
    let count = sportsList.length;

    sportsList.forEach(sport => {
      const slider = document.getElementById(`rating-${sport.id}`);
      const valDisplay = document.getElementById(`score-val-${sport.id}`);
      if (slider && valDisplay) {
        const val = parseFloat(slider.value).toFixed(1);
        valDisplay.textContent = `${val} / 10`;
        totalScore += parseFloat(val);
      }
    });

    const average = count > 0 ? (totalScore / count).toFixed(1) : "0.0";
    const combinedBadge = document.getElementById('combined-score-badge');

    if (combinedBadge) combinedBadge.textContent = `${average} / 10`;
  }

  // Attach event listeners to all sport sliders
  sportsList.forEach(sport => {
    const slider = document.getElementById(`rating-${sport.id}`);
    if (slider) {
      slider.addEventListener('input', updateCombinedRating);
    }
  });
  updateCombinedRating();

  // 4. Conditional Tournament History Previous Competition Field
  const statusPills = document.querySelectorAll('input[name="tournament_status"]');
  const prevWrapper = document.getElementById('previous-comp-wrapper');
  const prevInput = document.getElementById('previous_competition_name');

  function togglePreviousComp() {
    const selected = document.querySelector('input[name="tournament_status"]:checked')?.value;
    if (selected === 'Previous Participant') {
      if (prevWrapper) prevWrapper.style.display = 'block';
      if (prevInput) prevInput.required = true;
    } else {
      if (prevWrapper) prevWrapper.style.display = 'none';
      if (prevInput) {
        prevInput.required = false;
        prevInput.value = '';
      }
    }
  }

  statusPills.forEach(pill => pill.addEventListener('change', togglePreviousComp));
  togglePreviousComp();

  // 5. Drag & Drop Photo Upload Handler
  const dropZone = document.getElementById('photo-drop-zone');
  const photoInput = document.getElementById('photo-input');
  const previewImg = document.getElementById('avatar-preview-img');
  const previewIcon = document.getElementById('avatar-preview-icon');

  if (dropZone && photoInput) {
    dropZone.addEventListener('click', () => photoInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length) handlePhotoFile(files[0]);
    });

    photoInput.addEventListener('change', (e) => {
      if (e.target.files.length) handlePhotoFile(e.target.files[0]);
    });
  }

  function handlePhotoFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (JPG, PNG, WebP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          compressedPhotoBlob = blob;
          const previewUrl = URL.createObjectURL(blob);
          if (previewImg) {
            previewImg.src = previewUrl;
            previewImg.style.display = 'block';
            if (previewIcon) previewIcon.style.display = 'none';
          }
        }, 'image/jpeg', 0.85);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // 6. Form Submission Handler
  const regForm = document.getElementById('registration-form');
  const submitBtn = document.getElementById('btn-submit-form');
  const modalOverlay = document.getElementById('success-modal');
  const modalPlayerName = document.getElementById('modal-player-name');

  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const fullName = document.getElementById('full_name').value.trim();
      const age = parseInt(document.getElementById('age').value);
      const sex = document.querySelector('input[name="sex"]:checked')?.value || 'Male';
      const tournamentStatus = document.querySelector('input[name="tournament_status"]:checked')?.value || 'Debut';
      const previousCompName = document.getElementById('previous_competition_name')?.value.trim() || null;
      const jerseyName = document.getElementById('jersey_name').value.trim();
      const jerseyNumber = document.getElementById('jersey_number')?.value.trim() || null;
      const jerseySize = document.getElementById('jersey_size').value;

      if (!fullName || !age || !jerseyName || !jerseyNumber || !jerseySize) {
        alert("Please fill in all required fields.");
        return;
      }

      if (tournamentStatus === 'Previous Participant' && !previousCompName) {
        alert("Please enter your previous competition name.");
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
            previous_competition_name: previousCompName,
            jersey_name: jerseyName,
            jersey_number: jerseyNumber,
            jersey_size: jerseySize,
            created_at: new Date().toISOString()
          };

          const { error: dbErr } = await supabaseClient
            .from('registrations')
            .insert([recordPayload]);

          if (dbErr) {
            console.error("Database insert error:", dbErr);
          }
        }

        // Show Success Modal
        if (modalPlayerName) modalPlayerName.textContent = fullName.toUpperCase();
        if (modalOverlay) modalOverlay.classList.add('active');

      } catch (err) {
        console.error("Submission exception:", err);
        alert("An error occurred during registration. Please try again.");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-trophy"></i> COMPLETE REGISTRATION';
        }
      }
    });
  }

  // Modal Close handler
  const closeModalBtn = document.getElementById('btn-close-modal');
  if (closeModalBtn && modalOverlay) {
    closeModalBtn.addEventListener('click', () => {
      modalOverlay.classList.remove('active');
      if (regForm) regForm.reset();
      updateCombinedRating();
      togglePreviousComp();
      if (previewImg) {
        previewImg.style.display = 'none';
        if (previewIcon) previewIcon.style.display = 'block';
      }
    });
  }
});

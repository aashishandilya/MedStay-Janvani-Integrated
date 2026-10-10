// MedStay Lifeline & Critical Resource Radar Frontend Controller

window.currentView = window.currentView || 'home';
window.lifelineMeta = window.lifelineMeta || null;
window.currentRadarRegion = window.currentRadarRegion || 'All';
window.currentRadarCategory = window.currentRadarCategory || 'All';
window.currentLifelineTab = window.currentLifelineTab || 'blood-stock';

// Freshness badge helper
function renderFreshnessBadge(freshness, customStatus) {
  const status = customStatus || freshness?.label || 'Availability Unknown';
  const state = freshness?.state || 'unknown';
  let badgeClass = 'badge-unknown';
  if (state === 'fresh' || status === 'Recently Confirmed') badgeClass = 'badge-fresh';
  else if (state === 'aging' || status === 'Reported Availability') badgeClass = 'badge-aging';
  else if (state === 'stale' || status === 'Data Stale') badgeClass = 'badge-stale';
  else if (status === 'Verification Needed') badgeClass = 'badge-attention';

  return `<span class="badge-status ${badgeClass}" title="${freshness?.text || ''}">● ${status}</span>`;
}

// Format relative date
function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return isoStr;
  }
}

// Switch between views
function showHome() {
  currentView = 'home';
  $('homeView').style.display = 'block';
  $('hospitalHero').style.display = 'block';
  $('dashboardView').classList.remove('show');
  $('lifelineView').classList.remove('show');
  $('radarView').classList.remove('show');
  if ($('JanvaniView')) $('JanvaniView').classList.remove('show');
  renderNav();
  loadHospitals();
}

function showDashboardView() {
  currentView = 'dashboard';
  $('homeView').style.display = 'none';
  $('hospitalHero').style.display = 'none';
  $('lifelineView').classList.remove('show');
  $('radarView').classList.remove('show');
  if ($('JanvaniView')) $('JanvaniView').classList.remove('show');
  $('dashboardView').classList.add('show');
  renderNav();
}

// ========================================================
// LIFELINE MODULE
// ========================================================

async function showLifeline(tab = 'blood-stock') {
  currentView = 'lifeline';
  currentLifelineTab = tab;
  $('homeView').style.display = 'none';
  $('hospitalHero').style.display = 'none';
  $('dashboardView').classList.remove('show');
  $('radarView').classList.remove('show');
  if ($('JanvaniView')) $('JanvaniView').classList.remove('show');
  $('lifelineView').classList.add('show');
  renderNav();

  if (!lifelineMeta) {
    try {
      lifelineMeta = await api('/lifeline/meta');
    } catch (e) {
      console.error(e);
      lifelineMeta = {
        cities: ['Bengaluru', 'Chennai', 'Delhi', 'Mumbai'],
        bloodGroups: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
        components: ['Packed Red Blood Cells (PRBC)', 'Platelets', 'Fresh Frozen Plasma (FFP)', 'Whole Blood', 'Cryoprecipitate'],
        transplantServices: ['Kidney', 'Liver', 'Heart', 'Lung', 'Pancreas', 'Cornea', 'Bone Marrow / Stem Cell']
      };
    }
  }

  renderLifelineLayout();
  switchLifelineTab(currentLifelineTab);
}

function renderLifelineLayout() {
  $('lifelineView').innerHTML = `
    <div class="view-header">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div>
          <h2>MedStay Lifeline</h2>
          <p>Regional discovery for reported blood components and accredited organ transplant centres.</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn amber" onclick="openStockUpdateModal()">+ Update Stock (Demo Admin)</button>
          <button class="btn" onclick="showRadar()">View Resource Radar →</button>
        </div>
      </div>
      <div class="disclaimer-banner">
        <div>⚠️</div>
        <div>
          <b>Coordination Advisory:</b> MedStay Lifeline is an informational discovery and coordination platform.
          It is <b>not a blood-selling marketplace, organ-booking system, or clinical decision tool</b>.
          Reported units reflect voluntary facility telemetry. Compatibility testing, donor screening, and release authorization are handled strictly by certified healthcare professionals.
        </div>
      </div>
      <div class="tabs">
        <button class="tab-btn ${currentLifelineTab==='blood-stock'?'active':''}" onclick="switchLifelineTab('blood-stock')">🩸 Blood Availability</button>
        <button class="tab-btn ${currentLifelineTab==='blood-banks'?'active':''}" onclick="switchLifelineTab('blood-banks')">🏥 Blood Bank Finder</button>
        <button class="tab-btn ${currentLifelineTab==='transplant-network'?'active':''}" onclick="switchLifelineTab('transplant-network')">🌐 Organ Transplant Network</button>
        <button class="tab-btn ${currentLifelineTab==='audit-log'?'active':''}" onclick="switchLifelineTab('audit-log')">📋 Stock Updates & Audit Log</button>
      </div>
    </div>
    <div id="lifelineTabContent"></div>
  `;
}

function switchLifelineTab(tab) {
  currentLifelineTab = tab;
  document.querySelectorAll('.tabs .tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', 
      (tab === 'blood-stock' && i === 0) ||
      (tab === 'blood-banks' && i === 1) ||
      (tab === 'transplant-network' && i === 2) ||
      (tab === 'audit-log' && i === 3)
    );
  });

  if (tab === 'blood-stock') renderBloodStockTab();
  else if (tab === 'blood-banks') renderBloodBanksTab();
  else if (tab === 'transplant-network') renderTransplantNetworkTab();
  else if (tab === 'audit-log') renderLifelineAuditTab();
}

// Tab 1: Blood Availability
function renderBloodStockTab() {
  const cities = lifelineMeta?.cities || ['Bengaluru', 'Chennai', 'Delhi', 'Mumbai'];
  const groups = lifelineMeta?.bloodGroups || ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const components = lifelineMeta?.components || ['Packed Red Blood Cells (PRBC)', 'Platelets', 'Fresh Frozen Plasma (FFP)', 'Whole Blood', 'Cryoprecipitate'];

  $('lifelineTabContent').innerHTML = `
    <div class="filter-box">
      <div class="filter-grid">
        <div class="filter-item">
          <label>City / Location</label>
          <select id="lsCity" onchange="fetchBloodStock()">
            <option value="All">All Cities</option>
            ${cities.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="filter-item">
          <label>Blood Group (Independent)</label>
          <select id="lsGroup" onchange="fetchBloodStock()">
            <option value="All">All Blood Groups</option>
            ${groups.map(g => `<option value="${g}">${g}</option>`).join('')}
          </select>
        </div>
        <div class="filter-item">
          <label>Blood Component (Independent)</label>
          <select id="lsComp" onchange="fetchBloodStock()">
            <option value="All">All Components</option>
            ${components.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="filter-item">
          <label>Availability Status</label>
          <select id="lsAvail" onchange="fetchBloodStock()">
            <option value="All">All Stock Levels</option>
            <option value="available">Adequate Reserve (>4 units)</option>
            <option value="shortage">Reported Shortage (<=4 units)</option>
            <option value="depleted">Depleted (0 units)</option>
            <option value="unknown">Unknown / Unconfirmed</option>
          </select>
        </div>
        <div class="filter-item">
          <label>Data Freshness</label>
          <select id="lsFresh" onchange="fetchBloodStock()">
            <option value="All">All Freshness States</option>
            <option value="fresh">Recently Confirmed (&lt;2h)</option>
            <option value="aging">Aging (2h - 24h)</option>
            <option value="stale">Data Stale (&gt;24h)</option>
            <option value="unknown">Unknown Timestamp</option>
          </select>
        </div>
        <div class="filter-item">
          <label>Sort By</label>
          <select id="lsSort" onchange="fetchBloodStock()">
            <option value="freshness">Freshness (Newest First)</option>
            <option value="units-desc">Available Units (High to Low)</option>
            <option value="name">Facility Name (A-Z)</option>
          </select>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; gap:10px; flex-wrap:wrap;">
        <input id="lsSearch" placeholder="Search by blood bank name, address, or pincode..." style="max-width:380px" oninput="debounceFetchBloodStock()">
        <button class="btn primary" onclick="fetchBloodStock()">Apply Filters</button>
      </div>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h3 style="margin:0; font-family:Georgia,serif">Blood Component Stock Records</h3>
      <span class="muted" id="bloodStockCount">Loading stock records...</span>
    </div>
    <div class="grid" id="bloodStockGrid"></div>
  `;

  fetchBloodStock();
}

let bloodSearchTimeout = null;
function debounceFetchBloodStock() {
  clearTimeout(bloodSearchTimeout);
  bloodSearchTimeout = setTimeout(fetchBloodStock, 300);
}

async function fetchBloodStock() {
  const p = new URLSearchParams();
  const city = $('lsCity')?.value;
  const group = $('lsGroup')?.value;
  const comp = $('lsComp')?.value;
  const avail = $('lsAvail')?.value;
  const fresh = $('lsFresh')?.value;
  const sort = $('lsSort')?.value;
  const search = $('lsSearch')?.value;

  if (city && city !== 'All') p.set('city', city);
  if (group && group !== 'All') p.set('bloodGroup', group);
  if (comp && comp !== 'All') p.set('component', comp);
  if (avail && avail !== 'All') p.set('availability', avail);
  if (fresh && fresh !== 'All') p.set('freshness', fresh);
  if (sort) p.set('sort', sort);
  if (search) p.set('q', search.trim());

  $('bloodStockGrid').innerHTML = `<div class="empty">Scanning blood bank stock telemetry...</div>`;
  try {
    const d = await api('/lifeline/blood-stock?' + p.toString());
    const items = d.results || [];
    $('bloodStockCount').textContent = `${items.length} matching record${items.length===1?'':'s'}`;

    if (!items.length) {
      $('bloodStockGrid').innerHTML = `
        <div class="empty" style="grid-column: 1 / -1">
          <b>No blood stock records match the selected filters.</b><br>
          <span class="muted">Try expanding your location or clearing specific component constraints.</span>
        </div>`;
      return;
    }

    $('bloodStockGrid').innerHTML = items.map(s => {
      let unitColor = 'var(--ink)';
      let unitLabel = 'Reported Units';
      let unitDisplay = `${s.reportedUnits} <span style="font-size:14px; font-weight:normal">units</span>`;

      if (s.isUnknown || s.reportedUnits === null) {
        unitDisplay = `<span style="font-size:16px; color:#6b46c1">Unknown / Unconfirmed</span>`;
        unitLabel = 'Stock Quantity Not Reported';
      } else if (s.isDepleted) {
        unitColor = 'var(--danger)';
        unitDisplay = `<span style="color:var(--danger)">0 Units (Depleted)</span>`;
      } else if (s.isShortage) {
        unitColor = '#b7791f';
        unitDisplay = `<span style="color:#b7791f">${s.reportedUnits} Units (Low Reserve)</span>`;
      }

      return `
        <article class="stock-card">
          <div>
            <div class="stock-head">
              <div class="stock-group">
                <div class="blood-badge">${s.bloodGroup}</div>
                <div>
                  <b style="font-size:15px">${s.component}</b>
                  <div class="muted" style="font-size:12px">${s.category || 'Blood Centre'}</div>
                </div>
              </div>
              <div class="units-display">
                <div class="units-number" style="color:${unitColor}">${unitDisplay}</div>
                <div class="units-label">${unitLabel}</div>
              </div>
            </div>
            <div style="margin: 10px 0;">
              <h4 style="margin:0 0 4px; font-size:15px">${s.facilityName}</h4>
              <div class="muted" style="font-size:12px">${s.city} • ${s.address}</div>
              ${s.pincode ? `<div class="muted" style="font-size:11px">PIN: ${s.pincode}</div>` : ''}
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin: 10px 0; font-size:12px">
              <div>${renderFreshnessBadge(s.freshness, s.verificationStatus)}</div>
              <div class="muted">${formatDate(s.lastUpdatedAt)}</div>
            </div>
            ${s.notes ? `<div style="background:#f9f9f9; padding:8px; border-radius:6px; font-size:11px; color:#555; margin-bottom:10px">📝 ${s.notes}</div>` : ''}
            <div class="muted" style="font-size:11px; margin-bottom:12px">Source: ${s.source || 'Facility Telemetry'}</div>
          </div>
          <div style="display:flex; gap:8px; border-top:1px solid var(--line); padding-top:12px">
            <button class="btn primary" style="flex:1" onclick="openBloodBankDetails('${s.facilityId}')">View Full Stock</button>
            <a class="btn" style="text-decoration:none; display:flex; align-items:center" href="tel:${s.emergencyContact || s.contact}" title="Call Blood Desk">📞</a>
          </div>
        </article>
      `;
    }).join('');
  } catch (e) {
    $('bloodStockGrid').innerHTML = `<div class="empty" style="grid-column: 1 / -1; color:var(--danger)">Error loading blood stock: ${e.message}</div>`;
  }
}

// Tab 2: Blood Bank Finder
function renderBloodBanksTab() {
  const cities = lifelineMeta?.cities || ['Bengaluru', 'Chennai', 'Delhi', 'Mumbai'];

  $('lifelineTabContent').innerHTML = `
    <div class="filter-box">
      <div class="filter-grid">
        <div class="filter-item">
          <label>City / District</label>
          <select id="lbbCity" onchange="fetchBloodBanks()">
            <option value="All">All Cities</option>
            ${cities.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="filter-item">
          <label>Facility Category</label>
          <select id="lbbCat" onchange="fetchBloodBanks()">
            <option value="All">All Categories</option>
            <option value="Hospital-attached">Hospital-attached</option>
            <option value="Charitable / Trust">Charitable / Trust</option>
            <option value="Indian Red Cross Society">Indian Red Cross Society</option>
          </select>
        </div>
        <div class="filter-item">
          <label>Apheresis Facility Available</label>
          <select id="lbbApheresis" onchange="fetchBloodBanks()">
            <option value="All">All</option>
            <option value="true">Apheresis Ready (Platelets/SDP)</option>
          </select>
        </div>
        <div class="filter-item" style="grid-column: span 2">
          <label>Search Facility</label>
          <input id="lbbSearch" placeholder="Search by name, address, or license number..." oninput="debounceFetchBloodBanks()">
        </div>
      </div>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h3 style="margin:0; font-family:Georgia,serif">Accredited Blood Banks & Transfusion Centres</h3>
      <span class="muted" id="bloodBankCount">Loading blood banks...</span>
    </div>
    <div class="grid" id="bloodBankGrid"></div>
  `;

  fetchBloodBanks();
}

let bbSearchTimeout = null;
function debounceFetchBloodBanks() {
  clearTimeout(bbSearchTimeout);
  bbSearchTimeout = setTimeout(fetchBloodBanks, 300);
}

async function fetchBloodBanks() {
  const p = new URLSearchParams();
  const city = $('lbbCity')?.value;
  const cat = $('lbbCat')?.value;
  const apheresis = $('lbbApheresis')?.value;
  const search = $('lbbSearch')?.value;

  if (city && city !== 'All') p.set('city', city);
  if (cat && cat !== 'All') p.set('category', cat);
  if (apheresis === 'true') p.set('apheresis', 'true');
  if (search) p.set('q', search.trim());

  $('bloodBankGrid').innerHTML = `<div class="empty">Scanning blood banks...</div>`;
  try {
    const d = await api('/lifeline/blood-banks?' + p.toString());
    const banks = d.bloodBanks || [];
    $('bloodBankCount').textContent = `${banks.length} accredited blood bank${banks.length===1?'':'s'}`;

    if (!banks.length) {
      $('bloodBankGrid').innerHTML = `<div class="empty" style="grid-column: 1 / -1">No blood banks found matching the criteria.</div>`;
      return;
    }

    $('bloodBankGrid').innerHTML = banks.map(b => `
      <article class="card" style="padding:18px; display:flex; flex-direction:column; justify-content:space-between">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px">
            <span class="tag" style="background:#e8f4f3; color:var(--teal)">${b.category}</span>
            ${renderFreshnessBadge(b.freshness, b.verificationStatus)}
          </div>
          <h3 style="margin:0 0 6px; font-family:Georgia,serif">${b.name}</h3>
          <div class="muted" style="font-size:13px; margin-bottom:10px">${b.city} • ${b.address}</div>
          <div class="summary" style="padding:10px; margin:10px 0; font-size:12px">
            <div class="row"><span>Operating Hours</span><b>${b.operatingHours || '24/7'}</b></div>
            <div class="row"><span>License</span><b>${b.licenseNumber || 'Verified State License'}</b></div>
            <div class="row"><span>Apheresis Unit</span><b>${b.apheresisAvailable ? '✓ Available' : 'Not installed'}</b></div>
            <div class="row"><span>Emergency Contact</span><b>${b.emergencyContact || b.contact}</b></div>
          </div>
        </div>
        <div style="display:flex; gap:8px; border-top:1px solid var(--line); padding-top:12px">
          <button class="btn primary" style="flex:1" onclick="openBloodBankDetails('${b.id}')">View Available Stock</button>
          <a class="btn" style="text-decoration:none" href="tel:${b.emergencyContact || b.contact}" title="Call">📞 Call</a>
        </div>
      </article>
    `).join('');
  } catch (e) {
    $('bloodBankGrid').innerHTML = `<div class="empty" style="grid-column: 1 / -1; color:var(--danger)">Error: ${e.message}</div>`;
  }
}

// Tab 3: Organ Transplant Network
function renderTransplantNetworkTab() {
  const cities = lifelineMeta?.cities || ['Bengaluru', 'Chennai', 'Delhi', 'Mumbai'];
  const services = lifelineMeta?.transplantServices || ['Kidney', 'Liver', 'Heart', 'Lung', 'Pancreas', 'Cornea', 'Bone Marrow / Stem Cell'];

  $('lifelineTabContent').innerHTML = `
    <div class="disclaimer-banner notto">
      <div>🏛️</div>
      <div>
        <b>National Organ & Tissue Transplant Organization (NOTTO) Compliance Notice:</b><br>
        In accordance with the <b>Transplantation of Human Organs and Tissues Act (THOTA)</b>, organ allocation in India is strictly non-commercial and managed solely by authorized government coordination bodies (NOTTO, SOTTO, ROTTO).<br>
        MedStay <b>does not list available organs, donor records, or facilitate organ bookings or matching</b>. This directory lists accredited transplant institutions and authorized coordination desks for official liaison.<br>
        Official Portal: <a href="https://notto.mohfw.gov.in/" target="_blank" style="color:var(--teal); font-weight:700">National Organ and Tissue Transplant Organization (NOTTO) →</a>
      </div>
    </div>
    <div class="filter-box">
      <div class="filter-grid">
        <div class="filter-item">
          <label>City / State</label>
          <select id="ltcCity" onchange="fetchTransplantCentres()">
            <option value="All">All Regions</option>
            ${cities.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="filter-item">
          <label>Transplant Service / Organ</label>
          <select id="ltcService" onchange="fetchTransplantCentres()">
            <option value="All">All Services</option>
            ${services.map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
        <div class="filter-item" style="grid-column: span 2">
          <label>Search Institution or Coordinator</label>
          <input id="ltcSearch" placeholder="Search hospital name, coordinator, or accreditation ID..." oninput="debounceFetchTransplantCentres()">
        </div>
      </div>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h3 style="margin:0; font-family:Georgia,serif">Accredited Transplant Institutions & Coordination Desks</h3>
      <span class="muted" id="transplantCount">Loading institutions...</span>
    </div>
    <div class="grid" id="transplantGrid"></div>
  `;

  fetchTransplantCentres();
}

let tcSearchTimeout = null;
function debounceFetchTransplantCentres() {
  clearTimeout(tcSearchTimeout);
  tcSearchTimeout = setTimeout(fetchTransplantCentres, 300);
}

async function fetchTransplantCentres() {
  const p = new URLSearchParams();
  const city = $('ltcCity')?.value;
  const service = $('ltcService')?.value;
  const search = $('ltcSearch')?.value;

  if (city && city !== 'All') p.set('city', city);
  if (service && service !== 'All') p.set('service', service);
  if (search) p.set('q', search.trim());

  $('transplantGrid').innerHTML = `<div class="empty">Scanning NOTTO registered centres...</div>`;
  try {
    const d = await api('/lifeline/transplant-centres?' + p.toString());
    const centres = d.transplantCentres || [];
    $('transplantCount').textContent = `${centres.length} authorized institution${centres.length===1?'':'s'}`;

    if (!centres.length) {
      $('transplantGrid').innerHTML = `<div class="empty" style="grid-column: 1 / -1">No transplant institutions matched your filters.</div>`;
      return;
    }

    $('transplantGrid').innerHTML = centres.map(tc => `
      <article class="card" style="padding:18px; display:flex; flex-direction:column; justify-content:space-between">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px">
            <span class="tag" style="background:#f3e8fd; color:#6b46c1">${tc.institutionType}</span>
            <span class="badge-status badge-fresh">● ${tc.verificationStatus}</span>
          </div>
          <h3 style="margin:4px 0 6px; font-family:Georgia,serif">${tc.name}</h3>
          <div class="muted" style="font-size:13px">${tc.city} • ${tc.address}</div>
          <div style="margin:12px 0">
            <div style="font-size:12px; font-weight:700; color:var(--muted); margin-bottom:6px">Approved Transplant Services:</div>
            <div class="tags">
              ${(tc.transplantServices || []).map(s => `<span class="tag" style="background:#eaf3f1; color:var(--teal)">✓ ${s}</span>`).join('')}
            </div>
          </div>
          <div class="summary" style="padding:10px; margin:10px 0; font-size:12px">
            <div class="row"><span>Official Coordinator</span><b>${tc.coordinatorName || 'Designated Transplant Officer'}</b></div>
            <div class="row"><span>NOTTO / SOTTO ID</span><b>${tc.registrationId || 'Verified Regional ID'}</b></div>
            <div class="row"><span>Coordination Desk</span><b>${tc.emergencyDesk || tc.contact}</b></div>
            <div class="row"><span>Last Verified</span><span>${formatDate(tc.lastVerifiedAt)}</span></div>
          </div>
        </div>
        <div style="display:flex; gap:8px; border-top:1px solid var(--line); padding-top:12px">
          <a class="btn primary" style="flex:1; text-align:center; text-decoration:none" href="tel:${tc.emergencyDesk || tc.contact}">Contact Coordination Desk</a>
          <a class="btn" style="text-decoration:none" href="${tc.officialWebsite || 'https://notto.mohfw.gov.in/'}" target="_blank" title="Official Web Portal">🔗 Portal</a>
        </div>
      </article>
    `).join('');
  } catch (e) {
    $('transplantGrid').innerHTML = `<div class="empty" style="grid-column: 1 / -1; color:var(--danger)">Error: ${e.message}</div>`;
  }
}

// Tab 4: Stock Management & Audit Trail
async function renderLifelineAuditTab() {
  $('lifelineTabContent').innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px">
      <div>
        <h3 style="margin:0; font-family:Georgia,serif">Stock Telemetry Audit Trail</h3>
        <p class="muted" style="margin:4px 0 0">Verified record of blood stock updates submitted by authorized facility coordinators.</p>
      </div>
      <button class="btn amber" onclick="openStockUpdateModal()">+ Submit New Stock Update</button>
    </div>
    <div class="table-container">
      <div id="auditLogContent" style="padding:12px">Loading audit trail...</div>
    </div>
  `;

  try {
    const d = await api('/lifeline/audit');
    const logs = d.audit || [];
    if (!logs.length) {
      $('auditLogContent').innerHTML = `<div class="empty">No recent stock changes recorded in this session.</div>`;
      return;
    }

    $('auditLogContent').innerHTML = logs.map(a => `
      <div class="audit-entry">
        <div>
          <div style="font-weight:700">${a.facilityName}</div>
          <div class="muted" style="font-size:12px">${a.bloodGroup} ${a.component} • Reason: ${a.reason || 'Inventory verification'}</div>
        </div>
        <div style="text-align:right">
          <div><span style="color:#888; text-decoration:line-through">${a.oldValue !== null ? a.oldValue + ' units' : 'unrecorded'}</span> → <b style="color:var(--teal)">${a.newValue} units</b></div>
          <div class="muted" style="font-size:11px">${formatDate(a.timestamp)} • by ${a.actorName}</div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    $('auditLogContent').innerHTML = `<div class="empty" style="color:var(--danger)">Error loading audit log: ${e.message}</div>`;
  }
}

// Blood Bank Facility Details Modal
async function openBloodBankDetails(facilityId) {
  openModal(`<div class="empty">Loading facility inventory...</div>`);
  try {
    const d = await api('/lifeline/blood-banks/' + facilityId);
    const f = d.facility;
    const stocks = d.stock || [];

    openModal(`
      <button class="close" onclick="closeModal()">×</button>
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px">
        <div>
          <h2>${f.name}</h2>
          <div class="muted">${f.city} • ${f.address}</div>
        </div>
        ${renderFreshnessBadge(f.freshness, f.verificationStatus)}
      </div>

      <div class="summary" style="margin:14px 0">
        <div class="formgrid">
          <div class="row"><span>Facility Type</span><b>${f.category}</b></div>
          <div class="row"><span>Operating Hours</span><b>${f.operatingHours || '24/7'}</b></div>
          <div class="row"><span>License</span><b>${f.licenseNumber || 'State Blood License'}</b></div>
          <div class="row"><span>Apheresis Unit</span><b>${f.apheresisAvailable ? '✓ Operational' : 'Not installed'}</b></div>
          <div class="row"><span>Contact Desk</span><b>${f.contact}</b></div>
          <div class="row"><span>Emergency 24/7 Hotline</span><b>${f.emergencyContact || f.contact}</b></div>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin:16px 0 10px">
        <h3 style="margin:0; font-family:Georgia,serif">Component Stock Inventory</h3>
        <button class="btn amber" onclick="openStockUpdateModal('${f.id}')">+ Update Stock</button>
      </div>

      <div class="table-container">
        <table class="radar-table">
          <thead>
            <tr>
              <th>Blood Group</th>
              <th>Component</th>
              <th>Reported Units</th>
              <th>Status</th>
              <th>Last Updated</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            ${stocks.length ? stocks.map(s => `
              <tr>
                <td><b>${s.bloodGroup}</b></td>
                <td>${s.component}</td>
                <td>
                  ${s.reportedUnits === null ? '<span style="color:#6b46c1">Unknown</span>' : 
                    s.reportedUnits === 0 ? '<b style="color:var(--danger)">0 (Depleted)</b>' : 
                    s.isShortage ? `<b style="color:#b7791f">${s.reportedUnits} units</b>` : 
                    `<b>${s.reportedUnits} units</b>`}
                </td>
                <td>${renderFreshnessBadge(s.freshness, s.verificationStatus)}</td>
                <td class="muted">${formatDate(s.lastUpdatedAt)}</td>
                <td class="muted" style="font-size:11px">${s.source}</td>
              </tr>
            `).join('') : `<tr><td colspan="6" style="text-align:center; padding:20px" class="muted">No component stock reports on file for this facility.</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="disclaimer-banner" style="margin-top:16px">
        <div>ℹ️</div>
        <div>
          <b>Clinical Release Disclaimer:</b> Blood inventory quantities are voluntary telemetry figures.
          Compatibility cross-matching, Transfusion Transmitted Infection (TTI) screening, and blood bag issuance require mandatory clinician requisition.
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px">
        <button class="btn" onclick="closeModal()">Close</button>
        <a class="btn primary" href="tel:${f.emergencyContact || f.contact}" style="text-decoration:none">Call Blood Centre</a>
      </div>
    `);
  } catch (e) {
    openModal(`<button class="close" onclick="closeModal()">×</button><div class="empty" style="color:var(--danger)">${e.message}</div>`);
  }
}

// Authorized Stock Update Modal
function openStockUpdateModal(preselectedFacilityId = null) {
  const banks = lifelineMeta?.bloodBanks || [
    { id: 'bb-1', name: 'Greenview Transfusion Medicine & Blood Centre (Bengaluru)' },
    { id: 'bb-2', name: 'Lakeside Rotary Blood Centre (Bengaluru)' },
    { id: 'bb-4', name: "St. Anne's Care Blood & Component Bank (Mumbai)" },
    { id: 'bb-6', name: 'Lions Metropolitan Blood Centre (Mumbai)' },
    { id: 'bb-7', name: 'Sunrise Regional Transfusion Centre (Delhi)' },
    { id: 'bb-10', name: 'Harborview Pediatric Blood Centre (Chennai)' },
    { id: 'bb-12', name: 'Jeevan Blood Bank & Transfusion Centre (Chennai)' }
  ];

  const groups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const components = [
    'Packed Red Blood Cells (PRBC)',
    'Platelets',
    'Fresh Frozen Plasma (FFP)',
    'Whole Blood',
    'Cryoprecipitate'
  ];

  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <h2>Authorized Stock Update</h2>
    <p class="muted">Demo workflow: Authorized blood bank coordinators update reported units with full audit logging.</p>
    
    <div class="field">
      <label>Participating Blood Bank Facility *</label>
      <select id="modalFacilityId">
        ${banks.map(b => `<option value="${b.id}" ${b.id===preselectedFacilityId?'selected':''}>${b.name}</option>`).join('')}
      </select>
    </div>

    <div class="formgrid">
      <div class="field">
        <label>Blood Group *</label>
        <select id="modalBloodGroup">
          ${groups.map(g => `<option value="${g}">${g}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Blood Component *</label>
        <select id="modalComponent">
          ${components.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="formgrid">
      <div class="field">
        <label>Reported Units Available *</label>
        <input id="modalUnits" type="number" min="0" placeholder="e.g. 12" value="8">
      </div>
      <div class="field">
        <label>Audit Reason *</label>
        <input id="modalReason" placeholder="e.g. Physical inventory count / donation drive" value="Daily physical cold-chain verification">
      </div>
    </div>

    <div class="field">
      <label>Operational Note (Optional)</label>
      <input id="modalNotes" placeholder="e.g. Single-donor apheresis ready; refrigerated at 4°C">
    </div>

    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="submitStockUpdate()">Submit Verified Update</button>
    </div>
  `);
}

async function submitStockUpdate() {
  const facilityId = $('modalFacilityId')?.value;
  const bloodGroup = $('modalBloodGroup')?.value;
  const component = $('modalComponent')?.value;
  const units = $('modalUnits')?.value;
  const reason = $('modalReason')?.value;
  const notes = $('modalNotes')?.value;

  if (!facilityId || !bloodGroup || !component || units === '') {
    toast('Please fill all required stock fields');
    return;
  }

  try {
    const res = await api('/lifeline/blood-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        facilityId,
        bloodGroup,
        component,
        reportedUnits: Number(units),
        reason,
        notes
      })
    });

    closeModal();
    toast(`Stock updated successfully (Audit: ${res.audit?.id || 'Recorded'})`);

    if (currentView === 'lifeline') {
      if (currentLifelineTab === 'blood-stock') fetchBloodStock();
      else if (currentLifelineTab === 'audit-log') renderLifelineAuditTab();
    } else if (currentView === 'radar') {
      showRadar(currentRadarRegion);
    }
  } catch (e) {
    toast('Error updating stock: ' + e.message);
  }
}

// ========================================================
// CRITICAL RESOURCE RADAR MODULE
// ========================================================

async function showRadar(region = 'All') {
  currentView = 'radar';
  currentRadarRegion = region;
  $('homeView').style.display = 'none';
  $('hospitalHero').style.display = 'none';
  $('dashboardView').classList.remove('show');
  $('lifelineView').classList.remove('show');
  if ($('JanvaniView')) $('JanvaniView').classList.remove('show');
  $('radarView').classList.add('show');
  renderNav();

  $('radarView').innerHTML = `
    <div class="view-header">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
        <div>
          <h2>Critical Resource Radar</h2>
          <p>Regional resource-monitoring and shortage-awareness dashboard for authorized coordinators.</p>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn primary" onclick="showRadar('${currentRadarRegion}')">🔄 Refresh Telemetry</button>
          <button class="btn amber" onclick="openThresholdModal()">⚙️ Alert Thresholds</button>
        </div>
      </div>
      <div class="disclaimer-banner">
        <div>🛡️</div>
        <div>
          <b>Authorized Coordinator Advisory:</b> Critical Resource Radar combines facility-reported telemetry to identify regional shortages and facilitate mutual aid liaison.<br>
          <b>Do not independently make automated clinical transfers.</b> Cross-resource recommendations are decision-support prompts requiring human telephone verification before any patient or resource movement.
        </div>
      </div>
    </div>

    <!-- Region selector & status toolbar -->
    <div class="radar-toolbar">
      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap">
        <label style="font-weight:700; color:var(--muted); font-size:13px">Selected Region:</label>
        <select id="radarRegionSelect" onchange="switchRadarRegion(this.value)" style="width:auto; font-weight:700">
          <option value="All" ${currentRadarRegion==='All'?'selected':''}>All Regions (National View)</option>
          <option value="Bengaluru" ${currentRadarRegion==='Bengaluru'?'selected':''}>Bengaluru</option>
          <option value="Mumbai" ${currentRadarRegion==='Mumbai'?'selected':''}>Mumbai</option>
          <option value="Delhi" ${currentRadarRegion==='Delhi'?'selected':''}>Delhi</option>
          <option value="Chennai" ${currentRadarRegion==='Chennai'?'selected':''}>Chennai</option>
        </select>
        <span class="muted" style="font-size:12px" id="radarLastRefreshed">Updating live...</span>
      </div>
      <div style="display:flex; gap:8px; align-items:center">
        <span class="badge-status badge-fresh">● Live Feed Active</span>
        <button class="btn" style="padding:5px 10px; font-size:12px" onclick="showLifeline()">Go to Lifeline →</button>
      </div>
    </div>

    <!-- Top 5 Summary Cards -->
    <div id="radarSummaryCards" class="radar-stats">Loading regional summaries...</div>

    <!-- Section 2: Regional Shortage Alerts -->
    <div style="margin: 28px 0;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px">
        <div>
          <h3 style="margin:0; font-family:Georgia,serif; font-size:22px">Regional Shortage Alerts & Coordination</h3>
          <span class="muted" style="font-size:13px">Rules-based triggers with cross-resource mutual aid recommendations</span>
        </div>
        <div style="display:flex; gap:6px">
          <button class="btn ${radarAlertFilter==='all'?'primary':''}" style="padding:6px 12px; font-size:12px" onclick="filterRadarAlerts('all')">All</button>
          <button class="btn ${radarAlertFilter==='Active'?'primary':''}" style="padding:6px 12px; font-size:12px" onclick="filterRadarAlerts('Active')">Active</button>
          <button class="btn ${radarAlertFilter==='Acknowledged'?'primary':''}" style="padding:6px 12px; font-size:12px" onclick="filterRadarAlerts('Acknowledged')">Acknowledged</button>
          <button class="btn ${radarAlertFilter==='Resolved'?'primary':''}" style="padding:6px 12px; font-size:12px" onclick="filterRadarAlerts('Resolved')">Resolved</button>
        </div>
      </div>
      <div id="radarAlertsContainer">Loading active alerts...</div>
    </div>

    <!-- Section 3: Detailed Resource Inventory -->
    <div style="margin: 32px 0;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px">
        <div>
          <h3 style="margin:0; font-family:Georgia,serif; font-size:22px">Detailed Resource Telemetry Table</h3>
          <span class="muted" style="font-size:13px">Live tracking across hospital beds, blood reserves, oxygen, and critical equipment</span>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
          <label class="check" style="margin:0; font-size:13px">
            <input type="checkbox" id="radarNeedsConfirm" onchange="fetchRadarResources()"> Show only unverified / stale records
          </label>
          <input id="radarTableSearch" placeholder="Filter resources..." style="max-width:220px; padding:6px 10px" oninput="debounceFetchRadarResources()">
        </div>
      </div>

      <div class="tabs" style="margin:0 0 16px">
        <button class="tab-btn ${currentRadarCategory==='All'?'active':''}" onclick="switchRadarCategory('All')">All Categories</button>
        <button class="tab-btn ${currentRadarCategory==='Hospital Beds'?'active':''}" onclick="switchRadarCategory('Hospital Beds')">Hospital Beds</button>
        <button class="tab-btn ${currentRadarCategory==='Oxygen Supply'?'active':''}" onclick="switchRadarCategory('Oxygen Supply')">Oxygen Supply</button>
        <button class="tab-btn ${currentRadarCategory==='Critical Medical Equipment'?'active':''}" onclick="switchRadarCategory('Critical Medical Equipment')">Critical Equipment</button>
      </div>

      <div class="table-container">
        <table class="radar-table" id="radarResourceTable">
          <thead>
            <tr>
              <th>Category</th>
              <th>Resource Type</th>
              <th>Facility Name</th>
              <th>Region</th>
              <th>Reported Available / Total</th>
              <th>Status</th>
              <th>Freshness</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="radarResourceTableBody">
            <tr><td colspan="8" style="text-align:center; padding:20px" class="muted">Loading telemetry...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  await Promise.all([
    fetchRadarSummary(),
    fetchRadarAlerts(),
    fetchRadarResources()
  ]);
}

function switchRadarRegion(region) {
  currentRadarRegion = region;
  showRadar(region);
}

function switchRadarCategory(cat) {
  currentRadarCategory = cat;
  fetchRadarResources();
}

let radarAlertFilter = 'all';
function filterRadarAlerts(status) {
  radarAlertFilter = status;
  fetchRadarAlerts();
}

// Fetch Radar Summary Cards
async function fetchRadarSummary() {
  try {
    const d = await api('/resource-radar/summary?region=' + currentRadarRegion);
    $('radarLastRefreshed').textContent = `Refreshed ${formatDate(d.lastRefreshedAt)}`;

    const beds = d.beds;
    const blood = d.blood;
    const oxy = d.oxygen;
    const equip = d.equipment;
    const fresh = d.freshness;

    // Freshness percentage
    const totalFreshRecords = Math.max(1, fresh.totalRecords);
    const freshPct = Math.round((fresh.freshCount / totalFreshRecords) * 100);
    const agingPct = Math.round((fresh.agingCount / totalFreshRecords) * 100);
    const stalePct = Math.round((fresh.staleCount / totalFreshRecords) * 100);
    const unkPct = Math.max(0, 100 - freshPct - agingPct - stalePct);

    $('radarSummaryCards').innerHTML = `
      <!-- Card A: Hospital Beds -->
      <div class="radar-card">
        <div>
          <div class="radar-card-title">
            <span>Hospital Beds</span>
            <span>🏥 ${beds.facilitiesReporting} facilities</span>
          </div>
          <div class="radar-card-value">${beds.totalAvailable} <span style="font-size:14px; font-weight:normal; color:var(--muted)">/ ${beds.totalCapacity} total</span></div>
          <div class="muted" style="font-size:12px">Available beds in region (${beds.occupancyRate}% occupancy)</div>
        </div>
        <div class="radar-breakdown">
          <div class="row"><span>General Ward</span><b>${beds.generalWard} beds</b></div>
          <div class="row"><span>Private Room</span><b>${beds.privateRoom} rooms</b></div>
          <div class="row"><span style="color:${beds.icu<=2?'var(--danger)':'inherit'}">ICU Beds</span><b style="color:${beds.icu<=2?'var(--danger)':'inherit'}">${beds.icu} beds</b></div>
          <div class="muted" style="font-size:10px; margin-top:2px">● Synchronized live with MedStay inventory</div>
        </div>
      </div>

      <!-- Card B: Blood Availability -->
      <div class="radar-card">
        <div>
          <div class="radar-card-title">
            <span>Blood Availability</span>
            <span>🩸 ${blood.facilitiesReporting} blood banks</span>
          </div>
          <div class="radar-card-value">${blood.components.find(c=>c.component.includes('PRBC'))?.units || 0} <span style="font-size:14px; font-weight:normal; color:var(--muted)">PRBC units</span></div>
          <div class="muted" style="font-size:12px">${blood.activeShortages > 0 ? `<b style="color:var(--danger)">⚠️ ${blood.activeShortages} active shortage alerts</b>` : 'Normal reserve across blood types'}</div>
        </div>
        <div class="radar-breakdown">
          ${blood.components.map(c => `
            <div class="row"><span>${c.component.split(' ')[0]}</span><b>${c.units} units</b></div>
          `).join('')}
          <div class="row" style="color:#b06000; font-size:11px"><span>Needing confirmation</span><b>${blood.recordsNeedingUpdate} records</b></div>
        </div>
      </div>

      <!-- Card C: Oxygen Status -->
      <div class="radar-card">
        <div>
          <div class="radar-card-title">
            <span>Oxygen Status</span>
            <span>💨 ${oxy.facilitiesReporting} plants</span>
          </div>
          <div class="radar-card-value">${oxy.liquidOxygenAvailableKl} <span style="font-size:14px; font-weight:normal; color:var(--muted)">kL LMO</span></div>
          <div class="muted" style="font-size:12px">${oxy.statusDistribution.Critical > 0 || oxy.statusDistribution.Low > 0 ? `<b style="color:var(--danger)">⚠️ Low oxygen reported</b>` : 'Liquid manifolds stable'}</div>
        </div>
        <div class="radar-breakdown">
          <div class="row"><span>Normal Manifolds</span><b>${oxy.statusDistribution.Normal || 0}</b></div>
          <div class="row"><span style="color:${oxy.statusDistribution.Low>0?'var(--amber)':'inherit'}">Low Status</span><b>${oxy.statusDistribution.Low || 0}</b></div>
          <div class="row"><span style="color:${oxy.statusDistribution.Critical>0?'var(--danger)':'inherit'}">Critical Shortage</span><b>${oxy.statusDistribution.Critical || 0}</b></div>
          <div class="row"><span>Bulk D-Cylinders</span><b>${oxy.bulkCylindersAvailable} available</b></div>
        </div>
      </div>

      <!-- Card D: Critical Equipment -->
      <div class="radar-card">
        <div>
          <div class="radar-card-title">
            <span>Critical Equipment</span>
            <span>⚡ ${equip.facilitiesReporting} units</span>
          </div>
          <div class="radar-card-value">${equip.categories.find(c=>c.type.includes('Ventilator'))?.available || 0} <span style="font-size:14px; font-weight:normal; color:var(--muted)">ventilators free</span></div>
          <div class="muted" style="font-size:12px">Total ${equip.categories.find(c=>c.type.includes('Ventilator'))?.total || 0} ventilators installed</div>
        </div>
        <div class="radar-breakdown">
          ${equip.categories.map(c => `
            <div class="row"><span>${c.type.split(' ')[0]}</span><b>${c.available} / ${c.total} free</b></div>
          `).join('')}
        </div>
      </div>

      <!-- Card E: Regional Data Freshness -->
      <div class="radar-card">
        <div>
          <div class="radar-card-title">
            <span>Data Freshness</span>
            <span>⏱️ ${fresh.totalRecords} telemetry points</span>
          </div>
          <div class="radar-card-value">${freshPct}% <span style="font-size:14px; font-weight:normal; color:#137333">recently confirmed</span></div>
          <div class="muted" style="font-size:12px">Uncertainty visibility across records</div>
        </div>
        <div class="freshness-bar-container">
          <div class="freshness-bar">
            <div class="freshness-segment" style="width:${freshPct}%; background:#137333" title="Fresh: ${fresh.freshCount}"></div>
            <div class="freshness-segment" style="width:${agingPct}%; background:#f2994a" title="Aging: ${fresh.agingCount}"></div>
            <div class="freshness-segment" style="width:${stalePct}%; background:#828282" title="Stale: ${fresh.staleCount}"></div>
            <div class="freshness-segment" style="width:${unkPct}%; background:#9b51e0" title="Unknown: ${fresh.unknownCount}"></div>
          </div>
          <div class="radar-breakdown" style="border:none; padding:0">
            <div class="row"><span style="color:#137333">● Fresh (&lt;2h)</span><b>${fresh.freshCount}</b></div>
            <div class="row"><span style="color:#b06000">● Aging (2-24h)</span><b>${fresh.agingCount}</b></div>
            <div class="row"><span style="color:#5f6368">● Data Stale (&gt;24h)</span><b>${fresh.staleCount}</b></div>
            <div class="row"><span style="color:#7627bb">● Unknown</span><b>${fresh.unknownCount}</b></div>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    $('radarSummaryCards').innerHTML = `<div class="empty" style="color:var(--danger)">Error loading summary: ${e.message}</div>`;
  }
}

// Fetch Radar Alerts
async function fetchRadarAlerts() {
  try {
    const p = new URLSearchParams();
    if (currentRadarRegion !== 'All') p.set('region', currentRadarRegion);
    if (radarAlertFilter !== 'all') p.set('status', radarAlertFilter);

    const d = await api('/resource-radar/alerts?' + p.toString());
    const alerts = d.alerts || [];

    if (!alerts.length) {
      $('radarAlertsContainer').innerHTML = `
        <div class="empty">
          <b>No shortage alerts currently match your filter for ${currentRadarRegion==='All'?'any region':currentRadarRegion}.</b><br>
          <span class="muted">All participating resources are reporting above configured minimum thresholds.</span>
        </div>`;
      return;
    }

    $('radarAlertsContainer').innerHTML = alerts.map(a => {
      let severityClass = 'attention';
      let sevBadgeClass = 'badge-attention';
      if (a.severity.includes('Critical')) {
        severityClass = 'critical';
        sevBadgeClass = 'badge-critical';
      } else if (a.severity.includes('Info')) {
        severityClass = 'info';
        sevBadgeClass = 'badge-fresh';
      }

      return `
        <article class="alert-card ${severityClass}">
          <div class="alert-header">
            <div>
              <span class="badge-status ${sevBadgeClass}">● ${a.severity}</span>
              <span class="tag" style="margin-left:6px">${a.category}</span>
              <span class="muted" style="font-size:12px; margin-left:8px">${a.region}</span>
            </div>
            <div>
              <span class="badge-status ${a.status==='Resolved'?'badge-fresh':a.status==='Acknowledged'?'badge-aging':'badge-critical'}">${a.status}</span>
            </div>
          </div>
          <div class="alert-title">${a.resourceType} — ${a.facilityName}</div>
          <div class="alert-meta">
            Triggering Rule: <b>${a.rule}</b> • Reported Value: <b>${a.reportedValue}</b> • Source: <i>${a.source}</i>
          </div>

          <!-- Cross-Resource Coordination Alternative Box (Key Differentiator!) -->
          ${a.suggestedAlternatives && a.suggestedAlternatives.length ? `
            <div class="coordination-box">
              <div class="coordination-header">
                <span>🔄</span>
                <span>Cross-Resource Mutual Aid Suggestion (Human Verification Required)</span>
              </div>
              <div class="muted" style="font-size:11px; margin-bottom:6px">
                The engine detected nearby facilities in ${a.region} reporting available surplus of this resource:
              </div>
              ${a.suggestedAlternatives.map(alt => `
                <div class="alternative-item">
                  <div class="alt-text">
                    <b>${alt.facilityName}</b> reported <b>${alt.reportedSurplus}</b> (${alt.freshness})<br>
                    <span>${alt.suggestion}</span>
                  </div>
                  <div>
                    <a class="btn amber" style="white-space:nowrap; text-decoration:none; font-size:12px" href="tel:${alt.contactPhone}">📞 Contact Liaison</a>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <!-- Coordination Notes -->
          ${a.coordinationNotes && a.coordinationNotes.length ? `
            <div style="background:#fff; border:1px solid var(--line); border-radius:8px; padding:10px; margin:10px 0; font-size:12px">
              <b>Coordinator Event Log:</b>
              ${a.coordinationNotes.map(n => `
                <div style="margin-top:4px; padding-top:4px; border-top:1px dashed #eee">
                  <span class="muted">[${formatDate(n.timestamp)}]</span> <b>${n.author}:</b> ${n.note}
                </div>
              `).join('')}
            </div>
          ` : ''}

          <!-- Action buttons -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; flex-wrap:wrap; gap:8px">
            <div class="muted" style="font-size:11px">
              Alert Created: ${formatDate(a.createdAt)} ${a.acknowledgedAt ? `• Acknowledged by ${a.acknowledgedBy} at ${formatDate(a.acknowledgedAt)}` : ''} ${a.resolvedAt ? `• Resolved at ${formatDate(a.resolvedAt)}` : ''}
            </div>
            <div style="display:flex; gap:6px">
              ${a.status !== 'Resolved' ? `
                ${a.status !== 'Acknowledged' ? `<button class="btn" onclick="openAcknowledgeModal('${a.id}')">✓ Acknowledge</button>` : ''}
                <button class="btn" onclick="openAddNoteModal('${a.id}')">📝 Add Coordination Note</button>
                <button class="btn primary" onclick="openResolveModal('${a.id}')">Resolve Shortage</button>
              ` : `
                <span class="muted" style="font-size:12px">Issue closed and resolved.</span>
              `}
            </div>
          </div>
        </article>
      `;
    }).join('');
  } catch (e) {
    $('radarAlertsContainer').innerHTML = `<div class="empty" style="color:var(--danger)">Error: ${e.message}</div>`;
  }
}

// Fetch Detailed Resource Table
let radarResourceSearchTimeout = null;
function debounceFetchRadarResources() {
  clearTimeout(radarResourceSearchTimeout);
  radarResourceSearchTimeout = setTimeout(fetchRadarResources, 300);
}

async function fetchRadarResources() {
  const p = new URLSearchParams();
  if (currentRadarRegion !== 'All') p.set('region', currentRadarRegion);
  if (currentRadarCategory !== 'All') p.set('category', currentRadarCategory);
  if ($('radarNeedsConfirm')?.checked) p.set('needConfirmation', 'true');
  const search = $('radarTableSearch')?.value;
  if (search) p.set('q', search.trim());

  $('radarResourceTableBody').innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px" class="muted">Scanning regional telemetry points...</td></tr>`;
  try {
    const d = await api('/resource-radar/resources?' + p.toString());
    const resources = d.resources || [];

    if (!resources.length) {
      $('radarResourceTableBody').innerHTML = `<tr><td colspan="8" style="text-align:center; padding:25px" class="muted">No resource records found for this combination of filters.</td></tr>`;
      return;
    }

    $('radarResourceTableBody').innerHTML = resources.map(r => `
      <tr>
        <td><span class="tag">${r.resourceCategory}</span></td>
        <td><b>${r.resourceType}</b></td>
        <td>
          <div><b>${r.facilityName}</b></div>
          <div class="muted" style="font-size:11px">${r.source}</div>
        </td>
        <td>${r.region}</td>
        <td>
          <b>${r.reportedQuantity}</b>
          ${r.totalReported ? `<span class="muted"> / ${r.totalReported}</span>` : ''}
          <span class="muted">${r.unit || ''}</span>
        </td>
        <td>
          <span class="badge-status ${r.reportedStatus==='Low'||r.reportedStatus==='Critical'?'badge-critical':'badge-fresh'}">
            ${r.reportedStatus || 'Available'}
          </span>
        </td>
        <td>
          ${renderFreshnessBadge(r.freshness, r.verificationStatus)}
          <div class="muted" style="font-size:10px">${formatDate(r.lastUpdatedAt)}</div>
        </td>
        <td>
          <button class="btn" style="padding:4px 8px; font-size:11px" onclick="openResourceQuickAction('${r.facilityName}', '${r.resourceType}', '${r.region}')">Quick Liaison</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    $('radarResourceTableBody').innerHTML = `<tr><td colspan="8" style="color:var(--danger); padding:20px">Error: ${e.message}</td></tr>`;
  }
}

// Quick Liaison Action Dialog
function openResourceQuickAction(facilityName, resourceType, region) {
  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <h2>Regional Resource Liaison</h2>
    <div class="muted">${resourceType} at ${facilityName} (${region})</div>
    <div class="summary" style="margin:14px 0">
      <p>Initiating coordination communication for <b>${facilityName}</b>.</p>
      <div class="row"><span>Facility Desk</span><b>Central Admitting / Biomedical Ops</b></div>
      <div class="row"><span>Coordination Hotline</span><b>+91-80-2559-1122</b></div>
      <div class="row"><span>Protocol</span><b>Inter-facility Mutual Aid Agreement</b></div>
    </div>
    <div class="field">
      <label>Record Liaison Note</label>
      <textarea id="liaisonNote" placeholder="Enter details of conversation with facility supervisor..."></textarea>
    </div>
    <div style="display:flex; justify-content:flex-end; gap:8px">
      <button class="btn" onclick="closeModal()">Close</button>
      <button class="btn primary" onclick="toast('Liaison contact recorded in coordinator log'); closeModal()">Save Liaison Note</button>
    </div>
  `);
}

// Coordinator Alert Action Modals
function openAcknowledgeModal(alertId) {
  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <h2>Acknowledge Regional Shortage Alert</h2>
    <p class="muted">Acknowledging signifies that a coordinator has reviewed the alert. <b>It does NOT resolve the shortage.</b></p>
    <div class="field">
      <label>Operational Note / Immediate Action Taken</label>
      <textarea id="ackNote" placeholder="e.g. Contacted facility supervisor; supplier refill tanker dispatched; mutual aid requested from Lakeside"></textarea>
    </div>
    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="submitAcknowledge('${alertId}')">Confirm Acknowledgement</button>
    </div>
  `);
}

async function submitAcknowledge(alertId) {
  const note = $('ackNote')?.value.trim();
  try {
    await api(`/resource-radar/alerts/${alertId}/acknowledge`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    closeModal();
    toast('Alert acknowledged by coordinator');
    fetchRadarAlerts();
  } catch (e) {
    toast('Error: ' + e.message);
  }
}

function openAddNoteModal(alertId) {
  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <h2>Add Coordination Note</h2>
    <p class="muted">Record liaison actions, facility calls, or replenishment ETA.</p>
    <div class="field">
      <label>Coordination Note *</label>
      <textarea id="coordNote" placeholder="e.g. Spoke with Dr. Rao. Confirmed receipt of 4 units PRBC from partner blood bank."></textarea>
    </div>
    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="submitCoordNote('${alertId}')">Append Note to Event Log</button>
    </div>
  `);
}

async function submitCoordNote(alertId) {
  const note = $('coordNote')?.value.trim();
  if (!note) {
    toast('Note cannot be empty');
    return;
  }
  try {
    await api(`/resource-radar/alerts/${alertId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    closeModal();
    toast('Coordination note recorded');
    fetchRadarAlerts();
  } catch (e) {
    toast('Error: ' + e.message);
  }
}

function openResolveModal(alertId) {
  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <h2>Resolve Shortage Alert</h2>
    <p class="muted">Mark this shortage resolved after updated inventory confirms safe operating levels.</p>
    <div class="field">
      <label>Resolution Summary *</label>
      <textarea id="resNote" placeholder="e.g. Inox Air Products completed 4 kL oxygen tanker delivery. Manifold pressure returned to normal."></textarea>
    </div>
    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="submitResolve('${alertId}')">Confirm Resolution</button>
    </div>
  `);
}

async function submitResolve(alertId) {
  const resolutionNote = $('resNote')?.value.trim();
  if (!resolutionNote) {
    toast('Resolution summary is required');
    return;
  }
  try {
    await api(`/resource-radar/alerts/${alertId}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutionNote })
    });
    closeModal();
    toast('Shortage alert marked resolved');
    fetchRadarAlerts();
    fetchRadarSummary();
  } catch (e) {
    toast('Error: ' + e.message);
  }
}

// Configurable Alert Thresholds Modal
async function openThresholdModal() {
  try {
    const d = await api('/resource-radar/config');
    const t = d.thresholds || {};

    openModal(`
      <button class="close" onclick="closeModal()">×</button>
      <h2>Alert Engine Configuration</h2>
      <p class="muted">Configurable demo rules: Adjust parameters that trigger regional shortage warnings.</p>
      <div class="formgrid">
        <div class="field">
          <label>Blood Stock Minimum Alert Threshold (Units)</label>
          <input id="cfgBloodMin" type="number" min="1" value="${t.bloodUnitsMin || 4}">
        </div>
        <div class="field">
          <label>ICU Beds Minimum Alert Threshold (Beds)</label>
          <input id="cfgIcuMin" type="number" min="0" value="${t.icuBedsMin || 1}">
        </div>
      </div>
      <div class="formgrid">
        <div class="field">
          <label>ICU Ventilators Minimum Alert Threshold (Units)</label>
          <input id="cfgVentMin" type="number" min="1" value="${t.ventilatorsMin || 2}">
        </div>
        <div class="field">
          <label>Freshness Limit for "Recently Confirmed" (Hours)</label>
          <input id="cfgFreshHours" type="number" min="1" value="${t.freshThresholdHours || 2}">
        </div>
      </div>
      <div class="field">
        <label>Aging Limit before "Data Stale" (Hours)</label>
        <input id="cfgAgingHours" type="number" min="2" value="${t.agingThresholdHours || 24}">
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px">
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn primary" onclick="submitThresholds()">Save Configuration</button>
      </div>
    `);
  } catch (e) {
    toast('Error: ' + e.message);
  }
}

async function submitThresholds() {
  try {
    await api('/resource-radar/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bloodUnitsMin: Number($('cfgBloodMin').value),
        icuBedsMin: Number($('cfgIcuMin').value),
        ventilatorsMin: Number($('cfgVentMin').value),
        freshThresholdHours: Number($('cfgFreshHours').value),
        agingThresholdHours: Number($('cfgAgingHours').value)
      })
    });
    closeModal();
    toast('Alert thresholds updated');
    showRadar(currentRadarRegion);
  } catch (e) {
    toast('Error: ' + e.message);
  }
}

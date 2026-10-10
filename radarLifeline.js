// MedStay Lifeline + Critical Resource Radar Backend Module
// Extends MedStay with blood bank discovery, organ transplant network, regional resource monitoring, and shortage radar.

const crypto = require('crypto');

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
}

function getFreshness(lastUpdatedAt, thresholds) {
  if (!lastUpdatedAt) {
    return { label: 'Availability Unknown', state: 'unknown', text: 'Missing or unverified timestamp' };
  }
  const d = new Date(lastUpdatedAt);
  if (isNaN(d.getTime())) {
    return { label: 'Availability Unknown', state: 'unknown', text: 'Invalid timestamp format' };
  }
  const diffHours = (Date.now() - d.getTime()) / (1000 * 60 * 60);
  const freshLimit = thresholds?.freshThresholdHours || 2;
  const agingLimit = thresholds?.agingThresholdHours || 24;

  if (diffHours < 0) {
    return { label: 'Recently Confirmed', state: 'fresh', text: 'Updated just now' };
  }
  if (diffHours <= freshLimit) {
    const mins = Math.max(1, Math.round(diffHours * 60));
    return { label: 'Recently Confirmed', state: 'fresh', text: `Updated ${mins}m ago` };
  }
  if (diffHours <= agingLimit) {
    const hrs = Math.round(diffHours);
    return { label: 'Reported Availability', state: 'aging', text: `Updated ${hrs}h ago (Aging)` };
  }
  const days = Math.round(diffHours / 24);
  return { label: 'Data Stale', state: 'stale', text: `Updated ${days}d ago (Stale data)` };
}

// Compute dynamic bed metrics from db.hospitals
function computeBedSummary(hospitals, regionFilter) {
  let list = hospitals.filter(h => h.verificationStatus === 'Verified' && h.listedForPatients !== false);
  if (regionFilter && regionFilter !== 'All') {
    list = list.filter(h => h.city === regionFilter);
  }

  let totalAvailable = 0;
  let totalCapacity = 0;
  let generalWard = 0;
  let privateRoom = 0;
  let icu = 0;

  list.forEach(h => {
    (h.rooms || []).forEach(r => {
      const beds = Math.max(0, Number(r.beds) || 0);
      const cap = Math.max(beds, Number(r.totalBeds || r.beds) || 0);
      totalAvailable += beds;
      totalCapacity += cap;
      if (r.type === 'General Ward') generalWard += beds;
      else if (r.type === 'Private Room') privateRoom += beds;
      else if (r.type === 'ICU') icu += beds;
    });
  });

  return {
    facilitiesReporting: list.length,
    totalAvailable,
    totalCapacity,
    generalWard,
    privateRoom,
    icu,
    occupancyRate: totalCapacity > 0 ? Math.round(((totalCapacity - totalAvailable) / totalCapacity) * 100) : 0,
    freshness: 'Synchronized live with MedStay bed inventory'
  };
}

// Build Cross-Resource Alternative Suggestions for a shortage
function findCoordinationAlternatives(db, category, resourceType, facilityId, region) {
  const alternatives = [];

  if (category === 'Blood & Components' || category === 'Blood') {
    // Match blood group and component from resourceType, e.g. "O- Packed Red Blood Cells (PRBC)"
    const match = resourceType.match(/^([A-Z]+[+-])\s+(.+)$/i);
    const bGroup = match ? match[1].toUpperCase() : '';
    const comp = match ? match[2] : resourceType;

    (db.bloodBanks || []).forEach(bb => {
      if (bb.id === facilityId || bb.hospitalId === facilityId) return;
      if (region && region !== 'All' && bb.city !== region) return;

      const matchingStock = (db.bloodStock || []).find(s =>
        s.facilityId === bb.id &&
        (!bGroup || s.bloodGroup === bGroup) &&
        (!comp || s.component.toLowerCase().includes(comp.toLowerCase()) || comp.toLowerCase().includes(s.component.toLowerCase())) &&
        s.reportedUnits > 2
      );

      if (matchingStock) {
        const fresh = getFreshness(matchingStock.lastUpdatedAt, db.radarThresholds);
        alternatives.push({
          facilityId: bb.id,
          facilityName: bb.name,
          region: bb.city,
          address: bb.address,
          contactPhone: bb.emergencyContact || bb.contact,
          reportedSurplus: `${matchingStock.reportedUnits} units (${matchingStock.bloodGroup} ${matchingStock.component})`,
          freshness: fresh.text,
          suggestion: `${bb.name} in ${bb.city} reports ${matchingStock.reportedUnits} verified units (${fresh.text}). Suggest coordinator call ${bb.emergencyContact || bb.contact} to confirm emergency transfer feasibility.`
        });
      }
    });
  } else if (category === 'Hospital Beds') {
    // Look for other hospitals in the same region with ICU beds > 0
    (db.hospitals || []).forEach(h => {
      if (h.id === facilityId) return;
      if (region && region !== 'All' && h.city !== region) return;
      if (h.verificationStatus !== 'Verified') return;

      const icuRoom = (h.rooms || []).find(r => r.type === 'ICU' && r.beds > 0);
      if (icuRoom) {
        alternatives.push({
          facilityId: h.id,
          facilityName: h.name,
          region: h.city,
          address: h.address,
          contactPhone: h.phone || 'Front Desk',
          reportedSurplus: `${icuRoom.beds} ICU bed${icuRoom.beds > 1 ? 's' : ''} available`,
          freshness: 'Live MedStay bed inventory',
          suggestion: `${h.name} in ${h.city} has ${icuRoom.beds} available ICU bed(s). Contact hospital desk to initiate patient admission review.`
        });
      }
    });
  } else if (category === 'Oxygen Supply') {
    // Look for other facilities with normal oxygen
    (db.radarResources || []).forEach(res => {
      if (res.facilityId === facilityId) return;
      if (res.resourceCategory !== 'Oxygen Supply') return;
      if (region && region !== 'All' && res.region !== region) return;
      if (res.reportedStatus === 'Normal') {
        const fresh = getFreshness(res.lastUpdatedAt, db.radarThresholds);
        alternatives.push({
          facilityId: res.facilityId,
          facilityName: res.facilityName,
          region: res.region,
          contactPhone: '+91-Regional-Manifold-Desk',
          reportedSurplus: `${res.reportedQuantity} ${res.unit} (Normal)`,
          freshness: fresh.text,
          suggestion: `${res.facilityName} reports normal oxygen supply (${res.reportedQuantity} ${res.unit}, ${fresh.text}). Possible mutual aid supply buffer.`
        });
      }
    });
  } else if (category === 'Critical Medical Equipment' || category === 'Critical Equipment') {
    (db.radarResources || []).forEach(res => {
      if (res.facilityId === facilityId) return;
      if (res.resourceCategory !== 'Critical Medical Equipment') return;
      if (region && region !== 'All' && res.region !== region) return;
      if (res.resourceType.includes('Ventilator') && res.reportedQuantity >= 2) {
        const fresh = getFreshness(res.lastUpdatedAt, db.radarThresholds);
        alternatives.push({
          facilityId: res.facilityId,
          facilityName: res.facilityName,
          region: res.region,
          contactPhone: '+91-Biomedical-Ops',
          reportedSurplus: `${res.reportedQuantity} ventilators free`,
          freshness: fresh.text,
          suggestion: `${res.facilityName} reports ${res.reportedQuantity} available ventilators (${fresh.text}). Contact biomedical coordinator.`
        });
      }
    });
  }

  return alternatives.slice(0, 3);
}

// Synchronize and enrich radar alerts
function syncAlerts(db) {
  const thresholds = db.radarThresholds || {
    bloodUnitsMin: 4,
    icuBedsMin: 1,
    ventilatorsMin: 2,
    oxygenCriticalCategories: ['Low', 'Critical'],
    freshThresholdHours: 2,
    agingThresholdHours: 24
  };

  const existingAlerts = db.radarAlerts || [];

  // 1. Scan blood shortages
  (db.bloodStock || []).forEach(stock => {
    if (stock.reportedUnits === null || stock.reportedUnits === undefined) return;
    if (stock.reportedUnits <= thresholds.bloodUnitsMin) {
      const facility = (db.bloodBanks || []).find(b => b.id === stock.facilityId);
      const facilityName = facility ? facility.name : `Facility ${stock.facilityId}`;
      const region = facility ? facility.city : 'Regional';
      const resourceType = `${stock.bloodGroup} ${stock.component}`;

      let alert = existingAlerts.find(a =>
        a.category === 'Blood & Components' &&
        a.resourceType === resourceType &&
        (a.facilityId === stock.facilityId || a.facilityName === facilityName) &&
        a.status !== 'Resolved'
      );

      const freshness = getFreshness(stock.lastUpdatedAt, thresholds);
      const isStale = freshness.state === 'stale';
      const severity = stock.reportedUnits === 0
        ? 'Critical Reported Shortage'
        : stock.reportedUnits <= 2
          ? 'Critical Reported Shortage'
          : 'Attention Required';

      const rule = isStale
        ? `Blood bank reported ${stock.reportedUnits} units of ${resourceType}. NOTICE: Data is older than 24h. Re-verification required.`
        : `Blood bank reported ${stock.reportedUnits} unit(s) of ${resourceType} (Configured minimum: ${thresholds.bloodUnitsMin} units).`;

      if (!alert) {
        alert = {
          id: 'alt-' + (Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6)),
          category: 'Blood & Components',
          resourceType,
          facilityId: stock.facilityId,
          facilityName,
          region,
          severity,
          rule,
          reportedValue: `${stock.reportedUnits} unit(s) remaining`,
          source: stock.source || 'Blood Centre Report',
          freshnessState: freshness.label,
          status: 'Active',
          createdAt: new Date().toISOString(),
          acknowledgedAt: null,
          acknowledgedBy: null,
          resolvedAt: null,
          resolvedBy: null,
          coordinationNotes: [],
          suggestedAlternatives: findCoordinationAlternatives(db, 'Blood & Components', resourceType, stock.facilityId, region)
        };
        existingAlerts.push(alert);
      } else {
        alert.severity = severity;
        alert.rule = rule;
        alert.reportedValue = `${stock.reportedUnits} unit(s) remaining`;
        alert.freshnessState = freshness.label;
        if (!alert.suggestedAlternatives || alert.suggestedAlternatives.length === 0) {
          alert.suggestedAlternatives = findCoordinationAlternatives(db, 'Blood & Components', resourceType, stock.facilityId, region);
        }
      }
    } else {
      // If units have been replenished, check if active alert can be auto-resolved
      const resourceType = `${stock.bloodGroup} ${stock.component}`;
      const alert = existingAlerts.find(a =>
        a.category === 'Blood & Components' &&
        a.resourceType === resourceType &&
        (a.facilityId === stock.facilityId) &&
        a.status === 'Active'
      );
      if (alert) {
        alert.status = 'Resolved';
        alert.resolvedAt = new Date().toISOString();
        alert.resolvedBy = 'System Auto-Resolution';
        alert.coordinationNotes = alert.coordinationNotes || [];
        alert.coordinationNotes.push({
          timestamp: new Date().toISOString(),
          author: 'System Sensor Sync',
          note: `Inventory replenished to ${stock.reportedUnits} units. Shortage alert closed.`
        });
      }
    }
  });

  // 2. Scan oxygen shortages
  (db.radarResources || []).forEach(res => {
    if (res.resourceCategory !== 'Oxygen Supply') return;
    if (thresholds.oxygenCriticalCategories.includes(res.reportedStatus)) {
      let alert = existingAlerts.find(a =>
        a.category === 'Oxygen Supply' &&
        a.facilityId === res.facilityId &&
        a.resourceType === res.resourceType &&
        a.status !== 'Resolved'
      );

      const freshness = getFreshness(res.lastUpdatedAt, thresholds);
      const severity = res.reportedStatus === 'Critical' ? 'Critical Reported Shortage' : 'Attention Required';
      const rule = `Facility reported ${res.reportedStatus} oxygen status (${res.reportedQuantity} ${res.unit}).`;

      if (!alert) {
        alert = {
          id: 'alt-' + (Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6)),
          category: 'Oxygen Supply',
          resourceType: res.resourceType,
          facilityId: res.facilityId,
          facilityName: res.facilityName,
          region: res.region,
          severity,
          rule,
          reportedValue: `${res.reportedQuantity} ${res.unit} (${res.reportedStatus})`,
          source: res.source,
          freshnessState: freshness.label,
          status: 'Active',
          createdAt: new Date().toISOString(),
          acknowledgedAt: null,
          acknowledgedBy: null,
          resolvedAt: null,
          resolvedBy: null,
          coordinationNotes: [],
          suggestedAlternatives: findCoordinationAlternatives(db, 'Oxygen Supply', res.resourceType, res.facilityId, res.region)
        };
        existingAlerts.push(alert);
      }
    }
  });

  // 3. Scan ICU bed shortages in hospitals
  (db.hospitals || []).forEach(h => {
    if (h.verificationStatus !== 'Verified') return;
    const icuRoom = (h.rooms || []).find(r => r.type === 'ICU');
    if (icuRoom && icuRoom.beds === 0) {
      let alert = existingAlerts.find(a =>
        a.category === 'Hospital Beds' &&
        a.facilityId === h.id &&
        a.status !== 'Resolved'
      );

      if (!alert) {
        alert = {
          id: 'alt-' + (Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6)),
          category: 'Hospital Beds',
          resourceType: 'ICU Bed Availability',
          facilityId: h.id,
          facilityName: h.name,
          region: h.city,
          severity: 'Critical Reported Shortage',
          rule: `Zero ICU beds available reported across facility inventory (0 / ${icuRoom.totalBeds || 0} total).`,
          reportedValue: '0 ICU beds available',
          source: 'MedStay Real-time Bed Inventory',
          freshnessState: 'Live Inventory',
          status: 'Active',
          createdAt: new Date().toISOString(),
          acknowledgedAt: null,
          acknowledgedBy: null,
          resolvedAt: null,
          resolvedBy: null,
          coordinationNotes: [],
          suggestedAlternatives: findCoordinationAlternatives(db, 'Hospital Beds', 'ICU', h.id, h.city)
        };
        existingAlerts.push(alert);
      }
    }
  });

  db.radarAlerts = existingAlerts;
  return existingAlerts;
}

// Main handler for /api/lifeline/ and /api/resource-radar/
async function handleLifelineAndRadar(req, res, pathname, q, db, user, save, send, body) {
  // Ensure DB arrays exist
  db.bloodBanks = db.bloodBanks || [];
  db.bloodStock = db.bloodStock || [];
  db.transplantCentres = db.transplantCentres || [];
  db.radarResources = db.radarResources || [];
  db.radarAlerts = db.radarAlerts || [];
  db.lifelineAudit = db.lifelineAudit || [];
  db.radarThresholds = db.radarThresholds || {
    bloodUnitsMin: 4,
    icuBedsMin: 1,
    ventilatorsMin: 2,
    oxygenCriticalCategories: ['Low', 'Critical'],
    freshThresholdHours: 2,
    agingThresholdHours: 24
  };

  // Sync and enrich alerts
  syncAlerts(db);

  // ==========================================
  // LIFELINE ROUTES
  // ==========================================

  // GET /api/lifeline/meta
  if (req.method === 'GET' && pathname === '/api/lifeline/meta') {
    const cities = [...new Set([
      ...db.bloodBanks.map(b => b.city),
      ...db.transplantCentres.map(t => t.city),
      ...db.hospitals.map(h => h.city)
    ])].filter(Boolean).sort();

    const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    const components = [
      'Packed Red Blood Cells (PRBC)',
      'Platelets',
      'Fresh Frozen Plasma (FFP)',
      'Whole Blood',
      'Cryoprecipitate'
    ];
    const transplantServices = [
      'Kidney',
      'Liver',
      'Heart',
      'Lung',
      'Pancreas',
      'Cornea',
      'Bone Marrow / Stem Cell',
      'Bone & Tissue Allograft'
    ];

    return send(res, 200, {
      cities,
      bloodGroups,
      components,
      transplantServices,
      freshnessThresholds: db.radarThresholds,
      disclaimer: "MedStay Lifeline is a discovery and regional coordination platform. It is not an organ inventory, commercial blood marketplace, or clinical decision tool. Official allocations are governed by NOTTO and authorized medical protocols."
    });
  }

  // GET /api/lifeline/blood-banks
  if (req.method === 'GET' && pathname === '/api/lifeline/blood-banks') {
    let list = [...db.bloodBanks];
    if (q.city && q.city !== 'All') {
      list = list.filter(b => b.city.toLowerCase() === q.city.toLowerCase() || b.district.toLowerCase() === q.city.toLowerCase());
    }
    if (q.category && q.category !== 'All') {
      list = list.filter(b => b.category === q.category);
    }
    if (q.apheresis === 'true') {
      list = list.filter(b => b.apheresisAvailable);
    }
    if (q.q) {
      const s = String(q.q).toLowerCase();
      list = list.filter(b =>
        b.name.toLowerCase().includes(s) ||
        b.address.toLowerCase().includes(s) ||
        b.city.toLowerCase().includes(s) ||
        (b.pincode && b.pincode.includes(s))
      );
    }

    // Attach stock counts
    const enriched = list.map(b => {
      const stocks = db.bloodStock.filter(s => s.facilityId === b.id);
      const fresh = getFreshness(b.lastVerifiedAt, db.radarThresholds);
      return {
        ...b,
        stockCount: stocks.length,
        totalReportedUnits: stocks.reduce((sum, s) => sum + (s.reportedUnits || 0), 0),
        freshness: fresh
      };
    });

    return send(res, 200, { bloodBanks: enriched });
  }

  // GET /api/lifeline/blood-banks/:id
  if (req.method === 'GET' && pathname.startsWith('/api/lifeline/blood-banks/')) {
    const id = pathname.split('/').pop();
    const bb = db.bloodBanks.find(b => b.id === id);
    if (!bb) return send(res, 404, { error: 'Blood bank facility not found' });

    const stocks = db.bloodStock.filter(s => s.facilityId === id).map(s => {
      const fresh = getFreshness(s.lastUpdatedAt, db.radarThresholds);
      return {
        ...s,
        freshness: fresh,
        isShortage: s.reportedUnits !== null && s.reportedUnits <= db.radarThresholds.bloodUnitsMin
      };
    });

    const fresh = getFreshness(bb.lastVerifiedAt, db.radarThresholds);

    return send(res, 200, {
      facility: {
        ...bb,
        freshness: fresh
      },
      stock: stocks
    });
  }

  // GET /api/lifeline/blood-stock
  if (req.method === 'GET' && pathname === '/api/lifeline/blood-stock') {
    let results = [];

    const city = q.city || '';
    const bloodGroup = q.bloodGroup || '';
    const component = q.component || '';
    const availability = q.availability || ''; // 'available', 'shortage', 'depleted', 'unknown'
    const freshnessFilter = q.freshness || ''; // 'fresh', 'aging', 'stale', 'unknown'
    const search = (q.q || '').toLowerCase();
    const sort = q.sort || 'freshness';

    db.bloodStock.forEach(s => {
      const facility = db.bloodBanks.find(b => b.id === s.facilityId);
      if (!facility) return;

      // Filter by city / locality / pincode
      if (city && city !== 'All') {
        const cLower = city.toLowerCase();
        if (facility.city.toLowerCase() !== cLower &&
            facility.district.toLowerCase() !== cLower &&
            !facility.address.toLowerCase().includes(cLower)) {
          return;
        }
      }

      // Filter by independent blood group
      if (bloodGroup && bloodGroup !== 'All' && s.bloodGroup !== bloodGroup) {
        return;
      }

      // Filter by independent blood component
      if (component && component !== 'All') {
        if (!s.component.toLowerCase().includes(component.toLowerCase()) &&
            !component.toLowerCase().includes(s.component.toLowerCase())) {
          return;
        }
      }

      // Free text search
      if (search) {
        const full = `${facility.name} ${facility.address} ${facility.city} ${facility.pincode} ${s.bloodGroup} ${s.component}`.toLowerCase();
        if (!full.includes(search)) return;
      }

      const fresh = getFreshness(s.lastUpdatedAt, db.radarThresholds);

      // Freshness filter
      if (freshnessFilter && freshnessFilter !== 'All') {
        if (fresh.state !== freshnessFilter) return;
      }

      // Availability filter
      const isShortage = s.reportedUnits !== null && s.reportedUnits > 0 && s.reportedUnits <= db.radarThresholds.bloodUnitsMin;
      const isDepleted = s.reportedUnits === 0;
      const isUnknown = s.reportedUnits === null || s.reportedUnits === undefined;
      const isAvailable = s.reportedUnits !== null && s.reportedUnits > db.radarThresholds.bloodUnitsMin;

      if (availability === 'available' && !isAvailable) return;
      if (availability === 'shortage' && !isShortage) return;
      if (availability === 'depleted' && !isDepleted) return;
      if (availability === 'unknown' && !isUnknown) return;

      results.push({
        id: s.id,
        facilityId: facility.id,
        facilityName: facility.name,
        category: facility.category,
        address: facility.address,
        city: facility.city,
        district: facility.district,
        state: facility.state,
        pincode: facility.pincode,
        contact: facility.contact,
        emergencyContact: facility.emergencyContact,
        bloodGroup: s.bloodGroup,
        component: s.component,
        reportedUnits: s.reportedUnits, // null if unknown; 0 if depleted
        lastUpdatedAt: s.lastUpdatedAt,
        verificationStatus: s.verificationStatus || fresh.label,
        source: s.source,
        notes: s.notes,
        freshness: fresh,
        isShortage,
        isDepleted,
        isUnknown,
        licenseNumber: facility.licenseNumber,
        website: facility.website || ''
      });
    });

    // Sort
    if (sort === 'units-desc') {
      results.sort((a, b) => (b.reportedUnits || 0) - (a.reportedUnits || 0));
    } else if (sort === 'name') {
      results.sort((a, b) => a.facilityName.localeCompare(b.facilityName));
    } else {
      // Sort by freshness: fresh first, then aging, then stale, then unknown
      const rank = { fresh: 1, aging: 2, stale: 3, unknown: 4 };
      results.sort((a, b) => (rank[a.freshness.state] || 5) - (rank[b.freshness.state] || 5));
    }

    return send(res, 200, {
      total: results.length,
      filters: { city, bloodGroup, component, availability, freshnessFilter, sort },
      results
    });
  }

  // GET /api/lifeline/transplant-centres
  if (req.method === 'GET' && pathname === '/api/lifeline/transplant-centres') {
    let list = [...db.transplantCentres];

    if (q.city && q.city !== 'All') {
      list = list.filter(t => t.city.toLowerCase() === q.city.toLowerCase() || t.state.toLowerCase() === q.city.toLowerCase());
    }
    if (q.service && q.service !== 'All') {
      list = list.filter(t => (t.transplantServices || []).some(s => s.toLowerCase().includes(q.service.toLowerCase())));
    }
    if (q.institutionType && q.institutionType !== 'All') {
      list = list.filter(t => t.institutionType === q.institutionType);
    }
    if (q.q) {
      const s = String(q.q).toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(s) ||
        t.address.toLowerCase().includes(s) ||
        t.city.toLowerCase().includes(s) ||
        (t.transplantServices || []).join(' ').toLowerCase().includes(s)
      );
    }

    return send(res, 200, {
      transplantCentres: list,
      disclaimer: "Organ allocation is strictly regulated under the Transplantation of Human Organs and Tissues Act (THOTA). MedStay does not list organ inventory or facilitate donor matching. All queries must be directed to authorized institutions and official registries (NOTTO: https://notto.mohfw.gov.in/)."
    });
  }

  // POST /api/lifeline/blood-stock (Authorized / Demo Stock Update)
  if (req.method === 'POST' && pathname === '/api/lifeline/blood-stock') {
    const x = await body(req);
    const { facilityId, bloodGroup, component, reportedUnits, notes, reason } = x;

    if (!facilityId || !bloodGroup || !component) {
      return send(res, 400, { error: 'facilityId, bloodGroup, and component are required' });
    }

    const facility = db.bloodBanks.find(b => b.id === facilityId);
    if (!facility) {
      return send(res, 404, { error: 'Blood bank facility not found' });
    }

    const validGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    if (!validGroups.includes(bloodGroup)) {
      return send(res, 400, { error: 'Invalid blood group' });
    }

    let parsedUnits = null;
    if (reportedUnits !== null && reportedUnits !== undefined && reportedUnits !== '') {
      parsedUnits = Math.max(0, Math.floor(Number(reportedUnits)));
      if (isNaN(parsedUnits)) {
        return send(res, 400, { error: 'reportedUnits must be a non-negative number or null' });
      }
    }

    let stockItem = db.bloodStock.find(s => s.facilityId === facilityId && s.bloodGroup === bloodGroup && s.component === component);
    const oldValue = stockItem ? stockItem.reportedUnits : null;
    const nowIso = new Date().toISOString();

    if (!stockItem) {
      stockItem = {
        id: 'bs-' + Date.now(),
        facilityId,
        bloodGroup,
        component,
        reportedUnits: parsedUnits,
        lastUpdatedAt: nowIso,
        verificationStatus: 'Recently Confirmed',
        source: user ? `Authorized Update (${user.name})` : 'Authorized Demo Coordinator',
        notes: notes || ''
      };
      db.bloodStock.push(stockItem);
    } else {
      stockItem.reportedUnits = parsedUnits;
      stockItem.lastUpdatedAt = nowIso;
      stockItem.verificationStatus = 'Recently Confirmed';
      stockItem.source = user ? `Authorized Update (${user.name})` : 'Authorized Demo Coordinator';
      if (notes) stockItem.notes = notes;
    }

    // Facility last verified timestamp update
    facility.lastVerifiedAt = nowIso;
    facility.verificationStatus = 'Recently Confirmed';

    // Record audit trail
    const auditEntry = {
      id: 'aud-' + uid().substring(0, 8),
      recordId: stockItem.id,
      facilityId,
      facilityName: facility.name,
      bloodGroup,
      component,
      oldValue,
      newValue: parsedUnits,
      actorId: user ? user.id : 'demo-coordinator',
      actorName: user ? user.name : 'Authorized Demo Coordinator',
      reason: reason || 'Routine inventory count verification',
      timestamp: nowIso
    };
    db.lifelineAudit.unshift(auditEntry);
    if (db.lifelineAudit.length > 50) db.lifelineAudit.pop();

    // Re-sync alerts
    syncAlerts(db);
    save(db);

    return send(res, 200, {
      ok: true,
      stock: stockItem,
      audit: auditEntry
    });
  }

  // GET /api/lifeline/audit
  if (req.method === 'GET' && pathname === '/api/lifeline/audit') {
    return send(res, 200, { audit: db.lifelineAudit || [] });
  }

  // ==========================================
  // CRITICAL RESOURCE RADAR ROUTES
  // ==========================================

  // GET /api/resource-radar/summary
  if (req.method === 'GET' && pathname === '/api/resource-radar/summary') {
    const region = q.region || 'All';

    // Card A: Beds
    const beds = computeBedSummary(db.hospitals, region);

    // Card B: Blood
    let stockItems = [...db.bloodStock];
    if (region && region !== 'All') {
      const allowedBankIds = new Set(db.bloodBanks.filter(b => b.city === region).map(b => b.id));
      stockItems = stockItems.filter(s => allowedBankIds.has(s.facilityId));
    }

    // Group by component independently (NEVER sum unlike components together)
    const bloodByComponent = {};
    let bloodNeedingUpdate = 0;
    let bloodShortageCount = 0;

    stockItems.forEach(s => {
      const comp = s.component;
      if (!bloodByComponent[comp]) {
        bloodByComponent[comp] = { component: comp, units: 0, reportingFacilities: new Set() };
      }
      if (s.reportedUnits !== null && s.reportedUnits !== undefined) {
        bloodByComponent[comp].units += s.reportedUnits;
      }
      bloodByComponent[comp].reportingFacilities.add(s.facilityId);

      const fresh = getFreshness(s.lastUpdatedAt, db.radarThresholds);
      if (fresh.state === 'stale' || fresh.state === 'unknown') {
        bloodNeedingUpdate++;
      }
      if (s.reportedUnits !== null && s.reportedUnits <= db.radarThresholds.bloodUnitsMin) {
        bloodShortageCount++;
      }
    });

    const bloodComponentsSummary = Object.values(bloodByComponent).map(c => ({
      component: c.component,
      units: c.units,
      facilitiesReporting: c.reportingFacilities.size
    }));

    const reportingBanksCount = new Set(stockItems.map(s => s.facilityId)).size;

    // Card C: Oxygen
    let oxygenList = db.radarResources.filter(r => r.resourceCategory === 'Oxygen Supply');
    if (region && region !== 'All') {
      oxygenList = oxygenList.filter(r => r.region === region);
    }

    const oxygenStatusCounts = { Normal: 0, Low: 0, Critical: 0, Unknown: 0 };
    let totalLmoKl = 0;
    let totalCylinders = 0;

    oxygenList.forEach(r => {
      const st = r.reportedStatus || 'Unknown';
      oxygenStatusCounts[st] = (oxygenStatusCounts[st] || 0) + 1;
      if (r.unit && r.unit.toLowerCase().includes('kl')) {
        totalLmoKl += Number(r.reportedQuantity) || 0;
      }
      if (r.unit && r.unit.toLowerCase().includes('cylinder')) {
        totalCylinders += Number(r.reportedQuantity) || 0;
      }
    });

    // Card D: Critical Equipment
    let equipList = db.radarResources.filter(r => r.resourceCategory === 'Critical Medical Equipment');
    if (region && region !== 'All') {
      equipList = equipList.filter(r => r.region === region);
    }

    const equipmentSummary = {};
    equipList.forEach(e => {
      const t = e.resourceType;
      if (!equipmentSummary[t]) {
        equipmentSummary[t] = { type: t, available: 0, total: 0, facilities: 0 };
      }
      equipmentSummary[t].available += Number(e.reportedQuantity) || 0;
      equipmentSummary[t].total += Number(e.totalReported || e.reportedQuantity) || 0;
      equipmentSummary[t].facilities++;
    });

    // Card E: Data Freshness across region
    let freshCount = 0;
    let agingCount = 0;
    let staleCount = 0;
    let unknownCount = 0;

    // Aggregate freshness of stock items and equipment/oxygen
    stockItems.forEach(s => {
      const f = getFreshness(s.lastUpdatedAt, db.radarThresholds).state;
      if (f === 'fresh') freshCount++;
      else if (f === 'aging') agingCount++;
      else if (f === 'stale') staleCount++;
      else unknownCount++;
    });

    [...oxygenList, ...equipList].forEach(r => {
      const f = getFreshness(r.lastUpdatedAt, db.radarThresholds).state;
      if (f === 'fresh') freshCount++;
      else if (f === 'aging') agingCount++;
      else if (f === 'stale') staleCount++;
      else unknownCount++;
    });

    return send(res, 200, {
      selectedRegion: region,
      lastRefreshedAt: new Date().toISOString(),
      beds,
      blood: {
        facilitiesReporting: reportingBanksCount,
        components: bloodComponentsSummary,
        recordsNeedingUpdate: bloodNeedingUpdate,
        activeShortages: bloodShortageCount
      },
      oxygen: {
        facilitiesReporting: oxygenList.length,
        statusDistribution: oxygenStatusCounts,
        liquidOxygenAvailableKl: Math.round(totalLmoKl * 10) / 10,
        bulkCylindersAvailable: totalCylinders
      },
      equipment: {
        facilitiesReporting: equipList.length,
        categories: Object.values(equipmentSummary)
      },
      freshness: {
        freshCount,
        agingCount,
        staleCount,
        unknownCount,
        totalRecords: freshCount + agingCount + staleCount + unknownCount
      }
    });
  }

  // GET /api/resource-radar/resources
  if (req.method === 'GET' && pathname === '/api/resource-radar/resources') {
    const region = q.region || 'All';
    const category = q.category || 'All';
    const search = (q.q || '').toLowerCase();
    const needConfirmation = q.needConfirmation === 'true';

    let allResources = [];

    // 1. Oxygen & Equipment
    db.radarResources.forEach(res => {
      if (region !== 'All' && res.region !== region) return;
      if (category !== 'All' && res.resourceCategory !== category) return;

      const fresh = getFreshness(res.lastUpdatedAt, db.radarThresholds);
      if (needConfirmation && fresh.state === 'fresh') return;

      if (search) {
        const str = `${res.facilityName} ${res.region} ${res.resourceCategory} ${res.resourceType}`.toLowerCase();
        if (!str.includes(search)) return;
      }

      allResources.push({
        id: res.id,
        facilityId: res.facilityId,
        facilityName: res.facilityName,
        region: res.region,
        resourceCategory: res.resourceCategory,
        resourceType: res.resourceType,
        reportedQuantity: res.reportedQuantity,
        totalReported: res.totalReported,
        operationalQuantity: res.operationalQuantity,
        reportedStatus: res.reportedStatus,
        unit: res.unit,
        verificationStatus: res.verificationStatus,
        source: res.source,
        lastUpdatedAt: res.lastUpdatedAt,
        freshness: fresh
      });
    });

    // 2. Hospital Beds as Resource records
    if (category === 'All' || category === 'Hospital Beds') {
      db.hospitals.filter(h => h.verificationStatus === 'Verified').forEach(h => {
        if (region !== 'All' && h.city !== region) return;
        (h.rooms || []).forEach(r => {
          if (search) {
            const str = `${h.name} ${h.city} Hospital Beds ${r.type}`.toLowerCase();
            if (!str.includes(search)) return;
          }

          allResources.push({
            id: `bed-${h.id}-${r.type.replace(/\s+/g, '-')}`,
            facilityId: h.id,
            facilityName: h.name,
            region: h.city,
            resourceCategory: 'Hospital Beds',
            resourceType: `${r.type} Beds`,
            reportedQuantity: r.beds,
            totalReported: r.totalBeds || r.beds,
            reportedStatus: r.beds > 0 ? 'Available' : 'Fully Occupied',
            unit: 'Beds',
            verificationStatus: 'Verified Hospital',
            source: 'MedStay Bed Management',
            lastUpdatedAt: new Date().toISOString(),
            freshness: { label: 'Recently Confirmed', state: 'fresh', text: 'Live MedStay Database' }
          });
        });
      });
    }

    // Sort by region, then category
    allResources.sort((a, b) => a.region.localeCompare(b.region) || a.resourceCategory.localeCompare(b.resourceCategory));

    return send(res, 200, {
      total: allResources.length,
      resources: allResources
    });
  }

  // GET /api/resource-radar/alerts
  if (req.method === 'GET' && pathname === '/api/resource-radar/alerts') {
    const region = q.region || 'All';
    const status = q.status || 'all';

    let alerts = [...db.radarAlerts];
    if (region !== 'All') {
      alerts = alerts.filter(a => a.region === region);
    }
    if (status !== 'all') {
      alerts = alerts.filter(a => a.status.toLowerCase() === status.toLowerCase());
    }

    // Refresh suggested alternatives for active alerts
    alerts.forEach(a => {
      if (a.status !== 'Resolved' && (!a.suggestedAlternatives || a.suggestedAlternatives.length === 0)) {
        a.suggestedAlternatives = findCoordinationAlternatives(db, a.category, a.resourceType, a.facilityId, a.region);
      }
    });

    return send(res, 200, {
      total: alerts.length,
      thresholds: db.radarThresholds,
      alerts
    });
  }

  // PATCH /api/resource-radar/alerts/:id/acknowledge
  if (req.method === 'PATCH' && pathname.includes('/api/resource-radar/alerts/') && pathname.endsWith('/acknowledge')) {
    const id = pathname.replace('/api/resource-radar/alerts/', '').replace('/acknowledge', '');
    const alert = db.radarAlerts.find(a => a.id === id);
    if (!alert) return send(res, 404, { error: 'Alert not found' });

    const x = await body(req);
    const nowIso = new Date().toISOString();
    alert.status = 'Acknowledged';
    alert.acknowledgedAt = nowIso;
    alert.acknowledgedBy = user ? `${user.name} (${user.role})` : x.acknowledgedBy || 'Regional Coordinator Desk';

    if (x.note) {
      alert.coordinationNotes = alert.coordinationNotes || [];
      alert.coordinationNotes.push({
        timestamp: nowIso,
        author: alert.acknowledgedBy,
        note: String(x.note).trim()
      });
    }

    save(db);
    return send(res, 200, { ok: true, alert });
  }

  // POST /api/resource-radar/alerts/:id/notes
  if (req.method === 'POST' && pathname.includes('/api/resource-radar/alerts/') && pathname.endsWith('/notes')) {
    const id = pathname.replace('/api/resource-radar/alerts/', '').replace('/notes', '');
    const alert = db.radarAlerts.find(a => a.id === id);
    if (!alert) return send(res, 404, { error: 'Alert not found' });

    const x = await body(req);
    if (!x.note) return send(res, 400, { error: 'Note text is required' });

    const nowIso = new Date().toISOString();
    const author = user ? `${user.name} (${user.role})` : x.author || 'Regional Coordinator Desk';

    alert.coordinationNotes = alert.coordinationNotes || [];
    alert.coordinationNotes.push({
      timestamp: nowIso,
      author,
      note: String(x.note).trim()
    });

    save(db);
    return send(res, 200, { ok: true, alert });
  }

  // PATCH /api/resource-radar/alerts/:id/resolve
  if (req.method === 'PATCH' && pathname.includes('/api/resource-radar/alerts/') && pathname.endsWith('/resolve')) {
    const id = pathname.replace('/api/resource-radar/alerts/', '').replace('/resolve', '');
    const alert = db.radarAlerts.find(a => a.id === id);
    if (!alert) return send(res, 404, { error: 'Alert not found' });

    const x = await body(req);
    const nowIso = new Date().toISOString();
    alert.status = 'Resolved';
    alert.resolvedAt = nowIso;
    alert.resolvedBy = user ? `${user.name} (${user.role})` : x.resolvedBy || 'Regional Coordinator Desk';

    if (x.resolutionNote) {
      alert.coordinationNotes = alert.coordinationNotes || [];
      alert.coordinationNotes.push({
        timestamp: nowIso,
        author: alert.resolvedBy,
        note: `RESOLVED: ${String(x.resolutionNote).trim()}`
      });
    }

    save(db);
    return send(res, 200, { ok: true, alert });
  }

  // GET /api/resource-radar/config & PATCH /api/resource-radar/config
  if (pathname === '/api/resource-radar/config') {
    if (req.method === 'GET') {
      return send(res, 200, { thresholds: db.radarThresholds });
    }
    if (req.method === 'PATCH') {
      const x = await body(req);
      if (x.bloodUnitsMin !== undefined) db.radarThresholds.bloodUnitsMin = Math.max(1, Number(x.bloodUnitsMin));
      if (x.icuBedsMin !== undefined) db.radarThresholds.icuBedsMin = Math.max(0, Number(x.icuBedsMin));
      if (x.ventilatorsMin !== undefined) db.radarThresholds.ventilatorsMin = Math.max(1, Number(x.ventilatorsMin));
      if (x.freshThresholdHours !== undefined) db.radarThresholds.freshThresholdHours = Math.max(1, Number(x.freshThresholdHours));
      if (x.agingThresholdHours !== undefined) db.radarThresholds.agingThresholdHours = Math.max(2, Number(x.agingThresholdHours));

      syncAlerts(db);
      save(db);
      return send(res, 200, { ok: true, thresholds: db.radarThresholds });
    }
  }

  // POST /api/resource-radar/resources (Create or update resource)
  if (req.method === 'POST' && pathname === '/api/resource-radar/resources') {
    const x = await body(req);
    const { facilityId, facilityName, region, resourceCategory, resourceType, reportedQuantity, reportedStatus, unit, totalReported } = x;

    if (!facilityName || !region || !resourceCategory || !resourceType) {
      return send(res, 400, { error: 'facilityName, region, resourceCategory, and resourceType are required' });
    }

    let existing = db.radarResources.find(r => r.facilityName === facilityName && r.resourceCategory === resourceCategory && r.resourceType === resourceType);
    const nowIso = new Date().toISOString();

    if (existing) {
      existing.reportedQuantity = Number(reportedQuantity) || 0;
      existing.reportedStatus = reportedStatus || existing.reportedStatus;
      if (unit) existing.unit = unit;
      if (totalReported) existing.totalReported = Number(totalReported);
      existing.lastUpdatedAt = nowIso;
      existing.verificationStatus = 'Verified';
      existing.source = user ? `Authorized Entry (${user.name})` : 'Coordinator Update';
    } else {
      existing = {
        id: 'res-' + Date.now(),
        facilityId: facilityId || Date.now(),
        facilityName,
        region,
        resourceCategory,
        resourceType,
        reportedQuantity: Number(reportedQuantity) || 0,
        totalReported: Number(totalReported || reportedQuantity) || 0,
        reportedStatus: reportedStatus || 'Normal',
        unit: unit || 'Units',
        lastUpdatedAt: nowIso,
        verificationStatus: 'Verified',
        source: user ? `Authorized Entry (${user.name})` : 'Coordinator Update'
      };
      db.radarResources.push(existing);
    }

    syncAlerts(db);
    save(db);
    return send(res, 201, { ok: true, resource: existing });
  }

  return false;
}

module.exports = {
  handleLifelineAndRadar,
  getFreshness,
  syncAlerts
};

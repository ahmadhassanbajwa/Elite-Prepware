/**
 * Eliteprepware Enterprise Management Suite
 * Professional Clean Light Enterprise 3PL OS Client
 * Vertical Slice Architecture: IAM Worker Accounts, Capacity Gatekeeper, Storage, Pricing, Invoices
 */

// Global State
const state = {
  token: sessionStorage.getItem('ep_token'),
  user: null,
  activeTab: 'overview',
  analyticsMonths: 6,
  analyticsCurrency: 'USD',
  clients: [],
  slots: [],
  items: [],
  pricingTypes: [],
  invoices: [],
  workers: [],
  capacityBlocks: [],
  capacityMetrics: {
    total_rented_pallets: 0,
    total_occupied_pallets: 0,
    available_rented_space: 0,
    utilization_pct: 0
  },
  rebalancePlan: null,
  searchQueries: {
    clients: '',
    items: '',
    slots: '',
    invoices: '',
    workers: ''
  }
};

// Utilities
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2
  }).format(Number(amount) || 0);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (e) {
    return dateStr;
  }
};

// Toast Notifications
function showToast(message, type = 'info') {
  const container = $('#toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
  } else {
    iconSvg = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  }

  toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

// API Client
async function api(path, options = {}) {
  const { method = 'GET', body = null } = options;
  const headers = { 'Content-Type': 'application/json' };
  
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 401 && path !== '/auth/login') {
    handleSignOut();
    throw new Error('Your session has expired. Please sign in again.');
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || res.statusText || 'Operation failed');
  }

  return data;
}

// Modal Manager
function openModal(title, bodyHtml, onConfirm = null, confirmText = 'Save', confirmClass = 'btn-primary') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title">${escapeHtml(title)}</h3>
        <button class="modal-close" id="modal-close-btn">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-footer">
        <button class="btn" id="modal-cancel-btn">Cancel</button>
        ${onConfirm ? `<button class="btn ${confirmClass}" id="modal-confirm-btn">${escapeHtml(confirmText)}</button>` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 150);
  };

  overlay.querySelector('#modal-close-btn').onclick = close;
  overlay.querySelector('#modal-cancel-btn').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  if (onConfirm) {
    overlay.querySelector('#modal-confirm-btn').onclick = async () => {
      try {
        const shouldClose = await onConfirm(overlay);
        if (shouldClose !== false) close();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  return overlay;
}

// Auth Handlers
async function handleLogin(email, password) {
  try {
    const btn = $('#btn-signin');
    btn.disabled = true;
    btn.innerHTML = `<svg class="spin" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="4" stroke-dasharray="32" stroke-linecap="round"/></svg> Signing in...`;
    
    const data = await api('/auth/login', {
      method: 'POST',
      body: { email, password }
    });

    state.token = data.token;
    sessionStorage.setItem('ep_token', data.token);
    state.user = { email, role: 'admin' };
    
    showToast('Signed in successfully', 'success');
    showAppLayout();
    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
    const errBox = $('#login-error-msg');
    if (errBox) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    }
  } finally {
    const btn = $('#btn-signin');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sign in to Dashboard';
    }
  }
}

function handleSignOut() {
  state.token = null;
  state.user = null;
  sessionStorage.removeItem('ep_token');
  showLoginView();
  showToast('You have been signed out', 'info');
}

// Data Fetching
async function loadInitialData() {
  try {
    renderWorkspaceLoading();
    const [clients, slots, items, pricingTypes, invoices, workers, capacityData] = await Promise.all([
      api('/api/clients').catch(() => []),
      api('/api/storage/slots').catch(() => []),
      api('/api/storage/items').catch(() => []),
      api('/api/pricing/types').catch(() => []),
      api('/api/invoices').catch(() => []),
      api('/api/auth/workers').catch(() => []),
      api('/api/storage/capacity-blocks').catch(() => ({ blocks: [], metrics: {} }))
    ]);

    state.clients = clients;
    state.slots = slots;
    state.items = items;
    state.pricingTypes = pricingTypes;
    state.invoices = invoices;
    state.workers = workers;
    state.capacityBlocks = capacityData.blocks || [];
    state.capacityMetrics = capacityData.metrics || {};

    renderCurrentTab();
  } catch (err) {
    showToast('Error syncing data: ' + err.message, 'error');
  }
}

// Layout Switchers
function showLoginView() {
  $('#auth-view').style.display = 'flex';
  $('#app-view').style.display = 'none';
}

function showAppLayout() {
  $('#auth-view').style.display = 'none';
  $('#app-view').style.display = 'flex';
  
  if (state.user && $('#current-user-email')) {
    $('#current-user-email').textContent = state.user.email;
  }
}

function renderWorkspaceLoading() {
  const container = $('#workspace-content');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px;">
        <div style="font-size: 15px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;">Synchronizing Warehouse Data...</div>
        <div style="font-size: 13px; color: var(--text-light);">Loading clients, warehouse racks, workers, and pricing rates</div>
      </div>
    `;
  }
}

// Tab Switching
function switchTab(tabName) {
  state.activeTab = tabName;
  $$('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  renderCurrentTab();
}

function renderCurrentTab() {
  const container = $('#workspace-content');
  const titleEl = $('#current-page-title');
  if (!container) return;

  switch (state.activeTab) {
    case 'overview':
      if (titleEl) titleEl.textContent = 'Overview';
      renderOverviewTab(container);
      break;
    case 'clients':
      if (titleEl) titleEl.textContent = 'Clients';
      renderClientsTab(container);
      break;
    case 'storage':
      if (titleEl) titleEl.textContent = 'Storage';
      renderStorageTab(container);
      break;
    case 'workers':
      if (titleEl) titleEl.textContent = 'Team';
      renderWorkersTab(container);
      break;
    case 'pricing':
      if (titleEl) titleEl.textContent = 'Pricing';
      renderPricingTab(container);
      break;
    case 'invoices':
      if (titleEl) titleEl.textContent = 'Invoices';
      renderInvoicesTab(container);
      break;
    default:
      renderOverviewTab(container);
  }
}

function getInvoiceSeries(monthCount, currency) {
  const now = new Date();
  const months = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - monthCount + index + 1, 1);
    return {
      date,
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short' }),
      billed: 0,
      paid: 0
    };
  });
  const monthByKey = new Map(months.map(month => [month.key, month]));

  state.invoices.forEach(invoice => {
    if (invoice.status === 'void' || invoice.status === 'draft') return;
    if (String(invoice.currency || 'USD').toUpperCase() !== currency) return;
    const issued = new Date(invoice.issued_at);
    if (Number.isNaN(issued.getTime())) return;
    const key = `${issued.getFullYear()}-${String(issued.getMonth() + 1).padStart(2, '0')}`;
    const month = monthByKey.get(key);
    if (!month) return;
    const total = Math.max(0, Number(invoice.total) || 0);
    month.billed += total;
    if (invoice.status === 'paid') month.paid += total;
  });

  return months;
}

function renderRevenueChart(months, currency) {
  const hasActivity = months.some(month => month.billed > 0 || month.paid > 0);
  if (!hasActivity) return '<div class="chart-empty">No invoice activity in this period</div>';

  const width = months.length > 6 ? 820 : 640;
  const left = 54;
  const right = width - 18;
  const top = 18;
  const bottom = 164;
  const max = Math.max(1, ...months.map(month => Math.max(month.billed, month.paid)));
  const x = index => left + index * (right - left) / Math.max(1, months.length - 1);
  const y = value => bottom - value / max * (bottom - top);
  const billedPoints = months.map((month, index) => `${x(index)},${y(month.billed)}`).join(' ');
  const paidPoints = months.map((month, index) => `${x(index)},${y(month.paid)}`).join(' ');
  const compactCurrency = value => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
  const grid = [0, 0.5, 1].map(ratio => {
    const gridY = bottom - ratio * (bottom - top);
    return `<g><line class="chart-grid" x1="${left}" y1="${gridY}" x2="${right}" y2="${gridY}"></line><text class="chart-label" x="${left - 8}" y="${gridY + 4}" text-anchor="end">${escapeHtml(compactCurrency(max * ratio))}</text></g>`;
  }).join('');
  const labels = months.map((month, index) =>
    `<text class="chart-label" x="${x(index)}" y="190" text-anchor="middle">${escapeHtml(month.label)}</text>`
  ).join('');
  const points = (key, className) => months.map((month, index) =>
    `<circle class="${className}" cx="${x(index)}" cy="${y(month[key])}" r="4"><title>${escapeHtml(month.label)}: ${escapeHtml(formatCurrency(month[key], currency))}</title></circle>`
  ).join('');

  return `
    <svg class="revenue-chart" viewBox="0 0 ${width} 205" role="img" aria-label="Monthly billed and paid invoice totals">
      <title>Monthly billed and paid invoice totals</title>
      ${grid}
      <polyline class="chart-line-billed" points="${billedPoints}"></polyline>
      <polyline class="chart-line-paid" points="${paidPoints}"></polyline>
      ${points('billed', 'chart-point-billed')}
      ${points('paid', 'chart-point-paid')}
      ${labels}
    </svg>
  `;
}

function renderInvoiceStatusBreakdown() {
  const statuses = [
    { label: 'Paid', className: 'paid', matches: invoice => invoice.status === 'paid' },
    { label: 'Issued', className: 'open', matches: invoice => invoice.status === 'issued' },
    { label: 'Draft', className: 'draft', matches: invoice => invoice.status === 'draft' },
    { label: 'Voided', className: 'void', matches: invoice => invoice.status === 'void' }
  ];
  const total = state.invoices.length;
  if (!total) return '<div class="chart-empty">No invoices yet</div>';

  return `<div class="status-breakdown">${statuses.map(status => {
    const count = state.invoices.filter(status.matches).length;
    const share = count / total * 100;
    return `
      <div class="status-row">
        <div class="status-row-heading">
          <span>${status.label}</span>
          <strong>${count} <span style="font-weight: 400; color: var(--text-muted);">· ${Math.round(share)}%</span></strong>
        </div>
        <div class="status-track" role="img" aria-label="${status.label}: ${count} invoices, ${Math.round(share)} percent">
          <div class="status-fill status-fill-${status.className}" style="width: ${share}%"></div>
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

function renderOverviewTab(container) {
  const totalCapacity = state.slots.reduce((sum, slot) => sum + (Number(slot.capacity_units) || 0), 0);
  const totalFree = state.slots.reduce((sum, slot) => sum + (Number(slot.free_units) || 0), 0);
  const usedUnits = Math.max(0, totalCapacity - totalFree);
  const utilizationPct = totalCapacity > 0 ? Math.min(100, Math.round(usedUnits / totalCapacity * 100)) : 0;
  const monthCount = [6, 12].includes(Number(state.analyticsMonths)) ? Number(state.analyticsMonths) : 6;
  const currencies = [...new Set(state.invoices
    .filter(invoice => invoice.status !== 'void' && invoice.status !== 'draft')
    .map(invoice => String(invoice.currency || 'USD').toUpperCase()))];
  if (!currencies.includes(state.analyticsCurrency)) {
    state.analyticsCurrency = currencies.includes('USD') ? 'USD' : currencies[0] || 'USD';
  }
  const openBalance = state.invoices
    .filter(invoice => invoice.status === 'issued' && String(invoice.currency || 'USD').toUpperCase() === state.analyticsCurrency)
    .reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0);
  const openInvoiceCount = state.invoices.filter(invoice =>
    invoice.status === 'issued' && String(invoice.currency || 'USD').toUpperCase() === state.analyticsCurrency
  ).length;
  const months = getInvoiceSeries(monthCount, state.analyticsCurrency);
  const capacityPct = Math.max(0, Math.min(100, Number(state.capacityMetrics.utilization_pct) || 0));
  const capacityColor = capacityPct > 90 ? 'var(--danger)' : 'var(--primary)';

  container.innerHTML = `
    <div class="overview-heading">
      <h2 class="overview-title">At a glance</h2>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-info"><h4>Clients</h4><div class="stat-value">${state.clients.length}</div></div>
        <div class="stat-icon-badge stat-icon-blue" aria-hidden="true">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2m16 0v-2a4 4 0 00-3-3.87M14 3.13a4 4 0 010 7.75M14 11a4 4 0 100-8 4 4 0 000 8zM10 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-info"><h4>Inventory items</h4><div class="stat-value">${state.items.length}</div></div>
        <div class="stat-icon-badge stat-icon-emerald" aria-hidden="true">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3l9 5-9 5-9-5 9-5zm-9 9l9 5 9-5M3 16l9 5 9-5"/></svg>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-info"><h4>Slot utilization</h4><div class="stat-value">${utilizationPct}%</div><div class="stat-subtext">${usedUnits.toFixed(1)} / ${totalCapacity.toFixed(1)} units</div></div>
        <div class="stat-icon-badge stat-icon-purple" aria-hidden="true">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 19V5m0 14h16M8 15v-4m4 4V7m4 8v-6m4 6V4"/></svg>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-info"><h4>Open invoices · ${escapeHtml(state.analyticsCurrency)}</h4><div class="stat-value">${formatCurrency(openBalance, state.analyticsCurrency)}</div><div class="stat-subtext">${openInvoiceCount} awaiting payment</div></div>
        <div class="stat-icon-badge stat-icon-amber" aria-hidden="true">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 2v20m5-15H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        </div>
      </div>
    </div>

    <div class="analytics-grid">
      <section class="panel" aria-labelledby="revenue-chart-title">
        <div class="panel-header">
          <h3 class="panel-title" id="revenue-chart-title">Billing</h3>
          <div class="panel-actions">
            <div class="revenue-legend" aria-label="Chart legend">
              <span><i class="legend-dot legend-billed"></i>Billed</span>
              <span><i class="legend-dot legend-paid"></i>Paid</span>
            </div>
            <select class="form-select analytics-period" aria-label="Billing chart date range" onchange="state.analyticsMonths = Number(this.value); renderOverviewTab($('#workspace-content'))">
              <option value="6" ${monthCount === 6 ? 'selected' : ''}>6 months</option>
              <option value="12" ${monthCount === 12 ? 'selected' : ''}>12 months</option>
            </select>
            ${currencies.length > 1 ? `
              <select class="form-select analytics-period" aria-label="Billing chart currency" onchange="state.analyticsCurrency = this.value; renderOverviewTab($('#workspace-content'))">
                ${currencies.map(currency => `<option value="${escapeHtml(currency)}" ${currency === state.analyticsCurrency ? 'selected' : ''}>${escapeHtml(currency)}</option>`).join('')}
              </select>
            ` : ''}
          </div>
        </div>
        <div class="panel-body">${renderRevenueChart(months, state.analyticsCurrency)}</div>
      </section>

      <section class="panel" aria-labelledby="invoice-status-title">
        <div class="panel-header"><h3 class="panel-title" id="invoice-status-title">Invoice status</h3></div>
        <div class="panel-body">${renderInvoiceStatusBreakdown()}</div>
      </section>
    </div>

    <div class="overview-bottom-grid">
      <section class="panel">
        <div class="panel-header"><h3 class="panel-title">Quick actions</h3></div>
        <div class="panel-body overview-actions">
          <button class="btn btn-primary" onclick="showNewIntakeModal()">Receive inventory</button>
          <button class="btn" onclick="showGenerateInvoiceModal()">New invoice</button>
          <button class="btn" onclick="showAddClientModal()">Add client</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header"><h3 class="panel-title">Warehouse capacity</h3></div>
        <div class="panel-body">
          <div class="status-row-heading" style="margin-bottom: 10px;">
            <span>Occupied</span><strong>${capacityPct}%</strong>
          </div>
          <div class="capacity-meter" role="img" aria-label="Warehouse capacity ${capacityPct} percent occupied">
            <div class="capacity-meter-fill" style="width: ${capacityPct}%; background: ${capacityColor}"></div>
          </div>
          <div class="status-row-heading" style="margin-top: 12px;">
            <span>${(Number(state.capacityMetrics.total_occupied_pallets) || 0).toFixed(1)} occupied</span>
            <strong>${(Number(state.capacityMetrics.available_rented_space) || 0).toFixed(1)} free</strong>
          </div>
          <button class="btn btn-sm" onclick="showAddCapacityBlockModal()" style="width: 100%; margin-top: 16px;">Add capacity</button>
        </div>
      </section>
    </div>
  `;
}

// ==========================================
// 2. STAFF & WORKERS IAM VIEW
// ==========================================
function renderWorkersTab(container) {
  const query = state.searchQueries.workers.toLowerCase();
  const filtered = state.workers.filter(w =>
    w.full_name.toLowerCase().includes(query) ||
    (w.email && w.email.toLowerCase().includes(query))
  );

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Team (${state.workers.length})</h3>
        </div>
        <div class="panel-actions">
          <input 
            type="text" 
            class="form-input" 
            placeholder="Search worker name or email..." 
            value="${escapeHtml(state.searchQueries.workers)}"
            oninput="state.searchQueries.workers = this.value; renderWorkersTab($('#workspace-content'))"
            style="width: 240px; font-size: 12.5px;"
          />
          <button class="btn btn-primary" onclick="showProvisionWorkerModal()">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span>Provision Worker</span>
          </button>
        </div>
      </div>

      ${filtered.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon-circle">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          </div>
          <div class="empty-title">No staff accounts provisioned</div>
          <div class="empty-desc">No team members yet.</div>
          <button class="btn btn-primary" onclick="showProvisionWorkerModal()">Provision First Worker</button>
        </div>
      ` : `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Login Email / Device Handle</th>
                <th>Access Status</th>
                <th>Provisioned On</th>
                <th style="text-align: right;">Access Controls</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(w => `
                <tr>
                  <td>
                    <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(w.full_name)}</div>
                    <div style="font-size: 11px; color: var(--text-light); font-family: monospace;">ID: ${escapeHtml(w.worker_id.slice(0, 8))}...</div>
                  </td>
                  <td><span style="font-family: monospace; font-size: 12.5px;">${escapeHtml(w.email || '—')}</span></td>
                  <td>
                    <span class="badge ${w.is_active ? 'badge-green' : 'badge-red'}">
                      ${w.is_active ? 'Active (Authorized)' : 'Suspended (Revoked)'}
                    </span>
                  </td>
                  <td>${formatDate(w.created_at)}</td>
                  <td style="text-align: right;">
                    <div style="display: inline-flex; gap: 8px;">
                      <button 
                        class="btn btn-sm ${w.is_active ? 'btn-danger' : 'btn-primary'}" 
                        onclick="handleToggleWorkerStatus('${w.worker_id}', '${escapeHtml(w.full_name)}', ${!w.is_active})"
                      >
                        ${w.is_active ? 'Suspend & Kick' : 'Reactivate'}
                      </button>
                      <button class="btn btn-sm" onclick="handleResetWorkerPassword('${w.worker_id}', '${escapeHtml(w.full_name)}')">
                        Reset Password
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function showProvisionWorkerModal() {
  const formHtml = `
    <div class="form-group">
      <label class="form-label">Worker Full Name *</label>
      <input type="text" id="modal-w-name" class="form-input" placeholder="e.g. Marcus Vance" required />
    </div>
    <div class="form-group">
      <label class="form-label">Email Handle (Optional)</label>
      <div style="font-size: 11.5px; color: var(--text-muted); margin-bottom: 4px;">
        Leave empty to auto-generate a secure internal device handle (e.g. marcus.vance.104@eliteprepware.internal).
      </div>
      <input type="email" id="modal-w-email" class="form-input" placeholder="marcus@eliteprepware.internal" />
    </div>
  `;

  openModal('Provision Warehouse Worker Account', formHtml, async (modal) => {
    const fullName = modal.querySelector('#modal-w-name').value.trim();
    const email = modal.querySelector('#modal-w-email').value.trim();

    if (!fullName) {
      showToast('Worker full name is required', 'error');
      return false;
    }

    const payload = { full_name: fullName };
    if (email) payload.email = email;

    const data = await api('/api/auth/workers', {
      method: 'POST',
      body: payload
    });

    // Show credential handout dialog
    showCredentialHandoutModal(data);
    await loadInitialData();
    return true;
  }, 'Provision & Generate Credentials');
}

function showCredentialHandoutModal(cred) {
  const bodyHtml = `
    <div style="background: var(--surface-subtle); padding: 18px; border-radius: var(--radius-md); border: 1px solid var(--border);">
      <div style="font-weight: 700; color: var(--success-text); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
        <span>Worker Account Ready for Handout</span>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13.5px;">
        <div><b>Staff Member:</b> ${escapeHtml(cred.full_name)}</div>
        <div><b>Login Email:</b> <span style="font-family: monospace; background: white; padding: 2px 6px; border: 1px solid var(--border); border-radius: 4px;">${escapeHtml(cred.email)}</span></div>
        <div><b>Generated Password:</b> <span style="font-family: monospace; font-size: 15px; font-weight: 700; color: var(--primary); background: white; padding: 3px 8px; border: 1px solid var(--border); border-radius: 4px;">${escapeHtml(cred.temporary_password || cred.new_password)}</span></div>
      </div>
    </div>
    <div style="font-size: 12px; color: var(--text-muted); margin-top: 10px;">
      Copy or write down these credentials and hand them to the warehouse worker for their mobile scanner.
    </div>
  `;

  openModal('Worker Credentials Handout', bodyHtml, null);
}

async function handleToggleWorkerStatus(workerId, name, newStatus) {
  const actionText = newStatus ? 'Reactivate' : 'Suspend and immediately kill device session for';
  if (!confirm(`${actionText} worker "${name}"?`)) return;

  try {
    await api(`/api/auth/workers/${workerId}/status`, {
      method: 'PATCH',
      body: { is_active: newStatus }
    });
    showToast(`Worker access ${newStatus ? 'reactivated' : 'revoked'}`, 'success');
    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleResetWorkerPassword(workerId, name) {
  if (!confirm(`Generate new temporary credentials for "${name}"?`)) return;

  try {
    const data = await api(`/api/auth/workers/${workerId}/reset-password`, {
      method: 'POST'
    });
    data.full_name = name;
    showCredentialHandoutModal(data);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// 3. STORAGE & ELASTIC CAPACITY BLOCKS VIEW
// ==========================================
function renderStorageTab(container) {
  const query = state.searchQueries.items.toLowerCase();
  const filteredItems = state.items.filter(i => 
    i.name.toLowerCase().includes(query) ||
    (i.clients?.company_name && i.clients.company_name.toLowerCase().includes(query)) ||
    (i.sku && i.sku.toLowerCase().includes(query))
  );

  container.innerHTML = `
    <!-- Elastic Capacity Blocks & Gatekeeper Card -->
    <div class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            Capacity blocks (${state.capacityBlocks.length})
          </h3>
        </div>
        <div class="panel-actions">
          <button class="btn btn-sm btn-primary" onclick="showAddCapacityBlockModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Rent Capacity Block
          </button>
          <button class="btn btn-sm" onclick="handleTriggerLeaseExpiration()">
            Check leases
          </button>
        </div>
      </div>

      <div class="panel-body">
        ${state.capacityBlocks.length === 0 ? `
          <div style="font-size: 13px; color: var(--text-muted); background: var(--surface-subtle); padding: 14px; border-radius: var(--radius-md);">
            No capacity blocks.
          </div>
        ` : `
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-bottom: 16px;">
            ${state.capacityBlocks.map(b => `
              <div style="border: 1px solid var(--border); padding: 12px; border-radius: var(--radius-md); background: var(--surface-subtle);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <b>${escapeHtml(b.name || 'Capacity Block')}</b>
                  <span class="badge ${b.status === 'active' ? 'badge-green' : 'badge-red'}">${escapeHtml(b.status)}</span>
                </div>
                <div style="font-size: 16px; font-weight: 700; color: var(--text-main);">${b.pallet_count} Pallet Units</div>
                <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">
                  Expires: ${formatDate(b.end_date)}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>

    <!-- Warehouse Rack Visualizer Panel -->
    <div class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">
            Rack slots (${state.slots.length})
          </h3>
        </div>
        <div class="panel-actions">
          <button class="btn btn-sm" onclick="showAddSlotModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Add Rack Slot
          </button>
          <button class="btn btn-sm btn-primary" onclick="showRebalanceOptimizer()">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Rebalance Layout
          </button>
        </div>
      </div>

      <div class="panel-body">
        ${state.slots.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon-circle">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
            </div>
            <div class="empty-title">No storage slots configured</div>
            <div class="empty-desc">No rack slots yet.</div>
            <button class="btn btn-primary" onclick="showAddSlotModal()">Add First Rack Slot</button>
          </div>
        ` : `
          <div class="warehouse-grid">
            ${state.slots.map(s => {
              const cap = Number(s.capacity_units) || 1;
              const free = Number(s.free_units) || 0;
              const used = Math.max(0, cap - free);
              const fillPct = Math.round((used / cap) * 100);
              const fillClass = fillPct >= 95 ? 'full' : fillPct > 60 ? 'warn' : '';

              return `
                <div class="slot-card" style="${!s.active ? 'opacity: 0.55; background: var(--surface-alt);' : ''}">
                  <div class="slot-header">
                    <span class="slot-code">${escapeHtml(s.code)}</span>
                    <span class="badge ${s.active ? 'badge-blue' : 'badge-red'}" style="font-size: 10px; padding: 1px 6px;">
                      ${s.active ? (s.zone ? escapeHtml(s.zone) : 'Active') : 'Inactive'}
                    </span>
                  </div>
                  
                  <div class="slot-progress-bar">
                    <div class="slot-progress-fill ${fillClass}" style="width: ${fillPct}%;"></div>
                  </div>

                  <div class="slot-footer">
                    <span>${free.toFixed(1)} / ${cap.toFixed(1)} free</span>
                    <span title="Distance from loading dock">${Number(s.distance)}m dock</span>
                  </div>

                  <div style="margin-top: 4px; display: flex; justify-content: flex-end;">
                    <button class="btn btn-sm btn-icon-only" title="${s.active ? 'Deactivate Slot' : 'Activate Slot'}" onclick="toggleSlotStatus('${s.id}', ${!s.active})">
                      <span style="font-size: 10px; color: ${s.active ? 'var(--text-muted)' : 'var(--success-text)'};">
                        ${s.active ? 'Deactivate' : 'Activate'}
                      </span>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    </div>

    <!-- Active Stored Inventory Table -->
    <div class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Inventory (${state.items.length})</h3>
        </div>
        <div class="panel-actions">
          <input 
            type="text" 
            class="form-input" 
            placeholder="Search items, SKU, or client..." 
            value="${escapeHtml(state.searchQueries.items)}"
            oninput="state.searchQueries.items = this.value; renderStorageTab($('#workspace-content'))"
            style="width: 240px; font-size: 12.5px;"
          />
          <button class="btn btn-primary" onclick="showNewIntakeModal()">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span>Receive Intake</span>
          </button>
        </div>
      </div>

      ${filteredItems.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon-circle">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          </div>
          <div class="empty-title">No inventory in storage</div>
          <div class="empty-desc">${query ? 'No matching items.' : 'No inventory items yet.'}</div>
          <button class="btn btn-primary" onclick="showNewIntakeModal()">Receive First Shipment</button>
        </div>
      ` : `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Item & SKU</th>
                <th>Client</th>
                <th>Quantity</th>
                <th>Footprint (Units)</th>
                <th>Velocity Score</th>
                <th>Slot Placement</th>
                <th>Received On</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${filteredItems.map(item => {
                const openAssignment = item.item_assignments?.find(a => !a.released_at);
                const slotCode = openAssignment?.storage_slots?.code || 'Unplaced';

                return `
                  <tr>
                    <td>
                      <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(item.name)}</div>
                      ${item.sku ? `<div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">SKU: ${escapeHtml(item.sku)}</div>` : ''}
                    </td>
                    <td><b>${escapeHtml(item.clients?.company_name || '—')}</b></td>
                    <td>${item.quantity}</td>
                    <td>${Number(item.size_units).toFixed(1)}</td>
                    <td>
                      <span class="badge ${item.velocity >= 7 ? 'badge-blue' : item.velocity >= 4 ? 'badge-amber' : 'badge-gray'}" title="Turnover speed: 1 (slow) to 10 (rapid)">
                        Velocity: ${item.velocity}
                      </span>
                    </td>
                    <td>
                      <span class="badge ${slotCode === 'Unplaced' ? 'badge-red' : 'badge-green'}">
                        ${escapeHtml(slotCode)}
                      </span>
                    </td>
                    <td>${formatDate(item.received_at)}</td>
                    <td style="text-align: right;">
                      <button class="btn btn-sm btn-danger" onclick="handleReleaseItem('${item.id}', '${escapeHtml(item.name)}')">
                        Release / Depart
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function showAddCapacityBlockModal() {
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const formHtml = `
    <div class="form-group">
      <label class="form-label">Capacity Block Name</label>
      <input type="text" id="modal-cb-name" class="form-input" placeholder="e.g. Q4 Peak Rental, East Bay Section" />
    </div>
    <div class="form-group">
      <label class="form-label">Rented Pallet Count *</label>
      <input type="number" id="modal-cb-pallets" class="form-input" placeholder="100" min="1" step="1" required />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Lease Start Date *</label>
        <input type="date" id="modal-cb-start" class="form-input" value="${today}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Lease End Date *</label>
        <input type="date" id="modal-cb-end" class="form-input" value="${nextMonth}" required />
      </div>
    </div>
  `;

  openModal('Rent Capacity Block (Elastic Storage)', formHtml, async (modal) => {
    const name = modal.querySelector('#modal-cb-name').value.trim();
    const count = parseFloat(modal.querySelector('#modal-cb-pallets').value);
    const start = modal.querySelector('#modal-cb-start').value;
    const end = modal.querySelector('#modal-cb-end').value;

    if (isNaN(count) || count <= 0 || !end) {
      showToast('Please provide a valid pallet count and lease end date', 'error');
      return false;
    }

    await api('/api/storage/capacity-blocks', {
      method: 'POST',
      body: {
        name: name || undefined,
        pallet_count: count,
        start_date: start,
        end_date: end,
        status: 'active'
      }
    });

    showToast(`Capacity Block (${count} pallets) added`, 'success');
    await loadInitialData();
    return true;
  }, 'Add Capacity Block');
}

async function handleTriggerLeaseExpiration() {
  try {
    showToast('Scanning active capacity block lease dates...', 'info');
    const res = await api('/api/storage/capacity-blocks/expire-check', { method: 'POST' });
    showToast(`Scan complete: ${res.expired_blocks_count} expired blocks flagged, ${res.displaced_items_count} items flagged for relocation`, 'success');
    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showAddSlotModal() {
  const formHtml = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Slot Code *</label>
        <input type="text" id="modal-s-code" class="form-input" placeholder="e.g. A-101, B-04" required />
      </div>
      <div class="form-group">
        <label class="form-label">Zone</label>
        <input type="text" id="modal-s-zone" class="form-input" placeholder="e.g. Ground, Mezzanine" />
      </div>
    </div>
    <div class="form-row" style="margin-top: 14px;">
      <div class="form-group">
        <label class="form-label">Distance from Dock (meters) *</label>
        <input type="number" id="modal-s-dist" class="form-input" placeholder="15" min="0" required />
      </div>
      <div class="form-group">
        <label class="form-label">Capacity (Pallet Units) *</label>
        <input type="number" id="modal-s-cap" class="form-input" value="1" min="1" step="0.5" required />
      </div>
    </div>
  `;

  openModal('Add Warehouse Storage Slot', formHtml, async (modal) => {
    const code = modal.querySelector('#modal-s-code').value.trim();
    const dist = parseFloat(modal.querySelector('#modal-s-dist').value);
    const cap = parseFloat(modal.querySelector('#modal-s-cap').value);

    if (!code || isNaN(dist) || isNaN(cap)) {
      showToast('Please provide a valid code, distance, and capacity', 'error');
      return false;
    }

    const payload = { code, distance: dist, capacity_units: cap };
    const zone = modal.querySelector('#modal-s-zone').value.trim();
    if (zone) payload.zone = zone;

    await api('/api/storage/slots', { method: 'POST', body: payload });
    showToast(`Slot ${code} added to warehouse`, 'success');
    await loadInitialData();
    return true;
  }, 'Add Slot');
}

async function toggleSlotStatus(slotId, newStatus) {
  try {
    await api(`/api/storage/slots/${slotId}`, {
      method: 'PATCH',
      body: { active: newStatus }
    });
    showToast(`Slot status updated`, 'success');
    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showNewIntakeModal() {
  if (state.clients.length === 0) {
    showToast('Please register at least one client before receiving an intake', 'error');
    showAddClientModal();
    return;
  }

  const clientOpts = state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.company_name)}</option>`).join('');

  const formHtml = `
    <div class="form-group">
      <label class="form-label">Client / Seller Account *</label>
      <select id="modal-i-client" class="form-select">${clientOpts}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Intake Reference / PO # / BOL</label>
      <input type="text" id="modal-i-ref" class="form-input" placeholder="e.g. PO-84920, Inbound LTL" />
    </div>
    <div class="form-group">
      <label class="form-label">Inventory Items (Format: Name, Quantity, Size Units, Velocity)</label>
      <div style="font-size: 11.5px; color: var(--text-muted); margin-bottom: 4px;">
        Format: One item per line. Velocity = 1 (slow) to 10 (rapid turnover).
      </div>
      <textarea id="modal-i-lines" class="form-textarea" rows="4" placeholder="Apple iPhone Cases, 200, 1.5, 9&#10;Yoga Mats, 50, 2.0, 4"></textarea>
    </div>
  `;

  openModal('Receive Inbound Shipment (Gatekeeper Protected)', formHtml, async (modal) => {
    const clientId = modal.querySelector('#modal-i-client').value;
    const ref = modal.querySelector('#modal-i-ref').value.trim();
    const rawLines = modal.querySelector('#modal-i-lines').value.trim();

    if (!rawLines) {
      showToast('Please enter at least one item', 'error');
      return false;
    }

    const items = rawLines.split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        const parts = line.split(',').map(p => p.trim());
        return {
          name: parts[0] || 'Unnamed Product',
          quantity: parseInt(parts[1], 10) || 1,
          size_units: parseFloat(parts[2]) || 1,
          velocity: parseFloat(parts[3]) || 1
        };
      });

    const payload = { client_id: clientId, items };
    if (ref) payload.reference = ref;

    const res = await api('/api/storage/intakes', { method: 'POST', body: payload });
    showToast(`Placed ${res.placed} items automatically! (${res.unplaced.length} unplaced)`, 'success');
    await loadInitialData();
    return true;
  }, 'Authorize Intake & Auto-Slot');
}

async function handleReleaseItem(itemId, itemName) {
  if (!confirm(`Confirm releasing "${itemName}" from the warehouse? This will mark it as departed and free up the storage slot.`)) {
    return;
  }

  try {
    await api(`/api/storage/items/${itemId}/release`, { method: 'POST' });
    showToast(`Item "${itemName}" departed warehouse`, 'success');
    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function showRebalanceOptimizer() {
  try {
    showToast('Calculating optimal warehouse layout with FFD + Min-Heap...', 'info');
    const plan = await api('/api/storage/rebalance');
    state.rebalancePlan = plan;

    const moves = plan.moves || [];
    const mustMove = plan.mustMove || [];
    const unplaced = plan.unplaced || [];

    const getItemName = (id) => state.items.find(i => i.id === id)?.name || id;
    const getSlotCode = (id) => state.slots.find(s => s.id === id)?.code || id;

    const bodyHtml = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="font-size: 13.5px; color: var(--text-muted);">
          Our optimization algorithm matches fast-moving goods (high turnover velocity) with rack locations closest to the loading dock to minimize warehouse traversal times.
        </div>

        ${mustMove.length > 0 ? `
          <div style="background: var(--danger-subtle); border: 1px solid var(--danger-border); padding: 12px; border-radius: var(--radius-md);">
            <div style="font-weight: 600; color: var(--danger-text); font-size: 13px;">Critical Moves Required (${mustMove.length} items in inactive slots)</div>
            <div style="font-size: 12px; margin-top: 4px;">${mustMove.map(id => escapeHtml(getItemName(id))).join(', ')}</div>
          </div>
        ` : ''}

        ${moves.length === 0 ? `
          <div style="text-align: center; padding: 24px 0; color: var(--success-text); font-weight: 600;">
            Warehouse layout is already optimal! No moves needed.
          </div>
        ` : `
          <div>
            <div style="font-weight: 600; font-size: 13.5px; margin-bottom: 8px;">Recommended Relocations (${moves.length} moves)</div>
            <div style="max-height: 220px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-md);">
              <table class="data-table" style="font-size: 12.5px;">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Current Slot</th>
                    <th>Target Slot</th>
                    <th>Efficiency Gain</th>
                  </tr>
                </thead>
                <tbody>
                  ${moves.map(m => `
                    <tr>
                      <td><b>${escapeHtml(getItemName(m.itemId))}</b></td>
                      <td><span class="badge badge-gray">${escapeHtml(getSlotCode(m.fromSlotId))}</span></td>
                      <td><span class="badge badge-blue">${escapeHtml(getSlotCode(m.toSlotId))}</span></td>
                      <td><span class="badge badge-green">+${m.benefit} pts</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `}

        ${unplaced.length > 0 ? `
          <div style="font-size: 12px; color: var(--warning-text);">
            Notice: No available capacity to place: ${unplaced.map(id => escapeHtml(getItemName(id))).join(', ')}
          </div>
        ` : ''}
      </div>
    `;

    openModal('Warehouse Slotting & Rebalance Plan', bodyHtml, moves.length > 0 ? async () => {
      const res = await api('/api/storage/rebalance/apply', { method: 'POST' });
      showToast(`Relocation applied: Moved ${res.moved} items to optimal slots`, 'success');
      await loadInitialData();
      return true;
    } : null, 'Apply Relocation Plan', 'btn-primary');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// 4. CLIENTS MANAGEMENT VIEW
// ==========================================
function renderClientsTab(container) {
  const query = state.searchQueries.clients.toLowerCase();
  const filtered = state.clients.filter(c => 
    c.company_name.toLowerCase().includes(query) ||
    (c.email && c.email.toLowerCase().includes(query)) ||
    (c.tax_id && c.tax_id.toLowerCase().includes(query))
  );

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Clients (${state.clients.length})</h3>
        </div>
        <div class="panel-actions">
          <input 
            type="text" 
            class="form-input" 
            placeholder="Search company or email..." 
            value="${escapeHtml(state.searchQueries.clients)}"
            oninput="state.searchQueries.clients = this.value; renderClientsTab($('#workspace-content'))"
            style="width: 240px; font-size: 12.5px;"
          />
          <button class="btn btn-primary" onclick="showAddClientModal()">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span>Add Client</span>
          </button>
        </div>
      </div>

      ${filtered.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon-circle">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
          </div>
          <div class="empty-title">No clients found</div>
          <div class="empty-desc">${query ? 'No matching clients.' : 'No clients yet.'}</div>
          <button class="btn btn-primary" onclick="showAddClientModal()">Register Client</button>
        </div>
      ` : `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Billing Email</th>
                <th>Billing Address</th>
                <th>Tax ID / EIN</th>
                <th>Registered On</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(c => `
                <tr>
                  <td>
                    <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(c.company_name)}</div>
                    <div style="font-size: 11px; color: var(--text-light); font-family: monospace;">${escapeHtml(c.id.slice(0, 8))}...</div>
                  </td>
                  <td>${c.email ? `<a href="mailto:${escapeHtml(c.email)}" style="color: var(--primary); text-decoration: none;">${escapeHtml(c.email)}</a>` : '<span style="color: var(--text-light)">—</span>'}</td>
                  <td>${escapeHtml(c.billing_address || '—')}</td>
                  <td>${c.tax_id ? `<span class="badge badge-gray">${escapeHtml(c.tax_id)}</span>` : '<span style="color: var(--text-light)">—</span>'}</td>
                  <td>${formatDate(c.created_at)}</td>
                  <td style="text-align: right;">
                    <button class="btn btn-sm" onclick="showClientDetailsModal('${c.id}')">View Details</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function showAddClientModal() {
  const formHtml = `
    <div class="form-group">
      <label class="form-label">Company Name *</label>
      <input type="text" id="modal-c-name" class="form-input" placeholder="e.g. Apex Commerce LLC" required />
    </div>
    <div class="form-group">
      <label class="form-label">Billing Contact Email</label>
      <input type="email" id="modal-c-email" class="form-input" placeholder="billing@apexcommerce.com" />
    </div>
    <div class="form-group">
      <label class="form-label">Billing Address</label>
      <textarea id="modal-c-address" class="form-textarea" rows="2" placeholder="100 Warehouse Way, Suite 400, Chicago, IL 60601"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Tax ID / EIN / VAT</label>
      <input type="text" id="modal-c-tax" class="form-input" placeholder="XX-XXXXXXX" />
    </div>
  `;

  openModal('Register New Client Account', formHtml, async (modal) => {
    const name = modal.querySelector('#modal-c-name').value.trim();
    if (!name) {
      showToast('Company name is required', 'error');
      return false;
    }

    const payload = { company_name: name };
    const email = modal.querySelector('#modal-c-email').value.trim();
    const address = modal.querySelector('#modal-c-address').value.trim();
    const tax = modal.querySelector('#modal-c-tax').value.trim();

    if (email) payload.email = email;
    if (address) payload.billing_address = address;
    if (tax) payload.tax_id = tax;

    await api('/api/clients', { method: 'POST', body: payload });
    showToast(`Client "${name}" registered successfully`, 'success');
    await loadInitialData();
    return true;
  }, 'Create Client');
}

function showClientDetailsModal(clientId) {
  const client = state.clients.find(c => c.id === clientId);
  if (!client) return;

  const clientItems = state.items.filter(i => i.client_id === clientId);
  const clientInvoices = state.invoices.filter(i => i.client_id === clientId);

  const bodyHtml = `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <div style="background: var(--surface-subtle); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border);">
        <div style="font-size: 16px; font-weight: 700;">${escapeHtml(client.company_name)}</div>
        <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Email: ${escapeHtml(client.email || 'N/A')}</div>
        <div style="font-size: 13px; color: var(--text-muted);">Address: ${escapeHtml(client.billing_address || 'N/A')}</div>
        <div style="font-size: 13px; color: var(--text-muted);">Tax ID: ${escapeHtml(client.tax_id || 'N/A')}</div>
      </div>

      <div>
        <div style="font-weight: 600; font-size: 13.5px; margin-bottom: 6px;">Inventory in Warehouse (${clientItems.length} items)</div>
        ${clientItems.length === 0 ? '<div style="font-size: 13px; color: var(--text-muted);">No inventory currently stored for this client.</div>' : `
          <div style="max-height: 140px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-sm);">
            <table class="data-table" style="font-size: 12px;">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Footprint</th>
                </tr>
              </thead>
              <tbody>
                ${clientItems.map(i => `
                  <tr>
                    <td>${escapeHtml(i.name)}</td>
                    <td>${i.quantity}</td>
                    <td>${i.size_units} units</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <div>
        <div style="font-weight: 600; font-size: 13.5px; margin-bottom: 6px;">Invoices (${clientInvoices.length})</div>
        ${clientInvoices.length === 0 ? '<div style="font-size: 13px; color: var(--text-muted);">No invoices generated yet.</div>' : `
          <div style="font-size: 12.5px; color: var(--text-muted);">
            ${clientInvoices.map(inv => `
              <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border);">
                <span><b>${escapeHtml(inv.invoice_number)}</b> (${formatDate(inv.period_start)} to ${formatDate(inv.period_end)})</span>
                <span style="font-weight: 600;">${formatCurrency(inv.total, inv.currency)}</span>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  openModal(`Client Profile: ${client.company_name}`, bodyHtml, null);
}

// ==========================================
// 5. PRICING & RATE CARDS VIEW
// ==========================================
function renderPricingTab(container) {
  container.innerHTML = `
    <!-- Pricing Types Panel -->
    <div class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Pricing types (${state.pricingTypes.length})</h3>
        </div>
        <div class="panel-actions">
          <button class="btn btn-primary btn-sm" onclick="showAddPricingTypeModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Add Pricing Type
          </button>
        </div>
      </div>

      ${state.pricingTypes.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon-circle">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
          </div>
          <div class="empty-title">No pricing types configured</div>
          <div class="empty-desc">No pricing types yet.</div>
          <button class="btn btn-primary" onclick="showAddPricingTypeModal()">Create First Pricing Type</button>
        </div>
      ` : `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Service / Fee Name</th>
                <th>Billing Basis</th>
                <th>Status</th>
                <th>Created</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${state.pricingTypes.map(t => {
                const basisLabel = t.billing_basis === 'flat' ? 'Flat Fee' : t.billing_basis === 'per_unit' ? 'Per Unit' : 'Per Unit / Month';
                return `
                  <tr>
                    <td><b>${escapeHtml(t.name)}</b></td>
                    <td><span class="badge badge-blue">${basisLabel}</span></td>
                    <td><span class="badge ${t.archived_at ? 'badge-red' : 'badge-green'}">${t.archived_at ? 'Archived' : 'Active'}</span></td>
                    <td>${formatDate(t.created_at)}</td>
                    <td style="text-align: right;">
                      ${!t.archived_at ? `
                        <button class="btn btn-sm btn-danger" onclick="archivePricingType('${t.id}', '${escapeHtml(t.name)}')">Archive</button>
                      ` : ''}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <!-- Client Rate Overrides & Item Specific Rates Grid -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
      
      <!-- Client Rate Overrides Card -->
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Client rates</h3>
          </div>
          <button class="btn btn-sm btn-primary" onclick="showAddOverrideModal()">Add Override</button>
        </div>
        <div class="panel-body">
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
            Client-specific rates take precedence.
          </div>
          <button class="btn btn-sm" onclick="showAddOverrideModal()">Set Up Client Custom Rate</button>
        </div>
      </div>

      <!-- Item Specific Pricing Card -->
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Item pricing</h3>
          </div>
          <button class="btn btn-sm btn-primary" onclick="showAttachPriceModal()">Attach Price</button>
        </div>
        <div class="panel-body">
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
            Link any stored item with a pricing type to bill per pallet, per pick, or per monthly retention.
          </div>
          <button class="btn btn-sm" onclick="showAttachPriceModal()">Link Item Rate</button>
        </div>
      </div>

    </div>
  `;
}

function showAddPricingTypeModal() {
  const formHtml = `
    <div class="form-group">
      <label class="form-label">Service Fee Name *</label>
      <input type="text" id="modal-pt-name" class="form-input" placeholder="e.g. Pallet Rent, Container Unloading, Moving" required />
    </div>
    <div class="form-group">
      <label class="form-label">Billing Calculation Basis *</label>
      <select id="modal-pt-basis" class="form-select">
        <option value="per_period">Per Unit Per Month (Recurring storage)</option>
        <option value="per_unit">Per Unit (Prep & packing handling)</option>
        <option value="flat">Flat Fee (One-off service charge)</option>
      </select>
    </div>
  `;

  openModal('Create New Pricing Type', formHtml, async (modal) => {
    const name = modal.querySelector('#modal-pt-name').value.trim();
    const basis = modal.querySelector('#modal-pt-basis').value;

    if (!name) {
      showToast('Name is required', 'error');
      return false;
    }

    await api('/api/pricing/types', {
      method: 'POST',
      body: { name, billing_basis: basis }
    });

    showToast(`Pricing type "${name}" created`, 'success');
    await loadInitialData();
    return true;
  }, 'Create Type');
}

async function archivePricingType(id, name) {
  if (!confirm(`Archive pricing type "${name}"?`)) return;
  try {
    await api(`/api/pricing/types/${id}`, { method: 'DELETE' });
    showToast(`Pricing type archived`, 'success');
    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showAddOverrideModal() {
  if (state.clients.length === 0 || state.pricingTypes.length === 0) {
    showToast('Requires at least one client and one pricing type', 'error');
    return;
  }

  const clientOpts = state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.company_name)}</option>`).join('');
  const typeOpts = state.pricingTypes.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');

  const formHtml = `
    <div class="form-group">
      <label class="form-label">Client *</label>
      <select id="modal-o-client" class="form-select">${clientOpts}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Pricing Type *</label>
      <select id="modal-o-type" class="form-select">${typeOpts}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Negotiated Rate Amount (USD) *</label>
      <input type="number" id="modal-o-amount" class="form-input" placeholder="25.00" step="0.01" min="0" required />
    </div>
  `;

  openModal('Set Client Rate Override', formHtml, async (modal) => {
    const clientId = modal.querySelector('#modal-o-client').value;
    const typeId = modal.querySelector('#modal-o-type').value;
    const amount = parseFloat(modal.querySelector('#modal-o-amount').value);

    if (isNaN(amount) || amount < 0) {
      showToast('Please enter a valid amount', 'error');
      return false;
    }

    await api('/api/pricing/overrides', {
      method: 'POST',
      body: { client_id: clientId, pricing_type_id: typeId, amount }
    });

    showToast('Client rate override saved', 'success');
    return true;
  }, 'Save Override');
}

function showAttachPriceModal() {
  if (state.items.length === 0 || state.pricingTypes.length === 0) {
    showToast('Requires active inventory items and pricing types', 'error');
    return;
  }

  const itemOpts = state.items.map(i => `<option value="${i.id}">${escapeHtml(i.name)} (${escapeHtml(i.clients?.company_name || 'No client')})</option>`).join('');
  const typeOpts = state.pricingTypes.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');

  const formHtml = `
    <div class="form-group">
      <label class="form-label">Inventory Item *</label>
      <select id="modal-ap-item" class="form-select">${itemOpts}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Pricing Type *</label>
      <select id="modal-ap-type" class="form-select">${typeOpts}</select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Amount *</label>
        <input type="number" id="modal-ap-amount" class="form-input" placeholder="15.00" step="0.01" min="0" required />
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <input type="text" id="modal-ap-currency" class="form-input" value="USD" maxlength="3" />
      </div>
    </div>
  `;

  openModal('Attach Price Rate to Item', formHtml, async (modal) => {
    const itemId = modal.querySelector('#modal-ap-item').value;
    const typeId = modal.querySelector('#modal-ap-type').value;
    const amount = parseFloat(modal.querySelector('#modal-ap-amount').value);
    const currency = modal.querySelector('#modal-ap-currency').value.trim().toUpperCase() || 'USD';

    if (isNaN(amount) || amount < 0) {
      showToast('Please enter a valid amount', 'error');
      return false;
    }

    await api(`/api/pricing/items/${itemId}`, {
      method: 'POST',
      body: { pricing_type_id: typeId, amount, currency }
    });

    showToast('Price attached to item', 'success');
    return true;
  }, 'Attach Price');
}

// ==========================================
// 6. INVOICING & BILLING VIEW
// ==========================================
function renderInvoicesTab(container) {
  const query = state.searchQueries.invoices.toLowerCase();
  const filtered = state.invoices.filter(inv =>
    inv.invoice_number.toLowerCase().includes(query) ||
    (inv.clients?.company_name && inv.clients.company_name.toLowerCase().includes(query)) ||
    inv.status.toLowerCase().includes(query)
  );

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Invoices (${state.invoices.length})</h3>
        </div>
        <div class="panel-actions">
          <input 
            type="text" 
            class="form-input" 
            placeholder="Search invoice # or client..." 
            value="${escapeHtml(state.searchQueries.invoices)}"
            oninput="state.searchQueries.invoices = this.value; renderInvoicesTab($('#workspace-content'))"
            style="width: 240px; font-size: 12.5px;"
          />
          <button class="btn btn-primary" onclick="showGenerateInvoiceModal()">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span>Generate Invoice</span>
          </button>
        </div>
      </div>

      ${filtered.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon-circle">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z"/></svg>
          </div>
          <div class="empty-title">No invoices found</div>
          <div class="empty-desc">${query ? 'No matching invoices.' : 'No invoices yet.'}</div>
          <button class="btn btn-primary" onclick="showGenerateInvoiceModal()">Generate First Invoice</button>
        </div>
      ` : `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Client</th>
                <th>Billing Period</th>
                <th>Subtotal</th>
                <th>Tax</th>
                <th>Total Due</th>
                <th>Status</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(inv => {
                const statusBadge = inv.status === 'paid' 
                  ? 'badge-green' 
                  : inv.status === 'void' 
                  ? 'badge-red' 
                  : 'badge-amber';

                return `
                  <tr>
                    <td>
                      <div style="font-weight: 700; color: var(--text-main); font-family: monospace;">${escapeHtml(inv.invoice_number)}</div>
                      <div style="font-size: 11px; color: var(--text-muted);">${formatDate(inv.issued_at)}</div>
                    </td>
                    <td><b>${escapeHtml(inv.clients?.company_name || '—')}</b></td>
                    <td>${formatDate(inv.period_start)} to ${formatDate(inv.period_end)}</td>
                    <td>${formatCurrency(inv.subtotal, inv.currency)}</td>
                    <td>${formatCurrency(inv.tax, inv.currency)}</td>
                    <td><b style="font-size: 14px;">${formatCurrency(inv.total, inv.currency)}</b></td>
                    <td><span class="badge ${statusBadge}">${escapeHtml(inv.status.toUpperCase())}</span></td>
                    <td style="text-align: right;">
                      <div style="display: inline-flex; gap: 6px;">
                        <button class="btn btn-sm" onclick="downloadInvoicePdf('${inv.id}')" title="Download PDF Document">
                          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          PDF
                        </button>
                        ${inv.status === 'issued' ? `
                          <button class="btn btn-sm" onclick="updateInvoiceStatus('${inv.id}', 'paid')" style="color: var(--success-text); border-color: var(--success-border);" title="Mark as Paid">
                            Mark Paid
                          </button>
                          <button class="btn btn-sm btn-danger" onclick="updateInvoiceStatus('${inv.id}', 'void')" title="Void Invoice">
                            Void
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function showGenerateInvoiceModal() {
  if (state.clients.length === 0) {
    showToast('Please register a client first', 'error');
    return;
  }

  const clientOpts = state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.company_name)}</option>`).join('');
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  const formHtml = `
    <div class="form-group">
      <label class="form-label">Client *</label>
      <select id="modal-inv-client" class="form-select">${clientOpts}</select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Period Start Date *</label>
        <input type="date" id="modal-inv-start" class="form-input" value="${monthStart}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Period End Date *</label>
        <input type="date" id="modal-inv-end" class="form-input" value="${today}" required />
      </div>
    </div>
    <div class="form-row" style="margin-top: 14px;">
      <div class="form-group">
        <label class="form-label">Tax Rate (%)</label>
        <input type="number" id="modal-inv-tax" class="form-input" value="0" min="0" max="100" step="0.1" />
      </div>
      <div class="form-group">
        <label class="form-label">Payment Due (Days)</label>
        <input type="number" id="modal-inv-due" class="form-input" value="30" min="1" />
      </div>
    </div>
  `;

  openModal('Generate Itemized Invoice', formHtml, async (modal) => {
    const clientId = modal.querySelector('#modal-inv-client').value;
    const start = modal.querySelector('#modal-inv-start').value;
    const end = modal.querySelector('#modal-inv-end').value;
    const taxPct = parseFloat(modal.querySelector('#modal-inv-tax').value) || 0;
    const dueDays = parseInt(modal.querySelector('#modal-inv-due').value, 10) || 30;

    if (!start || !end) {
      showToast('Please specify valid start and end dates', 'error');
      return false;
    }

    const payload = {
      client_id: clientId,
      period_start: start,
      period_end: end,
      tax_rate: taxPct / 100,
      due_days: dueDays,
      currency: 'USD'
    };

    const inv = await api('/api/invoices', { method: 'POST', body: payload });
    showToast(`Invoice ${inv.invoice_number} created successfully!`, 'success');
    await loadInitialData();
    return true;
  }, 'Generate & Calculate');
}

async function downloadInvoicePdf(invoiceId) {
  try {
    showToast('Generating secure PDF download link...', 'info');
    const res = await api(`/api/invoices/${invoiceId}/pdf-url`);
    if (res.url) {
      window.open(res.url, '_blank');
    } else {
      showToast('PDF is currently being compiled, please retry in a moment', 'info');
    }
  } catch (err) {
    showToast('Failed to retrieve PDF: ' + err.message, 'error');
  }
}

async function updateInvoiceStatus(invoiceId, newStatus) {
  if (!confirm(`Mark this invoice as ${newStatus}?`)) return;
  try {
    await api(`/api/invoices/${invoiceId}/status`, {
      method: 'PATCH',
      body: { status: newStatus }
    });
    showToast(`Invoice status updated to ${newStatus}`, 'success');
    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function setupDevCredentialFill() {
  const button = $('#fill-dev-credentials');
  if (!button) return;

  button.onclick = async () => {
    button.disabled = true;
    try {
      const response = await fetch('/auth/dev-credentials?fill=1', {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('Development login is unavailable.');
      const credentials = await response.json();
      if (!credentials.enabled || !credentials.email || !credentials.password) {
        throw new Error('Development login credentials are not configured.');
      }

      $('#input-email').value = credentials.email;
      $('#input-password').value = credentials.password;
      $('#login-error-msg').style.display = 'none';
      showToast('Development login filled', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      button.disabled = false;
    }
  };

  try {
    const response = await fetch('/auth/dev-credentials', {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    const { enabled } = await response.json();
    button.hidden = !enabled;
  } catch (err) {
    console.warn('Could not check development login availability:', err);
  }
}

// Initial Boot
window.addEventListener('DOMContentLoaded', () => {
  if (state.token) {
    showAppLayout();
    loadInitialData();
  } else {
    showLoginView();
    setupDevCredentialFill();
  }

  const toggleBtn = $('#toggle-password-btn');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      const pwInput = $('#input-password');
      const isPw = pwInput.type === 'password';
      pwInput.type = isPw ? 'text' : 'password';
      toggleBtn.textContent = isPw ? 'Hide' : 'Show';
      pwInput.focus();
    };
  }

  const loginForm = $('#login-form');
  if (loginForm) {
    loginForm.onsubmit = (e) => {
      e.preventDefault();
      const email = $('#input-email').value.trim();
      const pw = $('#input-password').value;
      if (email && pw) {
        handleLogin(email, pw);
      }
    };
  }

  // Mobile drawer controls
  const mobileToggle = $('#mobile-menu-toggle');
  const sidebar = $('.sidebar');
  const backdrop = $('#sidebar-backdrop');

  const toggleSidebar = (open) => {
    if (!sidebar || !backdrop) return;
    const shouldOpen = open !== undefined ? open : !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', shouldOpen);
    backdrop.classList.toggle('open', shouldOpen);
    document.body.classList.toggle('no-scroll', shouldOpen);
  };

  if (mobileToggle) {
    mobileToggle.onclick = () => toggleSidebar();
  }
  if (backdrop) {
    backdrop.onclick = () => toggleSidebar(false);
  }

  $$('.nav-item').forEach(btn => {
    btn.onclick = () => {
      switchTab(btn.dataset.tab);
      if (window.innerWidth <= 1024) {
        toggleSidebar(false);
      }
    };
  });

  $$('.btn-signout').forEach(btn => {
    btn.onclick = handleSignOut;
  });
});

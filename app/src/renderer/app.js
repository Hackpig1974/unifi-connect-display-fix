// ── State ─────────────────────────────────────────────────────────────────────
let config = {};
let versions = [];
let selectedVersion = null;
let downloading = false;
let versionInfo = {};
let lastDownloadedFile = null;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  config = await window.api.getConfig();
  versionInfo = await window.api.getVersion();

  applyTheme(config.theme || 'dark');
  updateThemeButtons(config.theme || 'dark');

  document.getElementById('credits-version').textContent = `v${versionInfo.version}`;

  // Show WebUI button if IP configured and file already downloaded
  // (button removed — handled by upload button directly)

  // Update check
  window.api.onUpdateAvailable((version) => {
    const banner = document.getElementById('update-banner');
    const text = document.getElementById('update-text');
    text.textContent = `⬆ Update available: v${version} — click to download`;
    text.onclick = () => window.api.openExternal(versionInfo.releasesUrl);
    banner.style.display = 'flex';
    const creditsUpdate = document.getElementById('credits-update');
    creditsUpdate.textContent = `⬆ v${version} available`;
    creditsUpdate.onclick = (e) => { e.preventDefault(); window.api.openExternal(versionInfo.releasesUrl); };
    creditsUpdate.style.display = '';
  });

  // Download progress
  window.api.onDownloadProgress(({ pct, received, total }) => {
    document.getElementById('progress-bar-fill').style.width = pct + '%';
    document.getElementById('progress-pct').textContent = pct + '%';
    const mb = (received / 1024 / 1024).toFixed(1);
    const total_mb = (total / 1024 / 1024).toFixed(1);
    document.getElementById('progress-text').textContent = `Downloading... ${mb} MB / ${total_mb} MB`;
  });

  // Auto-load versions on start
  loadVersions();
}

// ── Load versions ─────────────────────────────────────────────────────────────
async function loadVersions() {
  setStatus('loading', 'Fetching available versions from Ubiquiti...');
  const body = document.getElementById('version-body');
  body.innerHTML = '<tr><td colspan="5" class="empty-row">Loading...</td></tr>';
  document.getElementById('btn-download').disabled = true;
  selectedVersion = null;
  hideNextSteps();

  const result = await window.api.fetchVersions();

  if (!result.ok) {
    setStatus('error', 'Failed to fetch versions — check your internet connection.');
    body.innerHTML = `<tr><td colspan="5" class="empty-row">❌ Error: ${result.error}</td></tr>`;
    return;
  }

  versions = result.versions;
  renderVersions();
  setStatus('ok', `Loaded ${versions.length} available versions. Select one to download.`);
}

// ── Render version table ──────────────────────────────────────────────────────
function renderVersions() {
  const body = document.getElementById('version-body');
  body.innerHTML = '';

  versions.forEach((v) => {
    const tr = document.createElement('tr');
    if (v.latest) tr.classList.add('row-latest');

    const date = new Date(v.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const sizeMb = (v.size / 1024 / 1024).toFixed(1);
    const latestBadge = v.latest ? '<span class="badge">LATEST</span>' : '';
    const statusPill = v.latest
      ? '<span class="status-pill latest">✓ Latest</span>'
      : '<span class="status-pill available">Available</span>';

    tr.innerHTML = `
      <td><span class="version-num">${v.version}</span>${latestBadge}</td>
      <td><span class="date-text">${date}</span></td>
      <td><span class="size-text">${sizeMb} MB</span></td>
      <td>${statusPill}</td>
      <td></td>
    `;

    tr.addEventListener('click', () => selectVersion(v, tr));
    body.appendChild(tr);
  });
}

// ── Select version ────────────────────────────────────────────────────────────
function selectVersion(v, tr) {
  if (downloading) return;
  document.querySelectorAll('.version-table tbody tr').forEach(r => r.classList.remove('selected'));
  tr.classList.add('selected');
  selectedVersion = v;
  document.getElementById('btn-download').disabled = false;
  document.getElementById('btn-download').textContent = '⬇ Download Selected';
  document.getElementById('hint-text').textContent = `Selected: ${v.version} (${(v.size / 1024 / 1024).toFixed(1)} MB)`;
  hideNextSteps();
}

// ── Download ──────────────────────────────────────────────────────────────────
async function startDownload() {
  if (!selectedVersion || downloading) return;

  // Check download folder is set
  if (!config.downloadFolder) {
    showNoFolderWarning();
    return;
  }

  const urlParts = selectedVersion.url.split('/');
  const originalFilename = urlParts[urlParts.length - 1];
  // Build a friendly filename: protect-android-app-3.2.0-616.apk
  const cleanVersion = selectedVersion.version.replace(/^v/, '');
  const filename = `protect-android-app-${cleanVersion}.apk`;

  downloading = true;
  lastDownloadedFile = null;
  document.getElementById('btn-download').disabled = true;
  document.getElementById('btn-download').textContent = '⬇ Downloading...';
  document.getElementById('progress-section').style.display = '';
  document.getElementById('progress-bar-fill').style.width = '0%';
  document.getElementById('progress-pct').textContent = '0%';
  document.getElementById('progress-text').textContent = 'Starting download...';
  setStatus('loading', `Downloading ${selectedVersion.version}...`);
  hideNextSteps();

  const result = await window.api.downloadApk({
    url: selectedVersion.url,
    destFolder: config.downloadFolder,
    filename
  });

  downloading = false;

  if (result.ok) {
    lastDownloadedFile = result.path;
    document.getElementById('progress-bar-fill').style.width = '100%';
    document.getElementById('progress-pct').textContent = '100%';
    document.getElementById('progress-text').textContent = `✅ Saved: ${result.path}`;
    setStatus('ok', `Download complete — ${selectedVersion.version} ready to upload.`);

    // Flip button to Upload mode
    const btn = document.getElementById('btn-download');
    btn.textContent = '📤 Upload to UniFi Connect';
    btn.disabled = false;
    btn.classList.add('upload-mode');

    // Show next steps — upload button handles WebUI opening
    showNextSteps();
  } else {
    document.getElementById('progress-text').textContent = `❌ Download failed: ${result.error}`;
    setStatus('error', `Download failed: ${result.error}`);
    const btn = document.getElementById('btn-download');
    btn.textContent = '⬇ Download Selected';
    btn.disabled = false;
  }
}

// ── Upload button action ──────────────────────────────────────────────────────
function handleMainButton() {
  const btn = document.getElementById('btn-download');
  if (btn.classList.contains('exit-mode')) {
    window.api.windowClose();
  } else if (btn.classList.contains('upload-mode')) {
    openWebUI();
    // Flip to exit mode
    btn.textContent = '✅ Exit When Done';
    btn.classList.remove('upload-mode');
    btn.classList.add('exit-mode');
  } else {
    startDownload();
  }
}

// ── Open WebUI ────────────────────────────────────────────────────────────────
function openWebUI() {
  const ip = config.udmIp;
  if (!ip) {
    // Prompt them to set IP
    showNoIpWarning();
    return;
  }
  const base = ip.startsWith('http') ? ip : `https://${ip}`;
  // Deep link into Connect devices
  const url = `${base}/connect/site/default/devices`;
  window.api.openExternal(url);
}

function updateWebuiButton() {
  // Only show open WebUI standalone button if we have an IP
  const btn = document.getElementById('btn-open-webui');
  btn.style.display = config.udmIp ? '' : 'none';
}

// ── Next steps panel ──────────────────────────────────────────────────────────
function showNextSteps() {
  const panel = document.getElementById('next-steps');
  panel.style.display = '';
}

function hideNextSteps() {
  const panel = document.getElementById('next-steps');
  if (panel) panel.style.display = 'none';
}

// ── Warning modals ────────────────────────────────────────────────────────────
function showNoFolderWarning() {
  document.getElementById('warn-overlay').style.display = 'flex';
  document.getElementById('warn-title').textContent = '📂 Download Folder Not Set';
  document.getElementById('warn-message').textContent =
    'You need to set a download folder before downloading. Click Settings to configure it, then try again.';
  document.getElementById('warn-action').textContent = '⚙ Open Settings';
  document.getElementById('warn-action').onclick = () => {
    closeWarning();
    openSettings();
  };
}

function showNoIpWarning() {
  document.getElementById('warn-overlay').style.display = 'flex';
  document.getElementById('warn-title').textContent = '📡 Console IP Not Set';
  document.getElementById('warn-message').textContent =
    'Set your UDM Pro IP address in Settings so the app can open your UniFi Connect WebUI automatically.';
  document.getElementById('warn-action').textContent = '⚙ Open Settings';
  document.getElementById('warn-action').onclick = () => {
    closeWarning();
    openSettings();
  };
}

function closeWarning() {
  document.getElementById('warn-overlay').style.display = 'none';
}

// ── Settings ──────────────────────────────────────────────────────────────────
function openSettings() {
  document.getElementById('cfg-udm-ip').value = config.udmIp || '';
  document.getElementById('cfg-download-folder').value = config.downloadFolder || '';
  updateThemeButtons(config.theme || 'dark');
  document.getElementById('settings-overlay').style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settings-overlay').style.display = 'none';
}

async function saveSettings() {
  const udmIp = document.getElementById('cfg-udm-ip').value.trim();
  const downloadFolder = document.getElementById('cfg-download-folder').value.trim();
  const activeTheme = document.querySelector('.theme-btn.active');
  const theme = activeTheme ? activeTheme.dataset.theme : 'dark';

  config = { ...config, udmIp, downloadFolder, theme };
  await window.api.saveConfig(config);
  applyTheme(theme);
  closeSettings();
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  const body = document.body;
  body.classList.remove('theme-light', 'theme-dark', 'theme-system');
  if (theme === 'light') {
    body.classList.add('theme-light');
  } else if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (!prefersDark) body.classList.add('theme-light');
  }
}

function updateThemeButtons(theme) {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

// ── Status helper ─────────────────────────────────────────────────────────────
function setStatus(state, text) {
  const dot = document.getElementById('status-dot');
  dot.className = 'status-dot ' + state;
  document.getElementById('status-text').textContent = text;
}

// ── Event listeners ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  init();

  document.getElementById('btn-minimize').addEventListener('click', () => window.api.windowMinimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.api.windowMaximize());
  document.getElementById('btn-close').addEventListener('click', () => window.api.windowClose());
  document.getElementById('btn-refresh').addEventListener('click', loadVersions);
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-download').addEventListener('click', handleMainButton);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('cfg-save').addEventListener('click', saveSettings);
  document.getElementById('update-dismiss').addEventListener('click', () => {
    document.getElementById('update-banner').style.display = 'none';
  });
  document.getElementById('warn-dismiss').addEventListener('click', closeWarning);

  document.getElementById('cfg-browse').addEventListener('click', async () => {
    const folder = await window.api.browseFolder();
    if (folder) document.getElementById('cfg-download-folder').value = folder;
  });

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => updateThemeButtons(btn.dataset.theme));
  });
});

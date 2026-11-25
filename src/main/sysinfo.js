// Collects everything about the PC and Windows, grouped in sections.
const si = require('systeminformation');
const os = require('os');
const { runPSJson } = require('./ps');

const safe = async (fn, fallback = null) => {
  try { return await fn(); } catch { return fallback; }
};

// Static facts (hardware, Windows build) are read once and reused.
const memo = new Map();
function once(key, fn) {
  if (!memo.has(key)) memo.set(key, Promise.resolve().then(fn).catch((e) => { memo.delete(key); throw e; }));
  return memo.get(key);
}
const S = {
  system: () => once('system', () => si.system()),
  osInfo: () => once('osInfo', () => si.osInfo()),
  cpu: () => once('cpu', () => si.cpu()),
  graphics: () => once('graphics', () => si.graphics()),
  diskLayout: () => once('diskLayout', () => si.diskLayout()),
  win: () => once('win', windowsDetails)
};

async function windowsDetails() {
  const script = `
    $os = Get-CimInstance Win32_OperatingSystem
    $cs = Get-CimInstance Win32_ComputerSystem
    $cv = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
    $sb = $null; try { $sb = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\State' -ErrorAction Stop).UEFISecureBootEnabled } catch {}
    $fw = $env:firmware_type
    $tz = (Get-TimeZone).DisplayName
    $hf = @(Get-CimInstance Win32_QuickFixEngineering -ErrorAction SilentlyContinue)
    $pf = @(Get-CimInstance Win32_PageFileUsage -ErrorAction SilentlyContinue)
    $vbs = $null; try { $vbs = (Get-CimInstance -Namespace root\\Microsoft\\Windows\\DeviceGuard -ClassName Win32_DeviceGuard -ErrorAction Stop).VirtualizationBasedSecurityStatus } catch {}
    [pscustomobject]@{
      edition = $os.Caption; version = $os.Version; build = $os.BuildNumber; ubr = $cv.UBR
      displayVersion = $cv.DisplayVersion; editionId = $cv.EditionID; installationType = $cv.InstallationType
      architecture = $os.OSArchitecture; installDate = $os.InstallDate.ToString('o'); lastBoot = $os.LastBootUpTime.ToString('o')
      registeredOwner = $cv.RegisteredOwner; organization = $cv.RegisteredOrganization; productId = $cv.ProductId
      locale = (Get-Culture).Name; uiLanguage = (Get-UICulture).Name; timeZone = $tz
      windowsDirectory = $os.WindowsDirectory; systemDrive = $os.SystemDrive
      manufacturer = $cs.Manufacturer; model = $cs.Model; systemFamily = $cs.SystemFamily; systemSku = $cs.SystemSKUNumber
      systemType = $cs.SystemType; pcType = $cs.PCSystemType; domain = $cs.Domain; partOfDomain = $cs.PartOfDomain; workgroup = $cs.Workgroup
      hypervisorPresent = $cs.HypervisorPresent; processors = $cs.NumberOfProcessors; logicalProcessors = $cs.NumberOfLogicalProcessors
      totalPhysicalMemory = [double]$cs.TotalPhysicalMemory; totalVirtualMemoryKB = [double]$os.TotalVirtualMemorySize; freeVirtualMemoryKB = [double]$os.FreeVirtualMemory
      secureBoot = $sb; firmwareType = $fw; vbsStatus = $vbs
      pageFiles = @($pf | ForEach-Object { [pscustomobject]@{ name = $_.Name; allocatedMB = $_.AllocatedBaseSize; currentUsageMB = $_.CurrentUsage; peakUsageMB = $_.PeakUsage } })
      hotfixCount = $hf.Count
      hotfixes = @($hf | Sort-Object InstalledOn -Descending -ErrorAction SilentlyContinue | Select-Object -First 15 | ForEach-Object { [pscustomobject]@{ id = $_.HotFixID; description = $_.Description; installedOn = "$($_.InstalledOn)" } })
    } | ConvertTo-Json -Depth 4 -Compress`;
  const d = await runPSJson(script, { timeout: 60000 });
  if (d && Number(d.build) >= 22000 && /Windows 10/.test(d.edition || '')) d.edition = d.edition.replace('Windows 10', 'Windows 11');
  const pcTypes = { 0: 'Unspecified', 1: 'Desktop', 2: 'Mobile / Laptop', 3: 'Workstation', 4: 'Enterprise server', 5: 'SOHO server', 6: 'Appliance PC', 7: 'Performance server', 8: 'Maximum' };
  if (d) d.pcType = pcTypes[d.pcType] || d.pcType;
  if (d && d.vbsStatus !== null && d.vbsStatus !== undefined) d.vbsStatus = ['Not enabled', 'Enabled, not running', 'Running'][d.vbsStatus] ?? d.vbsStatus;
  if (d && d.secureBoot !== null && d.secureBoot !== undefined) d.secureBoot = d.secureBoot === 1 ? 'On' : 'Off';
  return d;
}

async function installedApps() {
  const script = `
    $paths = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    $apps = @(Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentKeyName } |
      Sort-Object DisplayName -Unique | ForEach-Object { [pscustomobject]@{ name = $_.DisplayName; version = $_.DisplayVersion; publisher = $_.Publisher; installed = $_.InstallDate; sizeKB = $_.EstimatedSize } })
    ConvertTo-Json -InputObject $apps -Compress`;
  return (await runPSJson(script, { timeout: 60000 })) || [];
}

async function startupApps() {
  const script = `$s = @(Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ name = $_.Name; command = $_.Command; location = $_.Location; user = $_.User } }); ConvertTo-Json -InputObject $s -Compress`;
  return (await runPSJson(script, { timeout: 30000 })) || [];
}

// Run every getter of an object in parallel, never failing the whole section.
async function gather(getters) {
  const keys = Object.keys(getters);
  const values = await Promise.all(keys.map((k) => safe(getters[k])));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}

const SECTIONS = {
  overview: async () => ({
    ...(await gather({ system: S.system, osInfo: S.osInfo, cpu: S.cpu, graphics: S.graphics, win: S.win, mem: () => si.mem() })),
    hostname: os.hostname(),
    user: os.userInfo().username
  }),
  os: () => gather({
    windows: S.win,
    osInfo: S.osInfo,
    uuid: () => once('uuid', () => si.uuid()),
    time: () => si.time(),
    shell: () => once('shell', () => si.shell()),
    users: () => si.users()
  }),
  cpu: () => gather({
    cpu: S.cpu,
    speed: () => si.cpuCurrentSpeed(),
    cache: () => once('cpuCache', () => si.cpuCache()),
    temperature: () => si.cpuTemperature(),
    flags: () => once('cpuFlags', () => si.cpuFlags())
  }),
  memory: () => gather({ memory: () => si.mem(), modules: () => once('memLayout', () => si.memLayout()) }),
  graphics: () => S.graphics(),
  storage: () => gather({ physical: S.diskLayout, volumes: () => si.fsSize(), partitions: () => si.blockDevices() }),
  board: () => gather({
    system: S.system,
    bios: () => once('bios', () => si.bios()),
    baseboard: () => once('baseboard', () => si.baseboard()),
    chassis: () => once('chassis', () => si.chassis())
  }),
  network: () => gather({
    interfaces: () => si.networkInterfaces(),
    defaultInterface: () => si.networkInterfaceDefault(),
    gateway: () => si.networkGatewayDefault(),
    wifi: () => si.wifiConnections(),
    stats: () => si.networkStats('*')
  }),
  power: () => gather({ battery: () => si.battery() }),
  devices: () => gather({
    audio: () => si.audio(),
    usb: () => si.usb(),
    bluetooth: () => si.bluetoothDevices(),
    printers: () => si.printer()
  }),
  software: () => gather({ installed: installedApps, startup: startupApps })
};

async function section(key) {
  const fn = SECTIONS[key];
  if (!fn) throw new Error('Unknown section ' + key);
  return fn();
}

// Live stats are polled every ~1.5 s, so they must be cheap: CPU and RAM come
// straight from Node; network counters (a PowerShell call on Windows) refresh every few seconds.
let prevCpu = os.cpus();
let net = { at: 0, rx: 0, tx: 0, pending: null };

function cpuDelta() {
  const now = os.cpus();
  const cores = now.map((c, i) => {
    const p = prevCpu[i] || c;
    const idle = c.times.idle - p.times.idle;
    const total = Object.keys(c.times).reduce((a, k) => a + (c.times[k] - p.times[k]), 0);
    return total > 0 ? Math.max(0, Math.min(100, 100 * (1 - idle / total))) : 0;
  });
  prevCpu = now;
  return { cores, avg: cores.length ? cores.reduce((a, b) => a + b, 0) / cores.length : 0 };
}

function refreshNet() {
  if (net.pending || Date.now() - net.at < 4000) return;
  net.pending = si.networkStats()
    .then((list) => {
      const n = (list || [])[0] || {};
      net = { at: Date.now(), rx: n.rx_sec || 0, tx: n.tx_sec || 0, pending: null };
    })
    .catch(() => { net.pending = null; net.at = Date.now(); });
}

async function live() {
  const { cores, avg } = cpuDelta();
  refreshNet();
  const total = os.totalmem();
  return {
    cpu: avg,
    cores,
    memUsed: total - os.freemem(),
    memTotal: total,
    speed: os.cpus()[0] ? +(os.cpus()[0].speed / 1000).toFixed(2) : null,
    rx: net.rx,
    tx: net.tx,
    uptime: os.uptime()
  };
}

async function all() {
  const keys = Object.keys(SECTIONS).filter((k) => k !== 'overview');
  const values = await Promise.all(keys.map((k) => safe(() => SECTIONS[k]())));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}

module.exports = { section, live, all, sections: Object.keys(SECTIONS) };

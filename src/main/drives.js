// Lists drives (local, external/USB, network, optical) and portable devices (phones, cameras).
const fs = require('fs');
const { runPSJson } = require('./ps');

const TYPE = { 0: 'unknown', 1: 'unknown', 2: 'removable', 3: 'local', 4: 'network', 5: 'optical', 6: 'ram' };

async function listDrives() {
  let disks = [];
  try {
    const script = `
      $usb = @{}
      try {
        Get-CimInstance Win32_DiskDrive | ForEach-Object {
          $d = $_
          $parts = Get-CimAssociatedInstance -InputObject $d -ResultClassName Win32_DiskPartition -ErrorAction SilentlyContinue
          foreach ($p in $parts) {
            $lds = Get-CimAssociatedInstance -InputObject $p -ResultClassName Win32_LogicalDisk -ErrorAction SilentlyContinue
            foreach ($l in $lds) { $usb[$l.DeviceID] = @{ bus = $d.InterfaceType; model = $d.Model; media = $d.MediaType } }
          }
        }
      } catch {}
      $out = @(Get-CimInstance Win32_LogicalDisk | ForEach-Object {
        $info = $usb[$_.DeviceID]
        [pscustomobject]@{
          id = $_.DeviceID; label = $_.VolumeName; driveType = [int]$_.DriveType; fs = $_.FileSystem
          size = [double]$_.Size; free = [double]$_.FreeSpace; provider = $_.ProviderName
          bus = $(if ($info) { $info.bus } else { $null }); model = $(if ($info) { $info.model } else { $null })
          media = $(if ($info) { $info.media } else { $null })
        }
      })
      ConvertTo-Json -InputObject $out -Depth 3 -Compress`;
    disks = (await runPSJson(script)) || [];
  } catch {
    // Fallback: probe drive letters.
    for (let c = 65; c <= 90; c++) {
      const id = String.fromCharCode(c) + ':';
      try {
        fs.accessSync(id + '\\');
        let size = 0, free = 0;
        try { const s = fs.statfsSync(id + '\\'); size = s.blocks * s.bsize; free = s.bavail * s.bsize; } catch {}
        disks.push({ id, label: '', driveType: 3, fs: '', size, free });
      } catch {}
    }
  }

  const drives = disks.map((d) => {
    let kind = TYPE[d.driveType] || 'unknown';
    const external = kind === 'removable' || (kind === 'local' && (d.bus === 'USB' || /external|removable/i.test(d.media || '')));
    if (external) kind = 'external';
    return {
      id: d.id,
      path: d.id + '\\',
      label: d.label || '',
      kind,
      fs: d.fs || '',
      size: d.size || 0,
      free: d.free || 0,
      model: d.model || '',
      provider: d.provider || '',
      ready: !!d.size || kind === 'network'
    };
  });

  return { drives, devices: await listPortableDevices() };
}

async function listPortableDevices() {
  try {
    const script = `
      $sh = New-Object -ComObject Shell.Application
      $pc = $sh.Namespace(17)
      $out = @(foreach ($i in $pc.Items()) {
        if (-not $i.IsFileSystem -and $i.IsFolder) {
          [pscustomobject]@{ name = $i.Name; type = $i.Type }
        }
      })
      ConvertTo-Json -InputObject $out -Compress`;
    const list = (await runPSJson(script, { timeout: 20000 })) || [];
    return list.filter((d) => d && d.name).map((d) => ({ name: d.name, type: d.type || 'Portable device' }));
  } catch {
    return [];
  }
}

module.exports = { listDrives };

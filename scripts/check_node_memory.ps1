# check_node_memory.ps1 - Node.exe memory check (report only, no kill)
# Usage: powershell -File check_node_memory.ps1
# Output: JSON + alerts

param(
    [int]$WarnGB = 4,
    [int]$CritGB = 8
)

$logFile = Join-Path $PSScriptRoot "..\data\node-memory-log.json"
$now = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"

$procs = Get-Process node -ErrorAction SilentlyContinue | Select-Object Id,
    @{N='WorkingSetGB'; E={[math]::Round($_.WorkingSet64/1GB, 2)}},
    @{N='VirtualMemGB'; E={[math]::Round($_.VirtualMemorySize64/1GB, 2)}},
    @{N='PrivateMemGB'; E={[math]::Round($_.PrivateMemorySize64/1GB, 2)}},
    StartTime,
    @{N='UptimeHours'; E={[math]::Round(((Get-Date) - $_.StartTime).TotalHours, 1)}}

if (-not $procs) {
    Write-Output "{`"status`":`"no_node_processes`",`"timestamp`":`"$now`"}"
    exit 0
}

$results = @()
$maxLevel = "ok"

foreach ($p in $procs) {
    $level = "ok"
    if ($p.WorkingSetGB -ge $CritGB) {
        $level = "critical"
        $maxLevel = "critical"
    }
    elseif ($p.WorkingSetGB -ge $WarnGB) {
        $level = "warning"
        if ($maxLevel -ne "critical") { $maxLevel = "warning" }
    }

    $results += @{
        pid = $p.Id
        working_set_gb = $p.WorkingSetGB
        virtual_mem_gb = $p.VirtualMemGB
        private_mem_gb = $p.PrivateMemGB
        start_time = if ($p.StartTime) { $p.StartTime.ToString("yyyy-MM-ddTHH:mm:ss") } else { $null }
        uptime_hours = $p.UptimeHours
        level = $level
    }
}

$totalWS = ($procs | Measure-Object -Property WorkingSetGB -Sum).Sum

$report = @{
    timestamp = $now
    process_count = $procs.Count
    total_working_set_gb = [math]::Round($totalWS, 2)
    max_level = $maxLevel
    processes = $results
}

$json = $report | ConvertTo-Json -Depth 3

# Append to log (keep last 500)
$logDir = Split-Path $logFile -Parent
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

$history = @()
if (Test-Path $logFile) {
    try {
        $raw = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($raw) { $history = @($raw | ConvertFrom-Json) }
    }
    catch { $history = @() }
}

if ($history -isnot [array]) { $history = @($history) }
$history += $report

if ($history.Count -gt 500) {
    $history = $history[-500..-1]
}

$history | ConvertTo-Json -Depth 4 | Set-Content $logFile -Encoding UTF8

# Trend: check if same PID rising over last 3 readings
$trend_warnings = @()
if ($history.Count -ge 3) {
    $recent3 = $history[-3..-1]
    $allPids = $results | ForEach-Object { $_.pid } | Sort-Object -Unique

    foreach ($pid in $allPids) {
        $readings = @()
        foreach ($h in $recent3) {
            $match = $h.processes | Where-Object { $_.pid -eq $pid }
            if ($match) { $readings += $match.working_set_gb }
        }
        if ($readings.Count -ge 3) {
            $increasing = ($readings[1] -gt $readings[0]) -and ($readings[2] -gt $readings[1])
            $delta = $readings[2] - $readings[0]
            if ($increasing -and $delta -gt 0.5) {
                $trend_warnings += "PID $pid rising: $($readings -join ' -> ') GB (+$([math]::Round($delta,2)) GB)"
            }
        }
    }
}

Write-Output $json

if ($trend_warnings.Count -gt 0) {
    Write-Output ""
    Write-Output "=== TREND WARNING ==="
    $trend_warnings | ForEach-Object { Write-Output $_ }
}

if ($maxLevel -eq "critical") {
    Write-Output ""
    Write-Output "[CRITICAL] node.exe > ${CritGB}GB detected - possible memory leak"
    exit 2
}
elseif ($maxLevel -eq "warning") {
    Write-Output ""
    Write-Output "[WARNING] node.exe > ${WarnGB}GB detected - monitoring"
    exit 1
}
else {
    exit 0
}

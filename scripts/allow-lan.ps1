$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $elevated = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`""
    )
    exit $elevated.ExitCode
}

try {
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $ruleName = 'QuantumShield-FinEdu-LAN-5175'
    $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        $existing | Set-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -Profile Any
        $existing | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort 5175 -RemotePort Any
        $existing | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -LocalAddress Any -RemoteAddress LocalSubnet
        $existing | Get-NetFirewallApplicationFilter | Set-NetFirewallApplicationFilter -Program $nodePath
    } else {
        New-NetFirewallRule -Name $ruleName -DisplayName 'QuantumShield FinEdu LAN 5175' `
            -Direction Inbound -Action Allow -Enabled True -Protocol TCP -LocalPort 5175 `
            -RemoteAddress LocalSubnet -Profile Any -Program $nodePath | Out-Null
    }
    exit 0
} catch {
    Write-Error $_
    exit 1
}

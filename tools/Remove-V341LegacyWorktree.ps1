#Requires -Version 7.3
[CmdletBinding()]
param(
    [ValidateSet('V32','V33')][string]$Target,
    [switch]$Remove,
    [switch]$ConfirmClosed
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$parent = Split-Path -Parent $repo
if ((Split-Path -Leaf $repo) -ne 'garmin-coaching-hub-dev') { throw 'Usare il worktree permanente garmin-coaching-hub-dev.' }
if ($Remove -and (-not $Target -or -not $ConfirmClosed)) {
    throw 'Per rimuovere un worktree selezionare -Target e attestare la chiusura di IDE, terminali e server con -ConfirmClosed.'
}
$versions = [ordered]@{
    V32 = @{ Name = 'garmin-coaching-hub-v32'; Branch = 'feature/v32-recharts-migration'; Sha = 'ba30c08b7ecd8836b7a3492a6f183fa7c93ac52c' }
    V33 = @{ Name = 'garmin-coaching-hub-v33'; Branch = 'feature/v33-advanced-running-analytics'; Sha = 'f117f98073a4544b4099c5483ef0514ec3132d72' }
}
$gitExe = (Get-Command git -CommandType Application | Select-Object -First 1).Source
function Invoke-Git([string]$Path, [string[]]$Arguments) {
    $output = & $gitExe --no-optional-locks -C $Path @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Verifica Git fallita (codice $LASTEXITCODE)." }
    return $output
}
$registered = @(Invoke-Git $repo @('worktree','list','--porcelain'))
foreach ($version in $versions.Keys) {
    if ($Target -and $Target -ne $version) { continue }
    $spec = $versions[$version]
    $path = Join-Path $parent $spec.Name
    $remote = @(Invoke-Git $repo @('ls-remote','--exit-code','--heads','origin',"refs/heads/$($spec.Branch)"))
    $present = "worktree $($path.Replace('\','/'))" -in $registered
    if (-not $present) {
        if ($Remove) { throw "Worktree $version assente dall'inventario Git." }
        Write-Output ([pscustomobject]@{ Version = $version; Registrato = $false })
        continue
    }
    $directory = Get-Item -LiteralPath $path
    if (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $directory.FullName -ne $path) {
        throw "Percorso inatteso per $version."
    }
    $sha = Invoke-Git $path @('rev-parse','HEAD')
    $branch = Invoke-Git $path @('branch','--show-current')
    $status = @(Invoke-Git $path @('status','--porcelain=v1','--untracked-files=all'))
    $ignored = @(Invoke-Git $path @('status','--porcelain=v1','--ignored=matching') | Where-Object { $_.StartsWith('!! ') })
    $expectedRemote = "$($spec.Sha)" + [char]9 + "refs/heads/$($spec.Branch)"
    $matchesRef = $branch -ceq $spec.Branch -and $sha -ceq $spec.Sha -and $remote.Count -eq 1 -and $remote[0] -ceq $expectedRemote
    $regenerable = @($ignored | Where-Object { $_ -match '^!! (__pycache__/|tests/__pycache__/|dashboard/(node_modules/|dist/|tsconfig\.tsbuildinfo))$' })
    $testArtifacts = @($ignored | Where-Object { $_ -match '^!! dashboard/(test-results|playwright-report)/$' })
    $processes = @(Get-CimInstance Win32_Process | Where-Object {
        ($_.CommandLine -and $_.CommandLine.Replace('/','\').Contains($path,[StringComparison]::OrdinalIgnoreCase)) -or
        ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($path + '\',[StringComparison]::OrdinalIgnoreCase))
    })
    Write-Output ([pscustomobject]@{
        Version = $version
        Registrato = $true
        SHA = $sha
        RiferimentiVerificati = $matchesRef
        ModificheOUntracked = $status.Count
        IgnoratiRigenerabili = ($regenerable -replace '^!! ') -join ', '
        ArtefattiTestDaValutare = ($testArtifacts -replace '^!! ') -join ', '
        AltriIgnoratiDaValutare = $ignored.Count - $regenerable.Count - $testArtifacts.Count
        ProcessiConPercorsoEsplicito = $processes.Count
    })
    if ($Remove) {
        if (-not $matchesRef -or $status.Count -or $ignored.Count -or $processes.Count) {
            throw "Rimozione $version bloccata. Risolvere i risultati dell'inventario e rieseguire il dry-run."
        }
        $null = Invoke-Git $repo @('worktree','remove',$path)
        Invoke-Git $repo @('worktree','list')
    }
}

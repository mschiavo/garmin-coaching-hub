#Requires -Version 7.3
[CmdletBinding()]
param(
    [ValidateSet('Plan','Local','Verify','Snapshot','Install','Fixture','Probe','Dashboard','Backup','Restore')]
    [string]$Task = 'Plan',
    [ValidateSet('Fresh','Upgrade33','Upgrade34')][string]$Mode = 'Fresh',
    [ValidateSet('small','large')][string]$Size = 'large',
    [ValidatePattern('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')][string]$Reference = '2024-03-05',
    [string]$Python = 'python',
    [string]$Node = 'node',
    [string]$PgBin,
    [ValidateRange(1024,65535)][int]$PgPort = 55441,
    [string]$DumpFile,
    [string]$ReviewedToc,
    [switch]$Legacy,
    [switch]$VerifyRevisionChange,
    [switch]$ApproveCloud,
    [string]$ApprovedProjectRef
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Operazione fallita ($([IO.Path]::GetFileName($Executable)), codice $LASTEXITCODE)." }
}

function Get-PgTool([string]$Name) {
    if ($PgBin) { $Name = Join-Path $PgBin $Name }
    return (Get-Command $Name -CommandType Application | Select-Object -First 1).Source
}

if ($Task -eq 'Plan') {
    Write-Output 'Local: test SQL, dump custom, TOC, restore e verifica in un cluster loopback nuovo.'
    Write-Output 'Staging: Verify, Snapshot, Install, Fixture, Probe, Dashboard e Backup richiedono -ApproveCloud e -ApprovedProjectRef.'
    Write-Output 'Restore: ripristino isolato con -DumpFile e -ReviewedToc. Checklist nel report operativo.'
    exit 0
}

$cloud = $Task -in @('Verify','Snapshot','Install','Fixture','Probe','Dashboard','Backup')
if ($cloud -and (-not $ApproveCloud -or $ApprovedProjectRef -cnotmatch '^[a-z0-9]{20}$' -or
                $ApprovedProjectRef -cne $env:GCH_STAGING_PROJECT_REF)) {
    throw 'Serve autorizzazione esplicita per il ref di staging verificato.'
}
if ($Task -eq 'Restore') {
    if (-not $DumpFile -or -not $ReviewedToc) { throw 'Indicare dump e TOC revisionata.' }
    $DumpFile = (Resolve-Path -LiteralPath $DumpFile).Path
    $ReviewedToc = (Resolve-Path -LiteralPath $ReviewedToc).Path
}

Push-Location -LiteralPath $repo
try {
    if ($Task -ne 'Restore') {
        $pythonExe = (Get-Command $Python -CommandType Application | Select-Object -First 1).Source
    }
    if ($cloud) {
        $operation = @('-m','tools.staging_operations',$Task,'--approved-project-ref',$ApprovedProjectRef,
                      '--mode',$Mode,'--reference',$Reference,'--size',$Size)
        if ($Legacy) { $operation += '--legacy' }
        if ($Task -in @('Probe','Dashboard')) { $operation[2] = 'Verify' }
        if ($Task -eq 'Snapshot') { $operation += @('--psql',(Get-PgTool psql)) }
        if ($Task -eq 'Backup') {
            if ($DumpFile) { throw 'Backup staging usa una directory privata nuova sotto backups/.' }
            $backupRoot = Join-Path $repo 'backups'
            if ((Test-Path -LiteralPath $backupRoot) -and
                ((Get-Item -LiteralPath $backupRoot).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                throw 'La directory backups/ deve essere una directory locale protetta.'
            }
            $folder = Join-Path $repo ('backups/staging-' + [guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $folder | Out-Null
            $DumpFile = Join-Path $folder 'archive.dump'
            $operation += @('--pg-dump',(Get-PgTool pg_dump),'--output',$DumpFile)
        }
        Invoke-Checked $pythonExe $operation
        if ($Task -eq 'Backup') {
            Invoke-Checked (Get-PgTool pg_restore) @('--list',"--file=$(Join-Path $folder 'archive.toc')",$DumpFile)
            Write-Output "Backup e TOC in $folder"
        }
        if ($Task -eq 'Probe') {
            $probe = @('-m','tools.staging_probe')
            if ($Mode -eq 'Fresh' -and -not $Legacy) { $probe += @('--fixture-size',$Size) }
            if ($VerifyRevisionChange) { $probe += '--verify-revision-change' }
            Invoke-Checked $pythonExe $probe
        }
        if ($Task -eq 'Dashboard') {
            $dashboard = Join-Path $repo 'dashboard'
            if (Get-ChildItem -LiteralPath $dashboard -Force -Filter '.env*' | Where-Object Name -ne '.env.example') {
                throw 'Usare una directory dashboard priva di configurazioni .env locali.'
            }
            $nodeExe = (Get-Command $Node -CommandType Application | Select-Object -First 1).Source
            $key = $env:GCH_STAGING_SUPABASE_PUBLISHABLE_KEY
            if ($key -cnotmatch '^sb_publishable_[A-Za-z0-9_-]+$') { throw 'Serve una chiave publishable.' }
            $start = [Diagnostics.ProcessStartInfo]::new($nodeExe)
            $start.WorkingDirectory = $dashboard
            $start.UseShellExecute = $false
            foreach ($arg in 'node_modules/vite/bin/vite.js','--host','127.0.0.1','--strictPort') { $start.ArgumentList.Add($arg) }
            foreach ($name in @($start.Environment.Keys)) {
                if ($name -match '^(GCH_|PG|VITE_|SUPABASE_|GARMIN_)') { $null = $start.Environment.Remove($name) }
            }
            $start.Environment['VITE_SUPABASE_URL'] = $env:GCH_STAGING_SUPABASE_URL
            $start.Environment['VITE_SUPABASE_PUBLISHABLE_KEY'] = $key
            $start.Environment['VITE_GARMIN_TIMEZONE'] = 'Europe/Rome'
            $server = [Diagnostics.Process]::Start($start)
            try {
                $server.WaitForExit()
                if ($server.ExitCode -ne 0) { throw 'Dashboard interrotta.' }
            } finally {
                if (-not $server.HasExited) { $server.Kill($true) }
                $server.Dispose()
            }
        }
        return
    }

    # All local commands target a new cluster on loopback, independent of shell libpq settings.
    $savedEnvironment = @{}
    foreach ($item in Get-ChildItem Env: | Where-Object { $_.Name -match '^(PG|V34_TEST_DSN$|GCH_TEST_POSTGRES_SYSTEM_ID$)' }) {
        $savedEnvironment[$item.Name] = $item.Value
        [Environment]::SetEnvironmentVariable($item.Name,$null)
    }
    $clusterStarted = $false
    try {
        $folder = Join-Path $repo ('.cache/staging-local-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $folder | Out-Null
        $cluster = Join-Path $folder 'pgdata'
        $ctl = Get-PgTool pg_ctl
        $psql = Get-PgTool psql
        $restore = Get-PgTool pg_restore
        $address = @('-h','127.0.0.1','-p',[string]$PgPort,'-U','postgres','-w')
        Invoke-Checked (Get-PgTool initdb) @('-A','trust','-U','postgres','-E','UTF8','--no-locale','-D',$cluster)
        Invoke-Checked $ctl @('-D',$cluster,'-l',(Join-Path $folder 'postgres.log'),'-o',"-h 127.0.0.1 -p $PgPort",'-w','start')
        $clusterStarted = $true
        $names = @('gch_v341_restore')
        if ($Task -eq 'Local') { $names += @('v34_fresh','v34_upgrade','gch_v341_fixture','gch_v341_upgrade') }
        foreach ($name in $names) { Invoke-Checked (Get-PgTool createdb) ($address + @($name)) }
        $env:V34_TEST_DSN = "host=127.0.0.1 port=$PgPort user=postgres dbname=postgres"
        $restoreOptions = @()
        if ($Task -eq 'Local') {
            Invoke-Checked $pythonExe @('-m','unittest','discover','-s','tests/sql','-v')
            $DumpFile = Join-Path $folder 'archive.dump'
            Invoke-Checked (Get-PgTool pg_dump) ($address + @('-Fc','-f',$DumpFile,'gch_v341_fixture'))
            Invoke-Checked $restore @('--list',"--file=$(Join-Path $folder 'archive.toc')",$DumpFile)
        } else {
            Invoke-Checked $psql ($address + @('-X','-d','gch_v341_restore','-v','ON_ERROR_STOP=1','-f','tests/sql/auth_stub.sql'))
            $restoreOptions = @("--use-list=$ReviewedToc",'--no-owner')
        }
        Invoke-Checked $restore ($address + $restoreOptions + @('--exit-on-error','--single-transaction','-d','gch_v341_restore',$DumpFile))
        $targets = @('gch_v341_restore')
        if ($Task -eq 'Local') { $targets += 'gch_v341_fixture' }
        $snapshots = @(foreach ($db in $targets) {
            (Invoke-Checked $psql ($address + @('-X','-At','-d',$db,'-v','ON_ERROR_STOP=1','-v','local_stub=1','-f','tools/staging_snapshot.sql'))) -join "`n"
        })
        if ($snapshots.Count -eq 2 -and $snapshots[0] -cne $snapshots[1]) { throw 'Origine e ripristino divergono.' }
        Write-Output "Ripristino isolato terminato. Artefatti sintetici in $folder"
        $snapshots[0]
    } finally {
        $env:V34_TEST_DSN = $null
        foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name,$savedEnvironment[$name]) }
        if ($clusterStarted) { Invoke-Checked $ctl @('-D',$cluster,'-m','fast','-w','stop') }
    }
} finally { Pop-Location }

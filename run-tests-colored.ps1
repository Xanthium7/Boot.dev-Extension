$escape = [char]27
$reset = "$escape[0m"
$green = "$escape[32m"
$red = "$escape[31m"

$lines = @(& go test 2>&1)
$exitCode = $LASTEXITCODE

foreach ($line in $lines) {
    $text = [string]$line
    $trimmed = $text.Trim()

    if ($trimmed -match '(^|:\s*)Pass$|^\d+ passed, 0 failed$|^PASS$|^ok\s') {
        Write-Host "$green$text$reset"
    } elseif ($trimmed -match '(^|:\s*)Fail$|^\d+ passed, [1-9]\d* failed$|^FAIL$|^FAIL\s') {
        Write-Host "$red$text$reset"
    } elseif ($text -match 'main_test\.go:\d+:') {
        Write-Host $text -ForegroundColor Gray
    } else {
        Write-Host $text
    }
}

try {
    if ($exitCode -eq 0) {
        [Console]::Beep(880, 70)
        [Console]::Beep(1175, 70)
        [Console]::Beep(1568, 180)
    } else {
        [Console]::Beep(220, 350)
        [Console]::Beep(160, 500)
    }
} catch {
    # Some terminals do not support Console.Beep.
}

exit $exitCode
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
        # Rapid ascending major triad chime: C6 → E6 → G6
        [Console]::Beep(1047, 80)
        [Console]::Beep(1319, 80)
        [Console]::Beep(1568, 120)
    } else {
        # Quick subtle low blip
        [Console]::Beep(220, 150)
    }
} catch {
    # Some terminals do not support Console.Beep.
}

exit $exitCode
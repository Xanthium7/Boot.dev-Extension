$escape = [char]27
$reset = "$escape[0m"
$green = "$escape[32m"
$red = "$escape[31m"

function Play-Chime([int[]]$frequencies, [int[]]$durations) {
    $sampleRate = 44100
    $totalSamples = 0
    foreach ($d in $durations) {
        $totalSamples += [int]($sampleRate * $d / 1000)
    }
    $dataSize = $totalSamples * 2  # 16-bit = 2 bytes per sample

    $filePath = Join-Path $env:TEMP "learn-go-chime.wav"
    $stream = [System.IO.File]::Open($filePath, [System.IO.FileMode]::Create)
    $writer = New-Object System.IO.BinaryWriter($stream)

    # WAV header (16-bit PCM mono)
    $writer.Write([Text.Encoding]::ASCII.GetBytes("RIFF"))
    $writer.Write([int](36 + $dataSize))
    $writer.Write([Text.Encoding]::ASCII.GetBytes("WAVEfmt "))
    $writer.Write([int]16)        # chunk size
    $writer.Write([Int16]1)       # PCM
    $writer.Write([Int16]1)       # mono
    $writer.Write([int]$sampleRate)
    $writer.Write([int]($sampleRate * 2))  # byte rate (16-bit mono)
    $writer.Write([Int16]2)       # block align
    $writer.Write([Int16]16)      # bits per sample
    $writer.Write([Text.Encoding]::ASCII.GetBytes("data"))
    $writer.Write([int]$dataSize)

    # Write all notes into a single stream
    for ($n = 0; $n -lt $frequencies.Count; $n++) {
        $freq = $frequencies[$n]
        $dur = $durations[$n]
        $samples = [int]($sampleRate * $dur / 1000)
        $fadeLen = [Math]::Min($samples / 5, 400)
        for ($s = 0; $s -lt $samples; $s++) {
            $t = $s / $sampleRate
            $env = 1.0
            if ($s -lt $fadeLen) { $env = $s / $fadeLen }
            if ($s -gt ($samples - $fadeLen)) { $env = ($samples - $s) / $fadeLen }
            $val = [Math]::Sin(2 * [Math]::PI * $freq * $t) * $env * 1.0
            $writer.Write([Int16]([Math]::Max(-32768, [Math]::Min(32767, [int]($val * 32767)))))
        }
    }

    $writer.Close()
    $stream.Close()

    try {
        $player = New-Object System.Media.SoundPlayer($filePath)
        $player.PlaySync()
        $player.Dispose()
    } finally {
        Remove-Item $filePath -Force -ErrorAction SilentlyContinue
    }
}

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
        # Bright ascending tada: C5 → E5 → G5 → C6
        Play-Chime @(523, 659, 784, 1047) @(120, 120, 120, 250)
    } else {
        # Descending minor failure: G4 → Eb4 → C4
        Play-Chime @(392, 311, 262) @(150, 150, 300)
    }
} catch {
    # Some systems do not support audio feedback.
}

exit $exitCode
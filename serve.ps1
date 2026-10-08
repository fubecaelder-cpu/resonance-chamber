# Tiny static server (PowerShell fallback): explicit MIME types + basic Range support. Usage: serve.ps1 -Port 8765
param([int]$Port = 8765)
$root = $PSScriptRoot
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mp4'='video/mp4'; '.mp3'='audio/mpeg';
            '.png'='image/png'; '.jpg'='image/jpeg'; '.json'='application/json'; '.css'='text/css'; '.md'='text/markdown; charset=utf-8' }
$l = New-Object System.Net.HttpListener; $l.Prefixes.Add("http://localhost:$Port/"); $l.Prefixes.Add("http://127.0.0.1:$Port/"); $l.Start()
while ($l.IsListening) {
  $c = $l.GetContext(); $req = $c.Request; $res = $c.Response
  try {
    $p = [Uri]::UnescapeDataString($req.Url.AbsolutePath); if ($p.EndsWith('/')) { $p += 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $p.TrimStart('/')))
    if (-not $file.StartsWith($root) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) { $res.StatusCode = 404; $res.Close(); continue }
    $ext = [IO.Path]::GetExtension($file).ToLower(); $ct = $types[$ext]; if (-not $ct) { $ct = 'application/octet-stream' }
    $fs = [IO.File]::OpenRead($file); $size = $fs.Length; $start = 0; $end = $size - 1
    $res.ContentType = $ct; $res.AddHeader('Accept-Ranges','bytes'); $res.AddHeader('Cache-Control','no-store')
    $rng = $req.Headers['Range']
    if ($rng -match '^bytes=(\d*)-(\d*)$' -and ($matches[1] -or $matches[2])) {
      if ($matches[1] -eq '') { $start = [Math]::Max(0, $size - [int64]$matches[2]) } else { $start = [int64]$matches[1]; if ($matches[2]) { $end = [Math]::Min([int64]$matches[2], $end) } }
      $res.StatusCode = 206; $res.AddHeader('Content-Range', "bytes $start-$end/$size")
    }
    $len = $end - $start + 1; $res.ContentLength64 = $len
    if ($req.HttpMethod -ne 'HEAD') {
      $fs.Seek($start, 'Begin') | Out-Null; $buf = New-Object byte[] 65536
      while ($len -gt 0) { $n = $fs.Read($buf, 0, [Math]::Min($buf.Length, $len)); if ($n -le 0) { break }; $res.OutputStream.Write($buf, 0, $n); $len -= $n }
    }
    $fs.Close()
  } catch { } finally { try { $res.Close() } catch { } }
}

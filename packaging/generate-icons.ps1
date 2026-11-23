$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$sourcePath = Join-Path $root 'logo-toolkit.png'
$outputDir = Join-Path $root 'extension\public\icons'
if (!(Test-Path -LiteralPath $sourcePath)) { throw "Không tìm thấy logo: $sourcePath" }
New-Item -Path $outputDir -ItemType Directory -Force | Out-Null

$source = [System.Drawing.Image]::FromFile($sourcePath)
try {
  # Chỉ lấy phần hình, không lấy chữ. Vùng cắt vuông đặt biểu tượng ở chính giữa.
  $crop = New-Object System.Drawing.Rectangle(320, 95, 715, 715)
  foreach ($size in @(16, 32, 48, 128)) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
    try {
      $diameter = [Math]::Max(4, [int][Math]::Round($size * 0.32))
      $edge = $size - $diameter
      $shape.AddArc(0, 0, $diameter, $diameter, 180, 90)
      $shape.AddArc($edge, 0, $diameter, $diameter, 270, 90)
      $shape.AddArc($edge, $edge, $diameter, $diameter, 0, 90)
      $shape.AddArc(0, $edge, $diameter, $diameter, 90, 90)
      $shape.CloseFigure()

      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SetClip($shape)
      $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 0, $size, $size)), $crop, [System.Drawing.GraphicsUnit]::Pixel)
      $bitmap.Save((Join-Path $outputDir "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $shape.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
} finally {
  $source.Dispose()
}

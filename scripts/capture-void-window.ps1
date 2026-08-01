[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [long]$Hwnd,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [string]$SidecarPath
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class VoidWindowCaptureNative
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint flags);

    [DllImport("user32.dll")]
    public static extern uint GetDpiForWindow(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr dpiContext);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(
        IntPtr hWnd,
        int attribute,
        out RECT value,
        int size
    );
}
'@

Add-Type -AssemblyName System.Drawing

$dpiAwarenessContextPerMonitorAwareV2 = [IntPtr]::new(-4)
$null = [VoidWindowCaptureNative]::SetProcessDpiAwarenessContext(
    $dpiAwarenessContextPerMonitorAwareV2
)
$previousThreadDpiContext = [VoidWindowCaptureNative]::SetThreadDpiAwarenessContext(
    $dpiAwarenessContextPerMonitorAwareV2
)

$targetHwnd = [IntPtr]::new($Hwnd)
if (-not [VoidWindowCaptureNative]::IsWindow($targetHwnd)) {
    throw "The supplied HWND is not a live window: $Hwnd"
}

$windowRect = New-Object VoidWindowCaptureNative+RECT
if (-not [VoidWindowCaptureNative]::GetWindowRect($targetHwnd, [ref]$windowRect)) {
    $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "GetWindowRect failed for HWND $Hwnd (Win32 error $errorCode)."
}

$captureRect = $windowRect
$dwmRect = New-Object VoidWindowCaptureNative+RECT
$dwmExtendedFrameBounds = 9
$dwmResult = [VoidWindowCaptureNative]::DwmGetWindowAttribute(
    $targetHwnd,
    $dwmExtendedFrameBounds,
    [ref]$dwmRect,
    [Runtime.InteropServices.Marshal]::SizeOf($dwmRect)
)
if ($dwmResult -eq 0 -and $dwmRect.Right -gt $dwmRect.Left -and $dwmRect.Bottom -gt $dwmRect.Top) {
    $captureRect = $dwmRect
}

$windowWidth = $windowRect.Right - $windowRect.Left
$windowHeight = $windowRect.Bottom - $windowRect.Top
$captureWidth = $captureRect.Right - $captureRect.Left
$captureHeight = $captureRect.Bottom - $captureRect.Top
if ($windowWidth -le 0 -or $windowHeight -le 0 -or $captureWidth -le 0 -or $captureHeight -le 0) {
    throw "The supplied HWND has invalid window or DWM bounds."
}

$resolvedOutputPath = [IO.Path]::GetFullPath($OutputPath)
if ([string]::IsNullOrWhiteSpace($SidecarPath)) {
    $SidecarPath = "$resolvedOutputPath.json"
}
$resolvedSidecarPath = [IO.Path]::GetFullPath($SidecarPath)
foreach ($directory in @(
    [IO.Path]::GetDirectoryName($resolvedOutputPath),
    [IO.Path]::GetDirectoryName($resolvedSidecarPath)
)) {
    if (-not [string]::IsNullOrWhiteSpace($directory)) {
        $null = New-Item -ItemType Directory -Path $directory -Force
    }
}

$pwRenderFullContent = 2
$captureMethod = 'PrintWindow(PW_RENDERFULLCONTENT)'
$potentiallyOccluded = $false
$fallbackReason = $null
$fullBitmap = $null
$capturedBitmap = $null

try {
    $fullBitmap = New-Object System.Drawing.Bitmap($windowWidth, $windowHeight)
    $printGraphics = [System.Drawing.Graphics]::FromImage($fullBitmap)
    try {
        $printHdc = $printGraphics.GetHdc()
        try {
            $printSucceeded = [VoidWindowCaptureNative]::PrintWindow(
                $targetHwnd,
                $printHdc,
                $pwRenderFullContent
            )
        }
        finally {
            $printGraphics.ReleaseHdc($printHdc)
        }
    }
    finally {
        $printGraphics.Dispose()
    }

    if ($printSucceeded) {
        $cropLeft = $captureRect.Left - $windowRect.Left
        $cropTop = $captureRect.Top - $windowRect.Top
        if (
            $cropLeft -lt 0 -or $cropTop -lt 0 -or
            ($cropLeft + $captureWidth) -gt $windowWidth -or
            ($cropTop + $captureHeight) -gt $windowHeight
        ) {
            throw 'DWM extended-frame bounds fall outside the PrintWindow bitmap.'
        }
        $crop = New-Object System.Drawing.Rectangle(
            $cropLeft,
            $cropTop,
            $captureWidth,
            $captureHeight
        )
        $capturedBitmap = $fullBitmap.Clone(
            $crop,
            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
        )
    }
    else {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        $fallbackReason = "PrintWindow returned false (Win32 error $errorCode)."
        $captureMethod = 'CopyFromScreen'
        $potentiallyOccluded = $true
        $capturedBitmap = New-Object System.Drawing.Bitmap($captureWidth, $captureHeight)
        $screenGraphics = [System.Drawing.Graphics]::FromImage($capturedBitmap)
        try {
            $screenGraphics.CopyFromScreen(
                $captureRect.Left,
                $captureRect.Top,
                0,
                0,
                (New-Object System.Drawing.Size($captureWidth, $captureHeight)),
                [System.Drawing.CopyPixelOperation]::SourceCopy
            )
        }
        finally {
            $screenGraphics.Dispose()
        }
    }

    $capturedBitmap.Save(
        $resolvedOutputPath,
        [System.Drawing.Imaging.ImageFormat]::Png
    )

    $metadata = [ordered]@{
        schema_version = 'void-window-capture/v1'
        captured_at_utc = [DateTime]::UtcNow.ToString('o')
        hwnd = ('0x{0:X}' -f $Hwnd)
        dpi_awareness = 'PerMonitorV2'
        dpi = [VoidWindowCaptureNative]::GetDpiForWindow($targetHwnd)
        capture_method = $captureMethod
        potentially_occluded = $potentiallyOccluded
        fallback_reason = $fallbackReason
        output_path = $resolvedOutputPath
        window_rect = [ordered]@{
            left = $windowRect.Left
            top = $windowRect.Top
            right = $windowRect.Right
            bottom = $windowRect.Bottom
        }
        dwm_extended_frame_bounds = if ($dwmResult -eq 0) {
            [ordered]@{
                left = $dwmRect.Left
                top = $dwmRect.Top
                right = $dwmRect.Right
                bottom = $dwmRect.Bottom
            }
        } else { $null }
        capture_bounds = [ordered]@{
            left = $captureRect.Left
            top = $captureRect.Top
            right = $captureRect.Right
            bottom = $captureRect.Bottom
            width = $captureWidth
            height = $captureHeight
        }
    }
    $metadata | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $resolvedSidecarPath -Encoding utf8
}
finally {
    if ($null -ne $capturedBitmap) {
        $capturedBitmap.Dispose()
    }
    if ($null -ne $fullBitmap) {
        $fullBitmap.Dispose()
    }
    if ($previousThreadDpiContext -ne [IntPtr]::Zero) {
        $null = [VoidWindowCaptureNative]::SetThreadDpiAwarenessContext(
            $previousThreadDpiContext
        )
    }
}

[PSCustomObject]@{
    image = $resolvedOutputPath
    sidecar = $resolvedSidecarPath
    capture_method = $captureMethod
    potentially_occluded = $potentiallyOccluded
}

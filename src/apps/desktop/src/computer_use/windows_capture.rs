//! Windows foreground/window capture adapter foundation.

#![allow(dead_code)]

use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
use log::warn;
use void_core::util::errors::{VoidError, VoidResult};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute};
use windows::Win32::Graphics::Gdi::{
    BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC,
    DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDC, GetDIBits, GetWindowDC, RGBQUAD, ReleaseDC,
    SRCCOPY, SelectObject,
};
use windows::Win32::Storage::Xps::{PRINT_WINDOW_FLAGS, PrintWindow};
use windows::Win32::UI::WindowsAndMessaging::{
    GA_ROOT, GetAncestor, GetForegroundWindow, GetWindowRect, IsIconic, WindowFromPoint,
};

const PW_RENDERFULLCONTENT: PRINT_WINDOW_FLAGS = PRINT_WINDOW_FLAGS(2u32);
const DWM_CROP_INSET_PX: i32 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CaptureSource {
    PrintWindow,
    WindowsGraphicsCapture,
    BitBltScreenRegion,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CaptureRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl CaptureRect {
    pub fn new(left: i32, top: i32, right: i32, bottom: i32) -> Option<Self> {
        if right <= left || bottom <= top {
            return None;
        }
        Some(Self {
            left,
            top,
            right,
            bottom,
        })
    }

    pub fn width(self) -> u32 {
        (self.right - self.left) as u32
    }

    pub fn height(self) -> u32 {
        (self.bottom - self.top) as u32
    }
}

impl From<RECT> for CaptureRect {
    fn from(value: RECT) -> Self {
        Self {
            left: value.left,
            top: value.top,
            right: value.right,
            bottom: value.bottom,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DwmCrop {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub origin_offset_x: i32,
    pub origin_offset_y: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WindowCaptureMetadata {
    pub source: CaptureSource,
    pub potentially_occluded: bool,
    pub origin_x: i32,
    pub origin_y: i32,
    pub width: u32,
    pub height: u32,
}

impl WindowCaptureMetadata {
    pub fn from_source(source: CaptureSource, rect: CaptureRect, occluded: bool) -> Self {
        Self {
            source,
            potentially_occluded: source == CaptureSource::BitBltScreenRegion || occluded,
            origin_x: rect.left,
            origin_y: rect.top,
            width: rect.width(),
            height: rect.height(),
        }
    }
}

pub struct WindowCapture {
    pub png: Vec<u8>,
    pub metadata: WindowCaptureMetadata,
}

pub fn is_mostly_black_bgra(data: &[u8], width: u32, height: u32) -> bool {
    if data.len() < 16 {
        return true;
    }
    let pixel_count = (width as usize).saturating_mul(height as usize);
    if pixel_count == 0 {
        return true;
    }
    let available = data.len() / 4;
    if available == 0 {
        return true;
    }
    let sample_count = available.min(pixel_count);
    let stride = (sample_count / 1024).max(1);
    let mut sampled = 0usize;
    let mut black = 0usize;
    for i in (0..sample_count).step_by(stride) {
        let off = i * 4;
        if off + 2 >= data.len() {
            continue;
        }
        if data[off] == 0 && data[off + 1] == 0 && data[off + 2] == 0 {
            black += 1;
        }
        sampled += 1;
    }
    sampled > 0 && (black * 200) >= (sampled * 199)
}

pub fn compute_dwm_crop(
    win_rect: CaptureRect,
    dwm_rect: Option<CaptureRect>,
    bitmap_width: i32,
    bitmap_height: i32,
) -> Option<DwmCrop> {
    let dwm = dwm_rect?;
    let off_x = (dwm.left - win_rect.left) + DWM_CROP_INSET_PX;
    let off_y = (dwm.top - win_rect.top) + DWM_CROP_INSET_PX;
    let crop_w = (dwm.right - dwm.left) - 2 * DWM_CROP_INSET_PX;
    let crop_h = (dwm.bottom - dwm.top) - 2 * DWM_CROP_INSET_PX;
    if off_x < 0
        || off_y < 0
        || crop_w <= 0
        || crop_h <= 0
        || off_x + crop_w > bitmap_width
        || off_y + crop_h > bitmap_height
    {
        return None;
    }
    Some(DwmCrop {
        x: off_x,
        y: off_y,
        width: crop_w as u32,
        height: crop_h as u32,
        origin_offset_x: off_x,
        origin_offset_y: off_y,
    })
}

pub fn target_is_obscured(hwnd: HWND) -> bool {
    if hwnd.is_invalid() {
        return false;
    }
    let mut rect = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
        return false;
    }
    let w = rect.right - rect.left;
    let h = rect.bottom - rect.top;
    if w <= 4 || h <= 4 {
        return false;
    }
    let points = [
        POINT {
            x: rect.left + 2,
            y: rect.top + 2,
        },
        POINT {
            x: rect.right - 3,
            y: rect.top + 2,
        },
        POINT {
            x: rect.left + 2,
            y: rect.bottom - 3,
        },
        POINT {
            x: rect.right - 3,
            y: rect.bottom - 3,
        },
        POINT {
            x: (rect.left + rect.right) / 2,
            y: (rect.top + rect.bottom) / 2,
        },
    ];
    let target_root = unsafe { GetAncestor(hwnd, GA_ROOT) };
    let mut covered = 0usize;
    for point in points {
        let owner = unsafe { WindowFromPoint(point) };
        if owner.is_invalid() {
            continue;
        }
        let owner_root = unsafe { GetAncestor(owner, GA_ROOT) };
        if owner_root != target_root {
            covered += 1;
        }
    }
    covered >= 2
}

pub fn is_iconic(hwnd: HWND) -> bool {
    !hwnd.is_invalid() && unsafe { IsIconic(hwnd).as_bool() }
}

pub fn capture_foreground_window() -> VoidResult<WindowCapture> {
    let hwnd = unsafe { GetForegroundWindow() };
    capture_window(hwnd)
}

pub fn capture_window(hwnd: HWND) -> VoidResult<WindowCapture> {
    unsafe { capture_window_unsafe(hwnd) }
}

pub fn screenshot_window_via_wgc(hwnd: HWND) -> VoidResult<(Vec<u8>, u32, u32)> {
    let _ = hwnd;
    Err(VoidError::tool(
        "Windows Graphics Capture is not implemented for this adapter yet.".to_string(),
    ))
}

unsafe fn capture_window_unsafe(hwnd: HWND) -> VoidResult<WindowCapture> {
    if hwnd.is_invalid() {
        return Err(VoidError::tool(
            "windows_capture: foreground HWND is invalid".to_string(),
        ));
    }
    if is_iconic(hwnd) {
        return Err(VoidError::tool(
            "windows_capture: minimized windows have no reliable rendered content".to_string(),
        ));
    }

    let mut raw_rect = RECT::default();
    GetWindowRect(hwnd, &mut raw_rect)
        .map_err(|e| VoidError::tool(format!("windows_capture: GetWindowRect failed: {e}")))?;
    let win_rect = CaptureRect::new(raw_rect.left, raw_rect.top, raw_rect.right, raw_rect.bottom)
        .ok_or_else(|| {
        VoidError::tool("windows_capture: window bounds are empty".to_string())
    })?;
    let w = win_rect.width() as i32;
    let h = win_rect.height() as i32;

    let window_dc = GetWindowDC(Some(hwnd));
    let mem_dc = CreateCompatibleDC(Some(window_dc));
    let bitmap = CreateCompatibleBitmap(window_dc, w, h);
    let old_bitmap = SelectObject(mem_dc, bitmap.into());

    let pw_ok = PrintWindow(hwnd, mem_dc, PW_RENDERFULLCONTENT);
    if !pw_ok.as_bool() {
        let _ = BitBlt(mem_dc, 0, 0, w, h, Some(window_dc), 0, 0, SRCCOPY);
    }

    let dwm_rect = {
        let mut rect = RECT::default();
        let hr = DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut _ as *mut _,
            std::mem::size_of::<RECT>() as u32,
        );
        hr.ok()
            .and_then(|_| CaptureRect::new(rect.left, rect.top, rect.right, rect.bottom))
    };

    let pixels = get_bitmap_bgra(mem_dc, bitmap, w, h, "windows_capture")?;
    SelectObject(mem_dc, old_bitmap);
    let _ = DeleteObject(bitmap.into());
    let _ = DeleteDC(mem_dc);
    let _ = ReleaseDC(Some(hwnd), window_dc);

    let (pixels, rect) = crop_pixels_to_dwm_frame(pixels, w, h, win_rect, dwm_rect);

    if is_mostly_black_bgra(&pixels, rect.width(), rect.height()) {
        if let Ok((alt_pixels, alt_w, alt_h)) = screenshot_window_via_wgc(hwnd) {
            let alt_rect = CaptureRect::new(
                win_rect.left,
                win_rect.top,
                win_rect.left + alt_w as i32,
                win_rect.top + alt_h as i32,
            )
            .ok_or_else(|| {
                VoidError::tool("windows_capture: WGC returned empty bounds".to_string())
            })?;
            return Ok(WindowCapture {
                png: encode_bgra_to_png(&alt_pixels, alt_w, alt_h)?,
                metadata: WindowCaptureMetadata::from_source(
                    CaptureSource::WindowsGraphicsCapture,
                    alt_rect,
                    false,
                ),
            });
        }
        let occluded = target_is_obscured(hwnd);
        match capture_via_screen_region(hwnd) {
            Ok((alt_pixels, alt_rect)) => {
                return Ok(WindowCapture {
                    png: encode_bgra_to_png(&alt_pixels, alt_rect.width(), alt_rect.height())?,
                    metadata: WindowCaptureMetadata::from_source(
                        CaptureSource::BitBltScreenRegion,
                        alt_rect,
                        occluded,
                    ),
                });
            }
            Err(e) => {
                warn!(
                    "windows_capture: PrintWindow returned mostly black and BitBlt fallback failed: {e}"
                );
            }
        }
    }

    Ok(WindowCapture {
        png: encode_bgra_to_png(&pixels, rect.width(), rect.height())?,
        metadata: WindowCaptureMetadata::from_source(CaptureSource::PrintWindow, rect, false),
    })
}

unsafe fn capture_via_screen_region(hwnd: HWND) -> VoidResult<(Vec<u8>, CaptureRect)> {
    let mut raw_rect = RECT::default();
    GetWindowRect(hwnd, &mut raw_rect).map_err(|e| {
        VoidError::tool(format!(
            "windows_capture: BitBlt fallback GetWindowRect failed: {e}"
        ))
    })?;
    let rect = CaptureRect::new(raw_rect.left, raw_rect.top, raw_rect.right, raw_rect.bottom)
        .ok_or_else(|| VoidError::tool("windows_capture: BitBlt bounds are empty".to_string()))?;
    let w = rect.width() as i32;
    let h = rect.height() as i32;
    let screen_dc = GetDC(None);
    let mem_dc = CreateCompatibleDC(Some(screen_dc));
    let bitmap = CreateCompatibleBitmap(screen_dc, w, h);
    let old_bitmap = SelectObject(mem_dc, bitmap.into());
    let blt_ok = BitBlt(
        mem_dc,
        0,
        0,
        w,
        h,
        Some(screen_dc),
        rect.left,
        rect.top,
        SRCCOPY,
    );
    let pixels = get_bitmap_bgra(mem_dc, bitmap, w, h, "windows_capture BitBlt fallback")?;
    SelectObject(mem_dc, old_bitmap);
    let _ = DeleteObject(bitmap.into());
    let _ = DeleteDC(mem_dc);
    let _ = ReleaseDC(None, screen_dc);
    if blt_ok.is_err() {
        return Err(VoidError::tool(format!(
            "windows_capture: BitBlt fallback failed: {blt_ok:?}"
        )));
    }
    Ok((pixels, rect))
}

unsafe fn get_bitmap_bgra(
    mem_dc: windows::Win32::Graphics::Gdi::HDC,
    bitmap: windows::Win32::Graphics::Gdi::HBITMAP,
    w: i32,
    h: i32,
    label: &str,
) -> VoidResult<Vec<u8>> {
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            biSizeImage: (w * h * 4) as u32,
            ..Default::default()
        },
        bmiColors: [RGBQUAD::default(); 1],
    };
    let mut pixels = vec![0u8; (w * h * 4) as usize];
    let ok = GetDIBits(
        mem_dc,
        bitmap,
        0,
        h as u32,
        Some(pixels.as_mut_ptr() as *mut _),
        &mut bmi,
        DIB_RGB_COLORS,
    );
    if ok == 0 {
        return Err(VoidError::tool(format!("{label}: GetDIBits returned 0")));
    }
    Ok(pixels)
}

fn crop_pixels_to_dwm_frame(
    pixels: Vec<u8>,
    bitmap_width: i32,
    bitmap_height: i32,
    win_rect: CaptureRect,
    dwm_rect: Option<CaptureRect>,
) -> (Vec<u8>, CaptureRect) {
    let Some(crop) = compute_dwm_crop(win_rect, dwm_rect, bitmap_width, bitmap_height) else {
        return (pixels, win_rect);
    };
    let stride_full = (bitmap_width * 4) as usize;
    let stride_crop = (crop.width * 4) as usize;
    let mut cropped = vec![0u8; (crop.width * crop.height * 4) as usize];
    for row in 0..crop.height as usize {
        let src_row = (crop.y as usize + row) * stride_full + (crop.x as usize) * 4;
        let dst_row = row * stride_crop;
        cropped[dst_row..dst_row + stride_crop]
            .copy_from_slice(&pixels[src_row..src_row + stride_crop]);
    }
    let rect = CaptureRect {
        left: win_rect.left + crop.origin_offset_x,
        top: win_rect.top + crop.origin_offset_y,
        right: win_rect.left + crop.origin_offset_x + crop.width as i32,
        bottom: win_rect.top + crop.origin_offset_y + crop.height as i32,
    };
    (cropped, rect)
}

fn encode_bgra_to_png(bgra: &[u8], width: u32, height: u32) -> VoidResult<Vec<u8>> {
    if bgra.len() as u64 != width as u64 * height as u64 * 4 {
        return Err(VoidError::tool(format!(
            "windows_capture: BGRA buffer size {} does not match {width}x{height}",
            bgra.len()
        )));
    }
    let mut rgba = bgra.to_vec();
    for px in rgba.chunks_exact_mut(4) {
        px.swap(0, 2);
    }
    let image =
        ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(width, height, rgba).ok_or_else(|| {
            VoidError::tool(format!(
                "windows_capture: invalid RGBA buffer for {width}x{height}"
            ))
        })?;
    let mut bytes = Vec::new();
    DynamicImage::ImageRgba8(image)
        .write_to(&mut std::io::Cursor::new(&mut bytes), ImageFormat::Png)
        .map_err(|e| VoidError::tool(format!("windows_capture: PNG encode failed: {e}")))?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_foreground_capture_black_bgra_detects_printwindow_failure() {
        let data = vec![0u8; 64 * 64 * 4];
        assert!(is_mostly_black_bgra(&data, 64, 64));
    }

    #[test]
    fn windows_foreground_capture_black_bgra_allows_dark_nonblack_ui() {
        let mut data = vec![0u8; 64 * 64 * 4];
        for px in data.chunks_exact_mut(4) {
            px[0] = 1;
        }
        assert!(!is_mostly_black_bgra(&data, 64, 64));
    }

    #[test]
    fn windows_foreground_capture_dwm_crop_updates_origin_offset() {
        let win = CaptureRect::new(10, 20, 130, 100).unwrap();
        let dwm = CaptureRect::new(18, 28, 122, 92).unwrap();
        let crop = compute_dwm_crop(win, Some(dwm), 120, 80).unwrap();
        assert_eq!(crop.x, 9);
        assert_eq!(crop.y, 9);
        assert_eq!(crop.width, 102);
        assert_eq!(crop.height, 62);
        assert_eq!(crop.origin_offset_x, 9);
        assert_eq!(crop.origin_offset_y, 9);
    }

    #[test]
    fn windows_foreground_capture_bitblt_metadata_is_occlusion_uncertain() {
        let meta = WindowCaptureMetadata::from_source(
            CaptureSource::BitBltScreenRegion,
            CaptureRect::new(-20, 30, 180, 230).unwrap(),
            true,
        );
        assert!(meta.potentially_occluded);
        assert_eq!(meta.source, CaptureSource::BitBltScreenRegion);
        assert_eq!(meta.origin_x, -20);
        assert_eq!(meta.width, 200);
    }

    #[test]
    fn windows_foreground_capture_bitblt_is_uncertain_even_without_observed_obstruction() {
        let meta = WindowCaptureMetadata::from_source(
            CaptureSource::BitBltScreenRegion,
            CaptureRect::new(0, 0, 200, 100).unwrap(),
            false,
        );
        assert!(meta.potentially_occluded);
    }
}

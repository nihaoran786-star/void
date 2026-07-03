//! Windows UI Automation (UIA) tree walk for stable screen coordinates.

use crate::computer_use::ui_locate_common;
use std::collections::{BTreeSet, VecDeque};
use std::time::{SystemTime, UNIX_EPOCH};
use void_core::agentic::tools::computer_use_host::{
    AppInfo, AppStateSnapshot, AxNode, OcrAccessibilityHit, UiElementLocateQuery,
    UiElementLocateResult,
};
use void_core::util::errors::{VoidError, VoidResult};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationCacheRequest, IUIAutomationElement,
    IUIAutomationTreeWalker, TreeScope_Subtree, UIA_AutomationIdPropertyId,
    UIA_BoundingRectanglePropertyId, UIA_ControlTypePropertyId, UIA_ExpandCollapsePatternId,
    UIA_HelpTextPropertyId, UIA_InvokePatternId, UIA_IsEnabledPropertyId,
    UIA_IsOffscreenPropertyId, UIA_LocalizedControlTypePropertyId, UIA_NamePropertyId,
    UIA_RangeValuePatternId, UIA_ScrollPatternId, UIA_SelectionItemPatternId, UIA_TextPatternId,
    UIA_TogglePatternId, UIA_ValuePatternId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId,
};

const DEFAULT_MAX_DEPTH: u32 = 48;
const DEFAULT_MAX_TOTAL_ELEMENTS: usize = 12_000;
const BUILD_CACHE_MAX_ATTEMPTS: usize = 3;
const BUILD_CACHE_BACKOFF_MS: u64 = 40;

fn bstr_to_string(b: windows_core::BSTR) -> String {
    b.to_string()
}

fn walker_children(
    walker: &IUIAutomationTreeWalker,
    parent: &IUIAutomationElement,
) -> VoidResult<Vec<IUIAutomationElement>> {
    let mut out = Vec::new();
    let first = unsafe { walker.GetFirstChildElement(parent) };
    let Ok(mut cur) = first else {
        return Ok(out);
    };
    loop {
        out.push(cur.clone());
        let next = unsafe { walker.GetNextSiblingElement(&cur) };
        match next {
            Ok(n) => cur = n,
            Err(_) => break,
        }
    }
    Ok(out)
}

fn localized_control_type_string(elem: &IUIAutomationElement) -> String {
    unsafe {
        elem.CurrentLocalizedControlType()
            .map(bstr_to_string)
            .unwrap_or_default()
    }
}

fn option_nonempty(s: String) -> Option<String> {
    if s.trim().is_empty() { None } else { Some(s) }
}

fn window_text(hwnd: HWND) -> String {
    let len = unsafe { GetWindowTextLengthW(hwnd) };
    if len <= 0 {
        return String::new();
    }
    let mut buf = vec![0u16; (len + 1) as usize];
    let written = unsafe { GetWindowTextW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..(written as usize).min(buf.len())])
}

fn foreground_app_info(hwnd: HWND) -> AppInfo {
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    let title = window_text(hwnd);
    AppInfo {
        name: if title.trim().is_empty() {
            "Foreground Window".to_string()
        } else {
            title
        },
        bundle_id: None,
        pid: if pid == 0 { None } else { Some(pid as i32) },
        running: true,
        last_used_ms: None,
        launch_count: 0,
    }
}

fn detect_cached_actions(elem: &IUIAutomationElement, role: &str) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    let mut push = |action: &str| {
        if seen.insert(action.to_string()) {
            out.push(action.to_string());
        }
    };

    let checks = [
        (UIA_InvokePatternId, "invoke"),
        (UIA_TogglePatternId, "toggle"),
        (UIA_SelectionItemPatternId, "select"),
        (UIA_ExpandCollapsePatternId, "expand"),
        (UIA_ValuePatternId, "set_value"),
        (UIA_RangeValuePatternId, "set_range_value"),
        (UIA_TextPatternId, "text"),
        (UIA_ScrollPatternId, "scroll"),
    ];
    for (pattern, action) in checks {
        if unsafe { elem.GetCachedPattern(pattern) }.is_ok() {
            push(action);
        }
    }

    let role_lc = role.to_lowercase();
    if role_lc.contains("button") || role_lc.contains("menu item") || role_lc.contains("link") {
        push("invoke");
    }
    if role_lc.contains("combo") || role_lc.contains("split") {
        push("expand");
    }
    out
}

fn element_to_cached_uia_node(
    elem: &IUIAutomationElement,
    depth: usize,
    element_index: Option<usize>,
    parent_element_index: Option<usize>,
) -> UiaNode {
    let control_type = unsafe { elem.CachedLocalizedControlType() }
        .map(bstr_to_string)
        .unwrap_or_else(|_| localized_control_type_string(elem));
    let name = unsafe { elem.CachedName() }
        .ok()
        .map(bstr_to_string)
        .and_then(option_nonempty);
    let automation_id = unsafe { elem.CachedAutomationId() }
        .ok()
        .map(bstr_to_string)
        .and_then(option_nonempty);
    let help_text = unsafe { elem.CachedHelpText() }
        .ok()
        .map(bstr_to_string)
        .and_then(option_nonempty);
    let rect = unsafe { elem.CachedBoundingRectangle() }
        .ok()
        .and_then(|r| {
            if r.right > r.left && r.bottom > r.top {
                Some((r.left, r.top, r.right, r.bottom))
            } else {
                None
            }
        });
    let (center_x, center_y) = rect
        .map(|(l, t, r, b)| ((l + r) / 2, (t + b) / 2))
        .unwrap_or((0, 0));
    let enabled = unsafe { elem.CachedIsEnabled() }
        .map(|v| v.as_bool())
        .unwrap_or(true);

    UiaNode {
        element_index,
        control_type: if control_type.is_empty() {
            "Unknown".to_string()
        } else {
            control_type.clone()
        },
        name,
        value: None,
        automation_id,
        help_text,
        actions: detect_cached_actions(elem, &control_type),
        center_x,
        center_y,
        rect,
        msaa_role: None,
        depth,
        parent_element_index,
        enabled,
    }
}

fn build_cache_request(automation: &IUIAutomation) -> VoidResult<IUIAutomationCacheRequest> {
    let request = unsafe {
        automation.CreateCacheRequest().map_err(|e| {
            VoidError::tool(format!("UI Automation CreateCacheRequest failed: {}.", e))
        })?
    };
    let filter = unsafe {
        automation.ControlViewCondition().map_err(|e| {
            VoidError::tool(format!("UI Automation ControlViewCondition failed: {}.", e))
        })?
    };

    unsafe {
        request.SetTreeScope(TreeScope_Subtree).map_err(|e| {
            VoidError::tool(format!("UI Automation cache SetTreeScope failed: {}.", e))
        })?;
        request.SetTreeFilter(&filter).map_err(|e| {
            VoidError::tool(format!("UI Automation cache SetTreeFilter failed: {}.", e))
        })?;
        for property in [
            UIA_ControlTypePropertyId,
            UIA_LocalizedControlTypePropertyId,
            UIA_NamePropertyId,
            UIA_AutomationIdPropertyId,
            UIA_HelpTextPropertyId,
            UIA_IsEnabledPropertyId,
            UIA_IsOffscreenPropertyId,
            UIA_BoundingRectanglePropertyId,
        ] {
            request.AddProperty(property).map_err(|e| {
                VoidError::tool(format!("UI Automation cache AddProperty failed: {}.", e))
            })?;
        }
        for pattern in [
            UIA_InvokePatternId,
            UIA_TogglePatternId,
            UIA_SelectionItemPatternId,
            UIA_ExpandCollapsePatternId,
            UIA_ValuePatternId,
            UIA_RangeValuePatternId,
            UIA_TextPatternId,
            UIA_ScrollPatternId,
        ] {
            let _ = request.AddPattern(pattern);
        }
    }

    Ok(request)
}

fn build_updated_cache_with_retry(
    root: &IUIAutomationElement,
    request: &IUIAutomationCacheRequest,
) -> VoidResult<IUIAutomationElement> {
    let mut last_err = None;
    for attempt in 0..BUILD_CACHE_MAX_ATTEMPTS {
        match unsafe { root.BuildUpdatedCache(request) } {
            Ok(cached) => return Ok(cached),
            Err(e) => {
                last_err = Some(e);
                if attempt + 1 < BUILD_CACHE_MAX_ATTEMPTS {
                    std::thread::sleep(std::time::Duration::from_millis(BUILD_CACHE_BACKOFF_MS));
                }
            }
        }
    }
    Err(VoidError::tool(format!(
        "UI Automation BuildUpdatedCache failed after {} attempts: {}.",
        BUILD_CACHE_MAX_ATTEMPTS,
        last_err
            .map(|e| e.to_string())
            .unwrap_or_else(|| "unknown error".to_string())
    )))
}

fn cached_children(elem: &IUIAutomationElement) -> Vec<IUIAutomationElement> {
    let Ok(children) = (unsafe { elem.GetCachedChildren() }) else {
        return Vec::new();
    };
    let len = unsafe { children.Length() }.unwrap_or(0).max(0);
    let mut out = Vec::new();
    for idx in 0..len {
        if let Ok(child) = unsafe { children.GetElement(idx) } {
            out.push(child);
        }
    }
    out
}

fn walk_tree_full(
    automation: &IUIAutomation,
    hwnd: HWND,
    max_depth: u32,
    max_nodes: usize,
) -> VoidResult<Vec<UiaNode>> {
    let uncached_root = unsafe {
        automation.ElementFromHandle(hwnd).map_err(|e| {
            VoidError::tool(format!("UI Automation ElementFromHandle failed: {}.", e))
        })?
    };
    let cache_request = build_cache_request(automation)?;
    let root = build_updated_cache_with_retry(&uncached_root, &cache_request)?;

    struct Queued {
        el: IUIAutomationElement,
        depth: u32,
        parent_element_index: Option<usize>,
    }

    let mut q = VecDeque::new();
    q.push_back(Queued {
        el: root,
        depth: 0,
        parent_element_index: None,
    });
    let mut nodes = Vec::new();
    let mut next_actionable_idx = 0usize;

    while let Some(cur) = q.pop_front() {
        if cur.depth > max_depth {
            continue;
        }
        if nodes.len() >= max_nodes {
            return Err(VoidError::tool(
                "UI Automation snapshot limit reached; reduce max_depth or focus the target window."
                    .to_string(),
            ));
        }

        let node = element_to_cached_uia_node(
            &cur.el,
            cur.depth as usize,
            Some(next_actionable_idx),
            cur.parent_element_index,
        );
        let parent_for_children = node.element_index;
        next_actionable_idx += 1;
        nodes.push(node);

        let children = cached_children(&cur.el);
        let next_depth = cur.depth + 1;
        for ch in children {
            q.push_back(Queued {
                el: ch,
                depth: next_depth,
                parent_element_index: parent_for_children,
            });
        }
    }

    Ok(nodes)
}

#[allow(dead_code)]
pub fn get_app_state_snapshot(
    max_depth: u32,
    _focus_window_only: bool,
) -> VoidResult<AppStateSnapshot> {
    let hwnd = foreground_window_handle()?;
    get_app_state_snapshot_for_window(hwnd, max_depth, _focus_window_only)
}

pub fn foreground_window_handle() -> VoidResult<HWND> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_invalid() {
        return Err(VoidError::tool(
            "No foreground window (GetForegroundWindow returned null).".to_string(),
        ));
    }
    Ok(hwnd)
}

#[allow(dead_code)]
pub fn foreground_window_pid() -> VoidResult<i32> {
    let hwnd = foreground_window_handle()?;
    window_pid(hwnd)
}

pub fn window_pid(hwnd: HWND) -> VoidResult<i32> {
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
        return Err(VoidError::tool(
            "Windows target window has no owning process id.".to_string(),
        ));
    }
    Ok(pid as i32)
}

pub fn window_center(hwnd: HWND) -> VoidResult<(i32, i32)> {
    if hwnd.is_invalid() {
        return Err(VoidError::tool(
            "Windows target window handle is invalid.".to_string(),
        ));
    }
    let mut rect = RECT::default();
    unsafe {
        GetWindowRect(hwnd, &mut rect)
            .map_err(|e| VoidError::tool(format!("GetWindowRect failed: {e}")))?;
    }
    if rect.right <= rect.left || rect.bottom <= rect.top {
        return Err(VoidError::tool(
            "Windows target window bounds are empty.".to_string(),
        ));
    }
    Ok(((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2))
}

pub fn get_app_state_snapshot_for_window(
    hwnd: HWND,
    max_depth: u32,
    _focus_window_only: bool,
) -> VoidResult<AppStateSnapshot> {
    if hwnd.is_invalid() {
        return Err(VoidError::tool(
            "Windows target window handle is invalid.".to_string(),
        ));
    }
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }
    let automation: IUIAutomation = unsafe {
        CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).map_err(|e| {
            VoidError::tool(format!(
                "UI Automation (CoCreateInstance CUIAutomation): {}.",
                e
            ))
        })?
    };

    let max_depth = if max_depth == 0 {
        DEFAULT_MAX_DEPTH
    } else {
        max_depth.clamp(1, 200)
    };
    let ui_nodes = match walk_tree_full(&automation, hwnd, max_depth, DEFAULT_MAX_TOTAL_ELEMENTS) {
        Ok(nodes) if !nodes.is_empty() => nodes,
        Ok(_) | Err(_) if crate::computer_use::windows_msaa::is_sal_vcl_window(hwnd) => {
            crate::computer_use::windows_msaa::walk_msaa_tree(hwnd)?
        }
        Ok(_) => {
            return Err(VoidError::tool(
                "UI Automation returned an empty target-window tree.".to_string(),
            ));
        }
        Err(e) => return Err(e),
    };

    let ax_nodes = dense_reindex_nodes(&ui_nodes);
    if ax_nodes.is_empty() {
        return Err(VoidError::tool(
            "Windows accessibility snapshot contained no AX nodes.".to_string(),
        ));
    }

    Ok(AppStateSnapshot {
        app: foreground_app_info(hwnd),
        window_title: option_nonempty(window_text(hwnd)),
        nodes: ax_nodes.clone(),
        tree_text: render_nodes_text(&ui_nodes),
        digest: compute_digest(&ax_nodes),
        captured_at_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        screenshot: None,
        loop_warning: None,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct UiaNode {
    pub element_index: Option<usize>,
    pub control_type: String,
    pub name: Option<String>,
    pub value: Option<String>,
    pub automation_id: Option<String>,
    pub help_text: Option<String>,
    pub actions: Vec<String>,
    pub center_x: i32,
    pub center_y: i32,
    pub rect: Option<(i32, i32, i32, i32)>,
    pub msaa_role: Option<i32>,
    pub depth: usize,
    pub parent_element_index: Option<usize>,
    pub enabled: bool,
}

pub(crate) fn format_node_line(node: &UiaNode) -> String {
    let mut s = String::new();
    if let Some(idx) = node.element_index {
        s.push_str(&format!("- [{}] {}", idx, node.control_type));
        if let Some(name) = &node.name {
            s.push_str(&format!(" \"{}\"", name));
        }
        let mut attrs = Vec::new();
        if let Some(value) = &node.value {
            attrs.push(format!("value=\"{}\"", value));
        }
        if let Some(id) = &node.automation_id {
            attrs.push(format!("id={}", id));
        }
        if let Some(help) = &node.help_text {
            attrs.push(format!("help=\"{}\"", help));
        }
        if !node.actions.is_empty() {
            attrs.push(format!("actions=[{}]", node.actions.join(",")));
        }
        if !attrs.is_empty() {
            s.push_str(&format!(" [{}]", attrs.join(" ")));
        }
    } else {
        s.push_str(&format!("- {}", node.control_type));
        if let Some(name) = &node.name {
            s.push_str(&format!(" \"{}\"", name));
        }
        if let Some(value) = &node.value {
            s.push_str(&format!(" = \"{}\"", value));
        }
    }
    s
}

pub(crate) fn render_nodes_text(nodes: &[UiaNode]) -> String {
    let mut out = String::new();
    for node in nodes {
        for _ in 0..node.depth {
            out.push_str("  ");
        }
        out.push_str(&format_node_line(node));
        out.push('\n');
    }
    out
}

pub(crate) fn dense_reindex_nodes(nodes: &[UiaNode]) -> Vec<AxNode> {
    let mut element_to_dense = std::collections::HashMap::new();
    for (dense_idx, node) in nodes.iter().enumerate() {
        if let Some(element_index) = node.element_index {
            element_to_dense.insert(element_index, dense_idx as u32);
        }
    }

    nodes
        .iter()
        .enumerate()
        .map(|(idx, node)| {
            let frame_global = node
                .rect
                .map(|(l, t, r, b)| (l as f64, t as f64, (r - l) as f64, (b - t) as f64));
            AxNode {
                idx: idx as u32,
                parent_idx: node
                    .parent_element_index
                    .and_then(|parent| element_to_dense.get(&parent).copied()),
                role: node.control_type.clone(),
                title: node.name.clone(),
                value: node.value.clone(),
                description: None,
                identifier: node.automation_id.clone(),
                enabled: node.enabled,
                focused: false,
                selected: None,
                frame_global,
                actions: node.actions.clone(),
                role_description: None,
                subrole: None,
                help: node.help_text.clone(),
                url: None,
                expanded: None,
            }
        })
        .collect()
}

pub(crate) fn compute_digest(nodes: &[AxNode]) -> String {
    use sha1::{Digest, Sha1};

    let mut h = Sha1::new();
    for node in nodes {
        h.update(node.idx.to_le_bytes());
        h.update(node.parent_idx.unwrap_or(u32::MAX).to_le_bytes());
        h.update(node.role.as_bytes());
        h.update(b"\x1f");
        h.update(node.subrole.as_deref().unwrap_or("").as_bytes());
        h.update(b"\x1f");
        h.update(node.title.as_deref().unwrap_or("").as_bytes());
        h.update(b"\x1f");
        h.update(node.identifier.as_deref().unwrap_or("").as_bytes());
        h.update(b"\x1f");
        h.update(node.description.as_deref().unwrap_or("").as_bytes());
        h.update(b"\x1f");
        h.update(node.help.as_deref().unwrap_or("").as_bytes());
        h.update(b"\x1f");
        h.update(node.value.as_deref().unwrap_or("").as_bytes());
        h.update(b"\x1f");
        h.update(node.enabled.to_string().as_bytes());
        h.update(b"\x1f");
        for action in &node.actions {
            h.update(action.as_bytes());
            h.update(b",");
        }
        h.update(b"\n");
    }
    h.finalize().iter().map(|b| format!("{:02x}", b)).collect()
}

/// Foreground window root, then UIA RawViewWalker BFS.
pub fn locate_ui_element_center(query: &UiElementLocateQuery) -> VoidResult<UiElementLocateResult> {
    ui_locate_common::validate_query(query)?;

    if query.node_idx.is_some() {
        return Err(VoidError::tool(
            "[AX_IDX_NOT_SUPPORTED] node_idx lookup is only implemented on macOS. \
             Fall back to `text_contains` / `title_contains` + `role_substring` on this host."
                .to_string(),
        ));
    }

    let max_depth = query.max_depth.unwrap_or(48).clamp(1, 200);
    let max_nodes = 12_000usize;

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }

    let automation: IUIAutomation = unsafe {
        CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).map_err(|e| {
            VoidError::tool(format!(
                "UI Automation (CoCreateInstance CUIAutomation): {}.",
                e
            ))
        })?
    };

    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_invalid() {
        return Err(VoidError::tool(
            "No foreground window (GetForegroundWindow returned null).".to_string(),
        ));
    }

    let root = unsafe {
        automation.ElementFromHandle(hwnd).map_err(|e| {
            VoidError::tool(format!("UI Automation ElementFromHandle failed: {}.", e))
        })?
    };

    let walker = unsafe {
        automation
            .RawViewWalker()
            .map_err(|e| VoidError::tool(format!("UI Automation RawViewWalker: {}.", e)))?
    };

    struct Queued {
        el: IUIAutomationElement,
        depth: u32,
    }

    let mut q = VecDeque::new();
    q.push_back(Queued { el: root, depth: 0 });
    let mut visited = 0usize;

    loop {
        let Some(cur) = q.pop_front() else {
            return Err(VoidError::tool(
                "No UI element matched in the foreground window for this query. Refine filters or use ComputerUse screenshot. Locate uses the same UI Automation permission as mouse/keyboard automation."
                    .to_string(),
            ));
        };
        if cur.depth > max_depth {
            continue;
        }
        visited += 1;
        if visited > max_nodes {
            return Err(VoidError::tool(
                "UI Automation search limit reached; narrow title/role/identifier filters."
                    .to_string(),
            ));
        }

        let name = unsafe {
            cur.el
                .CurrentName()
                .ok()
                .map(bstr_to_string)
                .unwrap_or_default()
        };
        let ident = unsafe {
            cur.el
                .CurrentAutomationId()
                .ok()
                .map(bstr_to_string)
                .unwrap_or_default()
        };
        let role = localized_control_type_string(&cur.el);
        let help = unsafe {
            cur.el
                .CurrentHelpText()
                .ok()
                .map(bstr_to_string)
                .unwrap_or_default()
        };

        let attrs = ui_locate_common::NodeAttrs {
            role: Some(role.as_str()),
            subrole: None,
            title: Some(name.as_str()),
            value: None,
            description: None,
            identifier: Some(ident.as_str()),
            help: if help.is_empty() {
                None
            } else {
                Some(help.as_str())
            },
        };
        let matched = ui_locate_common::matches_filters_attrs(query, &attrs);
        if matched {
            let rect = unsafe { cur.el.CurrentBoundingRectangle() };
            if let Ok(r) = rect {
                if r.right > r.left && r.bottom > r.top {
                    let gx = (r.left + r.right) as f64 / 2.0;
                    let gy = (r.top + r.bottom) as f64 / 2.0;
                    let bl = r.left as f64;
                    let bt = r.top as f64;
                    let bw = (r.right - r.left) as f64;
                    let bh = (r.bottom - r.top) as f64;
                    return ui_locate_common::ok_result(
                        gx,
                        gy,
                        bl,
                        bt,
                        bw,
                        bh,
                        role,
                        if name.is_empty() { None } else { Some(name) },
                        if ident.is_empty() { None } else { Some(ident) },
                    );
                }
            }
        }

        let children = walker_children(&walker, &cur.el)?;
        let next_depth = cur.depth + 1;
        for ch in children {
            q.push_back(Queued {
                el: ch,
                depth: next_depth,
            });
        }
    }
}

/// Hit-test UIA at global screen coordinates (OCR `move_to_text` disambiguation).
pub fn accessibility_hit_at_global_point(
    gx: f64,
    gy: f64,
) -> VoidResult<Option<OcrAccessibilityHit>> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }
    let automation: IUIAutomation = unsafe {
        CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
            .map_err(|e| VoidError::tool(format!("UI Automation (CoCreateInstance): {}.", e)))?
    };
    let pt = POINT {
        x: gx.round() as i32,
        y: gy.round() as i32,
    };
    let elem = unsafe { automation.ElementFromPoint(pt) };
    let elem = match elem {
        Ok(e) => e,
        Err(_) => return Ok(None),
    };
    let name = unsafe {
        elem.CurrentName()
            .ok()
            .map(bstr_to_string)
            .unwrap_or_default()
    };
    let ident = unsafe {
        elem.CurrentAutomationId()
            .ok()
            .map(bstr_to_string)
            .unwrap_or_default()
    };
    let role = localized_control_type_string(&elem);
    let parent_context = if let Ok(walker) = unsafe { automation.ControlViewWalker() } {
        unsafe { walker.GetParentElement(&elem) }
            .ok()
            .and_then(|parent| {
                let pn = unsafe {
                    parent
                        .CurrentName()
                        .ok()
                        .map(bstr_to_string)
                        .unwrap_or_default()
                };
                let pr = localized_control_type_string(&parent);
                let s = format!("{}: {}", pr, pn);
                if s == ": " || s.trim().is_empty() {
                    None
                } else {
                    Some(s)
                }
            })
    } else {
        None
    };
    let desc = format!(
        "role={} name={:?} id={:?} parent={:?}",
        role, name, ident, parent_context
    );
    Ok(Some(OcrAccessibilityHit {
        role: if role.is_empty() { None } else { Some(role) },
        title: if name.is_empty() { None } else { Some(name) },
        identifier: if ident.is_empty() { None } else { Some(ident) },
        parent_context,
        description: desc,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(
        element_index: Option<usize>,
        parent_element_index: Option<usize>,
        depth: usize,
        control_type: &str,
        name: Option<&str>,
        value: Option<&str>,
        actions: Vec<&str>,
    ) -> UiaNode {
        UiaNode {
            element_index,
            control_type: control_type.to_string(),
            name: name.map(str::to_string),
            value: value.map(str::to_string),
            automation_id: Some(format!("id-{control_type}")),
            help_text: None,
            actions: actions.into_iter().map(str::to_string).collect(),
            center_x: 15,
            center_y: 25,
            rect: Some((10, 20, 30, 50)),
            msaa_role: None,
            depth,
            parent_element_index,
            enabled: true,
        }
    }

    #[test]
    fn windows_ax_snapshot_formats_tree_lines_with_actions_and_content_nodes() {
        let button = node(
            Some(0),
            None,
            0,
            "Button",
            Some("Save"),
            None,
            vec!["invoke"],
        );
        let text = node(
            None,
            Some(0),
            1,
            "Text",
            Some("Status"),
            Some("Ready"),
            vec![],
        );

        assert_eq!(
            format_node_line(&button),
            "- [0] Button \"Save\" [id=id-Button actions=[invoke]]"
        );
        assert_eq!(format_node_line(&text), "- Text \"Status\" = \"Ready\"");
        assert_eq!(
            render_nodes_text(&[button, text]),
            "- [0] Button \"Save\" [id=id-Button actions=[invoke]]\n  - Text \"Status\" = \"Ready\"\n"
        );
    }

    #[test]
    fn windows_ax_snapshot_dense_reindex_includes_content_nodes_and_remaps_parent() {
        let nodes = vec![
            node(
                Some(0),
                None,
                0,
                "Window",
                Some("App"),
                None,
                vec!["invoke"],
            ),
            node(None, Some(0), 1, "Text", Some("Label"), None, vec![]),
            node(
                Some(1),
                Some(0),
                1,
                "Button",
                Some("OK"),
                None,
                vec!["invoke"],
            ),
        ];

        let ax = dense_reindex_nodes(&nodes);
        assert_eq!(ax.len(), 3);
        assert_eq!(ax[0].idx, 0);
        assert_eq!(ax[0].parent_idx, None);
        assert_eq!(ax[1].idx, 1);
        assert_eq!(ax[1].parent_idx, Some(0));
        assert_eq!(ax[1].role, "Text");
        assert_eq!(ax[2].idx, 2);
        assert_eq!(ax[2].parent_idx, Some(0));
        assert_eq!(ax[2].actions, vec!["invoke".to_string()]);
        assert_eq!(ax[2].frame_global, Some((10.0, 20.0, 20.0, 30.0)));
    }

    #[test]
    fn windows_ax_snapshot_digest_is_stable_and_changes_with_actions() {
        let base = dense_reindex_nodes(&[node(
            Some(0),
            None,
            0,
            "Button",
            Some("Save"),
            None,
            vec!["invoke"],
        )]);
        let changed = dense_reindex_nodes(&[node(
            Some(0),
            None,
            0,
            "Button",
            Some("Save"),
            None,
            vec!["invoke", "expand"],
        )]);

        assert_eq!(compute_digest(&base), compute_digest(&base));
        assert_ne!(compute_digest(&base), compute_digest(&changed));
        assert_eq!(compute_digest(&base).len(), 40);
    }
}

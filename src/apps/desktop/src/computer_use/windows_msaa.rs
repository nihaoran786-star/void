//! Windows MSAA fallback helpers for UI Automation snapshots.

#![cfg(target_os = "windows")]

use std::collections::VecDeque;
use std::ffi::c_void;

use crate::computer_use::windows_ax_ui::UiaNode;
use void_core::util::errors::{VoidError, VoidResult};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Variant::{VARIANT, VT_I4};
use windows::Win32::UI::Accessibility::{
    AccessibleChildren, AccessibleObjectFromWindow, IAccessible,
};
use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, OBJID_CLIENT};
use windows_core::Interface;

pub(crate) const ROLE_SYSTEM_PUSHBUTTON: i32 = 0x2B;
pub(crate) const ROLE_SYSTEM_CHECKBUTTON: i32 = 0x2C;
pub(crate) const ROLE_SYSTEM_RADIOBUTTON: i32 = 0x2D;
pub(crate) const ROLE_SYSTEM_COMBOBOX: i32 = 0x2E;
pub(crate) const ROLE_SYSTEM_BUTTONDROPDOWN: i32 = 0x38;
pub(crate) const ROLE_SYSTEM_BUTTONMENU: i32 = 0x39;
pub(crate) const ROLE_SYSTEM_BUTTONDROPDOWNGRID: i32 = 0x3A;
pub(crate) const ROLE_SYSTEM_SPLITBUTTON: i32 = 0x3E;
pub(crate) const ROLE_SYSTEM_LINK: i32 = 0x1E;
pub(crate) const ROLE_SYSTEM_MENUITEM: i32 = 0x0C;
pub(crate) const ROLE_SYSTEM_LISTITEM: i32 = 0x22;
pub(crate) const ROLE_SYSTEM_PAGETAB: i32 = 0x25;
pub(crate) const ROLE_SYSTEM_TEXT: i32 = 0x2A;
pub(crate) const ROLE_SYSTEM_STATICTEXT: i32 = 0x29;
pub(crate) const ROLE_SYSTEM_LIST: i32 = 0x21;
pub(crate) const ROLE_SYSTEM_PAGETABLIST: i32 = 0x3C;

pub(crate) fn is_sal_class_name(class_name: &str) -> bool {
    class_name.starts_with("SAL")
}

pub(crate) fn role_to_control_type(role: i32) -> String {
    match role {
        ROLE_SYSTEM_PUSHBUTTON => "Button",
        ROLE_SYSTEM_CHECKBUTTON => "CheckBox",
        ROLE_SYSTEM_RADIOBUTTON => "RadioButton",
        ROLE_SYSTEM_COMBOBOX => "ComboBox",
        ROLE_SYSTEM_LINK => "Hyperlink",
        ROLE_SYSTEM_MENUITEM => "MenuItem",
        ROLE_SYSTEM_LIST => "List",
        ROLE_SYSTEM_LISTITEM => "ListItem",
        ROLE_SYSTEM_PAGETAB => "TabItem",
        ROLE_SYSTEM_PAGETABLIST => "Tab",
        ROLE_SYSTEM_TEXT => "Edit",
        ROLE_SYSTEM_STATICTEXT => "Text",
        ROLE_SYSTEM_BUTTONDROPDOWN
        | ROLE_SYSTEM_BUTTONMENU
        | ROLE_SYSTEM_BUTTONDROPDOWNGRID
        | ROLE_SYSTEM_SPLITBUTTON => "SplitButton",
        0 => "Unknown",
        other => return format!("Role_0x{:X}", other),
    }
    .to_string()
}

pub(crate) fn actions_for(role: i32, default_action: Option<&str>) -> Vec<String> {
    let has_default_action = default_action
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let is_dropdown = matches!(
        role,
        ROLE_SYSTEM_BUTTONDROPDOWN
            | ROLE_SYSTEM_BUTTONMENU
            | ROLE_SYSTEM_BUTTONDROPDOWNGRID
            | ROLE_SYSTEM_SPLITBUTTON
    );
    let is_clickable = matches!(
        role,
        ROLE_SYSTEM_PUSHBUTTON
            | ROLE_SYSTEM_CHECKBUTTON
            | ROLE_SYSTEM_RADIOBUTTON
            | ROLE_SYSTEM_LINK
            | ROLE_SYSTEM_MENUITEM
            | ROLE_SYSTEM_LISTITEM
            | ROLE_SYSTEM_PAGETAB
            | ROLE_SYSTEM_COMBOBOX
    );

    let mut actions = Vec::new();
    if has_default_action || is_dropdown || is_clickable {
        actions.push("invoke".to_string());
    }
    if is_dropdown {
        actions.push("expand".to_string());
    }
    actions
}

fn child_id_variant(child_id: i32) -> VARIANT {
    let mut v = VARIANT::default();
    unsafe {
        let data = &mut *v.Anonymous.Anonymous;
        data.vt = VT_I4;
        data.Anonymous.lVal = child_id;
    }
    v
}

fn variant_i4(v: &VARIANT) -> Option<i32> {
    unsafe {
        let data = &*v.Anonymous.Anonymous;
        if data.vt == VT_I4 {
            Some(data.Anonymous.lVal)
        } else {
            None
        }
    }
}

fn bstr_option(value: windows_core::Result<windows_core::BSTR>) -> Option<String> {
    value
        .ok()
        .map(|b| b.to_string())
        .filter(|s| !s.trim().is_empty())
}

fn window_class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 256];
    let len = unsafe { GetClassNameW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..len as usize])
}

pub fn is_sal_vcl_window(hwnd: HWND) -> bool {
    is_sal_class_name(&window_class_name(hwnd))
}

fn accessible_from_window(hwnd: HWND) -> VoidResult<IAccessible> {
    let mut raw: *mut c_void = std::ptr::null_mut();
    unsafe {
        AccessibleObjectFromWindow(hwnd, OBJID_CLIENT.0 as u32, &IAccessible::IID, &mut raw)
            .map_err(|e| {
                VoidError::tool(format!("MSAA AccessibleObjectFromWindow failed: {}.", e))
            })?;
        if raw.is_null() {
            return Err(VoidError::tool(
                "MSAA AccessibleObjectFromWindow returned null.".to_string(),
            ));
        }
        Ok(IAccessible::from_raw(raw))
    }
}

fn role_from_variant(v: &VARIANT) -> i32 {
    variant_i4(v).unwrap_or(0)
}

fn accessible_node(
    acc: &IAccessible,
    child: &VARIANT,
    depth: usize,
    element_index: usize,
    parent_element_index: Option<usize>,
) -> UiaNode {
    let role = unsafe { acc.get_accRole(child) }
        .ok()
        .as_ref()
        .map(role_from_variant)
        .unwrap_or(0);
    let name = unsafe { bstr_option(acc.get_accName(child)) };
    let value = unsafe { bstr_option(acc.get_accValue(child)) };
    let help_text = unsafe { bstr_option(acc.get_accHelp(child)) };
    let default_action = unsafe { bstr_option(acc.get_accDefaultAction(child)) };
    let mut left = 0;
    let mut top = 0;
    let mut width = 0;
    let mut height = 0;
    let rect = unsafe {
        acc.accLocation(&mut left, &mut top, &mut width, &mut height, child)
            .ok()
            .and_then(|_| {
                if width > 0 && height > 0 {
                    Some((left, top, left + width, top + height))
                } else {
                    None
                }
            })
    };
    let (center_x, center_y) = rect
        .map(|(l, t, r, b)| ((l + r) / 2, (t + b) / 2))
        .unwrap_or((0, 0));

    UiaNode {
        element_index: Some(element_index),
        control_type: role_to_control_type(role),
        name,
        value,
        automation_id: None,
        help_text,
        actions: actions_for(role, default_action.as_deref()),
        center_x,
        center_y,
        rect,
        msaa_role: Some(role),
        depth,
        parent_element_index,
        enabled: true,
    }
}

pub fn walk_msaa_tree(hwnd: HWND) -> VoidResult<Vec<UiaNode>> {
    let root = accessible_from_window(hwnd)?;
    let self_child = child_id_variant(0);
    let mut nodes = Vec::new();
    nodes.push(accessible_node(&root, &self_child, 0, 0, None));

    struct Queued {
        acc: IAccessible,
        depth: usize,
        parent_element_index: usize,
    }

    let mut q = VecDeque::new();
    q.push_back(Queued {
        acc: root,
        depth: 1,
        parent_element_index: 0,
    });

    while let Some(cur) = q.pop_front() {
        if nodes.len() >= 12_000 || cur.depth > 200 {
            break;
        }
        let child_count = unsafe { cur.acc.accChildCount() }.unwrap_or(0).max(0);
        if child_count == 0 {
            continue;
        }
        let mut children = vec![VARIANT::default(); child_count as usize];
        let mut obtained = 0i32;
        if unsafe { AccessibleChildren(&cur.acc, 0, &mut children, &mut obtained) }.is_err() {
            continue;
        }
        for child in children.into_iter().take(obtained.max(0) as usize) {
            let idx = nodes.len();
            if let Ok(dispatch) = unsafe { cur.acc.get_accChild(&child) } {
                if let Ok(child_acc) = dispatch.cast::<IAccessible>() {
                    nodes.push(accessible_node(
                        &child_acc,
                        &self_child,
                        cur.depth,
                        idx,
                        Some(cur.parent_element_index),
                    ));
                    q.push_back(Queued {
                        acc: child_acc,
                        depth: cur.depth + 1,
                        parent_element_index: idx,
                    });
                    continue;
                }
            }

            nodes.push(accessible_node(
                &cur.acc,
                &child,
                cur.depth,
                idx,
                Some(cur.parent_element_index),
            ));
        }
    }

    if nodes.is_empty() {
        Err(VoidError::tool("MSAA returned an empty tree.".to_string()))
    } else {
        Ok(nodes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_msaa_fallback_detects_only_sal_vcl_classes() {
        assert!(is_sal_class_name("SALFRAME"));
        assert!(is_sal_class_name("SALTMPSUBFRAME"));
        assert!(!is_sal_class_name("Chrome_WidgetWin_1"));
        assert!(!is_sal_class_name(""));
    }

    #[test]
    fn windows_msaa_fallback_maps_roles_and_dropdown_actions() {
        assert_eq!(role_to_control_type(ROLE_SYSTEM_PUSHBUTTON), "Button");
        assert_eq!(role_to_control_type(ROLE_SYSTEM_TEXT), "Edit");
        assert_eq!(
            role_to_control_type(ROLE_SYSTEM_BUTTONDROPDOWN),
            "SplitButton"
        );
        assert_eq!(role_to_control_type(0x777), "Role_0x777");

        assert_eq!(
            actions_for(ROLE_SYSTEM_BUTTONDROPDOWN, None),
            vec!["invoke".to_string(), "expand".to_string()]
        );
        assert_eq!(
            actions_for(ROLE_SYSTEM_PUSHBUTTON, None),
            vec!["invoke".to_string()]
        );
        assert_eq!(actions_for(ROLE_SYSTEM_TEXT, None), Vec::<String>::new());
        assert_eq!(
            actions_for(ROLE_SYSTEM_TEXT, Some("activate")),
            vec!["invoke".to_string()]
        );
    }
}

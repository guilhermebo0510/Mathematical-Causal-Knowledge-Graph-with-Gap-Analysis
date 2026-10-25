//! A protected DACL for this Windows account, never the permissive pipe default.
use std::ffi::c_void;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Authorization::{
        ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
    },
    Security::{GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER},
    System::Threading::{GetCurrentProcess, OpenProcessToken},
};

pub struct LocalSecurity(pub *mut c_void);
impl Drop for LocalSecurity {
    fn drop(&mut self) {
        unsafe {
            LocalFree(self.0);
        }
    }
}

pub fn current_user() -> Result<LocalSecurity, String> {
    let error = || "Não foi possível restringir o canal ao usuário Windows.".to_string();
    let mut token = std::ptr::null_mut();
    // SAFETY: process pseudo-handle is valid; returned token is exclusively owned.
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
        return Err(error());
    }
    let token = unsafe { OwnedHandle::from_raw_handle(token) };
    let mut needed = 0;
    unsafe {
        GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            std::ptr::null_mut(),
            0,
            &mut needed,
        )
    };
    if needed == 0 || needed > 65536 {
        return Err(error());
    }
    // usize storage provides alignment for TOKEN_USER and its contained SID.
    let mut buffer = vec![0usize; (needed as usize).div_ceil(std::mem::size_of::<usize>())];
    if unsafe {
        GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            buffer.as_mut_ptr().cast(),
            needed,
            &mut needed,
        )
    } == 0
    {
        return Err(error());
    }
    let user = unsafe { &*buffer.as_ptr().cast::<TOKEN_USER>() };
    let mut text = std::ptr::null_mut();
    if unsafe { ConvertSidToStringSidW(user.User.Sid, &mut text) } == 0 {
        return Err(error());
    }
    let sid_owner = LocalSecurity(text.cast());
    let mut len = 0;
    // SID strings are bounded by the Windows SID format; avoid an unbounded scan.
    while len < 256 && unsafe { *text.add(len) } != 0 {
        len += 1;
    }
    if len == 256 {
        return Err(error());
    }
    let sid = String::from_utf16(unsafe { std::slice::from_raw_parts(text, len) })
        .map_err(|_| error())?;
    drop(sid_owner);
    let descriptor: Vec<u16> = format!("D:P(A;;GA;;;{sid})")
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let mut security = std::ptr::null_mut();
    if unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            descriptor.as_ptr(),
            1,
            &mut security,
            std::ptr::null_mut(),
        )
    } == 0
    {
        return Err(error());
    }
    Ok(LocalSecurity(security))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protected_descriptor_has_one_explicit_allow_entry() {
        use windows_sys::Win32::Security::{
            GetSecurityDescriptorControl, GetSecurityDescriptorDacl, SE_DACL_PROTECTED,
        };
        let descriptor = current_user().unwrap();
        let mut present = 0;
        let mut defaulted = 0;
        let mut acl = std::ptr::null_mut();
        assert_ne!(
            unsafe {
                GetSecurityDescriptorDacl(descriptor.0, &mut present, &mut acl, &mut defaulted)
            },
            0
        );
        assert_ne!(present, 0);
        assert_eq!(defaulted, 0);
        assert!(!acl.is_null());
        assert_eq!(unsafe { (*acl).AceCount }, 1);
        let mut control = 0;
        let mut revision = 0;
        assert_ne!(
            unsafe { GetSecurityDescriptorControl(descriptor.0, &mut control, &mut revision) },
            0
        );
        assert_ne!(control & SE_DACL_PROTECTED, 0);
    }
}

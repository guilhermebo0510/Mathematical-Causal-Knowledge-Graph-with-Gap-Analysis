//! Windows child containment. No handles, PIDs or flags are supplied by the WebView.

#[cfg(windows)]
mod windows {
    use std::{
        mem::{size_of, zeroed},
        os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
        time::Duration,
    };
    use tokio::process::{Child, Command};
    use windows_sys::Win32::{
        Foundation::INVALID_HANDLE_VALUE,
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD,
                THREADENTRY32,
            },
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicAccountingInformation,
                JobObjectExtendedLimitInformation, QueryInformationJobObject,
                SetInformationJobObject, TerminateJobObject,
                JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_JOB_MEMORY, JOB_OBJECT_LIMIT_JOB_TIME,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
            Threading::{
                OpenThread, ResumeThread, CREATE_NO_WINDOW, CREATE_SUSPENDED, THREAD_SUSPEND_RESUME,
            },
        },
    };

    pub struct ProcessGroup(OwnedHandle, i64);

    // Fixed native budgets, never supplied by imported JSON or the WebView.
    // Committed virtual memory across the launcher and descendants, not RSS.
    const MEMORY_BYTES: usize = 512 * 1024 * 1024;
    // Aggregate user-mode CPU time, in 100 ns ticks; not elapsed time or CPU percentage.
    const USER_TIME_TICKS: i64 = 30 * 10_000_000;

    impl ProcessGroup {
        pub fn new() -> Result<Self, String> {
            Self::with_budget(MEMORY_BYTES, USER_TIME_TICKS)
        }

        #[cfg(test)]
        pub fn test_budget(memory_bytes: usize, user_time_ticks: i64) -> Result<Self, String> {
            Self::with_budget(memory_bytes, user_time_ticks)
        }

        fn with_budget(memory_bytes: usize, user_time_ticks: i64) -> Result<Self, String> {
            if memory_bytes == 0 || user_time_ticks <= 0 {
                return Err("Orçamento do motor inválido.".into());
            }
            // SAFETY: unnamed non-inheritable job, owned exclusively by this guard.
            let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if handle.is_null() {
                return Err("Não foi possível criar o escopo do motor.".into());
            }
            let owned = unsafe { OwnedHandle::from_raw_handle(handle) };
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                | JOB_OBJECT_LIMIT_JOB_MEMORY
                | JOB_OBJECT_LIMIT_JOB_TIME;
            limits.JobMemoryLimit = memory_bytes;
            limits.BasicLimitInformation.PerJobUserTimeLimit = user_time_ticks;
            // SAFETY: correctly initialized structure, exact size, valid owned job handle.
            if unsafe {
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as *const _,
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            } == 0
            {
                return Err("Não foi possível configurar o escopo do motor.".into());
            }
            Ok(Self(owned, user_time_ticks))
        }

        pub fn configure(&self, command: &mut Command) {
            // Assign before executing even the launcher's first instruction.
            command.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
        }

        pub fn attach_and_resume(&self, child: &Child) -> Result<(), String> {
            let process = child
                .raw_handle()
                .ok_or("Processo do motor indisponível.")?;
            let pid = child.id().ok_or("Identificação do motor indisponível.")?;
            // SAFETY: the child is alive and suspended; both handles remain owned by callers.
            if unsafe { AssignProcessToJobObject(self.0.as_raw_handle(), process) } == 0 {
                return Err("Não foi possível conter o processo do motor.".into());
            }
            // std closes the primary thread handle. Find only this still-suspended child's thread.
            let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
            if snapshot == INVALID_HANDLE_VALUE {
                return Err("Não foi possível preparar o motor.".into());
            }
            let snapshot = unsafe { OwnedHandle::from_raw_handle(snapshot) };
            let mut entry: THREADENTRY32 = unsafe { zeroed() };
            entry.dwSize = size_of::<THREADENTRY32>() as u32;
            let mut found = unsafe { Thread32First(snapshot.as_raw_handle(), &mut entry) };
            while found != 0 {
                if entry.th32OwnerProcessID == pid {
                    let thread =
                        unsafe { OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID) };
                    if thread.is_null() {
                        return Err("Não foi possível iniciar o motor contido.".into());
                    }
                    let thread = unsafe { OwnedHandle::from_raw_handle(thread) };
                    if unsafe { ResumeThread(thread.as_raw_handle()) } != 1 {
                        return Err("Estado inicial do motor não confirmado.".into());
                    }
                    return Ok(());
                }
                found = unsafe { Thread32Next(snapshot.as_raw_handle(), &mut entry) };
            }
            Err("Thread inicial do motor indisponível.".into())
        }

        pub fn active_processes(&self) -> Result<u32, String> {
            Ok(self.accounting()?.ActiveProcesses)
        }

        pub fn user_budget_exhausted(&self) -> Result<bool, String> {
            Ok(self.accounting()?.TotalUserTime >= self.1)
        }

        fn accounting(&self) -> Result<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, String> {
            let mut info: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = unsafe { zeroed() };
            // SAFETY: exact initialized output buffer and size, no borrowed pointer escapes.
            if unsafe {
                QueryInformationJobObject(
                    self.0.as_raw_handle(),
                    JobObjectBasicAccountingInformation,
                    &mut info as *mut _ as *mut _,
                    size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                    std::ptr::null_mut(),
                )
            } == 0
            {
                return Err("Estado da árvore do motor indisponível.".into());
            }
            Ok(info)
        }

        #[cfg(test)]
        pub fn user_time(&self) -> Result<i64, String> {
            Ok(self.accounting()?.TotalUserTime)
        }

        pub async fn wait_empty(&self) -> Result<(), String> {
            let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
            loop {
                if self.active_processes()? == 0 {
                    return Ok(());
                }
                if tokio::time::Instant::now() >= deadline {
                    return Err("Término da árvore do motor não confirmado.".into());
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }

        pub async fn terminate(&self) -> Result<(), String> {
            if self.active_processes()? != 0
                && unsafe { TerminateJobObject(self.0.as_raw_handle(), 1) } == 0
            {
                return Err("Não foi possível interromper a árvore do motor.".into());
            }
            self.wait_empty().await
        }
    }
}

#[cfg(windows)]
pub use windows::ProcessGroup;

#[cfg(not(windows))]
pub struct ProcessGroup;

#[cfg(not(windows))]
impl ProcessGroup {
    pub fn new() -> Result<Self, String> {
        Ok(Self)
    }
    pub fn configure(&self, _: &mut tokio::process::Command) {}
    pub fn attach_and_resume(&self, _: &tokio::process::Child) -> Result<(), String> {
        Ok(())
    }
    pub async fn wait_empty(&self) -> Result<(), String> {
        Ok(())
    }
    pub async fn terminate(&self) -> Result<(), String> {
        Ok(())
    }
    pub fn user_budget_exhausted(&self) -> Result<bool, String> {
        Ok(false)
    }
}

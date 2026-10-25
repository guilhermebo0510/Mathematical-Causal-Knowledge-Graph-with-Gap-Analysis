//! Bounded request-ID cancellation registry. Never addresses an arbitrary process.
use std::{
    collections::VecDeque,
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio::sync::oneshot;

struct Active {
    id: String,
    sender: Option<oneshot::Sender<()>>,
    cancelled: bool,
}
#[derive(Default)]
struct Registry {
    quarantined: bool,
    active: Option<Active>,
    early: VecDeque<(String, Instant)>,
    finished: VecDeque<String>,
}
#[derive(Default)]
pub struct EngineOperations(Mutex<Registry>);

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

pub struct Lease<'a> {
    registry: &'a EngineOperations,
    id: String,
    receiver: Option<oneshot::Receiver<()>>,
    ended: bool,
}

impl EngineOperations {
    pub fn quarantine(&self) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| "Estado de execução indisponível.")?
            .quarantined = true;
        Ok(())
    }
    pub fn begin(&self, id: &str) -> Result<Lease<'_>, String> {
        if !valid_id(id) {
            return Err("ID de operação inválido.".into());
        }
        let mut state = self
            .0
            .lock()
            .map_err(|_| "Estado de execução indisponível.")?;
        state
            .early
            .retain(|(_, at)| at.elapsed() < Duration::from_secs(10));
        if state.quarantined {
            return Err("Motor bloqueado após encerramento não confirmado.".into());
        }
        if state.active.is_some() {
            return Err("Já existe uma operação em andamento.".into());
        }
        if state.finished.iter().any(|x| x == id) {
            return Err("ID de operação já utilizado.".into());
        }
        let cancelled = state.early.iter().any(|(x, _)| x == id);
        state.early.retain(|(x, _)| x != id);
        let (sender, receiver) = oneshot::channel();
        let sender = if cancelled {
            let _ = sender.send(());
            None
        } else {
            Some(sender)
        };
        state.active = Some(Active {
            id: id.into(),
            sender,
            cancelled,
        });
        Ok(Lease {
            registry: self,
            id: id.into(),
            receiver: Some(receiver),
            ended: false,
        })
    }

    pub fn cancel(&self, id: &str) -> Result<&'static str, String> {
        if !valid_id(id) {
            return Err("ID de operação inválido.".into());
        }
        let mut state = self
            .0
            .lock()
            .map_err(|_| "Estado de execução indisponível.")?;
        if state.finished.iter().any(|x| x == id) {
            return Ok("already_finished");
        }
        if let Some(active) = state.active.as_mut() {
            if active.id != id {
                return Ok("not_active");
            }
            active.cancelled = true;
            if let Some(sender) = active.sender.take() {
                let _ = sender.send(());
            }
            return Ok("requested");
        }
        // IPC cancellation may arrive just before engine_request is scheduled.
        state
            .early
            .retain(|(_, at)| at.elapsed() < Duration::from_secs(10));
        if !state.early.iter().any(|(x, _)| x == id) {
            state.early.push_back((id.into(), Instant::now()));
        }
        while state.early.len() > 32 {
            state.early.pop_front();
        }
        Ok("queued")
    }

    fn end(&self, id: &str) -> Result<bool, String> {
        let mut state = self
            .0
            .lock()
            .map_err(|_| "Estado de execução indisponível.")?;
        let Some(active) = state.active.take() else {
            return Err("Operação não está ativa.".into());
        };
        if active.id != id {
            state.active = Some(active);
            return Err("Operação não corresponde ao escopo.".into());
        }
        state.finished.push_back(id.into());
        while state.finished.len() > 64 {
            state.finished.pop_front();
        }
        Ok(active.cancelled)
    }
}

impl Lease<'_> {
    pub fn receiver(&mut self) -> oneshot::Receiver<()> {
        self.receiver.take().expect("Receiver consumed once")
    }
    pub fn finish(mut self) -> Result<bool, String> {
        let result = self.registry.end(&self.id);
        self.ended = true;
        result
    }
}
impl Drop for Lease<'_> {
    fn drop(&mut self) {
        if !self.ended {
            let _ = self.registry.end(&self.id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unconfirmed_termination_blocks_following_jobs() {
        let ops = EngineOperations::default();
        let lease = ops.begin("first").unwrap();
        ops.quarantine().unwrap();
        lease.finish().unwrap();
        assert!(ops.begin("next").err().unwrap().contains("bloqueado"));
    }
    #[test]
    fn early_cancel_and_duplicate_ids_are_scoped_and_bounded() {
        let ops = EngineOperations::default();
        assert_eq!(ops.cancel("first").unwrap(), "queued");
        let mut lease = ops.begin("first").unwrap();
        assert!(lease.receiver().try_recv().is_ok());
        assert!(lease.finish().unwrap());
        assert!(ops.begin("first").is_err());
        assert_eq!(ops.cancel("first").unwrap(), "already_finished");
        for n in 0..100 {
            ops.cancel(&format!("early_{n}")).unwrap();
        }
        assert_eq!(ops.0.lock().unwrap().early.len(), 32);
    }
    #[test]
    fn stale_cancel_cannot_affect_new_operation_and_busy_state_is_exclusive() {
        let ops = EngineOperations::default();
        let first = ops.begin("first").unwrap();
        assert!(ops.begin("second").is_err());
        drop(first);
        let mut second = ops.begin("second").unwrap();
        let mut rx = second.receiver();
        assert_eq!(ops.cancel("first").unwrap(), "already_finished");
        assert_eq!(ops.cancel("unknown").unwrap(), "not_active");
        assert!(matches!(
            rx.try_recv(),
            Err(oneshot::error::TryRecvError::Empty)
        ));
        assert!(!second.finish().unwrap());
    }
    #[test]
    fn active_cancel_is_a_request_not_a_termination_acknowledgement() {
        let ops = EngineOperations::default();
        let mut lease = ops.begin("active").unwrap();
        let mut receiver = lease.receiver();
        assert_eq!(ops.cancel("active").unwrap(), "requested");
        assert_eq!(ops.cancel("active").unwrap(), "requested");
        assert!(receiver.try_recv().is_ok());
        assert!(ops.begin("new").is_err());
        assert!(lease.finish().unwrap());
        assert!(ops.begin("new").is_ok());
    }
    #[test]
    fn expired_early_cancel_and_invalid_ids_do_not_cancel_future_work() {
        let ops = EngineOperations::default();
        ops.0
            .lock()
            .unwrap()
            .early
            .push_back(("old".into(), Instant::now() - Duration::from_secs(11)));
        let mut lease = ops.begin("old").unwrap();
        assert!(matches!(
            lease.receiver().try_recv(),
            Err(oneshot::error::TryRecvError::Empty)
        ));
        assert!(!lease.finish().unwrap());
        assert!(ops.cancel("a/b").is_err());
        for n in 0..100 {
            let lease = ops.begin(&format!("done_{n}")).unwrap();
            lease.finish().unwrap();
        }
        assert_eq!(ops.0.lock().unwrap().finished.len(), 64);
    }
}

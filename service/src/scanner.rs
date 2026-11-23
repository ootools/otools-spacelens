//! 递归扫描器：walkdir 顺序遍历，边扫边把节点 delta 通过 SSE 推送给前端。
//! 目录大小由前端累加，这里只发文件真实大小（目录 size=0）。

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;
use walkdir::WalkDir;

const BATCH_NODES: usize = 256;
const FLUSH_INTERVAL: Duration = Duration::from_millis(80);
const HISTORY_LIMIT: usize = 256;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScanNode {
    pub id: u64,
    pub parent_id: Option<u64>,
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime: Option<i64>,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Totals {
    pub files: u64,
    pub dirs: u64,
    pub bytes: u64,
    pub scanned: u64,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ScanStatus {
    #[default]
    Running,
    Done,
    Cancelled,
    Error,
}

pub struct ScanState {
    pub id: String,
    pub root: String,
    pub started_at: u64,
    pub events: broadcast::Sender<(String, String)>,
    pub history: std::sync::Mutex<Vec<(String, String)>>,
    pub cancel: CancellationToken,
    pub totals: std::sync::Mutex<Totals>,
    pub status: std::sync::Mutex<ScanStatus>,
}

impl ScanState {
    pub fn new(id: String, root: String, started_at: u64) -> Self {
        let (events, _) = broadcast::channel::<(String, String)>(4096);
        Self {
            id,
            root,
            started_at,
            events,
            history: std::sync::Mutex::new(Vec::new()),
            cancel: CancellationToken::new(),
            totals: std::sync::Mutex::new(Totals::default()),
            status: std::sync::Mutex::new(ScanStatus::Running),
        }
    }

    /// 同时写入实时广播与有界历史；历史让 SSE 订阅晚于 POST /api/scan 也能拿全量。
    pub fn emit(&self, name: &str, value: serde_json::Value) {
        let payload = value.to_string();
        let _ = self.events.send((name.to_string(), payload.clone()));
        if let Ok(mut history) = self.history.lock() {
            if history.len() >= HISTORY_LIMIT {
                history.remove(0);
            }
            history.push((name.to_string(), payload));
        }
    }

    pub fn replay(&self) -> Vec<(String, String)> {
        self.history.lock().map(|h| h.clone()).unwrap_or_default()
    }

    pub fn set_status(&self, status: ScanStatus) {
        if let Ok(mut current) = self.status.lock() {
            *current = status;
        }
    }
}

fn node(id: u64, parent_id: Option<u64>, path: &Path, is_dir: bool, size: u64) -> ScanNode {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    let mtime = std::fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64);
    ScanNode {
        id,
        parent_id,
        name,
        path: path.to_string_lossy().into_owned(),
        is_dir,
        size,
        mtime,
    }
}

fn flush(state: &ScanState, batch: &mut Vec<ScanNode>, totals: Totals) {
    if batch.is_empty() {
        return;
    }
    state.emit(
        "batch",
        json!({"seq": totals.scanned, "nodes": batch}),
    );
    state.emit("progress", json!(totals));
    batch.clear();
}

/// 在 spawn_blocking 里运行；不持有 tokio runtime，扫描阻塞不影响其
/// 它请求。错误逐条发 warning，绝不回显 token，路径仅在事件里出现。
pub fn run_scan(state: Arc<ScanState>, root: PathBuf) {
    let started = Instant::now();
    state.emit(
        "start",
        json!({"scanId": state.id, "root": state.root, "startedAt": state.started_at}),
    );

    let root_id = 0_u64;
    let mut next_id = 1_u64;
    let mut dir_ids: HashMap<PathBuf, u64> = HashMap::new();
    dir_ids.insert(root.clone(), root_id);

    let mut batch = vec![node(root_id, None, &root, true, 0)];
    let mut totals = Totals {
        dirs: 1,
        ..Totals::default()
    };
    let mut last_flush = Instant::now();
    let mut cancelled = false;
    let mut first = true;

    for entry in WalkDir::new(&root)
        .sort_by_file_name()
        .follow_links(false)
        .into_iter()
    {
        if first {
            first = false;
            continue;
        }
        if state.cancel.is_cancelled() {
            cancelled = true;
            break;
        }
        match entry {
            Ok(entry) => {
                let is_dir = entry.file_type().is_dir();
                let size = if is_dir {
                    0
                } else {
                    entry.metadata().map(|m| m.len()).unwrap_or(0)
                };
                let parent_id = entry
                    .path()
                    .parent()
                    .and_then(|parent| dir_ids.get(parent).copied())
                    .unwrap_or(root_id);
                let id = next_id;
                next_id += 1;
                batch.push(node(id, Some(parent_id), entry.path(), is_dir, size));
                if is_dir {
                    dir_ids.insert(entry.path().to_path_buf(), id);
                    totals.dirs += 1;
                } else {
                    totals.files += 1;
                    totals.bytes += size;
                }
                totals.scanned += 1;
                if batch.len() >= BATCH_NODES || last_flush.elapsed() >= FLUSH_INTERVAL {
                    flush(&state, &mut batch, totals);
                    last_flush = Instant::now();
                }
            }
            Err(error) => {
                let permission = error
                    .io_error()
                    .map(|io| io.kind() == ErrorKind::PermissionDenied)
                    .unwrap_or(false);
                state.emit(
                    "warning",
                    json!({
                        "path": error.path().map(|p| p.to_string_lossy().into_owned()),
                        "kind": if permission { "permission" } else { "io" },
                        "message": if permission { "permission denied" } else { "io error" },
                    }),
                );
            }
        }
    }

    flush(&state, &mut batch, totals);
    if let Ok(mut saved) = state.totals.lock() {
        *saved = totals;
    }
    let duration_ms = started.elapsed().as_millis() as u64;
    if cancelled {
        state.set_status(ScanStatus::Cancelled);
        state.emit(
            "cancelled",
            json!({"durationMs": duration_ms, "totals": totals}),
        );
    } else {
        state.set_status(ScanStatus::Done);
        state.emit(
            "done",
            json!({"durationMs": duration_ms, "totals": totals}),
        );
    }
}

/// 当前 UNIX 毫秒，仅用于事件时间戳。
pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::{ScanNode, ScanState, run_scan};
    use serde_json::Value;
    use std::fs;
    use std::sync::Arc;

    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.bin"), vec![0u8; 1024]).unwrap();
        fs::write(dir.path().join("b.bin"), vec![0u8; 2048]).unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join("sub").join("c.bin"), vec![0u8; 4096]).unwrap();
        dir
    }

    fn batches(state: &ScanState) -> Vec<Value> {
        state
            .replay()
            .into_iter()
            .filter(|(name, _)| name == "batch")
            .map(|(_, payload)| serde_json::from_str(&payload).unwrap())
            .collect()
    }

    #[test]
    fn emits_root_files_and_directories_with_expected_sizes() {
        let dir = fixture();
        let root = dir.path().to_path_buf();
        let state = Arc::new(ScanState::new(
            "test".to_string(),
            root.to_string_lossy().into_owned(),
            0,
        ));
        run_scan(state.clone(), root);

        let all: Vec<ScanNode> = batches(&state)
            .into_iter()
            .flat_map(|event| {
                serde_json::from_value::<Vec<ScanNode>>(event["nodes"].clone()).unwrap()
            })
            .collect();
        assert_eq!(all.len(), 5); // root + sub + 3 files
        assert_eq!(all[0].id, 0);
        assert_eq!(all[0].parent_id, None);
        assert!(all[0].is_dir);
        let files: Vec<_> = all.iter().filter(|n| !n.is_dir).collect();
        assert_eq!(files.len(), 3);
        assert_eq!(files.iter().map(|n| n.size).sum::<u64>(), 1024 + 2048 + 4096);
        assert!(all.iter().any(|n| n.is_dir && n.name == "sub"));
        let totals = *state.totals.lock().unwrap();
        assert_eq!(totals.files, 3);
        assert_eq!(totals.dirs, 2);
        assert_eq!(totals.bytes, 1024 + 2048 + 4096);
        assert_eq!(totals.scanned, 4);
        // 无节点上限：done 不再带 partial 标记，也没有 limit 事件。
        let events = state.replay();
        assert!(!events.iter().any(|(name, _)| name == "limit"));
        let done = events.iter().find(|(name, _)| name == "done").unwrap().1.clone();
        let done: Value = serde_json::from_str(&done).unwrap();
        assert!(done.get("partial").is_none());
    }

    #[test]
    fn cancellation_stops_early() {
        let dir = fixture();
        let root = dir.path().to_path_buf();
        let state = Arc::new(ScanState::new(
            "cancel".to_string(),
            root.to_string_lossy().into_owned(),
            0,
        ));
        state.cancel.cancel();
        run_scan(state.clone(), root);
        assert_eq!(
            *state.status.lock().unwrap(),
            super::ScanStatus::Cancelled
        );
        assert!(state.replay().iter().any(|(name, _)| name == "cancelled"));
    }

    #[test]
    fn empty_dir_finishes_cleanly() {
        // 空目录只产生根节点，不能 panic 也不能出错
        let dir = tempfile::tempdir().unwrap();
        let state = Arc::new(ScanState::new(
            "empty".to_string(),
            dir.path().to_string_lossy().into_owned(),
            0,
        ));
        run_scan(state.clone(), dir.path().to_path_buf());
        assert_eq!(*state.status.lock().unwrap(), super::ScanStatus::Done);
        assert_eq!(state.totals.lock().unwrap().scanned, 0);
    }
}

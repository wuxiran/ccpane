// Re-export core services from cc-panes-core
pub use cc_panes_core::services::*;
mod skill_remote_update_service;
pub use skill_remote_update_service::SkillRemoteUpdateService;

// Tauri-specific services (kept in src-tauri)
mod launch_backfill_service;
mod notification_service;
pub mod orchestrator_service;
pub mod screenshot_overlay;
mod screenshot_service;
mod session_prompt_service;
mod skill_market_service;

pub(crate) use launch_backfill_service::detect_resume_session;
pub use launch_backfill_service::rescue_null_codex_records;
pub use launch_backfill_service::run_launch_history_backfill;
pub use notification_service::NotificationService;
pub use notification_service::{NotificationRequest, NotificationTriggerResult};
pub use orchestrator_service::{OrchestratorService, StartLocks};
pub use screenshot_service::{CaptureResult, ScreenshotService};
pub use session_prompt_service::extract_last_prompt;
pub use skill_market_service::{SkillMarketEntry, SkillMarketService};

use std::path::Path;

use crate::utils::error::AppError;

/// 验证路径安全性，防止路径穿越攻击
///
/// 检查项：
/// 1. 路径不包含 `..` 分量
/// 2. 路径是绝对路径（或为空时跳过）
pub fn validate_path(path: &str) -> Result<(), AppError> {
    if path.is_empty() {
        return Err(AppError::from("路径不能为空"));
    }

    let p = Path::new(path);

    // 检查路径穿越
    for component in p.components() {
        if let std::path::Component::ParentDir = component {
            return Err(AppError::from(format!(
                "路径包含非法的 '..' 分量: {}",
                path
            )));
        }
    }

    // 要求绝对路径
    if !p.is_absolute() {
        return Err(AppError::from(format!("路径必须是绝对路径: {}", path)));
    }

    Ok(())
}

/// 验证文件路径相对于项目路径的安全性
///
/// 确保 file_path 不会穿越到 project_path 之外
pub fn validate_relative_path(project_path: &str, file_path: &str) -> Result<(), AppError> {
    validate_path(project_path)?;

    // file_path 是相对路径，检查不包含 ..
    if file_path.contains("..") {
        return Err(AppError::from(format!(
            "文件路径包含非法的 '..' 分量: {}",
            file_path
        )));
    }

    Ok(())
}

/// 验证 Worktree 名称安全性
///
/// 拒绝包含路径穿越或路径分隔符的名称
pub fn validate_worktree_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() {
        return Err(AppError::from("Worktree 名称不能为空"));
    }

    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(AppError::from(format!(
            "Worktree 名称包含非法字符: {}",
            name
        )));
    }

    // 拒绝纯空白名称
    if name.trim().is_empty() {
        return Err(AppError::from("Worktree 名称不能为空白"));
    }

    Ok(())
}

/// 验证 Git URL 安全性
///
/// 只允许 HTTP/HTTPS 协议，防止 file:// 等危险协议
pub fn validate_git_url(url: &str) -> Result<(), AppError> {
    if url.is_empty() {
        return Err(AppError::from("Git URL 不能为空"));
    }

    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(AppError::from(format!(
            "仅支持 HTTP/HTTPS 协议的 Git URL: {}",
            url
        )));
    }

    // 防止命令注入字符
    if url.contains(';') || url.contains('|') || url.contains('`') || url.contains("$(") {
        return Err(AppError::from("Git URL 包含非法字符"));
    }

    Ok(())
}

/// 脱敏路径，仅保留文件名用于错误消息展示
///
/// 避免在面向用户的错误消息中暴露完整的文件系统路径。
/// 如果无法提取文件名，返回 `"<unknown>"`。
pub fn sanitize_path_display(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "<unknown>".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_absolute_path() {
        #[cfg(windows)]
        assert!(validate_path(r"C:\Users\test\project").is_ok());

        #[cfg(not(windows))]
        assert!(validate_path("/home/user/project").is_ok());
    }

    #[test]
    fn test_path_traversal_rejected() {
        #[cfg(windows)]
        assert!(validate_path(r"C:\Users\test\..\secret").is_err());

        #[cfg(not(windows))]
        assert!(validate_path("/home/user/../secret").is_err());
    }

    #[test]
    fn test_relative_path_rejected() {
        assert!(validate_path("relative/path").is_err());
    }

    #[test]
    fn test_empty_path_rejected() {
        assert!(validate_path("").is_err());
    }

    #[test]
    fn test_valid_relative_file_path() {
        #[cfg(windows)]
        assert!(validate_relative_path(r"C:\project", "src/main.rs").is_ok());

        #[cfg(not(windows))]
        assert!(validate_relative_path("/project", "src/main.rs").is_ok());
    }

    #[test]
    fn test_relative_file_path_traversal_rejected() {
        #[cfg(windows)]
        assert!(validate_relative_path(r"C:\project", "../secret.txt").is_err());

        #[cfg(not(windows))]
        assert!(validate_relative_path("/project", "../secret.txt").is_err());
    }

    #[test]
    fn test_valid_git_url() {
        assert!(validate_git_url("https://github.com/user/repo.git").is_ok());
        assert!(validate_git_url("http://gitlab.com/user/repo").is_ok());
    }

    #[test]
    fn test_git_url_rejects_file_protocol() {
        assert!(validate_git_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn test_git_url_rejects_ssh_protocol() {
        assert!(validate_git_url("ssh://git@github.com/user/repo.git").is_err());
    }

    #[test]
    fn test_git_url_rejects_injection_chars() {
        assert!(validate_git_url("https://example.com/repo;rm -rf /").is_err());
        assert!(validate_git_url("https://example.com/repo|cat /etc/passwd").is_err());
        assert!(validate_git_url("https://example.com/repo`whoami`").is_err());
        assert!(validate_git_url("https://example.com/$(id)").is_err());
    }

    #[test]
    fn test_git_url_rejects_empty() {
        assert!(validate_git_url("").is_err());
    }

    #[test]
    fn test_valid_worktree_name() {
        assert!(validate_worktree_name("feature-auth").is_ok());
        assert!(validate_worktree_name("hotfix-123").is_ok());
        assert!(validate_worktree_name("my_branch").is_ok());
    }

    #[test]
    fn test_worktree_name_rejects_traversal() {
        assert!(validate_worktree_name("..").is_err());
        assert!(validate_worktree_name("../secret").is_err());
        assert!(validate_worktree_name("foo/../bar").is_err());
    }

    #[test]
    fn test_worktree_name_rejects_path_separators() {
        assert!(validate_worktree_name("foo/bar").is_err());
        assert!(validate_worktree_name("foo\\bar").is_err());
    }

    #[test]
    fn test_worktree_name_rejects_empty() {
        assert!(validate_worktree_name("").is_err());
        assert!(validate_worktree_name("  ").is_err());
    }

    #[test]
    fn test_sanitize_path_display_full_path() {
        let path = Path::new("/home/user/.cc-panes/config.toml");
        assert_eq!(sanitize_path_display(path), "config.toml");
    }

    #[test]
    fn test_sanitize_path_display_windows_path() {
        let path = Path::new(r"C:\Users\test\.cc-panes\providers.json");
        assert_eq!(sanitize_path_display(path), "providers.json");
    }

    #[test]
    fn test_sanitize_path_display_filename_only() {
        let path = Path::new("data.db");
        assert_eq!(sanitize_path_display(path), "data.db");
    }
}

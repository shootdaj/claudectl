# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.37] - 2025-01-05

### Added
- **Update notification**: Shows `[UPDATE vX.X.X]` badge in title bar when new version available
- **In-app update**: Press `u` to update claudectl directly from TUI
- **Auto-launch after update**: Automatically relaunches ccl after updating
- **Auto-backup**: Hourly automatic backup of all Claude Code sessions to `~/.claudectl/backup/`
- **MCP Manager**: Press `m` to view and manage MCP server configurations
- **Skip permissions mode**: Press `d` to toggle `--dangerously-skip-permissions` for launches
- **Agent Expert integration**: Press `a` to auto-install agent-expert in new sessions
- **Full-text search**: `ccl sessions search <query>` searches across all session content
- **Settings preservation**: User settings (skip-permissions, etc.) persist across updates
- **Directory change**: Terminal changes to session directory before launching Claude

### Fixed
- Session list scrolling only triggers at boundaries, not on every selection
- Table height properly calculated to avoid overlap with bottom pane
- Install script version extraction made more robust with validation
- Settings.json and backup folder preserved during updates

### Changed
- Improved install script with better error handling
- Cleaner bottom pane layout with proper spacing

## [1.0.0] - 2024-12-28

### Added
- Initial release
- Global session view across all Claude Code projects
- Rich TUI with Dark Midnight theme (Nord-inspired colors)
- Session management: launch, rename, preview
- Search sessions by title
- Usage statistics (token counts)
- Keyboard navigation with vim-style bindings
- Install script with version support

### Technical
- Source distribution via Bun (blessed library incompatible with compiled binaries)
- GitHub Actions CI/CD pipeline
- Semantic versioning with release automation

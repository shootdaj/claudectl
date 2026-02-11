#!/bin/bash
set -e

# Auto-sync index if sessions exist but index doesn't
if [ -d "$CLAUDE_CONFIG_DIR/projects" ] && [ "$(ls -A $CLAUDE_CONFIG_DIR/projects 2>/dev/null)" ]; then
    if [ ! -f "$CLAUDECTL_HOME/sessions.json" ]; then
        echo "Auto-syncing session index..."
        bun run src/index.ts sessions sync 2>/dev/null || true
    fi
fi

# Mode handling
case "${SANDBOX_MODE:-tui}" in
    tui)
        exec bun run src/index.ts
        ;;
    shell)
        exec bash
        ;;
    test)
        exec "$@"
        ;;
    *)
        echo "Unknown SANDBOX_MODE: $SANDBOX_MODE"
        exit 1
        ;;
esac

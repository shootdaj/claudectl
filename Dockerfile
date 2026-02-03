# Use official Bun runtime as base image
FROM oven/bun:latest

# Install build dependencies for native modules (node-pty)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create isolated sandbox directories for Claude Code data
# These are separate from host ~/.claude/ to prevent contamination
RUN mkdir -p /sandbox/.claude/projects \
    && mkdir -p /sandbox/.claudectl

# Set environment variables to redirect Claude Code paths to sandbox
ENV CLAUDE_CONFIG_DIR=/sandbox/.claude
ENV CLAUDECTL_HOME=/sandbox/.claudectl

# Copy package files first for layer caching
COPY package.json bun.lock ./

# Install dependencies (includes native deps like node-pty for blessed)
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Default command (can be overridden)
CMD ["bun", "run", "dev"]

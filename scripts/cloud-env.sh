# Source this only in the prepared Codex cloud environment: . scripts/cloud-env.sh
export UV_CACHE_DIR=/workspace/.cache/uv
export npm_config_cache=/workspace/.cache/npm
if [ -d /workspace/.toolchains/rustup ]; then
  export RUSTUP_HOME=/workspace/.toolchains/rustup
  export CARGO_HOME=/workspace/.toolchains/cargo
  export PATH="$CARGO_HOME/bin:$PATH"
fi
if [ -x /usr/bin/chromium ]; then
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium
fi

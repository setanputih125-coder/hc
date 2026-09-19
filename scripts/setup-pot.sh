set -eu
cd "$(dirname "$0")/.."

# Optional: installs the proof-of-origin token provider so yt-dlp can attest its
# requests. Kept out of scripts/setup.sh because it clones a third-party repository
# and is only useful when YouTube challenges this server.

VERSION="${POT_PROVIDER_VERSION:-2.0.0}"
HOME_DIR="${POT_PROVIDER_HOME:-$HOME/bgutil-ytdlp-pot-provider}"
PYTHON="${PYTHON_BIN:-.venv/bin/python}"

if [ ! -x "$PYTHON" ]; then
  printf '%s\n' "Run bash scripts/setup.sh first: $PYTHON is missing." >&2
  exit 1
fi

"$PYTHON" -m pip install --disable-pip-version-check "bgutil-ytdlp-pot-provider==$VERSION" 2>/dev/null \
  || uv pip install --python "$PYTHON" "bgutil-ytdlp-pot-provider==$VERSION"

if [ ! -d "$HOME_DIR" ]; then
  git clone --single-branch --branch "$VERSION" --depth 1 \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git "$HOME_DIR"
fi

cd "$HOME_DIR/server"
npm ci
npx tsc

printf '\n%s\n' \
  'Proof-of-origin provider installed.' \
  'Add MUSIC_ATTESTATION=1 to your .env, then restart Undertone.' \
  'Tokens are generated on demand; no extra process needs to stay running.'

set -eu
cd "$(dirname "$0")/.."
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22||(major===22&&minor<12)) { console.error("Node.js 22.12+ is required."); process.exit(1); }'
python3 -c 'import sys; assert sys.version_info >= (3,10), "Python 3.10+ is required"'
python3 -m venv --without-pip .venv
if command -v uv >/dev/null 2>&1; then
  uv pip install --python .venv/bin/python -r requirements.txt
else
  pip3 --python .venv install --disable-pip-version-check -r requirements.txt
fi
.venv/bin/python -c 'import yt_dlp, yt_dlp_ejs; print("yt-dlp and its JavaScript runtime components are installed.")'
npm ci
npm run build

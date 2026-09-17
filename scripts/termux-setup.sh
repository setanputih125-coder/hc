set -eu
if ! command -v pkg >/dev/null 2>&1; then
  printf '%s\n' 'Run this script inside Termux. On Linux, install Node.js 22.12+, Python 3.10+, and pip, then run bash scripts/setup.sh.'
  exit 1
fi
pkg update -y
pkg install -y nodejs-lts npm python python-pip git
bash "$(dirname "$0")/setup.sh"
printf '\n%s\n' 'Ready. Run npm start and open http://127.0.0.1:3000.' 'No music folders, storage permission, API keys, or lyrics files are needed.'

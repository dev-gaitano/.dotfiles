#!/usr/bin/env sh
set -e

# 1. Install Python 3.11 and dev tools
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3.11-dev

# 2. Create a dedicated virtualenv for OpenBB
mkdir -p ~/.venvs
python3.11 -m venv ~/.venvs/openbb

# 3. Activate it
source ~/.venvs/openbb/bin/activate

# 4. Upgrade pip and build tools inside venv
pip install --upgrade pip setuptools wheel

# 5. Install OpenBB
pip install openbb

# Optional: also install the CLI interface
pip install openbb-cli

echo
echo "✅ OpenBB installed in ~/.venvs/openbb"
echo "To use it, run:"
echo "    source ~/.venvs/openbb/bin/activate"
echo "Then launch with:"
echo "    python -m openbb"
echo "or"
echo "    openbb"

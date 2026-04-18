#!/usr/bin/env sh

cd ~/neovim
git checkout release-0.12
git pull
make distclean
make CMAKE_BUILD_TYPE=Release
sudo make install

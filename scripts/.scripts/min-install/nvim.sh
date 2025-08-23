#!/usr/bin/env sh

NVIM_RELEASE="release-0.11"

read -r -p "Do you want to install Neovim $NVIM_RELEASE? (y/n): " answer

if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
	cd ~
	sudo apt install -y ninja-build gettext cmake unzip curl build-essential libtool libtool-bin autoconf automake pkg-config

	git clone https://github.com/neovim/neovim.git
	cd neovim
	git checkout $NVIM_RELEASE

	make CMAKE_BUILD_TYPE=release-0
	sudo make install

	NVIM_VERSION=$(nvim --version | head -n 1)
	echo "$NVIM_VERSION successfully installed"
	exit 0
else
	exit 0
fi





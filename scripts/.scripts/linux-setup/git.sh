#!/usr/bin/env sh

sudo apt install -y git

# SSH Key gen
ls -al ~/.ssh

read -p "Enter your github email address: " email

ssh-keygen -t ed25519 -C $email

#!/usr/bin/env sh

case "$1" in
  connect|c)
    # Connect HDMI
    xrandr --output HDMI-1 --mode 1920x1080 --right-of eDP-1 --auto 
    pactl set-card-profile alsa_card.pci-0000_00_1f.3 output:hdmi-stereo
    ~/.scripts/pywal.sh
    ;;
  disconnect|d)
    # Disconnect HDMI
    xrandr --output HDMI-1 --off
    pactl set-card-profile alsa_card.pci-0000_00_1f.3 output:analog-stereo
    ;;
  *)
    echo "Usage: $0 {connect|disconnect}"
    exit 1
    ;;
esac

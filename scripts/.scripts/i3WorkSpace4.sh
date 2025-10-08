#!/usr/bin/env sh

# Switch to workspace 4
i3-msg "workspace 4"

# Open Obsidian on the left
i3-msg "split h"
i3-msg 'exec flatpak run md.obsidian.Obsidian'

# Open ProtonVPN on the right
i3-msg "focus right"
i3-msg 'exec flatpak run com.protonvpn.www'

# Open EasyEffects at the bottom (full width)
i3-msg "focus parent"
i3-msg "split v"
i3-msg 'exec easyeffects'

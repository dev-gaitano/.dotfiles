#!/usr/bin/env sh

scan_time=5
config_tmp="/tmp/rofiBluetoothScanList"

# Scan and list paired + nearby devices
get_bluetooth_devices() {
    bluetoothctl power on

    # Start scanning in the background
    bluetoothctl scan on &
    scan_pid=$!

    # Wait a few seconds to discover devices
    sleep "$scan_time"

    # Stop scanning
    bluetoothctl scan off
    kill "$scan_pid" 2>/dev/null

    # Clear the temporary file
    > "$config_tmp"

    # Paired devices (filter lines starting with 'Device' and parse MAC;Name)
    bluetoothctl paired-devices | grep -E '^Device ([0-9A-F]{2}:){5}[0-9A-F]{2}' \
        | awk '{print $2 ";" substr($0, index($0,$3))}' >> "$config_tmp"

    # Nearby devices (filter lines starting with 'Device' and parse MAC;Name)
    bluetoothctl devices | grep -E '^Device ([0-9A-F]{2}:){5}[0-9A-F]{2}' \
        | awk '{print $2 ";" substr($0, index($0,$3))}' >> "$config_tmp"

    # Remove duplicates (by MAC)
    awk -F';' '!seen[$1]++' "$config_tmp" > "${config_tmp}.tmp" && mv "${config_tmp}.tmp" "$config_tmp"
}

connect_device() {
    device_mac="$1"
    device_name="$2"

    bluetoothctl disconnect

    output=$(bluetoothctl connect "$device_mac" 2>&1)

    if printf "%s" "$output" | grep -qi "Connection successful"; then
        notify-send -u low "Bluetooth connected to $device_name"
    else
        notify-send -u critical "$device_name connection failed"
    fi
}

choose_bluetooth_device() {
    get_bluetooth_devices

    # Build menu with device names + "off" option
    menu=$(awk -F';' '{print $2}' "$config_tmp" | sort)
    choice=$(printf "%s\noff" "$menu" \
	| rofi -dmenu -i -p "Bluetooth" -theme-str 'window {width: 20%; height: 24%;}')

    case "$choice" in
        off)
            bluetoothctl power off
        ;;
        "")
            exit
        ;;
        *)
            mac=$(grep -F ";$choice" "$config_tmp" | awk -F';' '{print $1}')
            if [ -n "$mac" ]; then
                connect_device "$mac" "$choice"
            else
                notify-send -u critical "Device not found"
            fi
        ;;
    esac
}

choose_bluetooth_device

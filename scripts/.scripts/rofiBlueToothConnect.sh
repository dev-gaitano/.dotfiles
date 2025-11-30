#!/usr/bin/env sh

connect_device() {
	device_mac="$1"
	device_name="$2"

	bluetoothctl power on
	bluetoothctl disconnect

	output=$(bluetoothctl connect "$device_mac" 2>&1)

	if printf "%s" "$output" | grep -qi "Connection successful"; then
	    notify-send -u low "Bluetooth connected to $device_name"
	else
	    notify-send -u critical "$device_name connection failed"
	fi
}

choose_bluetooth_device() {
	choice=$(printf "JBL\nRS288R\nGB03\noff" | rofi -dmenu -i -p "Connect Device" -theme-str 'window {width: 16%; height: 21%;}' )
	case "$choice" in
		JBL)
			connect_device "D8:AA:59:C3:85:CD" "JBL"
		;;
		RS288R)
			connect_device "55:D2:9E:EC:AD:C2" "RS288R"
		;;
		GB03)
			connect_device "61:81:FF:D0:77:93" "GB03"
		;;
		off)
			bluetoothctl power off
		;;
		*) exit
		;;
	esac
	
}

choose_bluetooth_device

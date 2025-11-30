#!/usr/bin/env sh

chooseBluetoothDevice() {
	choice=$(printf "JBL\nRS288R\nGB03\noff" | rofi -dmenu -i -p "Connect Device" -theme-str 'window {width: 16%; height: 21%;}' )
	case "$choice" in
		JBL) echo 1
			bluetoothctl power on
			bluetoothctl disconnect

			output=$(bluetoothctl connect D8:AA:59:C3:85:CD 2>&1)

			echo "$output" | grep -qi "Connection successful"
			if [ $? -eq 0 ]; then
			    notify-send -u low "Bluetooth connected to JBL"
			else
			    notify-send -u critical "JBL connection failed"
			fi
		;;
		RS288R)
			bluetoothctl power on
			bluetoothctl disconnect

			output=$(bluetoothctl connect 55:D2:9E:EC:AD:C2 2>&1)

			echo "$output" | grep -qi "Connection successful"
			if [ $? -eq 0 ]; then
				notify-send -u low "Bluetooth Connected to RS288R"
			else
				notify-send -u critical "RS288R connection failed"
			fi
		;;
		GB03)
			bluetoothctl power on
			bluetoothctl disconnect

			output=$(bluetoothctl connect 61:81:FF:D0:77:93 2>&1)

			echo "$output" | grep -qi "Connection successful"
			if [ $? -eq 0 ]; then
				notify-send -u low "Bluetooth Connected to GB03"
			else
				notify-send -u critical "GB03 connection failed"
			fi
		;;
		off)
			bluetoothctl power off
		;;
		*) exit
		;;
	esac
	
}

chooseBluetoothDevice

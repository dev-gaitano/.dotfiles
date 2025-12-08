#!/usr/bin/env sh

case "$1" in
on)
	echo "power on" | bluetoothctl
	echo "scan on" | bluetoothctl
	;;
off)
	echo "power off" | bluetoothctl
	;;
scan)
	echo "scan on" | bluetoothctl
	;;
connect | c)
	case "$2" in
	jbl)
		bluetoothctl connect D8:AA:59:C3:85:CD
		;;
	rs)
		bluetoothctl connect 55:D2:9E:EC:AD:C2
		;;
	gb)
		bluetoothctl connect 61:81:FF:D0:77:93
		;;
	esac
	;;
disconnect | d)
	case "$2" in
	jbl)
		bluetoothctl disconnect D8:AA:59:C3:85:CD
		;;
	rs)
		bluetoothctl disconnect 55:D2:9E:EC:AD:C2
		;;
	gb)
		bluetoothctl disconnect 61:81:FF:D0:77:93
		;;
	esac
	;;
*)
	echo "Usage: $0 {connect|disconnect}"
	exit 1
	;;
esac

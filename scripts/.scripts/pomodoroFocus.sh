#!/usr/bin/zsh 

# Usage: ./pomodoro -s <work_minutes> <break_minutes> <sessions>
# Example: ./pomodoro -s 45 15 2

while getopts ":s:" opt; do
  case $opt in
    s)
      IFS=' ' read -r work break sessions <<< "$OPTARG"
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      exit 1
      ;;
    :)
      echo "Option -$OPTARG requires an argument." >&2
      exit 1
      ;;
  esac
done

if [[ -z $work || -z $break || -z $sessions ]]; then
  echo "Usage: $0 -s <work> <break> <sessions>"
  exit 1
fi

notify() {
  notify-send "Pomodoro" "$1"
  echo "$1"
}

countdown() {
  local total=$1
  while [[ $total -gt 0 ]]; do
    mins=$((total / 60))
    secs=$((total % 60))
    printf "\r%02d:%02d remaining" "$mins" "$secs"
    sleep 1
    ((total--))
  done
  echo ""
}

for ((i=1; i<=sessions; i++)); do
  notify "Session $i: Work for $work minutes"
  countdown $((work * 60))
  if (( i < sessions )); then
    notify "Break time: $break minutes"
    countdown $((break * 60))
  fi
done

notify "Pomodoro complete!"

# Luminosity boost past the XDR display's SDR cap (source: boost/luminosity-boost.swift in the sunny repo).
# Percent of the normal max: 100 = normal, 200 = x2, 300 = panel limit.
#   luminosity              show the current level
#   luminosity 130          set it (130, 130% and 1.3 are the same)
#   luminosity + | -        x1.1 or /1.1 per sign ("++" = two steps); same as up | down
#   luminosity +10 | -10    add or remove that many percent points
#   luminosity off          back to normal
LUMINOSITY_STATE_FILE=~/.local/state/luminosity-percent
luminosity() {
  local current
  current=$(cat "$LUMINOSITY_STATE_FILE" 2>/dev/null || echo 100)
  case "${1:-}" in
    "")
      if pgrep -x luminosity-boost >/dev/null; then echo "luminosity: ${current}%"; else echo "luminosity: off (100%)"; fi
      return ;;
    off)
      pkill -x luminosity-boost
      echo 100 > "$LUMINOSITY_STATE_FILE"
      echo "luminosity: off (100%)"
      return ;;
    up) luminosity +; return ;;
    down) luminosity -; return ;;
  esac
  # Relative steps are multiplicative (each "+" is x1.1, each "-" is /1.1), because
  # perceived brightness is not linear: +10% always looks like the same jump.
  if [[ "$1" =~ ^\++$ || "$1" =~ ^-+$ ]]; then
    local steps=${#1}
    [ "${1:0:1}" = "-" ] && steps=$(( -steps ))
    luminosity "$(awk -v c="$current" -v n="$steps" 'BEGIN { print c * 1.1 ^ n }')"
    return
  fi
  if [[ "$1" =~ ^[+-][0-9]+%?$ ]]; then
    local delta="${1%\%}"
    luminosity $((current + ${delta#+}))
    return
  fi
  local percent="${1%\%}"
  # Values under 10 are factors (1.3 = 130%); round and clamp to 100-300.
  percent=$(awk -v v="$percent" 'BEGIN { if (v < 10) v = v * 100; v = int(v + 0.5); if (v < 100) v = 100; if (v > 300) v = 300; print v }')
  mkdir -p ~/.local/state && echo "$percent" > "$LUMINOSITY_STATE_FILE"
  # The running boost follows the state file live; start it only when needed.
  if [ "$percent" -le 100 ]; then
    pkill -x luminosity-boost
  elif ! pgrep -x luminosity-boost >/dev/null; then
    nohup ~/.local/bin/luminosity-boost >/dev/null 2>&1 & disown
  fi
  echo "luminosity: ${percent}%"
}

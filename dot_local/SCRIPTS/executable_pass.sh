#!/bin/bash

# Deterministic Password Generator using Argon2
# Requirements:
# - argon2 command-line tool (install via: apt-get install argon2 or brew install argon2)

set -e

# Configuration
MIN_LENGTH=12
MAX_LENGTH=50
DEFAULT_LENGTH=50
ALLOWED_SYMBOLS="-().&@?'#,/;+"
UPPERCASE="ABCDEFGHIJKLMNOPQRSTUVWXYZ"
LOWERCASE="abcdefghijklmnopqrstuvwxyz"
DIGITS="0123456789"

# Check if argon2 is installed
if ! command -v argon2 &> /dev/null; then
    echo "Error: argon2 is not installed."
    echo "Install it using:"
    echo "  Ubuntu/Debian: sudo apt-get install argon2"
    echo "  macOS: brew install argon2"
    exit 1
fi

# Function to display usage
usage() {
    echo "Usage: $0 <master_password> <service_name>"
    echo ""
    echo "Arguments:"
    echo "  master_password  Your master password (spaces allowed, no quotes needed)"
    echo "  service_name     Service/site name (last argument)"
    echo ""
    echo "Password length is embedded: $DEFAULT_LENGTH characters"
    echo ""
    echo "Examples:"
    echo "  $0 MySecretMaster123! github"
    echo "  $0 My Secret Pass github"
    echo "  $0 Super Long Password With Spaces netflix"
    exit 1
}

# Parse arguments
if [ $# -lt 2 ]; then
    usage
fi

# Combine all arguments except the last one as master password
# Last argument is the service name
SERVICE_NAME="${@: -1}"
MASTER_PASSWORD="${@:1:$(($# - 1))}"
LENGTH=$DEFAULT_LENGTH

# Generate deterministic hash using Argon2
# Using Argon2id with proper security parameters
# -t: time cost (iterations)
# -m: memory cost (2^N KiB, so -m 16 = 64 MiB)
# -p: parallelism (threads)
# -l: hash length in bytes
SALT="$SERVICE_NAME"
TIME_COST=3          # 3 iterations
MEMORY_COST=19       # 2^19 KiB = 512 MiB
PARALLELISM=4        # 4 threads
HASH_LENGTH=64       # 64 bytes output

HASH=$(echo -n "$MASTER_PASSWORD" | argon2 "$SALT" -id -t $TIME_COST -m $MEMORY_COST -p $PARALLELISM -l $HASH_LENGTH -r)

# Convert hash to bytes for random selection
HASH_BYTES=$(echo -n "$HASH" | xxd -r -p | xxd -p -c1)

# Create balanced character pool for random filling
# Equal representation of each type
CHAR_POOL="$UPPERCASE$LOWERCASE$DIGITS$ALLOWED_SYMBOLS"

# Generate password ensuring requirements
PASSWORD=""

# Create array to hold all positions
PASSWORD_ARRAY=()
for i in $(seq 0 $((LENGTH - 1))); do
    PASSWORD_ARRAY+=("")
done

# Function to get character from pool using hash byte
get_char_from_pool() {
    local pool="$1"
    local byte_index="$2"
    local byte=$(echo "$HASH_BYTES" | sed -n "$((byte_index % 64 + 1))p")
    local index=$((16#$byte % ${#pool}))
    echo "${pool:$index:1}"
}

# Function to get position using hash byte
get_position() {
    local byte_index="$1"
    local available_count="$2"
    local byte=$(echo "$HASH_BYTES" | sed -n "$((byte_index % 64 + 1))p")
    echo $((16#$byte % available_count))
}

# Track available positions
AVAILABLE_POSITIONS=()
for i in $(seq 0 $((LENGTH - 1))); do
    AVAILABLE_POSITIONS+=($i)
done

# Place required characters at random positions
# Digit
BYTE_INDEX=0
POS_INDEX=$(get_position $BYTE_INDEX ${#AVAILABLE_POSITIONS[@]})
DIGIT_POS=${AVAILABLE_POSITIONS[$POS_INDEX]}
PASSWORD_ARRAY[$DIGIT_POS]=$(get_char_from_pool "$DIGITS" $BYTE_INDEX)
AVAILABLE_POSITIONS=("${AVAILABLE_POSITIONS[@]:0:$POS_INDEX}" "${AVAILABLE_POSITIONS[@]:$((POS_INDEX + 1))}")
BYTE_INDEX=$((BYTE_INDEX + 1))

# Uppercase
POS_INDEX=$(get_position $BYTE_INDEX ${#AVAILABLE_POSITIONS[@]})
UPPER_POS=${AVAILABLE_POSITIONS[$POS_INDEX]}
PASSWORD_ARRAY[$UPPER_POS]=$(get_char_from_pool "$UPPERCASE" $BYTE_INDEX)
AVAILABLE_POSITIONS=("${AVAILABLE_POSITIONS[@]:0:$POS_INDEX}" "${AVAILABLE_POSITIONS[@]:$((POS_INDEX + 1))}")
BYTE_INDEX=$((BYTE_INDEX + 1))

# Lowercase
POS_INDEX=$(get_position $BYTE_INDEX ${#AVAILABLE_POSITIONS[@]})
LOWER_POS=${AVAILABLE_POSITIONS[$POS_INDEX]}
PASSWORD_ARRAY[$LOWER_POS]=$(get_char_from_pool "$LOWERCASE" $BYTE_INDEX)
AVAILABLE_POSITIONS=("${AVAILABLE_POSITIONS[@]:0:$POS_INDEX}" "${AVAILABLE_POSITIONS[@]:$((POS_INDEX + 1))}")
BYTE_INDEX=$((BYTE_INDEX + 1))

# Symbol
POS_INDEX=$(get_position $BYTE_INDEX ${#AVAILABLE_POSITIONS[@]})
SYMBOL_POS=${AVAILABLE_POSITIONS[$POS_INDEX]}
PASSWORD_ARRAY[$SYMBOL_POS]=$(get_char_from_pool "$ALLOWED_SYMBOLS" $BYTE_INDEX)
AVAILABLE_POSITIONS=("${AVAILABLE_POSITIONS[@]:0:$POS_INDEX}" "${AVAILABLE_POSITIONS[@]:$((POS_INDEX + 1))}")
BYTE_INDEX=$((BYTE_INDEX + 1))

# Fill remaining positions with random characters from all pools
# Use different parts of hash to get better distribution
for i in $(seq 0 $((LENGTH - 1))); do
    if [ -z "${PASSWORD_ARRAY[$i]}" ]; then
        # Cycle through different character types for better distribution
        CHAR_TYPE=$((BYTE_INDEX % 4))
        case $CHAR_TYPE in
            0) POOL="$UPPERCASE" ;;
            1) POOL="$LOWERCASE" ;;
            2) POOL="$DIGITS" ;;
            3) POOL="$ALLOWED_SYMBOLS" ;;
        esac
        PASSWORD_ARRAY[$i]=$(get_char_from_pool "$POOL" $BYTE_INDEX)
        BYTE_INDEX=$((BYTE_INDEX + 1))
    fi
done

# Combine into final password
for char in "${PASSWORD_ARRAY[@]}"; do
    PASSWORD+="$char"
done

# Output the password
echo "$PASSWORD"
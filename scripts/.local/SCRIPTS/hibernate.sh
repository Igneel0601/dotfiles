#!/bin/bash

# Log for debugging
echo "$(date): Locking screen and hibernating" >> /tmp/hypr-hibernate.log

# Lock the screen
hyprlock &

# Give it time to start
sleep 1

# Hibernate
systemctl hibernate

#!/bin/bash

set -e

DISK="/dev/sdc"  # Example: /dev/sda or /dev/nvme0n1
HOST="archvaibhav"
HOSTPASS="03071979"
ROOTPASS="03071979"

ROOT="${DISK}2"
SWAP="${DISK}1"

echo "==> Mounting filesystems..."

mount $ROOT /mnt
swapon $SWAP

echo "==> Installing base system..."

pacstrap /mnt base linux linux-firmware sof-firmware grub networkmanager base-devel nano

echo "==> Generating fstab..."
genfstab -U /mnt >> /mnt/etc/fstab

echo "==> Setting up chroot..."

arch-chroot /mnt /bin/bash << EOF
ln -sf /usr/share/zoneinfo/Asia/Kolkata /etc/localtime
hwclock --systohc

echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
locale-gen
echo "LANG=en_US.UTF-8" > /etc/locale.conf

echo "$HOST" > /etc/hostname
echo root:$ROOTPASS | chpasswd

useradd -m -G wheel -s /bin/bash $HOST
echo $HOST:$HOSTPASS | chpasswd

echo "%wheel ALL=(ALL) ALL" >> /etc/sudoers

# Install BIOS GRUB
grub-install --target=i386-pc $DISK
grub-mkconfig -o /boot/grub/grub.cfg

systemctl enable NetworkManager

EOF

echo "==> Unmounting and done!"
umount -R /mnt

echo "Arch installation complete. Reboot when ready!"

#!/bin/bash
# scripts/backup.sh

# MongoDB backup script for digital banking platform
# Creates timestamped backups of the digital-bank database

TIMESTAMP=$(date +%F_%H-%M-%S)
BACKUP_DIR="./backups/mongo"
MONGODB_URI=mongodb+srv://NEGAIBanking_V1:NEGAIBanking_V1317@cluster0.qt5p77s.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting MongoDB backup at $TIMESTAMP"

# Run mongodump
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/backup-$TIMESTAMP"

if [ $? -eq 0 ]; then
    echo "MongoDB backup completed successfully: $BACKUP_DIR/backup-$TIMESTAMP"
else
    echo "MongoDB backup failed"
    exit 1
fi

# Clean up backups older than 7 days (CBN compliance)
find "$BACKUP_DIR" -type d -mtime +7 -exec rm -rf {} \;

echo "Cleaned up old backups"
#!/bin/bash
set -e

# ---- Configuration ----
USER_HOME=$(eval echo "~$USER")
SERVER_DIR="$USER_HOME/minecraft-server"
VERSION="${1:-1.21.8}"
JAR_NAME="minecraft_server.${VERSION}.jar"
SERVICE_NAME="minecraft.service"
JAVA_MIN_VERSION=17

# ---- Helpers ----
echo_header() {
  echo
  echo "=========================="
  echo "$1"
  echo "=========================="
}

# 1. Install prerequisites
echo_header "Installing prerequisites"
sudo apt update
sudo apt install -y openjdk-21-jre-headless wget jq

# 2. Ensure directory
mkdir -p "$SERVER_DIR"
cd "$SERVER_DIR"

# 3. Download server jar
if [ -f "$JAR_NAME" ]; then
  echo "Server jar $JAR_NAME already exists; skipping download."
else
  echo_header "Downloading Minecraft Java Edition server $VERSION"
  # fetch version manifest to locate correct jar URL
  MANIFEST=$(curl -s https://launchermeta.mojang.com/mc/game/version_manifest.json)
  DOWNLOAD_URL=$(echo "$MANIFEST" | jq -r --arg VER "$VERSION" '.versions[] | select(.id == $VER) | .url' )
  if [ -z "$DOWNLOAD_URL" ] || [ "$DOWNLOAD_URL" == "null" ]; then
    echo "Version $VERSION not found in manifest."
    exit 1
  fi
  VERSION_JSON=$(curl -s "$DOWNLOAD_URL")
  SERVER_URL=$(echo "$VERSION_JSON" | jq -r '.downloads.server.url')
  if [ -z "$SERVER_URL" ] || [ "$SERVER_URL" == "null" ]; then
    echo "No server.jar URL for version $VERSION"
    exit 1
  fi
  wget -O "$JAR_NAME" "$SERVER_URL"
fi

# 4. Accept EULA
echo_header "Writing eula.txt"
echo "eula=true" > eula.txt

# 5. Create default server.properties if missing
if [ ! -f server.properties ]; then
  echo_header "Creating default server.properties"
  cat <<EOF > server.properties
enable-command-block=true
online-mode=true
enable-whitelist=false
pvp=true
motd=Hosted on Raspberry Pi
server-port=25565
EOF
fi

# 6. Create start.sh
echo_header "Creating start script"
cat <<'EOF' > start.sh
#!/bin/bash
cd "$HOME/minecraft-server"
java -Xmx1536M -Xms1024M -jar "$HOME/minecraft-server/${JAR_NAME}" nogui
EOF
chmod +x start.sh

# 7. Create systemd service
echo_header "Installing systemd service"
SERVICE_PATH="/etc/systemd/system/$SERVICE_NAME"
sudo tee "$SERVICE_PATH" > /dev/null <<EOF
[Unit]
Description=Minecraft Java Edition Server $VERSION
After=network.target

[Service]
User=$USER
WorkingDirectory=$SERVER_DIR
ExecStart=/usr/bin/java -Xmx1536M -Xms1024M -jar $SERVER_DIR/$JAR_NAME nogui
Restart=on-failure
RestartSec=10
StartLimitBurst=0

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable minecraft
sudo systemctl start minecraft

# 8. Final status
echo_header "Done"
sudo systemctl status minecraft --no-pager
echo
echo "Minecraft server $VERSION installed and started. Logs: journalctl -u minecraft -f"

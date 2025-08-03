#!/bin/bash
set -e

# ---- helpers ----
echo_header() {
  echo
  echo "======================================"
  echo "$1"
  echo "======================================"
}

# ensure requirements
echo_header "Installing prerequisites"
sudo apt update
sudo apt install -y wget jq openjdk-21-jre-headless

if ! command -v java >/dev/null 2>&1; then
  echo "Java not found after install. Exiting."
  exit 1
fi

# ask version
read -rp "Minecraft Java Edition version to install (e.g. 1.21.8, default 1.21.8): " VERSION
VERSION=${VERSION:-1.21.8}

USER_HOME=$(eval echo "~$USER")
SERVER_DIR="$USER_HOME/minecraft-server"
JAR_NAME="minecraft_server.${VERSION}.jar"
SERVICE_NAME="minecraft.service"

mkdir -p "$SERVER_DIR"
cd "$SERVER_DIR"

# download version manifest and resolve JAR URL
echo_header "Resolving version $VERSION"
MANIFEST_JSON=$(curl -fsSL https://launchermeta.mojang.com/mc/game/version_manifest.json)
VERSION_URL=$(echo "$MANIFEST_JSON" | jq -r --arg V "$VERSION" '.versions[] | select(.id==$V) | .url')
if [ -z "$VERSION_URL" ] || [ "$VERSION_URL" = "null" ]; then
  echo "Version '$VERSION' not found in manifest. Exiting."
  exit 1
fi

VERSION_JSON=$(curl -fsSL "$VERSION_URL")
SERVER_JAR_URL=$(echo "$VERSION_JSON" | jq -r '.downloads.server.url')
if [ -z "$SERVER_JAR_URL" ] || [ "$SERVER_JAR_URL" = "null" ]; then
  echo "Server jar URL missing for version $VERSION. Exiting."
  exit 1
fi

# download jar if missing
if [ -f "$JAR_NAME" ]; then
  echo "$JAR_NAME already exists; skipping download."
else
  echo_header "Downloading Minecraft server $VERSION"
  wget -O "$JAR_NAME" "$SERVER_JAR_URL"
fi

# eula
echo_header "Accepting EULA"
echo "eula=true" > eula.txt

# default server.properties
if [ ! -f server.properties ]; then
  echo_header "Writing default server.properties"
  cat <<EOF > server.properties
enable-command-block=true
online-mode=true
enable-whitelist=false
pvp=true
motd=Hosted on Raspberry Pi
server-port=25565
allow-nether=true
difficulty=normal
max-players=10
simulation-distance=10
spawn-protection=16
spawn-monsters=true
EOF
fi

# create start script
echo_header "Creating start.sh"
cat <<'EOF' > start.sh
#!/bin/bash
cd "$HOME/minecraft-server"
exec /usr/bin/java -Xmx1536M -Xms1024M -jar "$HOME/minecraft-server/${JAR_NAME}" nogui
EOF
chmod +x start.sh

# create systemd service
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

echo_header "Done"
sudo systemctl status minecraft --no-pager
echo
echo "To view live logs: journalctl -u minecraft -f"

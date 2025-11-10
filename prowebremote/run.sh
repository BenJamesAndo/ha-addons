#!/bin/bash
set -e

echo "Starting ProWebRemote with Ingress Support..."

# Install nginx and jq at runtime
apk add --no-cache nginx jq > /dev/null 2>&1

# Read config from options.json (Home Assistant provides this)
if [ -f /data/options.json ]; then
    PROPRESENTER_HOST=$(jq -r '.propresenter_host // "192.168.1.167"' /data/options.json)
    PROPRESENTER_PORT=$(jq -r '.propresenter_port // 51482' /data/options.json)
    PROPRESENTER_PASS=$(jq -r '.propresenter_password // "7777777"' /data/options.json)
    # Read booleans - if the key doesn't exist, use default
    MUST_AUTHENTICATE=$(jq -r 'if has("must_authenticate") then .must_authenticate else true end' /data/options.json)
    CHANGE_HOST=$(jq -r 'if has("change_host") then .change_host else false end' /data/options.json)
    CONTINUOUS_PLAYLIST=$(jq -r 'if has("continuous_playlist") then .continuous_playlist else true end' /data/options.json)
    RETRIEVE_ENTIRE_LIBRARY=$(jq -r 'if has("retrieve_entire_library") then .retrieve_entire_library else false end' /data/options.json)
    FORCE_SLIDES=$(jq -r 'if has("force_slides") then .force_slides else false end' /data/options.json)
    FOLLOW_PROPRESENTER=$(jq -r 'if has("follow_propresenter") then .follow_propresenter else true end' /data/options.json)
else
    PROPRESENTER_HOST="192.168.1.167"
    PROPRESENTER_PORT="51482"
    PROPRESENTER_PASS="7777777"
    MUST_AUTHENTICATE="true"
    CHANGE_HOST="false"
    CONTINUOUS_PLAYLIST="true"
    RETRIEVE_ENTIRE_LIBRARY="false"
    FORCE_SLIDES="false"
    FOLLOW_PROPRESENTER="true"
fi

echo "ProPresenter: ${PROPRESENTER_HOST}:${PROPRESENTER_PORT}"

# Create nginx config for ingress
mkdir -p /etc/nginx/http.d

# Patch config.js with connection settings
cat > /var/www/html/js/config.js <<JSEOF
// Connection
var host = "${PROPRESENTER_HOST}";
var port = "${PROPRESENTER_PORT}";
var pass = "${PROPRESENTER_PASS}";
JSEOF

# Patch site.js for ingress WebSocket support and user preferences
sed -i 's|wsUri = wsProtocol + host + ":" + port;|wsUri = wsProtocol + "//" + window.location.host + window.location.pathname.replace(/\\/$/, "");|' /var/www/html/js/site.js
sed -i "s|var continuousPlaylist = .*;|var continuousPlaylist = ${CONTINUOUS_PLAYLIST};|" /var/www/html/js/site.js
sed -i "s|var retrieveEntireLibrary = .*;|var retrieveEntireLibrary = ${RETRIEVE_ENTIRE_LIBRARY};|" /var/www/html/js/site.js
sed -i "s|var forceSlides = .*;|var forceSlides = ${FORCE_SLIDES};|" /var/www/html/js/site.js
sed -i "s|var followProPresenter = .*;|var followProPresenter = ${FOLLOW_PROPRESENTER};|" /var/www/html/js/site.js
sed -i "s|var mustAuthenticate = .*;|var mustAuthenticate = ${MUST_AUTHENTICATE};|" /var/www/html/js/site.js
sed -i "s|var changeHost = .*;|var changeHost = ${CHANGE_HOST};|" /var/www/html/js/site.js

cat > /etc/nginx/http.d/default.conf <<EOF
upstream propresenter {
    server ${PROPRESENTER_HOST}:${PROPRESENTER_PORT};
}

map \$http_upgrade \$connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 8080 default_server;
    
    root /var/www/html;
    index index.html;
    
    # Allow only from Home Assistant
    allow   172.30.32.2;
    deny    all;

    # Serve static files
    location / {
        try_files \$uri \$uri/ /index.html;
        
        # Disable caching for JS files to ensure changes are reflected
        location ~* \\.js$ {
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            add_header Pragma "no-cache";
            add_header Expires "0";
        }
    }
    
    # Proxy WebSocket connections to ProPresenter
    location /remote {
        proxy_pass http://propresenter;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host ${PROPRESENTER_HOST}:${PROPRESENTER_PORT};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_buffering off;
        
        # Don't timeout WebSocket connections
        proxy_read_timeout 86400;
    }
}
EOF

echo "Starting nginx..."
exec nginx -g 'daemon off;'

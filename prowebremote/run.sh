#!/bin/bash
set -e

echo "Starting ProWebRemote with Ingress Support..."

# Install nginx and jq at runtime
apk add --no-cache nginx jq > /dev/null 2>&1

# Read config from options.json (Home Assistant provides this)
if [ -f /data/options.json ]; then
    PROPRESENTER_HOST=$(jq -r '.propresenter_host' /data/options.json)
    PROPRESENTER_PORT=$(jq -r '.propresenter_port' /data/options.json)
    PROPRESENTER_PASS=$(jq -r '.propresenter_password // ""' /data/options.json)
    API_TYPE_RAW=$(jq -r 'if has("api_type") then .api_type else "Classic" end' /data/options.json)
    # Normalize API type to lowercase single word: "OpenAPI" -> "open", "Classic" -> "classic"
    if [ "$API_TYPE_RAW" = "OpenAPI" ]; then
        API_TYPE="open"
    elif [ "$API_TYPE_RAW" = "Classic" ]; then
        API_TYPE="classic"
    else
        # Fallback for any unexpected values
        API_TYPE="classic"
    fi
    # Read booleans - if the key doesn't exist, use default
    MUST_AUTHENTICATE=$(jq -r 'if has("must_authenticate") then .must_authenticate else true end' /data/options.json)
    CONTINUOUS_PLAYLIST=$(jq -r 'if has("continuous_playlist") then .continuous_playlist else true end' /data/options.json)
    RETRIEVE_ENTIRE_LIBRARY=$(jq -r 'if has("retrieve_entire_library") then .retrieve_entire_library else false end' /data/options.json)
    FORCE_SLIDES=$(jq -r 'if has("force_slides") then .force_slides else false end' /data/options.json)
    FOLLOW_PROPRESENTER=$(jq -r 'if has("follow_propresenter") then .follow_propresenter else true end' /data/options.json)
else
    echo "ERROR: /data/options.json not found"
    exit 1
fi

echo "ProPresenter: ${PROPRESENTER_HOST}:${PROPRESENTER_PORT}"
echo "API Type: ${API_TYPE}"

# Create nginx config for ingress
mkdir -p /etc/nginx/http.d

# Patch config.js with connection settings and API type
cat > /var/www/html/js/config.js <<JSEOF
// Connection
var host = "${PROPRESENTER_HOST}";
var port = "${PROPRESENTER_PORT}";
var pass = "${PROPRESENTER_PASS}";

// API Type: "classic" for classic WebSocket API, "open" for OpenAPI
var apiType = "${API_TYPE}";
JSEOF

# Patch site.js for ingress support and user preferences
# For classic: patch WebSocket URI to use ingress path
if [ "${API_TYPE}" = "classic" ]; then
    sed -i 's|wsUri = wsProtocol + host + ":" + port;|wsUri = wsProtocol + "//" + window.location.host + window.location.pathname.replace(/\\/$/, "");|' /var/www/html/js/api-classic.js
fi

# OpenAPI adapter now auto-detects ingress mode, no patching needed

sed -i "s|var continuousPlaylist = .*;|var continuousPlaylist = ${CONTINUOUS_PLAYLIST};|" /var/www/html/js/site.js
sed -i "s|var retrieveEntireLibrary = .*;|var retrieveEntireLibrary = ${RETRIEVE_ENTIRE_LIBRARY};|" /var/www/html/js/site.js
sed -i "s|var forceSlides = .*;|var forceSlides = ${FORCE_SLIDES};|" /var/www/html/js/site.js
sed -i "s|var followProPresenter = .*;|var followProPresenter = ${FOLLOW_PROPRESENTER};|" /var/www/html/js/site.js
sed -i "s|var mustAuthenticate = .*;|var mustAuthenticate = ${MUST_AUTHENTICATE};|" /var/www/html/js/site.js
sed -i "s|var changeHost = .*;|var changeHost = false;|" /var/www/html/js/site.js

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
    
    # Proxy WebSocket connections to ProPresenter (for Classic)
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
    
    # Proxy OpenAPI HTTP requests to ProPresenter (for OpenAPI v1)
    location /v1/ {
        proxy_pass http://propresenter;
        proxy_http_version 1.1;
        proxy_set_header Host ${PROPRESENTER_HOST}:${PROPRESENTER_PORT};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Disable buffering for streaming endpoints (status updates)
        proxy_buffering off;
        proxy_cache off;
        
        # Extended timeouts for long-lived connections (status stream)
        proxy_connect_timeout 60s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        
        # Handle CORS for OpenAPI
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        
        # Handle preflight requests
        if (\$request_method = OPTIONS) {
            return 204;
        }
    }
}
EOF

echo "Starting nginx..."
exec nginx -g 'daemon off;'

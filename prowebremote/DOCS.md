# ProWebRemote Add-on Documentation

## Technical Details

### Architecture

The add-on consists of three main components:

1. **ProWebRemote** - The web interface for controlling ProPresenter
2. **Nginx** - Reverse proxy that handles ingress and WebSocket proxying
3. **Runtime Patching** - Modifies ProWebRemote's JavaScript to work with ingress paths

### Nginx Configuration

The nginx server:
- Listens on port 8080 (ingress_port)
- Serves ProWebRemote static files from `/var/www/html`
- Proxies `/remote` endpoint to ProPresenter's WebSocket
- Disables caching for JavaScript files to ensure preference changes apply
- Restricts access to Home Assistant's ingress IP (172.30.32.2)

### JavaScript Patching

On startup, the add-on patches:

1. **config.js** - Injects connection settings from HA configuration
2. **site.js** - Modifies WebSocket URL construction to use ingress path
3. **site.js** - Applies user preference settings

The patching uses `sed` to modify files in-place before nginx starts.

### Why Runtime Installation?

Nginx and jq are installed at runtime because:
- Avoids Docker build failures when Alpine repos are temporarily unavailable
- Ensures the add-on can be built offline
- Installation is fast (2-3 seconds) and only happens on container creation

## Troubleshooting

### Add-on won't start

**Problem**: Add-on fails to start or shows error messages.

**Solutions**:
1. Check that your Home Assistant has internet access (required for nginx installation)
2. Verify ProPresenter's IP address and port are correct
3. Check the add-on logs for specific error messages

### WebSocket connection fails

**Problem**: ProWebRemote shows "Socket encountered error" or fails to connect.

**Solutions**:
1. Verify ProPresenter's Remote Control is enabled
2. Check that the port matches ProPresenter's settings (usually 1025 or 51482)
3. Ensure the password is correct
4. Try accessing ProWebRemote directly at `http://propresenter-ip:port` to verify it works

### Assets won't load (404 errors)

**Problem**: Page loads but images, CSS, or JavaScript files return 404 errors.

**Solutions**:
1. Hard refresh your browser (Ctrl+Shift+R or Ctrl+F5)
2. Clear your browser cache
3. Restart the add-on to regenerate patched files

### Changes to preferences don't apply

**Problem**: Toggling options like "Require Authentication" doesn't change behavior.

**Solutions**:
1. Restart the add-on after changing configuration
2. Check the add-on logs to verify the values are being applied
3. Hard refresh the browser to clear cached JavaScript

## Development

### Building Custom Images

If you want to avoid runtime nginx installation, create a custom base image:

```dockerfile
FROM ghcr.io/home-assistant/amd64-base:3.20
RUN apk add --no-cache nginx jq
```

Push to Docker Hub and update `build.yaml`:

```yaml
build_from:
  amd64: yourusername/prowebremote-base:latest
```

### Modifying ProWebRemote

The ProWebRemote files are copied from the `ProWebRemote/` directory during build. To update:

1. Download the latest ProWebRemote release
2. Extract to `prowebremote/ProWebRemote/`
3. Rebuild the add-on

### Testing Changes

1. Make changes to files in the addon directory
2. If using a local repository, just rebuild the add-on
3. Check logs to verify changes are applied
4. Test functionality through the sidebar entry

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

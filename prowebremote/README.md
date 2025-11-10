# ProWebRemote with Ingress Support

![Supports aarch64 Architecture][aarch64-shield]
![Supports amd64 Architecture][amd64-shield]
![Supports armhf Architecture][armhf-shield]
![Supports armv7 Architecture][armv7-shield]
![Supports i386 Architecture][i386-shield]

Access ProPresenter's WebSocket API securely over HTTPS through Home Assistant's ingress system.

## About

ProWebRemote is a web-based remote control for ProPresenter. However, it only supports insecure `ws://` WebSocket connections, which don't work when accessing Home Assistant over HTTPS due to mixed content restrictions.

This add-on wraps ProWebRemote with an ingress-enabled nginx proxy, allowing you to:

- 🔒 **Access ProPresenter over HTTPS** - No more mixed content errors
- 🌐 **Remote access from anywhere** - Works over WAN through your HA instance
- 📱 **Sidebar integration** - Add to HA sidebar for easy access
- ⚙️ **Configurable preferences** - Control authentication, playlists, and more

## How It Works

```
Browser → HTTPS → Home Assistant → Ingress Proxy → WS → ProPresenter
  🔒              🔒                ↓                    ⚠️
Secure          Secure        Internal LAN         Unencrypted
```

Your browser only sees secure `wss://` connections to Home Assistant. The nginx proxy handles the insecure `ws://` connection to ProPresenter internally on your local network.

## Installation

1. Add this repository to Home Assistant:
   - Navigate to **Settings** → **Add-ons** → **Add-on Store**
   - Click **⋮** menu → **Repositories**
   - Add: `https://github.com/BenJamesAndo/hassio-addons`

2. Install **ProWebRemote**:
   - Find it in the add-on store
   - Click **Install**

3. Configure the add-on:
   - Set your ProPresenter host IP address
   - Set the port (usually 1025 or 51482)
   - Set your ProPresenter password
   - Adjust user preferences as needed

4. Start the add-on

5. Enable **"Show in sidebar"** to access from the HA menu

## Configuration

### Connection Settings

| Option | Description | Default |
|--------|-------------|---------|
| `propresenter_host` | IP address of your ProPresenter computer | `192.168.1.167` |
| `propresenter_port` | ProPresenter Remote Control port | `51482` |
| `propresenter_password` | Remote control password | `7777777` |

### User Preferences

| Option | Description | Default |
|--------|-------------|---------|
| `must_authenticate` | Require authentication to connect | `true` |
| `change_host` | Show IP/port fields in UI (disable for ingress-only) | `false` |
| `continuous_playlist` | Enable continuous playlist playback | `true` |
| `retrieve_entire_library` | Load all library items at startup (may be slow) | `false` |
| `force_slides` | Always show slide previews | `false` |
| `follow_propresenter` | Automatically follow ProPresenter's display | `true` |

## Usage

1. Enable "Show in sidebar" in the add-on configuration
2. Click **ProPresenter Remote** in the Home Assistant sidebar
3. Click **Connect** (authentication should be automatic if configured)
4. Control ProPresenter from anywhere!

## Support

- [GitHub Issues](https://github.com/BenJamesAndo/hassio-addons/issues)
- [ProPresenter Integration](https://github.com/BenJamesAndo/ha-propresenter)

## Credits

- Based on [ProWebRemote](https://github.com/L2N6H5B3/ProWebRemote) by L2N6H5B3
- ProPresenter by [Renewed Vision](https://renewedvision.com/propresenter/)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[armhf-shield]: https://img.shields.io/badge/armhf-yes-green.svg
[armv7-shield]: https://img.shields.io/badge/armv7-yes-green.svg
[i386-shield]: https://img.shields.io/badge/i386-yes-green.svg

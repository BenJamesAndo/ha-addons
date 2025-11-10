# ProWebRemote with Ingress Support

![Supports amd64 Architecture][amd64-shield]

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

Adding this add-ons repository to your Home Assistant instance is simple:

**One-Click Installation:**

[![Add Repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https://github.com/BenJamesAndo/ha-addons)

**Manual Installation:**

1. Navigate to **Settings** → **Add-ons** → **Add-on Store**
2. Click the **⋮** menu in the top right and select **Repositories**
3. Add this repository URL:
   ```
   https://github.com/BenJamesAndo/ha-addons
   ```
4. Click **Add** → **Close**
5. The add-ons will now appear in your add-on store

## Setup

1. Install **ProWebRemote**:
   - Click **Install**

2. Configure the add-on:
   - Set your ProPresenter host IP address
   - Set the port
   - Set your ProPresenter password
   - Adjust user preferences as needed

3. Start the add-on

4. Enable **"Show in sidebar"** to access from the HA menu

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

- [GitHub Issues](https://github.com/BenJamesAndo/ha-addons/issues)
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

# ProWebRemote with Ingress Support

![Supports amd64 Architecture][amd64-shield]

Access ProPresenter's WebSocket API securely over HTTPS through Home Assistant's ingress system.

## About

[ProWebRemote](https://github.com/L2N6H5B3/ProWebRemote) is a web-based remote control for ProPresenter. However, it only supports insecure `ws://` WebSocket connections, which don't work when accessing Home Assistant over HTTPS due to mixed content restrictions.

This add-on wraps ProWebRemote with an ingress-enabled nginx proxy, allowing you to:

-  **Access ProPresenter over HTTPS**
-  **Remote access from anywhere**
-  **Sidebar** - Add to HA sidebar for easy access
-  **Configurable preferences**

## Screenshot
<img width="1917" height="925" alt="image" src="https://github.com/user-attachments/assets/0018fa65-788c-4dc6-b94d-434e8cf163e5" />


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

ProPresenter IP Address
ProPresenter Port
ProPresenter Controller Password

### User Preferences

Require Authentication
Continuous Playlist Mode
Retrive Entire Library
Force Slides View
Follow ProPresenter Display

## Usage

1. Enable "Show in sidebar" in the add-on configuration
2. Click **ProPresenter Remote** in the Home Assistant sidebar
3. Control ProPresenter from anywhere

## Support

- [GitHub Issues](https://github.com/BenJamesAndo/ha-addons/issues)
- [ProPresenter Integration](https://github.com/BenJamesAndo/ha-propresenter)

## Credits

- Based on [ProWebRemote](https://github.com/L2N6H5B3/ProWebRemote) by L2N6H5B3
- ProPresenter by [Renewed Vision](https://renewedvision.com/propresenter/)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg

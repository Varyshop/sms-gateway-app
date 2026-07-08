# Changelog

All notable changes to the Varyshop SMS Gateway app.

## [1.7.1] — 2026-07-08

### Fixed
- **Manual inbox rescan now scans the full 30-day window.** Previously it
  only scanned since the last automatic check (which runs at every service
  start), so manual rescans almost always found nothing.
- **Inbound checkpoint only advances after a successful upload.** Previously
  a failed upload (network/server outage) permanently skipped all messages
  in that window — they were never re-sent to the server.
- **Startup retroactive STOP check is no longer discarded** when the first
  poll has pending SMS in the queue. The check now runs on the first idle
  poll and retries on failure.
- `versionCode` is now incremented with each release so update installs
  work reliably on MIUI.

> Server side (sms_gateway v18.0.2.8.0): fixed partner matching for numbers
> stored with spaces, chatter posts rendering as raw HTML, duplicate inbound
> records, and added an Inbound SMS menu with a Reprocess action in Odoo.

## [1.7.0] — 2026-06-27

### Added
- **Internationalization (i18n):** English is now the default language,
  Czech (Čeština) selectable in Settings → Language. Language preference is
  persisted and the device locale is auto-detected on first launch.

### Changed
- README restructured: English default, Czech as `README.cs.md`.

## [1.6.0] — 2026-06-13

### Changed
- Performance improvements: throttled status broadcasts, reduced thread
  pool, optimized dashboard polling.

### Fixed
- Heartbeat no longer reports the phone offline when the phone number
  guard fails.

## [1.3.0] — 2026-04-04

### Added
- Campaign wizard: create SMS campaigns from templates directly in the app.
- SIM selection for campaigns, including splitting between both SIMs.
- Marketing stats: clicks, orders, unsubscribes and campaign revenue.
- Campaign pause/resume/archive.

## [1.2.0] — 2026-03-22

### Added
- Inbound SMS processing with STOP detection and server reporting.
- Retroactive inbox scan for missed messages.

### Fixed
- Safe area insets, background service reliability.

## [1.1.0] — 2026-03-18

### Added
- FCM push wake-up for instant SMS delivery.

### Fixed
- Background service kept alive on aggressive battery-saver ROMs.

## [1.0.0] — 2026-03-03

Initial release: QR pairing with Odoo, foreground service with polling and
heartbeat, SMS sending with delivery tracking, dual-SIM support, sending
limits and history.

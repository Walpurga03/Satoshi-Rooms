# SatoshiRooms

[![Nostr](https://img.shields.io/badge/Nostr-Protocol-purple)](https://nostr.com/)
[![NIP-29](https://img.shields.io/badge/NIP--29-Supported-brightgreen)](https://github.com/nostr-protocol/nips/blob/master/29.md)

SatoshiRooms ist eine dezentrale Chat-Anwendung, die auf dem Nostr-Protokoll basiert und über NIP-29 Gruppen kommuniziert.

## Inhaltsverzeichnis

- [Beschreibung](#beschreibung)
- [Features](#features)
- [Installation](#installation)
- [Verwendung](#verwendung)
- [Beitrag leisten](#beitrag-leisten)
- [Lizenz](#lizenz)
- [Kontakt](#kontakt)

## Beschreibung

SatoshiRooms nutzt das dezentrale Nostr-Protokoll, um eine zensurresistente und private Kommunikationsplattform zu schaffen. Die Anwendung implementiert NIP-29 (Nostr Implementation Possibility 29) für Gruppenkonversationen.

Die primäre Motivation hinter diesem Projekt ist es, einen sicheren Ort für den Austausch von Ideen rund um Bitcoin, österreichische Wirtschaftstheorie im Allgemeinen zu bieten, ohne dabei auf zentralisierte Dienste angewiesen zu sein.

![Screenshot der SatoshiRooms App](https://github.com/Walpurga03/Satoshi-Rooms/raw/main/frontend/public/satoshi-rooms-preview.png)

## Features

- ✅ **Dezentrale Kommunikation**: Basierend auf dem Nostr-Protokoll für maximale Zensurresistenz
- ✨ **NIP-29 Gruppenunterstützung**: Thematische Räume für organisierte Diskussionen
- 🔒 **Private Schlüssel-Authentifizierung**: Sichere Anmeldung mit Nostr-Schlüsseln
- 👥 **Aktive Gruppenmitglieder**: Echtzeit-Anzeige aktiver Teilnehmer im Raum
- 💬 **Echtzeit-Nachrichten**: Sofortige Nachrichtenübermittlung und -anzeige
- 🌐 **Multi-Relay-Unterstützung**: Verbindung zu mehreren Nostr-Relays für erhöhte Stabilität
- 🔍 **Profilansicht**: Einsehen von Benutzerinfos inklusive NIP-05 Verifizierung
- 😀 **Emoji-Unterstützung**: Einfüge von Emojis in Nachrichten
- 🔄 **Auto-Refresh**: Automatische Aktualisierung der Nachrichten
- 📱 **Responsives Design**: Optimiert für Desktop

## Installation

So richtest du SatoshiRooms auf deinem lokalen System ein:

1. Klone das Repository:
   ```bash
   git clone https://github.com/Walpurga03/Satoshi-Rooms.git
   ```
2. Wechsle in das Projektverzeichnis:
   ```bash
   cd Satoshi-Rooms/frontend
   ```
3. Installiere die Abhängigkeiten:
   ```bash
   npm install
   ```
4. Konfiguriere die Umgebungsvariablen(optional)
   ```bash
   cp .env.example .env
   # Bearbeite die .env Datei mit deinen eigenen Werten
   ```
5. Starte die Entwicklungsumgebung:
   ```bash
   npm run dev
   ```

## Verwendung

Nach der Installation kannst du SatoshiRooms wie folgt verwenden:

1. Öffne die App in deinem Browser (Standard: http://localhost:5173)
2. Melde dich mit deinem Nostr Private Key (nsec) an
3. Beginne mit der Kommunikation in der Gruppe


## Beitrag leisten

Beiträge zu SatoshiRooms sind willkommen! So kannst du helfen:

1. Forke das Projekt
2. Erstelle einen Feature-Branch (`git checkout -b feature/AwesomeFeature`)
3. Commite deine Änderungen (`git commit -m 'Add some AwesomeFeature'`)
4. Pushe zum Branch (`git push origin feature/AwesomeFeature`)
5. Öffne einen Pull Request

Alle Beiträge sollten sich an die Grundprinzipien der Dezentralisierung und Privatsphäre halten.

## Lizenz

Dieses Projekt ist unter der **MIT Lizenz** lizenziert. Siehe die `LICENSE`-Datei für weitere Informationen.

## Kontakt

npub -> npub1hht9umpeet75w55uzs9lq6ksayfpcvl9lk64hye75j0yj4husq5ss8xsry

Projekt-Link: `https://github.com/Walpurga03/Satoshi-Rooms`

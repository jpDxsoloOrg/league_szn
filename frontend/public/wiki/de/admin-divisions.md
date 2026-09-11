# Divisionen verwalten

Die Seite **Divisionen** ermöglicht es, Spieler nach Gewichtsklasse, Kartenposition oder Rolle zu gruppieren – z. B. Schwergewicht, Cruiserweight, Main Event oder Jobber. Divisionen sind keine Show-Brands; sie legen fest, wer bei aktivierter Divisionsbeschränkung für welche Meisterschaften antreten kann.

## Division anlegen

1. Gehe zu **Divisionen**
2. Fülle die Angaben aus:
   - **Divisionsname** — z. B. „Schwergewicht“, „Cruiserweight“, „Main Event“, „Jobber“
   - **Beschreibung** (optional) — z. B. „Top-Stars“, „Unter 205 lbs“ oder „Enhancement Talent“
3. Klicke auf **Division anlegen**, um zu speichern

## Division bearbeiten

1. Finde die Division in der Übersicht
2. Klicke auf **Bearbeiten** bei der Division
3. Passe Name oder Beschreibung an
4. Klicke auf **Division aktualisieren**, um die Änderungen zu übernehmen

## Division löschen

1. Finde die Division in der Übersicht
2. Klicke auf **Löschen** bei der Division
3. Bestätige die Aktion im Dialog

**Hinweis:** Eine Division, der noch Spieler zugewiesen sind, kann nicht gelöscht werden. Weise die Spieler zuerst einer anderen Division zu oder entferne die Zuweisung.

## Spieler Divisionen zuweisen

1. Gehe zu **Spieler verwalten**
2. Beim Bearbeiten eines Spielers nutze das **Division**-Dropdown
3. Wähle die passende Division oder „Keine Division”
4. Speichere den Spieler, um die Zuweisung zu übernehmen

## Divisions-Leiter

Der Bildschirm **Divisions-Leiter** ermöglicht es, Divisionen in eine Hierarchie zu organisieren und automatische Beförderungen und Degradierungen auf Grundlage von Gewinn- und Verlustserien zu aktivieren.

### Organisieren der Leiter

Divisionen sind von unten (Jobber-Tier – Nachwuchswrestler) nach oben (Main Event – Hauptkarte) angeordnet. Nutze die **▲**- und **▼**-Tasten, um Divisionen in der Hierarchie umzuordnen.

### Automatische Beförderung und Degradierung durch Serien

Wenn aktiviert, verschieben die Leiter-Regeln Spieler automatisch:

- **Beförderung**: Ein Spieler mit einer **5er-Gewinn-Serie** (Standard) rückt eine Division auf
- **Degradierung**: Ein Spieler mit einer **5er-Verlust-Serie** (Standard) rutscht eine Division ab
- Unentschieden führen zu keinen Änderungen
- Serien werden nur aus Kämpfen *nach* der letzten Divisions-Änderung des Spielers berechnet, daher setzt eine Beförderung den Zähler zurück
- Spieler können nicht über die oberste Division befördert oder unter die Jobber-Tier degradiert werden

### Regeln konfigurieren

1. **Aktiviere/Deaktiviere** die Leiter mit dem Toggle
2. **Gewinn-Serie** — Lege fest, wie viele aufeinanderfolgende Siege für eine Beförderung erforderlich sind (2–20, Standard 5)
3. **Verlust-Serie** — Lege fest, wie viele aufeinanderfolgende Verluste für eine Degradierung erforderlich sind (2–20, Standard 5)
4. Klicke auf **Speichern**, um die Änderungen zu übernehmen

### Aktuelle Bewegungen

Die Tabelle **Aktuelle Bewegungen** zeigt aktuelle Beförderungen und Degradierungen an, einschließlich des Spielers, Datums, Richtung und des Auslösers der Bewegung (Serie, Administrator oder Wechsel).

## Sperren

Der Bildschirm **Sperren** ermöglicht es, Spieler vorübergehend aus dem Kader zu entfernen, wenn sie verletzt, von der Politik suspendiert oder nicht verfügbar sind.

### Spieler sperren

1. Gehe zu **Sperren**
2. Nutze das Suchfeld, um den Spieler zu finden
3. Klicke auf den Spieler, um den Sperr-Dialog zu öffnen
4. Wähle eine Bedingung:
   - **Bis zu einem Datum** — Wähle ein zukünftiges Datum, an dem die Sperre endet
   - **Für eine Anzahl von Shows** — Gib ein, wie viele abgeschlossene Veranstaltungen verstreichen müssen, bevor eine Aufhebung möglich ist (1–52)
5. Füge optional einen Grund für die Sperre hinzu
6. Klicke auf **Sperren**, um zu bestätigen

### Gesperrte Spieler bei Buchungen

Gesperrte Spieler erscheinen immer noch im **Buchungs-Picker** (verwendet beim Planen von Kämpfen oder Überprüfung von Ereignissen) mit einem **„Gesperrt”**-Label, das zeigt:
- Bei Datum-basiert: das Sperr-Enddatum
- Bei Show-basiert: wie viele Shows noch verbleiben

Gesperrte Spieler können bei Bedarf immer noch gebucht werden.

### Aufhebung der Sperre

#### Manuelle Aufhebung

1. Gehe zu **Sperren**
2. Suche nach dem gesperrten Spieler oder finde ihn in der Tabelle der aktiven Sperren
3. Klicke auf **Aufheben**, um die Sperre sofort zu entfernen (auch vor der Zulässigkeit)

#### Automatische Aufhebungs-Aufforderung

Wenn sich ein Team-Mitglied anmeldet, nachdem eine Sperre erfüllt wurde (das Enddatum ist vergangen oder die erforderliche Anzahl der Shows ist abgelaufen), erscheint ein Modal mit:

- **Liste der zulässigen Spieler** mit der Bedingung, die erfüllt wurde (z. B. „Datum verstrichen 8. Sep” oder „4 von 4 Shows erfüllt”)
- **Aufheben**-Taste für jeden Spieler
- **Alle aufheben**-Taste, um alle zulässigen Spieler auf einmal aufzuheben
- **Erinnere mich später**, um das Modal für diese Sitzung zu schließen (es wird beim nächsten Anmelden erneut angezeigt)

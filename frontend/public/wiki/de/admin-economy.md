# Wirtschaft

Verträge, Geldbörsen, Strafen und der Shop. Diese Seite beschreibt die Seite der GMs. Was Spieler sehen, steht unter [Verträge und Geld](contracts-and-money).

## Zuerst einschalten

Die Wirtschaft hängt am Feature-Schalter **Wirtschaft** und ist **aus**, bis du sie einschaltest. Solange sie aus ist, sehen Spieler nichts davon: keine Seiten **Mein Vertrag**, **Free Agents** oder **Shop**, keine Geldbörsen-Karte und keine Strafen-Buttons.

1. Richte zuerst die **Wirtschaft**-Einstellungen ein (siehe unten), damit die ersten Angebote und Käufe mit deinen Zahlen laufen.
2. Ein Admin öffnet **Admin → Funktionsverwaltung** und schaltet **Wirtschaft** ein.

Du kannst sie jederzeit wieder ausschalten. Dabei geht nichts verloren: Verträge, Guthaben und Verlauf sind alle noch da, wenn du sie wieder einschaltest.

## Wirtschaftseinstellungen

**Admin → Wirtschaft**. Admins können sie ändern, Moderatoren können sie ansehen.

| Bereich | Was du festlegst |
|---------|------------------|
| **Währung** | Name und Symbol des Liga-Geldes. |
| **Standardverträge** | Die Startbedingungen für jede Vertragsart: Länge des Probevertrags, Match-Gage, Wochengehalt und Siegbonus. Jedes neue Angebot startet damit, und du kannst sie bei jedem einzelnen Angebot ändern. |
| **Prämien, Angebote und Strafen** | Den Free-Agent-Siegbonus, wie viele Tage ein Angebot offen bleibt, und die No-Show-Strafe. |
| **Strafvorlagen** | Strafen mit einem Klick, mit Bezeichnung und Betrag, zum Beispiel für Pause-Missbrauch. |
| **Shop-Artikel** | Schalte jeden Artikel an oder aus und lege Preis und Wirkung fest. Ausgeschaltete Artikel erscheinen nicht im Shop. |
| **Saisonbudget-Check** | Was ein Saisonvertrag mit den Bedingungen oben über eine Saison einbringt, damit du Shoppreise und Strafen prüfen kannst. |

Jedes Speichern ist eine neue Version. Änderungen gelten erst ab dann: für neue Angebote, Strafen und Käufe. Unterschriebene Verträge behalten ihre Bedingungen. Hat jemand anderes gespeichert, während du die Seite offen hattest, wirst du gebeten, neu zu laden und deine Änderungen noch einmal zu machen.

## Vertragsbüro

**Admin → Verträge** hat vier Tabs: **Aktiv**, **Angeboten**, **Free Agents** und **Verlauf**.

- **Vertrag anbieten**: Wähle Spieler und Vertragsart. Die Bedingungen starten mit den Standardwerten, und du kannst sie ändern. Wenn du willst, schreib eine Notiz dazu: Der Spieler sieht sie. Ein Saisonvertrag gilt immer für die aktive Saison, und ein Probevertrag zahlt nur pro Match. Spieler brauchen ein verknüpftes Konto, um auf ein Angebot zu antworten.
- **Zurückziehen**: Nimm ein offenes Angebot zurück, bevor der Spieler antwortet.
- **Entlassen**: Ein aktiver Vertrag endet sofort und der Spieler wird Free Agent. Eine Begründung ist Pflicht, und der Spieler sieht sie.
- **Guthaben anpassen** (nur Admins): Gib Geld dazu oder zieh es mit einem Minuszeichen ab. Eine Begründung ist Pflicht, und der Spieler sieht die Änderung in seiner Geldbörse als Korrektur. Das Guthaben darf unter null fallen.

Der Spieler bekommt zu jedem Angebot eine Benachrichtigung und antwortet unter **Mein Vertrag**. Angebote ohne Antwort laufen von selbst ab, und der GM, der das Angebot gemacht hat, wird informiert. Nimmt ein Spieler ein Angebot an, werden seine anderen offenen Angebote zurückgezogen.

Die Seite **Free Agents** ist öffentlich, und du kannst auch direkt von dort einen Vertrag anbieten.

## Was von selbst läuft

- **Match-Gage**: Wenn du ein Ergebnis einträgst, bekommt jeder im Match seine Match-Gage, und die Sieger bekommen ihren Siegbonus. Free Agents bekommen nur den Free-Agent-Siegbonus. Das Match zählt außerdem für den Vertrag jedes Spielers, und ein Probevertrag oder Match-Vertrag endet mit seinem letzten Match.
- **Gehaltslauf**: Jeden Sonntag (Ligazeit) bekommen alle mit einem aktiven Vertrag mit Wochengehalt ihr Gehalt.
- **Saisonende**: Wenn du eine Saison beendest, enden alle Saisonverträge dafür, und diese Spieler werden Free Agents.
- **Ein abgeschlossenes Match löschen** bucht Gage und Prämien dafür zurück und nimmt es aus den Vertragszählern der Spieler.

## Strafen und No-Shows

- **Strafen**: Nutze den Button **Strafen** in der Zeile des Spielers unter [Spieler verwalten](admin-manage-players). Wähle eine Vorlage oder einen eigenen Betrag. Ein eigener Betrag braucht eine Begründung. Der Spieler sieht die Begründung zusammen mit der Strafe. **Bisherige Strafen** listet sie auf, und **Zurücknehmen** erstattet eine.
- **No-Shows**: Nutze den Button **No-Shows** an einem Match, auf der Event-Karte, unter **Einzelne Matches** oder beim Eintragen eines Ergebnisses. Du kannst einen No-Show bei einem angesetzten Match markieren, oder bei einem abgeschlossenen bis 7 Tage nach dem Ergebnis. Das Markieren berechnet die No-Show-Strafe aus den Einstellungen. Wird es markiert, bevor das Ergebnis eingetragen ist, bekommt der Spieler für das Match keine Gage. **Rückgängig** erstattet die Strafe. Das Match selbst bleibt unverändert: Trag das Ergebnis wie gewohnt ein.

Admins und Moderatoren können Strafen verhängen und No-Shows markieren. Eine Strafe kann einen Spieler in die Schulden treiben. Er bekommt dann eine Benachrichtigung, und der Shop bleibt für ihn gesperrt, bis sein Guthaben wieder bei null oder darüber liegt.

## Warteschlange für GM-Eingriffe

Spieler können im Voraus für einen **GM-Eingriff** zahlen und sich alles Mögliche wünschen. Ihre Anfragen warten unter **Admin → GM-Eingriffe**. Standardmäßig siehst du die **offenen** Anfragen. Stell den Filter um, um den Rest zu sehen.

Klick auf **Entscheiden** und wähle ein Ergebnis:

| Ergebnis | Geld |
|----------|------|
| **Umgesetzt** | Du hast getan, worum gebeten wurde. Die Liga behält das Geld. |
| **Teilweise umgesetzt** | Du hast einen Teil davon umgesetzt. Die Liga behält das Geld. |
| **Geld behalten** | Du tust nichts und behältst das Geld. Der Spieler liest: „Der GM hat dein Geld genommen. Mehr Glück beim nächsten Mal.“ |
| **Erstatten** | Du lehnst ab, und das Geld geht an den Spieler zurück. |

Schreib eine **Notiz an den Spieler**, wenn er wissen soll, warum, und eine **interne Notiz**, die nur GMs sehen. Der Spieler bekommt eine Benachrichtigung mit dem Ergebnis. Deine eigene Anfrage kannst du nicht entscheiden: Das muss ein anderer GM tun. Jeder Spieler kann immer nur eine offene Anfrage haben.

## Der Shop und der Sim-Eingriff

Alle Shop-Artikel sind jetzt kaufbar. Verletzungsschutz, Reha und Ausdauer-Auffüllung wirken auf Ausdauer und Verletzungen, machen also nur einen Unterschied, solange der Schalter **Ausdauer & Verletzungen** an ist; siehe [Admin: Verletzungen](admin-injuries).

Ein Sim-Eingriff wird für ein angesetztes Match gekauft, in dem der Spieler steht. Wer ihn gekauft hat, bleibt privat: GMs sehen jeden Eingriff an einem Match, jeder Spieler nur seinen eigenen. Trägst du das Ergebnis dieses Matches von Hand ein, statt es zu simulieren, oder löschst du es, bekommt der Spieler sein Geld automatisch zurück.

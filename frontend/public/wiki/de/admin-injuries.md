# Admin: Verletzungen

Ausdauer, Verletzungen und ihre Wirkung auf die Match-Simulation. Diese Seite beschreibt die GM-Seite. Was Spieler sehen, steht unter [Ausdauer und Verletzungen](stamina-and-injuries).

## Zuerst einschalten

Ausdauer und Verletzungen hängen am Feature-Schalter **Ausdauer & Verletzungen**, und der ist **aus**, bis du ihn einschaltest. Solange er aus ist, kosten Matches keine Ausdauer, niemand würfelt um Verletzungen, niemand wird bei Buchungen blockiert, und die Simulation ignoriert die Ausdauer.

1. Prüfe zuerst die Einstellungen unter **Verletzungen & Ausdauer** (siehe unten), damit die ersten Würfe deine Zahlen nutzen.
2. Ein Admin öffnet **Admin → Funktionsverwaltung** und schaltet **Ausdauer & Verletzungen** ein.

Schaltest du es wieder aus, pausiert alles. Gelöscht wird nichts: Ausdauer, laufende Verletzungen und Verlauf sind noch da, wenn du es wieder einschaltest.

## Einstellungen für Verletzungen & Ausdauer

**Admin → Verletzungen & Ausdauer**. Admins können sie ändern, Moderatoren sie lesen. Alle Zahlen sind anfangs Platzhalter, stimm sie also auf deine Liga ab.

| Bereich | Was du festlegst |
|---------|------------------|
| **Ausdauerverbrauch** | Die maximale Ausdauer, die Ausdauer, die ein Einzelmatch je Sim-Kategorie kostet, und wie stark eine voll ausgebaute Zähigkeit diesen Verbrauch senkt (0 schaltet den Effekt der Zähigkeit ab). |
| **Format-Multiplikatoren** | Verbrauchs-Multiplikator je Match-Format: Einzel, Tag Team, Mehrkampf, Battle Royal. Ein nicht aufgeführtes Format nutzt 1. |
| **Verletzungschance nach Ausdauer** | Stufen von der höchsten Mindestausdauer bis hinunter zu 0, jede mit einer Verletzungschance. Ein Wrestler nutzt die erste Stufe, die seine Ausdauer nach dem Match erreicht. |
| **Kategorierisiko** | Multipliziert die Chance der Stufe je Sim-Kategorie, damit z. B. Hardcore- oder Käfig-Matches riskanter sind. Die Chance steigt nie über 95 %. |
| **Schweregrad** | Gewicht und minimale und maximale Ausfallwochen für Leicht, Mittel und Schwer, dazu die **Verschiebung bei wenig Ausdauer**: Unter diesem Wert fallen Verletzungen eher schwerer aus. |
| **Wöchentliche Erholung** | Jeden Sonntag wieder voll oder ein fester Betrag. Dazu die **Zeitzone der Liga**: Sie legt fest, wann Sonntag Mitternacht ist und wann die Ligawoche für Gehälter und andere wöchentliche Abläufe beginnt. |
| **Abzüge im Match-Sim** | Das Rating eines Wrestlers bei 0 Ausdauer (100 % bei voller Ausdauer, bis hinunter auf diesen Wert) und der zusätzliche Abzug für einen verletzten Wrestler, der trotzdem gebucht ist. |

Neben dem Formular helfen dir zwei Werkzeuge. Sie nutzen die Zahlen auf der Seite, gespeichert oder nicht:

- **Match-Vorschau**: Wähle Sim-Kategorie, Format, Start-Ausdauer und Zähigkeit und sieh den Verbrauch, die Ausdauer danach, die Verletzungschance und die Ausfallwochen bei einer Verletzung.
- **Matches bis zur Erschöpfung**: Wie viele Standard-Einzelmatches es ab voller Ausdauer braucht, um jede Stufe zu erreichen.

**Speichern** fragt nach einer Bestätigung und speichert eine neue Version. Neue Würfe nutzen die neue Version; bereits gewürfelte Verletzungen behalten ihre Version, damit sich ein altes Ergebnis immer erklären lässt. Der **Versionsverlauf** zeigt, wer welche Version wann gespeichert hat. Hat jemand anderes gespeichert, während du die Seite offen hattest, wirst du gebeten, neu zu laden und deine Änderungen noch einmal zu machen.

## Der Verletzungsbericht

**Admin → Verletzungsbericht**, für Moderatoren und Admins.

**Aktuelle Verletzungen** listet alle, die ausfallen: den Spieler, die Schwere, die Quelle (**Aus einem Match** oder **Storyline**), das Rückkehrdatum und was betroffen ist: die angesetzten Matches, für die er noch gebucht ist, und einen Titel, den er hält.

- **Heilen** beendet die Verletzung sofort. Der Spieler kann gleich wieder gebucht werden.
- **Verlängern** legt die Gesamtdauer der Verletzung in Wochen fest, gezählt ab ihrem Beginn. Das geht in beide Richtungen: Eine kleinere Zahl verkürzt sie. Das Rückkehrdatum rückt auf den Beginn dieser Ligawoche.

**Ausdauer im Kader** listet die Ausdauer aller Wrestler, sortierbar, wenig Ausdauer ist hervorgehoben. Mit **Anpassen** setzt du die Ausdauer eines Wrestlers von Hand.

Jede Aktion nimmt eine optionale Notiz, die nur das Staff sieht. Der Spieler bekommt eine neutrale Benachrichtigung, und jede Änderung landet im Änderungsprotokoll der Verletzung.

### Storyline-Verletzungen

Eine Storyline-Verletzung nimmt einen Wrestler für einen Angle aus dem TV. Sie wirkt wie eine Match-Verletzung: Der Wrestler kann nicht gebucht werden, bekommt ein Rückkehrdatum an einem Sonntag und zeigt das öffentliche Verletzungsabzeichen. Deine Notiz dazu sieht nur das Staff. Im Admin-Bereich gibt es noch keinen Button, um eine anzulegen: Sie wird über die Liga-API angelegt. Danach steht sie im Verletzungsbericht als **Storyline**, und du heilst oder verlängerst sie wie jede andere.

## Hinweise ans Staff

Verletzt sich ein Wrestler oder wird eine Verletzung verlängert, bekommen alle Moderatoren und Admins eine Benachrichtigung: wer ausfällt, bis wann, wie viele angesetzte Matches betroffen sind und welchen Titel er hält. Sie öffnet den Verletzungsbericht. Nichts wird automatisch abgesagt: Du entscheidest, ob du umbuchst, jemanden einwechselst oder das Match lässt.

## Verletzte Wrestler buchen

Verletzte Wrestler können nicht in neue Matches gesetzt werden. In **Kampf planen** und wenn du die Teilnehmer eines Matches bearbeitest, steht bei ihnen **Verletzt bis {Datum}**, und sie lassen sich nicht auswählen. Wrestler mit wenig Ausdauer zeigen ihre Ausdauer neben dem Namen, damit du die Arbeit verteilen kannst.

Willst du einen verletzten Wrestler für eine Storyline trotzdem buchen, setz das Häkchen bei **Verletzte zulassen (Override)**. Das Match wird mit einer Warnung gespeichert, wer verletzt war, und die Ausnahme wird am Match vermerkt. Spieler können das selbst nie umgehen: Einen Platz in einem Match beanspruchen und Herausforderungen werden abgelehnt, solange sie verletzt sind.

Angesetzte Matches mit einem Teilnehmer, der am Match-Tag verletzt ist, zeigen ein Warnbanner auf der Event-Seite und unter **Admin → Einzelne Matches**.

## Zustandsbericht

Wird ein Ergebnis eingetragen, von Hand oder mit der Simulation, sinkt die Ausdauer aller Teilnehmer, und für jeden wird um eine Verletzung gewürfelt. Abgeschlossene Matches auf der Event-Seite und unter **Einzelne Matches** zeigen dem Staff einen **Zustandsbericht**: die Ausdauer jedes Wrestlers vorher und nachher, seine Verletzungschance, den Wurf und das Ergebnis: eine Verletzung mit Schwere und Rückkehrdatum, **Bereits verletzt** oder **Keine Verletzung**. Spieler sehen ihn nie, weil die Ausdauer privat ist.

Löschst du ein abgeschlossenes Match, wird die Ausdauer zurückgegeben, die es gekostet hat, und jede Verletzung daraus endet, außer ein GM hat sie schon geheilt oder geändert.

## Wöchentliche Erholung

Jeden Sonntag um Mitternacht in der Zeitzone der Liga erholt sich die Ausdauer aller, und Verletzungen, deren Rückkehrdatum erreicht ist, enden. Die Spieler bekommen die Benachrichtigung, dass sie wieder einsatzbereit sind. Das läuft einmal pro Woche; war der Job ausgefallen, holt er es nach, sobald er wieder läuft.

## In der Match-Simulation

Mit eingeschaltetem Schalter senkt die [Match-Simulation](admin-match-simulator) das Rating eines Wrestlers nach seiner Ausdauer, von 100 % bei voller Ausdauer bis hinunter auf den Wert **Rating bei 0 Ausdauer**, und senkt es noch einmal für einen verletzten Wrestler, den du mit der Ausnahme gebucht hast. Die Vorschau zeigt die Ausdauer jedes Wrestlers und eine Markierung **Verletzt**, nur für GMs. Der Match-Verlauf kann zeigen, dass ein Wrestler platt ist oder seine Verletzung verkauft.

Hat ein Spieler im Shop einen **Sim-Eingriff** für das Match gekauft, bekommt sein Rating den Bonus, wenn du es simulierst. Die Vorschau zeigt den Bonus nur GMs, und der Match-Verlauf kann einen Run-in zeigen. Trägst du das Match von Hand ein, bekommt der Spieler stattdessen sein Geld zurück.

## Die Verletzungsartikel im Shop

Mit eingeschalteter Wirtschaft (siehe [Admin: Wirtschaft](admin-economy)) können Spieler kaufen:

- **Verletzungsschutz**: senkt ihr Verletzungsrisiko für ihre nächsten paar Matches. Jedes Match verbraucht eins davon.
- **Reha**: verkürzt eine laufende Verletzung. Das Rückkehrdatum bleibt auf einem Sonntag und liegt nie weniger als eine Woche nach dem Beginn der Verletzung. Das steht im Änderungsprotokoll der Verletzung.
- **Ausdauer-Auffüllung**: gibt sofort Ausdauer, bis zum Maximum.

Preise und Wirkung legst du in den **Wirtschaft**-Einstellungen fest.

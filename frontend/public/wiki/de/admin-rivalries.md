# Admin: Rivalitäten moderieren

Der Rivalitäten-Admintab unter `/admin/rivalries` ist die GM-Steuerzentrale für die Storyline-Funktion. Dieser Artikel behandelt: wann genehmigen, wie schreibe ich Notizen vs. Pläne, wie verknüpfe ich Matches und wie räume ich auf.

> **Hinweis zur Spoiler-Sicherheit.** Plan-Notizen sind standardmäßig auf `gm-only` gesetzt — sie beschreiben zukünftige Storyline-Beats. Wenn du einen Plan auf `participants` oder `all` änderst, sehen alle Wrestler ihn. Das Datenmodell erzwingt das serverseitig, aber ein versehentlicher Klick im Sichtbarkeits-Dropdown kann trotzdem das Finish verraten. Vor dem Speichern doppelt prüfen.

## Triage-Workflow

1. Öffne `/admin/rivalries` und wähle den **Prüfung läuft**-Chip.
2. Pro Zeile entscheidest du:
   - **Genehmigen**, wenn der Pitch zur Marke passt, beide Wrestler sinnvoll gewählt sind und die Storyline nicht mit einem laufenden Angle kollidiert.
   - **Ablehnen** mit kurzer Begründung — Wrestler sehen den Grund in ihrer Benachrichtigung. Beispiel: „Heben wir für nach dem Titel-Programm auf" oder „Kollidiert mit der laufenden Stable-Fehde".
3. Nach Genehmigung erscheint die Rivalität im Hub. Status ist `active`.

Faustregel: maximal 3 aktive Rivalitäten pro Wrestler. Sonst wird der Hub unübersichtlich.

## Storyline-Notizen vs. Pläne

Beide Notiztypen leben im **Notizen & Pläne**-Tab, dienen aber sehr unterschiedlichen Zwecken:

| Notiztyp | Audience | Wofür |
|---|---|---|
| **Storyline** | optional — `all`, `participants` oder `gm-only` | was bisher AUF dem Bildschirm passiert ist (Kontinuität) |
| **Plan** | Standard `gm-only` | was NOCH passieren wird — Beats, Ziel-Events, Finishes |

**Sichtbarkeitsregeln** (serverseitig erzwungen):

- Wrestler dürfen `storyline`-Notizen schreiben; ihre Sichtbarkeit wird immer auf `gm-only` erzwungen (gilt als Vorschlag an dich).
- Versucht ein Wrestler einen `plan` zu schreiben, gibt's 403. Pläne sind GM-only.
- Wrestler sehen die `gm-only`-Storyline-Notizen anderer Wrestler nicht. Eigene sehen sie.
- Wrestler sehen einen `plan` nie, außer seine Sichtbarkeit ist explizit auf `participants` oder `all` gesetzt.

Setzt du einen Plan auf `participants`, lesen die Wrestler ihn — nützlich für „Match 3 gewinnst du", ohne dass es öffentlich ist. Setze ihn nur dann auf `all`, wenn er öffentlich sichtbar sein soll.

## Pläne mit Matches und Events verknüpfen

Beim Anlegen eines Plans kannst du `linkedMatchId` oder `linkedEventId` setzen. Der Tab zeigt dann ein kleines Badge, das auf das Match oder Event verlinkt. Wenn der verknüpfte Datensatz später gelöscht wird, erscheint das Badge durchgestrichen — die Seite läuft nicht in 404.

Sinnvoll für „Plan A → Leiter-Match bei PPV-3", damit die Buchung von innerhalb der Rivalität sichtbar ist.

## Matches an eine Rivalität ansetzen

Zwei Wege:

1. **Vom Zukünftige-Kämpfe-Tab planen** — der schnellste Weg. Öffnet das Schedule-Match-Formular mit den Teilnehmern vorausgefüllt. Das neue Match wird automatisch verknüpft.
2. **Bestehendes Match verknüpfen** — beim normalen Schedule-Flow das optionale `rivalryId`-Feld setzen. Das Backend prüft, dass beide Match-Teilnehmer in der Rivalität sind.

Matches vor RIV-06 haben kein `rivalryId` und werden über das Teilnehmer-Overlap-Fallback eingeblendet. Neue Arbeit sollte das Feld immer setzen.

## Wann abschließen

Schließe eine Rivalität ab, sobald die Storyline ihr Payoff-Match hatte und du sie mindestens eine Saison ruhen lässt. Abgeschlossene Rivalitäten:

- Wandern ins **Archiv** im öffentlichen Hub.
- Tauchen standardmäßig nicht mehr im „Meine Rivalitäten"-Tab der Teilnehmer auf.
- Sind weiterhin abfragbar für Historiker.

Wrestler bekommen eine Benachrichtigung. Das Abschluss-Modal akzeptiert eine optionale Abschluss-Notiz — nutze sie für „WrestleMania 40, Cena retired Punk", damit das Archiv nicht namenlos ist.

## Massen-Aufräumen

Der **Erledigte löschen**-Button löscht jede Rivalität mit Status `completed`, `rejected` oder `cancelled` hart. Nutze das, wenn sich Testdaten oder Rauschen angesammelt haben. Das Bestätigungs-Modal zeigt die exakte Zahl.

Destruktiv — kein Undo. Wenn du versehentlich Produktionsverlauf gelöscht hast, brauchst du das letzte DynamoDB-Backup.

## Siehe auch

- [Promos verwalten](/guide/wiki/admin-promos)
- [Challenges](/guide/wiki/admin-challenges)
- [Storyline-Anfragen](/guide/wiki/admin-quickstart)

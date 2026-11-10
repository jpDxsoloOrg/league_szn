# Strikes

Strikes liegen im Datensatz jedes Spielers. Du öffnest sie unter [Spieler verwalten](admin-manage-players) über die Schaltfläche **Disziplin** in der Zeile des Spielers. Admins können handeln. Moderatoren können den Datensatz lesen, damit sie richtig buchen.

## Die Regeln

| Strike | Wirkung |
|--------|---------|
| Erster | Verwarnung für 7 Tage |
| Zweiter | Anmeldungen 7 Tage gesperrt, Strikes bleiben 14 Tage ab diesem Strike |
| Dritter, zu jedem Zeitpunkt innerhalb dieser 14 Tage | Konto deaktiviert, bis ein Admin es reaktiviert |

Tage sind 24 Stunden ab dem genauen Zeitpunkt des Strikes, ein Zeitraum kann also zu jeder Uhrzeit enden. Am Ende eines Zeitraums läuft nichts: Der Status wird bei jedem Lesen aus den Strike-Daten berechnet.

## Einen Strike vergeben

1. Öffne den Datensatz **Disziplin** des Spielers
2. Schreibe einen Grund mit 3 bis 500 Zeichen. **Der Spieler liest ihn**, formuliere ihn also entsprechend
3. Prüfe die Schaltfläche, sie nennt die Folge: **Verwarnung vergeben**, **Zweiten Strike vergeben** oder **Konto deaktivieren**
4. Sende ab. Eine Deaktivierung fragt vorher nach und zeigt, was der Spieler noch hält

Hat sich der Datensatz geändert, während er geöffnet war, wird nichts geschrieben. Der Dialog lädt neu, lies also den neuen Stand und versuche es erneut.

Admins und Moderatoren können keine Strikes erhalten. Entferne zuerst die Rolle in der [Benutzerverwaltung](admin-user-management).

Ein zweiter oder dritter Strike bricht außerdem die offenen oder gekonterten Herausforderungen des Spielers ab. **Gebuchte Matches bleiben unverändert.**

## Nach einer Deaktivierung

Der Spieler verliert sofort den Zugang. Er bleibt in bestehenden Einträgen, und nichts, was er hält, ändert sich von selbst. Der Dialog zeigt, was du noch erledigen musst:

- **Titel** bleiben beim Spieler. Mache sie unter [Meisterschaften](admin-championships) frei, wenn du möchtest. Bei einem Tag-Titel verliert ihn dadurch auch der Partner.
- **Geplante und offene Matches** bleiben auf der Card. Tausche den Spieler aus oder trage das Ergebnis wie gewohnt ein.
- **Angenommene Herausforderungen** kannst du unter **Admin → Promos** im Tab **Call-outs** abbrechen. Siehe [Herausforderungen](admin-challenges).
- **Turniere** behalten den Spieler als Teilnehmer. Du kannst seine Turniermatches weiter buchen, und die Buchungsseite weist darauf hin. Trage jedes davon als Aufgabe ein, indem du beim Match auf **Ergebnis eintragen** klickst und den Gegner als Sieger wählst, damit das Turnier enden kann. Die Schaltfläche findest du auf der Kampfkarte des Events oder unter **Admin → Einzelne Matches**. Siehe [Ergebnisse eintragen](admin-record-results).

Zu anderen Buchungen kann ein deaktivierter Spieler nicht hinzugefügt werden. Sein Tag-Team bleibt aktiv, verschwindet aber aus öffentlichen Listen. Der Partner kann es auflösen und ein neues gründen.

Deaktivierte Spieler fehlen in der Tabelle unter **Spieler verwalten**, bis du **Ausgeblendete anzeigen** ankreuzt.

## Einen Strike entfernen

Nutze **Entfernen** bei einem aktiven Strike, mit einem Grund. Er bleibt im Verlauf als entfernt stehen. Die übrigen Strikes werden ab ihren eigenen Daten neu berechnet:

- Entfernst du den einzigen Strike, ist der Spieler frei
- Entfernst du den ersten von zweien, wird der zweite zu einer 7-Tage-Verwarnung ab seinem eigenen Datum
- Entfernst du den zweiten von zweien, läuft der erste seine eigenen 7 Tage weiter oder ist weg, wenn diese vorbei sind

Das Entfernen eines Strikes bringt nichts zurück, was er entfernt hat. Abgelaufene Strikes kannst du nicht entfernen, und bei einem deaktivierten Spieler gar keine.

## Einen Spieler reaktivieren

1. Öffne den Datensatz und schreibe einen Grund
2. Kreuze **Frühere Strikes wiederherstellen** nur an, wenn der letzte Strike ein Fehler war. Dann wird nur dieser entfernt, und die anderen behalten ihre Daten. Ohne Häkchen werden alle aktiven Strikes entfernt
3. Klicke auf **Reaktivieren**

Das Formular zeigt, was der Spieler noch hält, weil das Team in der Zwischenzeit etwas geändert haben kann. Tabelle, Bilanz, Wrestler und Check-ins kommen zurück. Abgebrochene Herausforderungen nicht. Der Spieler loggt sich einfach wieder ein.

## Wenn ein Login nicht passt

Der Datensatz entscheidet über den Zugang. Der Login in Cognito ist eine zweite Ebene, und seine Änderung kann fehlschlagen, nachdem der Datensatz gespeichert ist:

- **Login konnte nicht geändert werden**: Korrigiere das in der [Benutzerverwaltung](admin-user-management). Bis dahin werden die Anfragen des Spielers trotzdem abgelehnt.
- **Der Login passt nicht zum Datensatz**: Der Dialog warnt, wenn ein deaktivierter Spieler einen aktiven Login hat oder ein nicht deaktivierter Spieler einen gesperrten. Korrigiere das auf derselben Seite. Ein Login lässt sich immer sperren und aktivieren, sobald der Spieler reaktiviert ist.
- **Kein verknüpfter Login**: Der Spieler hat kein Konto zum Ändern, es zählt also nur der Datensatz.
- **Login war schon gesperrt**: Die Reaktivierung lässt ihn gesperrt. Aktiviere ihn bei Bedarf in der [Benutzerverwaltung](admin-user-management).
- **Aufräumen nicht abgeschlossen**: Einige Herausforderungen können bleiben. Der Spieler wird trotzdem abgelehnt und aus diesen Listen ausgeblendet.

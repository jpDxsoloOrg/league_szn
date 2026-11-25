# Admin: Match-Simulator

Mit der Match-Simulation können GMs ein Match entscheiden, ohne es zu spielen. Sie liest die [Wrestler-Builds](wrestler-builds) beider Seiten, ihre Form und die Art des Matches, berechnet die Siegchance jeder Seite und lost einen Sieger aus. Moderatoren und Admins können sie nutzen. Wrestler sehen nie eine Vorschau oder die Chancen: Sie sehen nur das Ergebnis eines Matches, das du simuliert und eingetragen hast.

## Vorschau oder simulieren & eintragen

Es gibt zwei Wege, die Simulation zu nutzen:

- **Vorschau** zeigt die Chancen und ein Beispiel-Match und speichert nichts. Starte sie so oft du willst. Jeder Lauf lost neu, der Sieger kann also wechseln.
- **Simulieren & eintragen** entscheidet ein angesetztes Match wirklich. Das Ergebnis zählt genau wie eines, das du von Hand einträgst: Bilanzen, Tabellen, Saisontabellen, Titel und Turnierbäume werden aktualisiert.

### Die Seite Match-Simulator

Öffne **Admin** und wähl **Match-Simulator**. Stell zwei bis vier Seiten zusammen, füg einer Seite für ein Tag-Team-Match einen Partner hinzu und wähl eine Stipulation oder einen Match-Typ. Jeder Wrestler kann nur auf einer Seite stehen. Mit **Vorschau** siehst du das Ergebnis. Diese Seite ist zum Ausprobieren von Duellen da („Was wäre, wenn Undertaker im Käfig auf Edge trifft?“) und speichert nie etwas.

### Bei einem angesetzten Match

Angesetzte Matches haben neben dem normalen Ergebnisformular **Vorschau** und **Simulieren & eintragen**, sowohl auf der Event-Seite als auch unter **Admin > Einzelne Matches**. **Simulieren & eintragen** öffnet eine Bestätigung, die zuerst die Chancen zeigt. Bestätigst du, läuft die Simulation einmal mit einer neuen Auslosung und trägt den Sieger ein. Das lässt sich dort nicht rückgängig machen, prüf also vorher die Card. Wurde das Match schon entschieden, von Hand oder im selben Moment von einem anderen GM, bekommst du eine Fehlermeldung, und nichts ändert sich.

## Was die GMs sehen und was alle sehen

Das Ergebnisfeld zeigt:

- einen **Chancenbalken** mit der Siegchance jeder Seite
- die **Kategorie** des Matches (siehe unten)
- einen Hinweis **in Spezialität** mit Stern für alle, die in ihrer Spezialität kämpfen
- den **Match-Verlauf**, Zeile für Zeile. **Alles zeigen** springt ans Ende.

Die Chancen sind nur für GMs. Sobald ein simuliertes Match eingetragen ist, sieht jeder auf der Matches-Seite und auf der Event-Card das Abzeichen **Simuliert**, und jeder kann den Match-Verlauf und die Spezialitäts-Hinweise öffnen. Die Siegchancen bleiben vorher und nachher für alle außer den GMs verborgen.

## Sim-Kategorien bei Stipulationen und Match-Typen

Die Simulation gewichtet die Werte je nach Art des Matches anders. Jede Stipulation und jeder Match-Typ hat eine **Sim-Kategorie**, die du unter **Admin > Match-Konfiguration** festlegst (siehe [Match-Konfiguration](admin-match-config)):

| Kategorie | Beispiele | Wichtigste Werte |
|-----------|-----------|------------------|
| **Standard** | Normale Regeln | Schläge und Griffe, knapp vor Beweglichkeit und Ausdauer |
| **Hohes Risiko** | Ladder, TLC, Scaffold | Beweglichkeit |
| **Technisch** | Submission, I Quit, 2 out of 3 Falls | Griffe |
| **Ausdauer** | Iron Man, Last Man Standing | Ausdauer |
| **Hardcore** | Street Fight, Extreme Rules, Tables, Falls Count Anywhere | Schläge |
| **Käfig** | Steel Cage, Hell in a Cell | Schläge und Griffe |

Ein Match nimmt zuerst die Kategorie seiner Stipulation, dann die seines Match-Typs. Haben beide keine, ist es **Standard**. Die Kategorie entscheidet auch, wessen Spezialität greift. Gib also jeder neuen Stipulation eine.

## Was die Chancen bestimmt

Jeder Wrestler bekommt eine Wertung aus:

1. **Werten**: die vier Werte des Builds inklusive Stilbonus, gewichtet nach der Kategorie des Matches. Liegt ein Build nach einem Abstieg über dem Budget, wird mit einer herunterskalierten Kopie gerechnet, bis der Wrestler neu verteilt.
2. **Moves**: die Stufe des besten Finishers und die durchschnittliche Stufe der Signature-Moves.
3. **Form**: wie es in der laufenden Saison lief, aus den Ligapunkten pro Match und der Stärke der Gegner. Siege gegen starke Gegner zählen mehr. Gibt es keine aktive Saison, liest die Simulation die letzten 10 Matches. Wer noch kein Match hatte, gilt als Durchschnitt.
4. **Spezialität**: 6 % mehr, wenn die Kategorie des Matches seine Spezialität ist (3 % für einen Allrounder).

Die Wertung einer Seite ist der Durchschnitt ihrer Wrestler. Ein Tag-Team mit einem starken und einem schwachen Mitglied landet also dazwischen. Dann gibt das **Stil-Duell** 5 % dazu oder zieht 5 % ab, für jeden Gegner, den der Stil schlägt oder gegen den er verliert (siehe den Kreis unter [Wrestler-Builds](wrestler-builds)). Aus den Wertungen werden Siegchancen, die zusammen 100 % ergeben, und jede Seite behält mindestens 5 %. Deshalb sind Überraschungen immer möglich.

Die Simulation erzeugt nie ein Unentschieden.

### Wie einseitig kann es werden?

Aus einem Kalibrierungslauf mit 10.000 Simulationen pro Szenario:

- Ein voll ausgebauter Heavyweight-Build gewinnt gegen einen brandneuen Standard-Build etwa **83 %** der Matches, und etwa **90 %**, wenn er zusätzlich in seiner Spezialität kämpft und den Stilvorteil hat. Nie 100 %.
- Ein Stilvorteil allein bringt zwischen zwei sonst gleich starken Wrestlern etwa **57 zu 43**.
- In der eigenen Spezialität zu kämpfen ist gegen denselben Build ohne Spezialität etwa **5 Punkte** wert (55 zu 45). Beim Allrounder etwa die Hälfte.
- Im Beispielkader gewinnt der Favorit etwa 61 % zufälliger Paarungen. Je größer der Unterschied in der Wertung, desto öfter gewinnt der Favorit, und die angezeigten Chancen treffen, wie oft es wirklich passiert.

## Seeds und Wiederholungen

Jede Simulation startet mit einem zufälligen **Seed**. Derselbe Seed mit denselben Eingaben ergibt immer denselben Sieger und denselben Match-Verlauf. Trägst du eine Simulation ein, speichert das Match den Seed, die Chancen, den Match-Verlauf, einen Fingerabdruck der Eingaben und die Version der Sim-Regeln. So lässt sich ein Ergebnis auch später noch erklären, selbst wenn sich Builds ändern. Ändert die Liga die Zahlen der Simulation, steigt die Regelversion, und ältere Ergebnisse behalten die Version, unter der sie entschieden wurden.

Eine Vorschau lost jedes Mal einen neuen Seed aus. Deshalb können zwei Vorschauen desselben Matches unterschiedlich ausgehen.

## Gut zu wissen

- Nur angesetzte Matches können simuliert und eingetragen werden.
- Simulierte Matches starten ohne Sternebewertung. Fans können sie wie jedes andere Match bewerten.
- Die Simulation nutzt die Builds so, wie sie beim Lauf sind. Ändert ein Wrestler danach seinen Build, ändert sich ein eingetragenes Ergebnis nicht.
- Es gibt keine öffentliche „Was wäre, wenn?“-Seite. Vorschauen gibt es nur im Admin-Bereich und bei angesetzten Matches für GMs.

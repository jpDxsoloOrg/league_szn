# Wie Rivalitäts-Hitze funktioniert

Die Hitze einer Rivalität reagiert darauf, wie ihre Kämpfe bewertet werden und welche Promos zu ihr gehören. Die Stufe steht auf der Karte und der Seite der Rivalität, und im Rivalitäten-Hub kannst du danach filtern.

## Die fünf Stufen

| Stufe          | Stimmung                                       |
|----------------|------------------------------------------------|
| Eiskalt        | Pures Gift — nichts will klappen               |
| Kalt           | Unterdurchschnittliche Kämpfe                  |
| Warm           | Der Standard; Kämpfe sind weitgehend okay      |
| Heiß           | Ein ★★★★-Knaller nach dem anderen              |
| Glühend heiß   | Stoff für die Ewigkeit. Match of the Year      |

## Die Formel (für die Neugierigen)

Das sind die Standardwerte. Ein Admin kann sie unter Heat-Einstellungen ändern.

Jeder bewertete Kampf in einer Rivalität trägt Punkte zum Hitze-Wert bei:

`Beitrag = (Kampf-Durchschnitt − 2,5) × Gewicht`

wobei `Gewicht = min(Anzahl Bewertungen, 5)`. Die 2,5 ist der neutrale Drehpunkt — ein Kampf mit genau 2,5 Sternen verändert die Hitze nicht. Höhere Bewertungen erhöhen die Hitze; niedrigere senken sie. Ein als **Kampf des Abends** markierter Kampf zählt 1,5-fach, in beide Richtungen.

Auch der Rivalität zugeordnete Promos der Typen Ansage und Rivalität bringen Hitze. Jede bringt 3 Punkte. Feuer-Reaktionen bringen je 1,4 Punkte, Müll-Reaktionen ziehen je 1,4 ab. Es zählen nur die ersten 5 von jeder Art, und Reaktionen können die Summe einer Promo um höchstens 7 Punkte verändern. Vom Liga-Team ausgeblendete Promos zählen nicht.

Die Summe wird auf `[−100, +100]` begrenzt und einer Stufe zugeordnet:

| Wertebereich   | Stufe        |
|----------------|--------------|
| ≥ +60          | Glühend heiß |
| +20 … +59      | Heiß         |
| −19 … +19      | Warm         |
| −59 … −20      | Kalt         |
| ≤ −60          | Eiskalt      |

Wenn sich die Schwellenwerte falsch anfühlen, sag einem GM Bescheid.

## Hinweise für das Liga-Team

GMs können die Hitze einer Rivalität im Bereich Admin → Rivalitäten manuell überschreiben. Die nächste Bewertung, Änderung am Kampf des Abends oder zählende Promo-Aktivität in dieser Rivalität berechnet die Hitze von Grund auf neu und überschreibt jeden manuellen Wert. Mit der Schaltfläche „Aus Bewertungen neu berechnen" lässt sich dies ohne Wartezeit erzwingen.

# Driver Teammate Network

Static GitHub Pages site for an interactive driver teammate graph.

## CSV format

### Nodes

File: `data/driver_teams.csv`

```csv
Name,Team Id,Team Name
Norris,1,McLaren
Piastri,1,McLaren
Hamilton,3,Ferrari
Alonso,5,Aston Martin
Rosberg,12,Former teammate of a current driver
Vandoorne,13,Kevin Bacon distance 13
```

- `Name`: unique node id and display label
- `Team Id`: grouping and colour field
  - `1-11` = current teams
  - `12` = teammate of a current driver, but not current themselves
  - `13+` = Kevin Bacon distance from the current grid
- `Team Name`: label used in the legend

### Links

File: `data/driver_edges.csv`

```csv
Driver A,Driver B,Weighting
Norris,Piastri,1
Hamilton,Leclerc,1
Alonso,Hamilton,2
Rosberg,Hamilton,3
```

- `Weighting = 1`: current teammates
- `Weighting = 2`: ex-teammates, both currently on the grid
- `Weighting = 3`: ex-teammates, only one currently on the grid
- `Weighting = 4+`: Kevin Bacon style step distance

## Layout options

- `Default`: organic network view
- `Structured rings`: current drivers on the inner ring, then outer rings ordered by who they connect to
- `Current drivers centred`: keeps the current grid grouped in the middle while outer rings follow connected neighbours

## Hover behaviour

Hovering a node fades unrelated parts of the graph by graph distance:

- hovered node and direct neighbours: full opacity
- distance 2: 75%
- distance 3: 50%
- distance 4+: 25%
- unconnected: heavily faded
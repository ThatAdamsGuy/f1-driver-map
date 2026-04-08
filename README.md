# Driver Teammate Network

Static GitHub Pages site for an interactive driver teammate graph.

## CSV format

### Nodes

```csv
Name,TeamId,TeamName
Norris,1,McLaren
Piastri,1,McLaren
Hamilton,3,Ferrari
Alonso,12,Former teammate of a current driver
Rosberg,13,Kevin Bacon distance 13
```

- `Name`: unique node id and display label
- `TeamId`: grouping / colour field
  - `1-11` = current teams
  - `12` = teammate of a current driver, but not current themselves
  - `13+` = Kevin Bacon distance from the current grid
- `TeamName`: label used in the legend for `TeamId`

### Links

```csv
Source,Target,Weighting
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

- `Force layout`: organic network view
- `Structured rings`: current drivers on the inner ring, then outer rings by distance
- `Current drivers centred`: keeps the current grid grouped in the middle

## Publish on GitHub Pages

1. Push the repo to GitHub
2. Repo `Settings` -> `Pages`
3. Source: `Deploy from a branch`
4. Branch: `main`
5. Folder: `/ (root)`

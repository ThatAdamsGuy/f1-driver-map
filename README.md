# Driver Teammate Network

A GitHub Pages-ready interactive network graph for driver teammate relationships.

## What it does

- mouse-wheel zoom
- drag to pan
- fit graph button
- colour nodes by a selected field
- node and link details on click
- static hosting friendly for GitHub Pages

## Repo structure

- `index.html` - app shell
- `style.css` - page styling
- `script.js` - data loading, colour mapping, graph logic
- `data/nodes.csv` - node data
- `data/links.csv` - edge data
- `.nojekyll` - avoids Jekyll processing on GitHub Pages

## CSV format

### Nodes

```csv
Name,Team
Hamilton,1
Norris,3
Piastri,3
Bottas,12
Magnussen,13
```

Meaning of `Team` in your current model:

- `1` to `11`: current teams
- `12`: was teammate with a current driver
- `13`: was never teammate with a current driver

### Links

```csv
Source,Target,Weighting
Norris,Piastri,1
Gasly,Ocon,2
Hamilton,Alonso,3
Norris,Hamilton,4
```

Meaning of `Weighting` in your current model:

- `1`: current teammates
- `2`: ex teammates, both still on the grid
- `3`: ex teammates, only one still on the grid
- `4+`: increasingly indirect link to a current driver

## Customising colours

In `script.js`, edit the `COLOR_OVERRIDES` object.

```js
const COLOR_OVERRIDES = {
  Team: {
    '1': '#ff7f0e',
    '2': '#17becf',
    '3': '#1f77b4'
  }
};
```

You can also rename the legend text in `TEAM_LABELS`.

## Publish on GitHub Pages

1. Create a new GitHub repo.
2. Upload these files.
3. Go to **Settings -> Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select your default branch and `/ (root)`.
6. Save.
7. Wait a minute or two and open the published URL.

## Notes

- The graph uses Cytoscape.js from a CDN.
- For very large datasets, you may want to reduce labels or tune the layout settings in `script.js`.

// serialize.js — patch <-> JSON file (download / upload).
export function saveToFile(graph, name = 'patch.json') {
  const data = JSON.stringify(graph.toJSON(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export async function loadFromFile(graph, file) {
  const text = await file.text();
  graph.loadJSON(JSON.parse(text));
}

//Initialisation
let heures = 6;
let chartP = echarts.init(document.getElementById('chart-puissance'));
let chartE = echarts.init(document.getElementById('chart-energie'));

//Options communes aux deux graphiques
const baseOption = {
  backgroundColor: 'transparent',
  grid: { left: '10%', right: '5%', top: '10%', bottom: '15%' },
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#1a1d27',
    borderColor: '#2a2d3e',
    textStyle: { color: '#e0e0e0' }
  },
  xAxis: {
    type: 'time',
    axisLine: { lineStyle: { color: '#2a2d3e' } },
    axisLabel: {
      color: '#666',
      formatter: val => {
        const d = new Date(val);
        return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
      }
    }
  },
  yAxis: {
    axisLine: { lineStyle: { color: '#2a2d3e' } },
    splitLine: { lineStyle: { color: '#1e2130' } },
    axisLabel: { color: '#666' }
  }
};

//Graphique puissance (courbe)
chartP.setOption({
  ...baseOption,
  series: [{
    type: 'line',
    smooth: true,
    symbol: 'none',
    lineStyle: { color: '#4ade80', width: 2 },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(74,222,128,0.3)' },
        { offset: 1, color: 'rgba(74,222,128,0)' }
      ])
    },
    data: []
  }]
});

//Graphique énergie (histogramme)
chartE.setOption({
  ...baseOption,
  series: [{
    type: 'bar',
    barMaxWidth: 20,
    itemStyle: { color: '#60a5fa', borderRadius: [4, 4, 0, 0] },
    data: []
  }]
});

//Mise à jour des cartes (dernière valeur)
async function loadLatest() {
  try {
    const res = await fetch('http://localhost:3000/api/latest');
    const d = await res.json();
    if (!d.timestamp) {
      document.getElementById('status-text').textContent = 'En attente de données...';
      return;
    }
    document.getElementById('val-puissance').textContent = d.puissance ?? '—';
    document.getElementById('val-energie').textContent   = d.energie ? (d.energie / 1000).toFixed(1) : '—';
    document.getElementById('val-adresse').textContent   = d.adresse ?? '—';
    document.getElementById('status-text').textContent   = 'En ligne';
    document.getElementById('last-update').textContent   = `Dernière mise à jour : ${new Date(d.timestamp).toLocaleString('fr-FR')}`;
  } catch (e) {
    document.getElementById('status-text').textContent = 'Erreur API';
  }
}

//Mise à jour de la courbe de puissance
async function loadPuissance() {
  const res = await fetch(`http://localhost:3000/api/puissance?heures=${heures}`);
  const data = await res.json();
  chartP.setOption({
    series: [{ data: data.map(r => [r.timestamp, r.puissance]) }]
  });
}

//Mise à jour de l'histogramme d'énergie
async function loadEnergie() {
  const res = await fetch(`http://localhost:3000/api/energie?heures=${heures}`);
  const data = await res.json();
  chartE.setOption({
    series: [{ data: data.map(r => [r.periode, r.consommation]) }]
  });
}

//Changement de plage horaire (boutons 6h / 24h / 48h)
function setRange(btn, h) {
  heures = h;
  document.querySelectorAll('.controls button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadPuissance();
  loadEnergie();
}

//Rafraîchissement global
async function refresh() {
  await loadLatest();
  await loadPuissance();
  await loadEnergie();
}
//Redimensionnement des graphiques si la fenêtre change de taille
window.addEventListener('resize', () => {
  chartP.resize();
  chartE.resize();
});

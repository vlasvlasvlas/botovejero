import './style.css';

document.querySelector('#app').innerHTML = `
  <div class="container">
    <canvas id="main-canvas"></canvas>
    <div class="hud">
      <h1>BOTOVEJERO</h1>
      <div class="status">
        <span id="bank-indicator">BANCO 1</span>
        <span id="shader-indicator">EFECTO: PASS-THROUGH</span>
      </div>
      <div id="keyboard-map" class="keyboard-map">
        <!-- Generado dinámicamente -->
      </div>
    </div>
  </div>
`;

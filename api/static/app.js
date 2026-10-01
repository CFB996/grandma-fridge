const chips = document.querySelectorAll('.chip');
const fridgeInput = document.getElementById('fridgeInput');
const charCount = document.getElementById('charCount');
const askButton = document.getElementById('askButton');
const chatLog = document.getElementById('chatLog');
const errorBanner = document.getElementById('errorBanner');
const healthBanner = document.getElementById('healthBanner');
const championName = document.getElementById('champion-name');
const championDescription = document.getElementById('champion-description');

const sessionId = 'session-' + Math.random().toString(16).slice(2, 14);

const PERSONA_DESCRIPTIONS = {
  affectionate: 'Warm, simple and encouraging',
  strict: 'Judges your fridge, then precise steps',
  dramatic: 'Telenovela energy in every step',
  practical: 'Just the recipe as fast as possible',
};

function updateCharCount() {
  charCount.textContent = `${fridgeInput.value.length} / 500`;
}
fridgeInput.addEventListener('input', updateCharCount);

chips.forEach(chip => {
  chip.addEventListener('click', () => {
    fridgeInput.value = chip.dataset.fill;
    updateCharCount();
    fridgeInput.focus();
  });
});

function renderChampion(info) {
  const name = info && info.persona;
  if (!name) {
    championName.textContent = 'Avó';
    championDescription.textContent = '';
    return;
  }
  championName.textContent = name.charAt(0).toUpperCase() + name.slice(1);
  championDescription.textContent = PERSONA_DESCRIPTIONS[name] || '';
}

fetch('/persona/info')
  .then(r => r.json())
  .then(renderChampion)
  .catch(() => renderChampion(null));

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.remove('hidden');
}
function clearError() {
  errorBanner.classList.add('hidden');
}

function addUserBubble(text) {
  const turn = document.createElement('div');
  turn.className = 'turn';
  turn.innerHTML = `<div class="bubble-user">${text}</div>`;
  chatLog.appendChild(turn);
  return turn;
}

function addAvoBubble(turnEl, text, meta) {
  const bubble = document.createElement('div');
  bubble.className = 'bubble-avo';
  bubble.textContent = text;
  const metaEl = document.createElement('div');
  metaEl.className = 'bubble-meta';
  metaEl.textContent = meta;
  turnEl.appendChild(bubble);
  turnEl.appendChild(metaEl);
}

askButton.addEventListener('click', async () => {
  const fridgeItems = fridgeInput.value.trim();
  if (!fridgeItems) return;
  clearError();

  const turn = addUserBubble(fridgeItems);
  const thinking = document.createElement('div');
  thinking.className = 'thinking';
  thinking.textContent = 'Avó is thinking...';
  turn.appendChild(thinking);

  askButton.disabled = true;
  fridgeInput.value = '';
  updateCharCount();

  try {
    const res = await fetch('/recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fridge_items: fridgeItems, session_id: sessionId }),
    });
    const data = await res.json();
    thinking.remove();

    if (!res.ok || data.error) {
      showError(data.error || 'Avó ran into a problem.');
    } else {
      const meta = `${data.persona} · ${data.provider}${data.provider === 'ollama' ? ' (fallback)' : ''}`;
      addAvoBubble(turn, data.response, meta);
    }
  } catch (err) {
    thinking.remove();
    showError('Could not reach Avó. Is the API running?');
  } finally {
    askButton.disabled = false;
    chatLog.scrollTop = chatLog.scrollHeight;
  }
});

fetch('/health').then(r => r.json()).then(data => {
  if (data.status !== 'healthy' || !data.llm?.api_key_configured) {
    healthBanner.textContent = "Avó's kitchen is currently closed — please try again shortly.";
    healthBanner.classList.remove('hidden');
  }
}).catch(() => {
  healthBanner.textContent = "Avó's kitchen is currently closed — please try again shortly.";
  healthBanner.classList.remove('hidden');
});
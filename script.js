const input = document.getElementById('player-input');
const submitBtn = document.getElementById('submit-btn');
const giveUpBtn = document.getElementById('give-up-btn');
const gameLog = document.getElementById('game-log');
const languageSelect = document.getElementById('language');
const gameModeSelect = document.getElementById('game-mode');
const infoBox = document.getElementById('info-box');
const toggleInfoBtn = document.getElementById('toggle-info');

// Online multiplayer elements
const onlineControls = document.getElementById('online-controls');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const joinCodeInput = document.getElementById('join-code-input');
const roomCodeDisplay = document.getElementById('room-code-display');
const roomCodeElement = document.getElementById('room-code');
const onlineStatus = document.getElementById('online-status');

let expectedStartLetter = null;
let currentWordList = [];
let usedWords = [];
let gameMode = 'computer';
let currentPlayer = 1;
let currentLanguage = 'english';
let playerPoints = 0;
let wordsPlayedCount = 0;
const WORDS_FOR_POINT = 5;
const HINT_COST = 3;
const MASTER_CODE_POINTS = 3;

// Online multiplayer state
let currentRoomCode = null;
let isHost = false;
let playerNumber = 0;
let roomRef = null;
let lastProcessedTimestamp = 0;
let isConnected = false;
let MAX_PLAYERS = 4;
let isSpectator = false;
let lastGiveUpTimestamp = 0;
let lastPlayerJoinTimestamp = 0;
let lastPlayerLeaveTimestamp = 0;
let previousPlayerCount = 0;
let lastPlayerCountUpdate = 0;

// Special Muhammad words
const muhammadWords = {
  english: ['muhammad', 'muhamad', 'mohamad', 'mohammad', 'mohamed', 'mohammed', 'muhammed', 'muhamed'],
  french: ['muhammad', 'muhamad', 'mohamad', 'mohammad', 'mohamed', 'mohammed', 'muhammed', 'muhamed'],
  arabic: ['محمد']
};

const blessings = {
  english: 'peace be upon him',
  french: 'que la paix soit sur lui',
  arabic: 'صلى الله عليه و سلم'
};

const MASTER_CODE = '2300';

// ===== LAZY WORD BANK LOADING =====
// Word banks are now in separate JSON files — only the selected language is downloaded.
// Cache already-loaded banks so switching back doesn't re-download.
const wordBankCache = {};

async function loadWordBank(language) {
  if (wordBankCache[language]) {
    return wordBankCache[language];
  }

  // Show loading state
  input.disabled = true;
  submitBtn.disabled = true;
  input.placeholder = `Loading ${language} dictionary...`;

  try {
    const response = await fetch(`words_${language}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    wordBankCache[language] = data;
    addLog(`✅ ${language.charAt(0).toUpperCase() + language.slice(1)} dictionary loaded (${data.length.toLocaleString()} words)`, 'success');
    return data;
  } catch (err) {
    addLog(`❌ Failed to load ${language} dictionary. Check that words_${language}.json is in the same folder.`, 'error');
    console.error('Word bank load error:', err);
    return [];
  } finally {
    input.disabled = false;
    submitBtn.disabled = false;
    updateInputPlaceholder();
  }
}

// Info box toggle functionality
if (toggleInfoBtn) {
  toggleInfoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    infoBox.classList.toggle('show');
  });
}

// Close info box when clicking outside
document.addEventListener('click', (e) => {
  if (infoBox && !infoBox.contains(e.target) && e.target !== toggleInfoBtn) {
    infoBox.classList.remove('show');
  }
});

// Theme functionality
const themeToggle = document.getElementById('theme-toggle');
const themeChooser = document.getElementById('theme-chooser');
const closeThemeChooser = document.getElementById('close-theme-chooser');
const themeOptions = document.querySelectorAll('.theme-option');

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    themeChooser.classList.add('active');
    themeChooser.classList.remove('hidden');
  });
}

if (closeThemeChooser) {
  closeThemeChooser.addEventListener('click', () => {
    themeChooser.classList.remove('active');
    themeChooser.classList.add('hidden');
  });
}

if (themeChooser) {
  themeChooser.addEventListener('click', (e) => {
    if (e.target === themeChooser) {
      themeChooser.classList.remove('active');
      themeChooser.classList.add('hidden');
    }
  });
}

themeOptions.forEach(option => {
  option.addEventListener('click', () => {
    const mode = option.dataset.mode;
    const theme = option.dataset.theme;
    document.body.className = `${mode} theme-${theme}`;
    themeChooser.classList.remove('active');
    themeChooser.classList.add('hidden');
  });
});

// Game mode change handler
gameModeSelect.addEventListener('change', () => {
  gameMode = gameModeSelect.value;
  
  if (gameMode === 'online') {
    onlineControls.style.display = 'block';
  } else {
    onlineControls.style.display = 'none';
    if (isConnected) {
      leaveRoom();
    }
  }
  
  updateButtonVisibility();
  resetGame();
});

// Language change handler
languageSelect.addEventListener('change', async () => {
  currentLanguage = languageSelect.value;
  currentWordList = await loadWordBank(currentLanguage);
  resetGame();
});

function focusInput() {
  if (input && !input.disabled) {
    input.focus();
  }
}

// Normalize Arabic letters for comparison
function normalizeArabicLetter(letter) {
  if (letter === 'ة') return 'ت';
  if (letter === 'ه') return 'ة';
  return letter;
}

// Check if two Arabic letters match (considering ت = ة)
function arabicLettersMatch(letter1, letter2) {
  if (currentLanguage !== 'arabic') {
    return letter1 === letter2;
  }
  
  const normalized1 = normalizeArabicLetter(letter1);
  const normalized2 = normalizeArabicLetter(letter2);
  
  return normalized1 === normalized2 || 
         letter1 === letter2 || 
         (letter1 === 'ت' && letter2 === 'ة') ||
         (letter1 === 'ة' && letter2 === 'ت');
}

function updateInputPlaceholder() {
  if (expectedStartLetter) {
    input.placeholder = `Type a word starting with "${expectedStartLetter}"...`;
  } else {
    input.placeholder = 'Type your word...';
  }
}

// Initialize game
function resetGame() {
  usedWords = [];
  expectedStartLetter = null;
  gameLog.innerHTML = '';
  input.value = '';
  currentPlayer = 1;
  playerPoints = 0;
  wordsPlayedCount = 0;
  updatePointsDisplay();
  updateButtonVisibility();
  updateInputPlaceholder();
  
  if (gameMode === 'online' && roomRef) {
    roomRef.child('usedWords').set([]);
    roomRef.child('expectedLetter').set(null);
    roomRef.child('currentPlayer').set(1);
  }
  
  if (gameMode === 'computer') {
    addLog('🎮 vs Computer Mode', 'info');
    setTimeout(focusInput, 300);
  } else if (gameMode === 'two-player') {
    addLog('🎮 2-Player Local Mode', 'info');
    setTimeout(focusInput, 300);
  } else {
    addLog('🎮 Online Multiplayer Mode', 'online');
  }
}

// Points display
function updatePointsDisplay() {
  const pointsDisplay = document.getElementById('points-display');
  if (gameMode === 'computer') {
    pointsDisplay.style.display = 'block';
    pointsDisplay.textContent = `Points: ${playerPoints}`;
  } else {
    pointsDisplay.style.display = 'none';
  }
}

// Hint button
document.getElementById('hint-btn').addEventListener('click', () => {
  if (gameMode !== 'computer') {
    addLog('❌ Hints only in vs Computer mode!', 'error');
    return;
  }
  
  if (playerPoints < HINT_COST) {
    addLog(`❌ Need ${HINT_COST} points for hint! (You have ${playerPoints})`, 'error');
    return;
  }
  
  if (!expectedStartLetter) {
    addLog('❌ No hint available yet!', 'error');
    return;
  }
  
  const hints = currentWordList.filter(w => {
    if (currentLanguage === 'arabic') {
      return arabicLettersMatch(w[0].toLowerCase(), expectedStartLetter) && 
             !usedWords.includes(w.toLowerCase());
    }
    return w[0].toLowerCase() === expectedStartLetter && 
           !usedWords.includes(w.toLowerCase());
  });
  
  if (hints.length > 0) {
    playerPoints -= HINT_COST;
    updatePointsDisplay();
    const hint = hints[Math.floor(Math.random() * hints.length)];
    addLog(`💡 Hint: Try "${hint}"`, 'hint');
  } else {
    addLog('❌ No hints available!', 'error');
  }
});

// Submit button
submitBtn.addEventListener('click', handleSubmit);
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSubmit();
});

function updateButtonVisibility() {
  const hintBtn = document.getElementById('hint-btn');
  
  if (gameMode === 'computer') {
    hintBtn.style.display = 'inline-block';
  } else {
    hintBtn.style.display = 'none';
  }
}

function handleSubmit() {
  const word = input.value.trim().toLowerCase();
  input.value = '';
  
  if (!word) return;
  
  // Check for master code
  if (word === MASTER_CODE && gameMode === 'computer') {
    playerPoints += MASTER_CODE_POINTS;
    updatePointsDisplay();
    addLog(`Hello Master Rayan Kartobi!🫡`, 'special');
    addLog(`🎁 Bonus: +${MASTER_CODE_POINTS} points`, 'success');
    return;
  }
  
  // Check for Muhammad
  if (muhammadWords[currentLanguage].includes(word)) {
    addLog(`✨ ${blessings[currentLanguage]} ✨`, 'special');
    return;
  }
  
  if (gameMode === 'online') {
    submitWordOnline(word);
  } else {
    validateAndProcess(word);
  }
}

function validateAndProcess(word) {
  if (!currentWordList.includes(word)) {
    addLog(`❌ "${word}" not in dictionary!`, 'error');
    focusInput();
    return;
  }
  
  if (usedWords.includes(word)) {
    addLog(`❌ "${word}" already used!`, 'error');
    focusInput();
    return;
  }
  
  if (expectedStartLetter) {
    const wordFirstLetter = word[0];
    if (!arabicLettersMatch(wordFirstLetter, expectedStartLetter)) {
      addLog(`❌ Must start with "${expectedStartLetter}"!`, 'error');
      focusInput();
      return;
    }
  }
  
  usedWords.push(word);
  const lastLetter = word[word.length - 1];
  expectedStartLetter = lastLetter;
  updateInputPlaceholder();
  
  if (gameMode === 'computer') {
    wordsPlayedCount++;
    if (wordsPlayedCount % WORDS_FOR_POINT === 0) {
      playerPoints++;
      updatePointsDisplay();
      addLog(`🎉 +1 Point! Total: ${playerPoints}`, 'success');
    }
    addLog(`You: ${word}`, 'player');
    setTimeout(computerTurn, 1000);
  } else if (gameMode === 'two-player') {
    addLog(`Player ${currentPlayer}: ${word}`, `player${currentPlayer}`);
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    setTimeout(() => {
      focusInput();
      addLog(`🎯 Player ${currentPlayer}'s turn!`, 'info');
    }, 300);
  }
}

function computerTurn() {
  const possible = currentWordList.filter(w => {
    if (currentLanguage === 'arabic') {
      return arabicLettersMatch(w[0], expectedStartLetter);
    }
    return w[0] === expectedStartLetter;
  }).filter(w => !usedWords.includes(w));
  
  if (possible.length === 0) {
    addLog('🎉 You Win! Computer gave up!', 'success');
    setTimeout(resetGame, 2000);
    return;
  }
  
  const compWord = possible[Math.floor(Math.random() * possible.length)];
  usedWords.push(compWord);
  expectedStartLetter = compWord[compWord.length - 1];
  updateInputPlaceholder();
  addLog(`Computer: ${compWord}`, 'computer');
  
  setTimeout(() => {
    focusInput();
  }, 500);
}

// Give up button
giveUpBtn.addEventListener('click', () => {
  if (gameMode === 'online') {
    giveUpOnline();
    return;
  }
  
  const savedPoints = playerPoints;
  
  addLog('🏳️ You gave up!', 'error');
  
  setTimeout(() => {
    resetGame();
    if (gameMode === 'computer') {
      playerPoints = savedPoints;
      updatePointsDisplay();
      addLog(`💰 Your points: ${playerPoints}`, 'info');
    }
  }, 1500);
});

// Add log message
function addLog(message, type = '') {
  const div = document.createElement('div');
  div.textContent = message;
  if (type) div.className = type;
  gameLog.appendChild(div);
  gameLog.scrollTop = gameLog.scrollHeight;
}

// ===== ONLINE MULTIPLAYER =====

function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function createRoom() {
  if (isConnected) {
    addLog('❌ Already in a room!', 'error');
    return;
  }
  
  if (!window.database) {
    addLog('❌ Firebase not initialized!', 'error');
    return;
  }
  
  currentRoomCode = generateRoomCode();
  roomRef = window.database.ref('rooms/' + currentRoomCode);
  isHost = true;
  playerNumber = 1;
  
  roomRef.set({
    host: playerNumber,
    players: { 1: true },
    playerCount: 1,
    maxPlayers: MAX_PLAYERS,
    usedWords: [],
    expectedLetter: null,
    currentPlayer: 1,
    gameStarted: false,
    timestamp: Date.now(),
    playerCountUpdateTime: Date.now()
  }).then(() => {
    roomCodeElement.textContent = currentRoomCode;
    roomCodeDisplay.style.display = 'block';
    createRoomBtn.style.display = 'none';
    joinRoomBtn.disabled = true;
    joinCodeInput.disabled = true;
    leaveRoomBtn.style.display = 'inline-block';
    
    const existingStartBtn = document.getElementById('start-game-btn');
    if (existingStartBtn) {
      existingStartBtn.remove();
    }

    if (!isHost) {
      const readyBtn = document.createElement('button');
      readyBtn.id = 'ready-btn';
      readyBtn.className = 'online-btn';
      readyBtn.textContent = '✅ Ready';
      readyBtn.style.marginTop = '10px';
      readyBtn.style.display = 'none';
      readyBtn.addEventListener('click', () => {
        addLog('✅ You are ready!', 'success');
        readyBtn.disabled = true;
        readyBtn.textContent = '✅ Ready!';
      });
      roomCodeDisplay.appendChild(readyBtn);
    }
    
    const startBtn = document.createElement('button');
    startBtn.id = 'start-game-btn';
    startBtn.className = 'online-btn';
    startBtn.textContent = '🎮 Start Game';
    startBtn.style.marginTop = '10px';
    startBtn.addEventListener('click', startGame);
    roomCodeDisplay.appendChild(startBtn);
    
    listenToRoom();
    isConnected = true;
    showStatus('Waiting for players...', 'success');
    addLog(`✅ Room: ${currentRoomCode}`, 'success');
  }).catch((error) => {
    console.error('Error creating room:', error);
    addLog('❌ Failed to create room!', 'error');
  });
}

function startGame() {
  if (!isHost || !roomRef) return;
  
  roomRef.once('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.playerCount >= 1) {
      roomRef.update({
        gameStarted: true,
        usedWords: [],
        expectedLetter: null,
        currentPlayer: 1,
        giveUpPlayer: null,
        giveUpTimestamp: null
      });
      
      gameLog.innerHTML = '';
      addLog(`🎮 Game started with ${data.playerCount} player(s)!`, 'success');
      
      const startBtn = document.getElementById('start-game-btn');
      if (startBtn) {
        startBtn.style.display = 'none';
      }
      
      expectedStartLetter = null;
      updateInputPlaceholder();
      
      if (playerNumber === 1) {
        setTimeout(() => {
          focusInput();
          addLog('🎯 Your turn! Start the chain...', 'info');
        }, 500);
      }
    }
  });
}

function joinRoom() {
  if (isConnected) {
    addLog('❌ Already in a room!', 'error');
    return;
  }
  
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) {
    showStatus('Enter a room code!', 'error');
    return;
  }
  
  roomRef = window.database.ref('rooms/' + code);
  
  roomRef.once('value', (snapshot) => {
    if (!snapshot.exists()) {
      showStatus('Room not found!', 'error');
      roomRef = null;
      return;
    }
    
    const roomData = snapshot.val();
    const currentPlayers = roomData.playerCount || 1;
    
    if (currentPlayers >= MAX_PLAYERS) {
      showStatus('Room is full!', 'error');
      roomRef = null;
      return;
    }
    
    playerNumber = currentPlayers + 1;
    isHost = false;
    currentRoomCode = code;
    
    roomRef.update({
      [`players/${playerNumber}`]: true,
      playerCount: playerNumber
    });
    
    createRoomBtn.disabled = true;
    joinRoomBtn.style.display = 'none';
    joinCodeInput.disabled = true;
    leaveRoomBtn.style.display = 'inline-block';
    
    listenToRoom();
    isConnected = true;
    showStatus(`You are Player ${playerNumber}`, 'success');
    addLog(`✅ Joined as Player ${playerNumber}`, 'success');
  });
}

function leaveRoom() {
  if (!isConnected) return;
  
  const myPlayerNumber = playerNumber;
  const wasHost = isHost;
  
  if (roomRef) {
    try {
      roomRef.off('value');
    } catch (error) {
      console.log('Error removing listener:', error);
    }
    
    if (wasHost) {
      roomRef.remove().catch(err => console.log('Error removing room:', err));
    } else {
      roomRef.once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
          if (myPlayerNumber > 0) {
            roomRef.child(`players/${myPlayerNumber}`).remove();
            roomRef.child(`spectators/${myPlayerNumber}`).remove();
          }
          
          const allPlayers = data.players || {};
          const remainingPlayerKeys = Object.keys(allPlayers).filter(p => p !== String(myPlayerNumber));
          const newCount = remainingPlayerKeys.length;
          
          if (newCount > 0) {
            roomRef.update({ 
              playerCount: newCount,
              playerLeftTimestamp: Date.now(),
              playerLeftNumber: myPlayerNumber
            }).catch(err => console.log('Error updating count:', err));
          }
        }
      }).catch(err => console.log('Error reading room:', err));
    }
  }
  
  roomRef = null;
  isConnected = false;
  isHost = false;
  isSpectator = false;
  currentRoomCode = null;
  playerNumber = 0;
  lastProcessedTimestamp = 0;
  lastPlayerCountUpdate = 0;
  
  input.disabled = false;
  submitBtn.disabled = false;
  giveUpBtn.disabled = false;
  
  roomCodeDisplay.style.display = 'none';
  createRoomBtn.style.display = 'inline-block';
  createRoomBtn.disabled = false;
  joinRoomBtn.style.display = 'inline-block';
  joinRoomBtn.disabled = false;
  joinCodeInput.disabled = false;
  joinCodeInput.value = '';
  leaveRoomBtn.style.display = 'none';
  
  const startBtn = document.getElementById('start-game-btn');
  if (startBtn) startBtn.remove();
  
  onlineStatus.style.display = 'none';
  addLog('👋 Left room', 'info');
  resetGame();
}

function listenToRoom() {
  if (!roomRef) return;
  
  roomRef.off('value');
  
  let lastResetTimestamp = 0;
  let previousCurrentPlayer = 0;
  let previousPlayerCount = 0;
  let isFirstTurn = true;
  let hasInitialized = false;
  let lastPlayerLeftTimestamp = 0;
  
  roomRef.on('value', (snapshot) => {
    if (!snapshot.exists()) {
      if (isConnected) {
        showStatus('Room closed', 'error');
        addLog('❌ Room closed', 'error');
        if (roomRef) {
          roomRef.off('value');
        }
        roomRef = null;
        isConnected = false;
        isHost = false;
        currentRoomCode = null;
        playerNumber = 0;
        isSpectator = false;
        
        input.disabled = false;
        submitBtn.disabled = false;
        giveUpBtn.disabled = false;
        
        roomCodeDisplay.style.display = 'none';
        createRoomBtn.style.display = 'inline-block';
        createRoomBtn.disabled = false;
        joinRoomBtn.style.display = 'inline-block';
        joinRoomBtn.disabled = false;
        joinCodeInput.disabled = false;
        leaveRoomBtn.style.display = 'none';
        
        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) startBtn.remove();
        
        onlineStatus.style.display = 'none';
      }
      return;
    }
    
    const data = snapshot.val();
    const currentPlayerCount = data.playerCount || 0;
    
    if (!hasInitialized) {
      previousPlayerCount = currentPlayerCount;
      hasInitialized = true;
    } else {
      if (currentPlayerCount > previousPlayerCount) {
        addLog(`✅ Player ${currentPlayerCount} joined`, 'success');
      } else if (currentPlayerCount < previousPlayerCount) {
        if (data.playerLeftTimestamp && data.playerLeftTimestamp > lastPlayerLeftTimestamp) {
          lastPlayerLeftTimestamp = data.playerLeftTimestamp;
          addLog(`👋 Player ${data.playerLeftNumber || previousPlayerCount} left the room`, 'info');
        } else if (!data.playerLeftTimestamp) {
          addLog(`👋 A player left the room`, 'info');
        }
      }
    }
    
    previousPlayerCount = currentPlayerCount;
    
    if (isHost) {
      showStatus(`Players: ${data.playerCount}/${MAX_PLAYERS}`, 'info');
    } else if (isSpectator) {
      showStatus('👁️ Spectating', 'info');
    }
    
    if (data.resetTimestamp && data.resetTimestamp > lastResetTimestamp) {
      lastResetTimestamp = data.resetTimestamp;
      
      if (!isSpectator) {
        addLog('🔄 Game has been reset', 'info');
        usedWords = [];
        expectedStartLetter = null;
        updateInputPlaceholder();
        currentPlayer = 1;
        
        gameLog.innerHTML = '';
        addLog('🎮 Game reset!', 'info');
        
        if (isHost) {
          const startBtn = document.getElementById('start-game-btn');
          if (startBtn) {
            startBtn.style.display = 'inline-block';
            startBtn.textContent = '🎮 Start New Game';
          } else {
            const newStartBtn = document.createElement('button');
            newStartBtn.id = 'start-game-btn';
            newStartBtn.className = 'online-btn';
            newStartBtn.textContent = '🎮 Start New Game';
            newStartBtn.style.marginTop = '10px';
            newStartBtn.addEventListener('click', startGame);
            roomCodeDisplay.appendChild(newStartBtn);
          }
          addLog('🎮 Click "Start New Game" to play again', 'info');
        } else {
          addLog('⏳ Waiting for host to start new game...', 'info');
        }
        
        isFirstTurn = true;
      }
    }
    
    if (data.giveUpTimestamp && data.giveUpTimestamp > lastProcessedTimestamp) {
      if (data.giveUpPlayer && data.giveUpPlayer !== playerNumber) {
        addLog(`🏳️ Player ${data.giveUpPlayer} gave up!`, 'error');
        
        if (data.spectators && data.spectators[data.giveUpPlayer] && currentPlayerCount > 2) {
          addLog(`👁️ Player ${data.giveUpPlayer} is now spectating`, 'info');
        }
      }
    }
    
    if (data.gameStarted) {
      usedWords = data.usedWords || [];
      expectedStartLetter = data.expectedLetter;
      updateInputPlaceholder();
      currentPlayer = data.currentPlayer || 1;
      
      if (currentPlayer === playerNumber && !isSpectator) {
        if (previousCurrentPlayer !== currentPlayer) {
          setTimeout(() => {
            focusInput();
          }, 100);
        }
      }
      
      previousCurrentPlayer = currentPlayer;
      
      if (data.lastWord && data.lastWordTimestamp > lastProcessedTimestamp) {
        lastProcessedTimestamp = data.lastWordTimestamp;
        addLog(`Player ${data.lastPlayer}: ${data.lastWord}`, `online-player${data.lastPlayer}`);
      }
    }
  }, (error) => {
    console.error('Listener error:', error);
    if (error.code === 'PERMISSION_DENIED') {
      addLog('❌ Connection error', 'error');
      leaveRoom();
    }
  });
}

function giveUpOnline() {
  if (!roomRef || !isConnected) {
    addLog('❌ Not connected to room!', 'error');
    return;
  }
  
  roomRef.once('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    
    const activePlayers = data.playerCount || 0;
    
    addLog('🏳️ You gave up!', 'error');
    
    if (activePlayers <= 2) {
      roomRef.update({
        giveUpPlayer: playerNumber,
        giveUpTimestamp: Date.now(),
        gameStarted: false,
        usedWords: [],
        expectedLetter: null,
        currentPlayer: 1,
        resetTimestamp: Date.now()
      });
      
      addLog('🔄 Game reset', 'info');
      
      usedWords = [];
      expectedStartLetter = null;
      currentPlayer = 1;
      updateInputPlaceholder();
      
    } else {
      roomRef.update({
        giveUpPlayer: playerNumber,
        giveUpTimestamp: Date.now(),
        [`spectators/${playerNumber}`]: true
      });
      
      isSpectator = true;
      input.disabled = true;
      submitBtn.disabled = true;
      giveUpBtn.disabled = true;
      
      addLog('👁️ You are now spectating', 'info');
      
      const newPlayerCount = activePlayers - 1;
      roomRef.update({
        playerCount: newPlayerCount
      });
      
      if (newPlayerCount <= 1) {
        roomRef.update({
          gameStarted: false,
          usedWords: [],
          expectedLetter: null,
          currentPlayer: 1,
          resetTimestamp: Date.now()
        });
        addLog('🔄 Game reset - Only 1 player remaining', 'info');
      }
    }
  });
}

function submitWordOnline(word) {
  if (!roomRef || !isConnected) {
    showStatus('Not connected to room!', 'error');
    return;
  }
  
  if (isSpectator) {
    addLog('👁️ Spectators cannot play!', 'error');
    return;
  }
  
  roomRef.once('value', (snapshot) => {
    const data = snapshot.val();
    
    if (!data) {
      addLog('❌ Room data not found!', 'error');
      focusInput();
      return;
    }
    
    if (!data.gameStarted) {
      addLog('⏳ Waiting for host to start game...', 'error');
      focusInput();
      return;
    }
    
    if (data.currentPlayer !== playerNumber) {
      addLog(`⏳ Wait for Player ${data.currentPlayer}'s turn!`, 'error');
      focusInput();
      return;
    }
    
    const currentUsed = data.usedWords || [];
    const currentExpected = data.expectedLetter;
    
    if (!currentWordList.includes(word)) {
      addLog(`❌ "${word}" not in dictionary!`, 'error');
      focusInput();
      return;
    }
    
    if (currentUsed.includes(word)) {
      addLog(`❌ "${word}" already used!`, 'error');
      focusInput();
      return;
    }
    
    if (currentExpected) {
      const wordFirstLetter = word[0];
      if (!arabicLettersMatch(wordFirstLetter, currentExpected)) {
        addLog(`❌ Must start with "${currentExpected}"!`, 'error');
        focusInput();
        return;
      }
    }
    
    const newUsed = [...currentUsed, word];
    const lastLetter = word[word.length - 1];
    const nextPlayer = (data.currentPlayer % data.playerCount) + 1;
    
    roomRef.update({
      usedWords: newUsed,
      expectedLetter: lastLetter,
      currentPlayer: nextPlayer,
      lastWord: word,
      lastPlayer: playerNumber,
      lastWordTimestamp: Date.now()
    });
  });
}

function showStatus(message, type) {
  onlineStatus.textContent = message;
  onlineStatus.style.display = 'block';
  onlineStatus.style.backgroundColor = 
    type === 'success' ? '#4CAF50' : 
    type === 'error' ? '#f44336' : 
    '#2196F3';
  onlineStatus.style.color = 'white';
}

// Online multiplayer event listeners
if (createRoomBtn) {
  createRoomBtn.addEventListener('click', createRoom);
}

if (joinRoomBtn) {
  joinRoomBtn.addEventListener('click', joinRoom);
}

if (leaveRoomBtn) {
  leaveRoomBtn.addEventListener('click', leaveRoom);
}

// ===== PAGE LOAD =====
window.addEventListener('load', async () => {
  if (gameModeSelect) {
    gameModeSelect.value = 'computer';
    gameMode = 'computer';
  }
  
  if (onlineControls) {
    onlineControls.style.display = 'none';
  }
  
  if (languageSelect) {
    languageSelect.value = 'english';
    currentLanguage = 'english';
  }
  
  if (isConnected && roomRef) {
    try {
      roomRef.off('value');
    } catch (e) {
      console.log('Cleanup on refresh:', e);
    }
    roomRef = null;
    isConnected = false;
    isHost = false;
    isSpectator = false;
    currentRoomCode = null;
    playerNumber = 0;
  }
  
  lastProcessedTimestamp = 0;
  lastPlayerCountUpdate = 0;
  
  usedWords = [];
  expectedStartLetter = null;
  playerPoints = 0;
  wordsPlayedCount = 0;

  updatePointsDisplay();
  updateButtonVisibility();

  // Load the default language word bank on startup
  addLog('⏳ Loading dictionary...', 'info');
  currentWordList = await loadWordBank(currentLanguage);

  updateInputPlaceholder();
  addLog('🎮 Welcome! Type a word to start...', 'info');
});

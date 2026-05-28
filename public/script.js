document.addEventListener('DOMContentLoaded', () => {
  const loginOverlay = document.getElementById('loginOverlay');
  const loginForm = document.getElementById('loginForm');
  const loginPasswordInput = document.getElementById('loginPassword');
  const btnLogin = document.getElementById('btnLogin');
  
  const mainContent = document.getElementById('mainContent');
  const apiUrlInput = document.getElementById('apiUrl');
  const settingsForm = document.getElementById('settingsForm');
  
  const botTokenInput = document.getElementById('botToken');
  const chatIdInput = document.getElementById('chatId');
  const appsScriptUrlInput = document.getElementById('appsScriptUrl');
  const appsScriptUrlOp1Input = document.getElementById('appsScriptUrlOp1');
  const timezoneInput = document.getElementById('timezone');
  const dashboardPasswordInput = document.getElementById('dashboardPassword');
  
  // Dynamic Sheet Dropdowns
  const btnFetchSheetsMain = document.getElementById('btnFetchSheetsMain');
  const dropdownsMainRow = document.getElementById('dropdownsMainRow');
  const selectSheetProd = document.getElementById('selectSheetProd');
  const selectSheetOtmen = document.getElementById('selectSheetOtmen');
  
  const btnFetchSheetsOp1 = document.getElementById('btnFetchSheetsOp1');
  const dropdownsOp1Row = document.getElementById('dropdownsOp1Row');
  const selectSheetOp1 = document.getElementById('selectSheetOp1');
  
  const btnSave = document.getElementById('btnSave');
  const btnTestTelegram = document.getElementById('btnTestTelegram');
  const btnTestSheets = document.getElementById('btnTestSheets');
  
  const toastContainer = document.getElementById('toastContainer');
  const indicatorDot = document.querySelector('.indicator-dot');

  let activePassword = localStorage.getItem('dashboard_password') || '';
  
  // 1. Resolve and Save Backend Server URL (for Vercel cross-origin support)
  let savedApiUrl = localStorage.getItem('api_server_url') || '';
  if (!savedApiUrl) {
    savedApiUrl = window.location.origin;
    if (savedApiUrl.includes('localhost') || savedApiUrl.includes('127.0.0.1')) {
      savedApiUrl = 'http://localhost:3000';
    }
  }
  apiUrlInput.value = savedApiUrl;

  apiUrlInput.addEventListener('change', () => {
    let url = apiUrlInput.value.trim();
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    apiUrlInput.value = url;
    localStorage.setItem('api_server_url', url);
    showToast('Сервер API', 'Адрес сервера обновлен. Переподключение...', 'success');
    checkAuthAndLoad();
  });

  function getEndpoint(path) {
    const base = apiUrlInput.value.trim() || window.location.origin;
    return `${base}${path}`;
  }

  // 2. Authentication flow
  async function checkAuthAndLoad() {
    if (!activePassword) {
      showLoginScreen();
      return;
    }

    try {
      // Validate password against login endpoint
      const response = await fetch(getEndpoint('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: activePassword })
      });
      
      if (response.ok) {
        // Unlock panel
        loginOverlay.classList.add('hidden');
        mainContent.classList.remove('hidden');
        loadSettings();
      } else {
        localStorage.removeItem('dashboard_password');
        activePassword = '';
        showLoginScreen();
        showToast('Ошибка авторизации', 'Сессия истекла или неверный пароль.', 'error');
      }
    } catch (err) {
      console.error(err);
      // If server is unreachable, still show login screen to prevent locking
      showLoginScreen();
      showToast('Ошибка подключения', 'Не удалось связаться с сервером бэкенда.', 'error');
    }
  }

  function showLoginScreen() {
    loginOverlay.classList.remove('hidden');
    mainContent.classList.add('hidden');
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const entered = loginPasswordInput.value.trim();
    if (!entered) return;

    btnLogin.disabled = true;
    try {
      const response = await fetch(getEndpoint('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: entered })
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        activePassword = entered;
        localStorage.setItem('dashboard_password', entered);
        loginOverlay.classList.add('hidden');
        mainContent.classList.remove('hidden');
        loadSettings();
      } else {
        showToast('Ошибка', data.error || 'Неверный пароль', 'error');
        loginPasswordInput.value = '';
        loginPasswordInput.focus();
      }
    } catch (err) {
      showToast('Ошибка подключения', 'Не удалось связаться с сервером.', 'error');
    } finally {
      btnLogin.disabled = false;
    }
  });

  // 3. Fetch configuration settings
  async function loadSettings() {
    indicatorDot.classList.remove('active');
    try {
      const response = await fetch(getEndpoint('/api/settings'), {
        headers: { 'Authorization': activePassword }
      });
      const data = await response.json();
      
      if (data && data.success) {
        const settings = data.settings;
        botTokenInput.value = settings.BOT_TOKEN || '';
        chatIdInput.value = settings.CHAT_ID || '';
        appsScriptUrlInput.value = settings.APPS_SCRIPT_URL || '';
        appsScriptUrlOp1Input.value = settings.APPS_SCRIPT_URL_OP1 || '';
        timezoneInput.value = settings.TIMEZONE || 'Asia/Almaty';
        dashboardPasswordInput.value = settings.DASHBOARD_PASSWORD || 'admin';
        
        indicatorDot.classList.add('active');
        showToast('Успешно', 'Настройки бэкенда загружены.', 'success');
        
        // Auto-fetch sheet lists on load if URLs are active
        if (settings.APPS_SCRIPT_URL) fetchSheetsMain(false);
        if (settings.APPS_SCRIPT_URL_OP1) fetchSheetsOp1(false);
      } else {
        throw new Error(data.error || 'Ошибка формата');
      }
    } catch (err) {
      showToast('Ошибка данных', 'Не удалось загрузить настройки.', 'error');
    }
  }

  // Helper to get current month name in Russian (e.g. "Май")
  function getCurrentMonthName() {
    const months = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    return months[new Date().getMonth()];
  }

  // 4. Fetch available sheets for Main department
  async function fetchSheetsMain(showNotice = true) {
    const url = appsScriptUrlInput.value.trim();
    if (!url) return;

    if (showNotice) showToast('Основной отдел', 'Загрузка списка листов таблицы...', 'info');

    try {
      const response = await fetch(getEndpoint('/api/fetch-sheets-list'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': activePassword 
        },
        body: JSON.stringify({ url })
      });
      const data = await response.json();

      if (data && data.success && data.sheets.length > 0) {
        const sheets = data.sheets;
        populateDropdown(selectSheetProd, sheets, 'продлен');
        populateDropdown(selectSheetOtmen, sheets, 'отмен');
        dropdownsMainRow.classList.remove('hidden');
        if (showNotice) showToast('Вкладки получены', `Основной отдел: загружено ${sheets.length} вкладок.`, 'success');
      }
    } catch (err) {
      console.error(err);
      if (showNotice) showToast('Ошибка листов', 'Не удалось загрузить листы основного отдела.', 'error');
    }
  }

  // 5. Fetch available sheets for OP1 department
  async function fetchSheetsOp1(showNotice = true) {
    const url = appsScriptUrlOp1Input.value.trim();
    if (!url) return;

    if (showNotice) showToast('Отдел ОП1', 'Загрузка списка листов таблицы ОП1...', 'info');

    try {
      const response = await fetch(getEndpoint('/api/fetch-sheets-list'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': activePassword 
        },
        body: JSON.stringify({ url })
      });
      const data = await response.json();

      if (data && data.success && data.sheets.length > 0) {
        const sheets = data.sheets;
        populateDropdown(selectSheetOp1, sheets, 'общие продажи');
        dropdownsOp1Row.classList.remove('hidden');
        if (showNotice) showToast('Вкладки получены', `Отдел ОП1: загружено ${sheets.length} вкладок.`, 'success');
      }
    } catch (err) {
      console.error(err);
      if (showNotice) showToast('Ошибка листов', 'Не удалось загрузить листы таблицы ОП1.', 'error');
    }
  }

  // Populates select dropdown elements and auto-preselects matching tabs
  function populateDropdown(selectElement, sheetsList, keywordFilter) {
    selectElement.innerHTML = '';
    const currentMonth = getCurrentMonthName().toLowerCase();
    
    let matchedIndex = 0;
    
    sheetsList.forEach((sheetName, index) => {
      const option = document.createElement('option');
      option.value = sheetName;
      option.textContent = sheetName;
      selectElement.appendChild(option);
      
      const lowerName = sheetName.toLowerCase();
      // Auto-preselect matching tabs (e.g. contains current month and matches keywords like 'продлен' / 'отмен')
      if (lowerName.includes(currentMonth)) {
        if (keywordFilter === 'общие продажи' && !lowerName.includes('продлен') && !lowerName.includes('отмен')) {
          matchedIndex = index;
        } else if (lowerName.includes(keywordFilter)) {
          matchedIndex = index;
        }
      }
    });

    selectElement.selectedIndex = matchedIndex;
  }

  btnFetchSheetsMain.addEventListener('click', () => fetchSheetsMain(true));
  btnFetchSheetsOp1.addEventListener('click', () => fetchSheetsOp1(true));

  // 6. Save Configuration Action
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoadingState(btnSave, true);

    const payload = {
      BOT_TOKEN: botTokenInput.value.trim(),
      CHAT_ID: chatIdInput.value.trim(),
      APPS_SCRIPT_URL: appsScriptUrlInput.value.trim(),
      APPS_SCRIPT_URL_OP1: appsScriptUrlOp1Input.value.trim(),
      TIMEZONE: timezoneInput.value.trim(),
      DASHBOARD_PASSWORD: dashboardPasswordInput.value.trim()
    };

    try {
      const response = await fetch(getEndpoint('/api/settings'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': activePassword
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data && data.success) {
        showToast('Успешно сохранено', 'Настройки сохранены на бэкенде Railway и применены мгновенно!', 'success');
        // If password was edited, update our browser session to prevent lockout
        if (payload.DASHBOARD_PASSWORD !== activePassword) {
          activePassword = payload.DASHBOARD_PASSWORD;
          localStorage.setItem('dashboard_password', activePassword);
        }
      } else {
        throw new Error(data.error || 'Неизвестная ошибка');
      }
    } catch (err) {
      showToast('Ошибка сохранения', `Не удалось сохранить настройки: ${err.message}`, 'error');
    } finally {
      setLoadingState(btnSave, false);
    }
  });

  // 7. Test Telegram Connection Action
  btnTestTelegram.addEventListener('click', async () => {
    const token = botTokenInput.value.trim();
    const chat = chatIdInput.value.trim();

    if (!token || !chat) {
      showToast('Внимание', 'Пожалуйста, заполните поля Токен и ID чатов перед тестом.', 'error');
      return;
    }

    setLoadingState(btnTestTelegram, true);

    try {
      const response = await fetch(getEndpoint('/api/test-telegram'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': activePassword
        },
        body: JSON.stringify({ BOT_TOKEN: token, CHAT_ID: chat })
      });
      const data = await response.json();

      if (data && data.success) {
        showToast('Успех!', 'Тестовое сообщение доставлено во все указанные чаты!', 'success');
      } else {
        const errors = data.results && data.results.failed ? data.results.failed.map(f => f.error).join(', ') : 'Неизвестно';
        throw new Error(`Ошибка доставки: ${errors}`);
      }
    } catch (err) {
      showToast('Ошибка Telegram', err.message, 'error');
    } finally {
      setLoadingState(btnTestTelegram, false);
    }
  });

  // 8. Test Google Sheets Connection Action
  btnTestSheets.addEventListener('click', async () => {
    const mainUrl = appsScriptUrlInput.value.trim();
    const op1Url = appsScriptUrlOp1Input.value.trim();

    if (!mainUrl && !op1Url) {
      showToast('Внимание', 'Пожалуйста, укажите хотя бы один URL Apps Script перед тестом.', 'error');
      return;
    }

    setLoadingState(btnTestSheets, true);

    try {
      const response = await fetch(getEndpoint('/api/test-sheets'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': activePassword
        },
        body: JSON.stringify({ APPS_SCRIPT_URL: mainUrl, APPS_SCRIPT_URL_OP1: op1Url })
      });
      const data = await response.json();

      if (data && data.success) {
        let msg = 'Все протестированные таблицы успешно вернули корректные данные!';
        const list1 = data.results.sheets.sheetsList || [];
        const list2 = data.results.sheets_op1.sheetsList || [];
        if (list1.length > 0 || list2.length > 0) {
          msg += `\nНайдено листов: ${[...list1, ...list2].join(', ')}`;
        }
        showToast('Подключение успешно!', msg, 'success');
      } else {
        let errorMsg = '';
        if (data.results.sheets.error) {
          errorMsg += `Основной отдел: ${data.results.sheets.error}. `;
        }
        if (data.results.sheets_op1.error) {
          errorMsg += `Отдел ОП1: ${data.results.sheets_op1.error}.`;
        }
        throw new Error(errorMsg || 'Одна или несколько таблиц вернули ошибку.');
      }
    } catch (err) {
      showToast('Ошибка Таблиц', err.message, 'error');
    } finally {
      setLoadingState(btnTestSheets, false);
    }
  });

  // UI Helpers
  function setLoadingState(button, isLoading) {
    if (isLoading) {
      button.classList.add('loading');
      button.disabled = true;
    } else {
      button.classList.remove('loading');
      button.disabled = false;
    }
  }

  function showToast(title, message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '🔔';
    
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <div class="toast-content">
        <h4>${title}</h4>
        <p>${message.replace(/\n/g, '<br>')}</p>
      </div>
    `;

    toastContainer.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
      toast.style.animation = 'slide-in 0.3s reverse forwards';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 5000);
  }

  // Trigger Auth check immediately
  checkAuthAndLoad();
});

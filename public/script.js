document.addEventListener('DOMContentLoaded', () => {
  const loginOverlay = document.getElementById('loginOverlay');
  const loginForm = document.getElementById('loginForm');
  const loginUsernameInput = document.getElementById('loginUsername');
  const loginPasswordInput = document.getElementById('loginPassword');
  const loginApiUrlInput = document.getElementById('loginApiUrl');
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

  let activeToken = localStorage.getItem('dashboard_token') || localStorage.getItem('dashboard_password') || '';
  let activeSettings = null; // Store fetched settings globally
  
  // 1. Resolve and Save Backend Server URL (for Vercel cross-origin support)
  let savedApiUrl = localStorage.getItem('api_server_url') || '';
  if (!savedApiUrl) {
    savedApiUrl = window.location.origin;
    if (savedApiUrl.includes('localhost') || savedApiUrl.includes('127.0.0.1')) {
      savedApiUrl = 'http://localhost:3000';
    }
  }
  apiUrlInput.value = savedApiUrl;
  if (loginApiUrlInput) {
    loginApiUrlInput.value = savedApiUrl;
  }

  apiUrlInput.addEventListener('change', () => {
    let url = apiUrlInput.value.trim();
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    apiUrlInput.value = url;
    if (loginApiUrlInput) {
      loginApiUrlInput.value = url;
    }
    localStorage.setItem('api_server_url', url);
    showToast('Сервер API', 'Адрес сервера обновлен. Переподключение...', 'success');
    checkAuthAndLoad();
  });

  if (loginApiUrlInput) {
    loginApiUrlInput.addEventListener('change', () => {
      let url = loginApiUrlInput.value.trim();
      if (url.endsWith('/')) {
        url = url.slice(0, -1);
      }
      loginApiUrlInput.value = url;
      apiUrlInput.value = url;
      localStorage.setItem('api_server_url', url);
      showToast('Сервер API', 'Адрес сервера обновлен.', 'success');
    });
  }

  function getEndpoint(path) {
    const base = apiUrlInput.value.trim() || window.location.origin;
    return `${base}${path}`;
  }

  // 2. Authentication flow
  async function checkAuthAndLoad() {
    if (!activeToken) {
      showLoginScreen();
      return;
    }

    try {
      // Validate session token by loading settings (or simple verification request)
      const response = await fetch(getEndpoint('/api/settings'), {
        headers: { 'Authorization': activeToken }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.success) {
          activeSettings = data.settings;
          populateFormFields(data.settings);
          
          // Unlock panel
          loginOverlay.classList.add('hidden');
          mainContent.classList.remove('hidden');
          indicatorDot.classList.add('active');
          showToast('Успешно', 'Авторизовано. Настройки загружены.', 'success');
          
          // Auto-fetch sheet lists on load if URLs are active
          if (activeSettings.APPS_SCRIPT_URL) fetchSheetsMain(false, activeSettings.SHEET_PROD, activeSettings.SHEET_OTMEN);
          if (activeSettings.APPS_SCRIPT_URL_OP1) fetchSheetsOp1(false, activeSettings.SHEET_OP1);
        }
      } else {
        localStorage.removeItem('dashboard_token');
        localStorage.removeItem('dashboard_password');
        activeToken = '';
        showLoginScreen();
        showToast('Ошибка авторизации', 'Сессия истекла или неверный логин/пароль.', 'error');
      }
    } catch (err) {
      console.error(err);
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
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value.trim();
    if (!password) return;

    btnLogin.disabled = true;
    try {
      const response = await fetch(getEndpoint('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        activeToken = data.token;
        localStorage.setItem('dashboard_token', data.token);
        localStorage.setItem('dashboard_username', data.username);
        
        loginOverlay.classList.add('hidden');
        mainContent.classList.remove('hidden');
        checkAuthAndLoad();
      } else {
        showToast('Ошибка', data.error || 'Неверный логин или пароль', 'error');
        loginPasswordInput.value = '';
        loginPasswordInput.focus();
      }
    } catch (err) {
      showToast('Ошибка подключения', 'Не удалось связаться с сервером.', 'error');
    } finally {
      btnLogin.disabled = false;
    }
  });

  function populateFormFields(settings) {
    botTokenInput.value = settings.BOT_TOKEN || '';
    chatIdInput.value = settings.CHAT_ID || '';
    appsScriptUrlInput.value = settings.APPS_SCRIPT_URL || '';
    appsScriptUrlOp1Input.value = settings.APPS_SCRIPT_URL_OP1 || '';
    timezoneInput.value = settings.TIMEZONE || 'Asia/Almaty';
    dashboardPasswordInput.value = settings.DASHBOARD_PASSWORD || 'admin';
  }

  // 3. Fetch configuration settings (fallback trigger for updates)
  async function loadSettings() {
    indicatorDot.classList.remove('active');
    try {
      const response = await fetch(getEndpoint('/api/settings'), {
        headers: { 'Authorization': activeToken }
      });
      const data = await response.json();
      
      if (data && data.success) {
        activeSettings = data.settings;
        populateFormFields(activeSettings);
        indicatorDot.classList.add('active');
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
  async function fetchSheetsMain(showNotice = true, savedProd = '', savedOtmen = '') {
    const url = appsScriptUrlInput.value.trim();
    if (!url) return;

    if (showNotice) showToast('Основной отдел', 'Загрузка списка листов таблицы...', 'info');

    try {
      const response = await fetch(getEndpoint('/api/fetch-sheets-list'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': activeToken 
        },
        body: JSON.stringify({ url })
      });
      const data = await response.json();

      if (data && data.success && data.sheets.length > 0) {
        const sheets = data.sheets;
        populateDropdown(selectSheetProd, sheets, 'продлен', savedProd);
        populateDropdown(selectSheetOtmen, sheets, 'отмен', savedOtmen);
        dropdownsMainRow.classList.remove('hidden');
        if (showNotice) showToast('Вкладки получены', `Основной отдел: загружено ${sheets.length} вкладок.`, 'success');
      }
    } catch (err) {
      console.error(err);
      if (showNotice) showToast('Ошибка листов', 'Не удалось загрузить листы основного отдела.', 'error');
    }
  }

  // 5. Fetch available sheets for OP1 department
  async function fetchSheetsOp1(showNotice = true, savedOp1 = '') {
    const url = appsScriptUrlOp1Input.value.trim();
    if (!url) return;

    if (showNotice) showToast('Отдел ОП1', 'Загрузка списка листов таблицы ОП1...', 'info');

    try {
      const response = await fetch(getEndpoint('/api/fetch-sheets-list'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': activeToken 
        },
        body: JSON.stringify({ url })
      });
      const data = await response.json();

      if (data && data.success && data.sheets.length > 0) {
        const sheets = data.sheets;
        populateDropdown(selectSheetOp1, sheets, 'общие продажи', savedOp1);
        dropdownsOp1Row.classList.remove('hidden');
        if (showNotice) showToast('Вкладки получены', `Отдел ОП1: загружено ${sheets.length} вкладок.`, 'success');
      }
    } catch (err) {
      console.error(err);
      if (showNotice) showToast('Ошибка листов', 'Не удалось загрузить листы таблицы ОП1.', 'error');
    }
  }

  // Populates select dropdown elements and auto-preselects matching tabs or saved overrides
  function populateDropdown(selectElement, sheetsList, keywordFilter, savedOverrideVal) {
    selectElement.innerHTML = '';
    const currentMonth = getCurrentMonthName().toLowerCase();
    
    let matchedIndex = 0;
    
    sheetsList.forEach((sheetName, index) => {
      const option = document.createElement('option');
      option.value = sheetName;
      option.textContent = sheetName;
      selectElement.appendChild(option);
      
      if (savedOverrideVal && sheetName === savedOverrideVal) {
        matchedIndex = index;
      } else if (!savedOverrideVal) {
        const lowerName = sheetName.toLowerCase();
        // Auto-preselect matching tabs (e.g. contains current month and matches keywords like 'продлен' / 'отмен')
        if (lowerName.includes(currentMonth)) {
          if (keywordFilter === 'общие продажи' && !lowerName.includes('продлен') && !lowerName.includes('отмен')) {
            matchedIndex = index;
          } else if (lowerName.includes(keywordFilter)) {
            matchedIndex = index;
          }
        }
      }
    });

    selectElement.selectedIndex = matchedIndex;
  }

  btnFetchSheetsMain.addEventListener('click', () => {
    fetchSheetsMain(true, activeSettings ? activeSettings.SHEET_PROD : '', activeSettings ? activeSettings.SHEET_OTMEN : '');
  });
  btnFetchSheetsOp1.addEventListener('click', () => {
    fetchSheetsOp1(true, activeSettings ? activeSettings.SHEET_OP1 : '');
  });

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
      DASHBOARD_PASSWORD: dashboardPasswordInput.value.trim(),
      SHEET_PROD: selectSheetProd.value || '',
      SHEET_OTMEN: selectSheetOtmen.value || '',
      SHEET_OP1: selectSheetOp1.value || ''
    };

    try {
      const response = await fetch(getEndpoint('/api/settings'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': activeToken
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data && data.success) {
        showToast('Успешно сохранено', 'Настройки и выбранные листы сохранены в базу данных PostgreSQL!', 'success');
        
        // If password was edited, sessions are invalidated, let's ask to re-login
        if (activeSettings && payload.DASHBOARD_PASSWORD !== activeSettings.DASHBOARD_PASSWORD) {
          showToast('Безопасность', 'Пароль изменен. Пожалуйста, выполните повторный вход.', 'info');
          setTimeout(() => {
            localStorage.removeItem('dashboard_token');
            localStorage.removeItem('dashboard_password');
            window.location.reload();
          }, 2000);
        } else {
          // Update local memory cache so dropdowns keep correct overrides
          activeSettings = payload;
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
          'Authorization': activeToken
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
          'Authorization': activeToken
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

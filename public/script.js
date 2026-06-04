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
  const selectSheetRnp = document.getElementById('selectSheetRnp');
  
  const btnFetchSheetsOp1 = document.getElementById('btnFetchSheetsOp1');
  const dropdownsOp1Row = document.getElementById('dropdownsOp1Row');
  const selectSheetOp1 = document.getElementById('selectSheetOp1');
  
  const btnSave = document.getElementById('btnSave');
  const btnTestTelegram = document.getElementById('btnTestTelegram');
  const btnTestSheets = document.getElementById('btnTestSheets');
  
  // Binotel Elements
  const binotelApiKeyInput = document.getElementById('binotelApiKey');
  const binotelApiSecretInput = document.getElementById('binotelApiSecret');
  const binotelCompanyIdInput = document.getElementById('binotelCompanyId');
  const btnSaveBinotel = document.getElementById('btnSaveBinotel');

  const managersLoading = document.getElementById('managersLoading');
  const managersPlaceholder = document.getElementById('managersPlaceholder');
  const managersError = document.getElementById('managersError');
  const managersList = document.getElementById('managersList');
  const managersActions = document.getElementById('managersActions');
  const btnSaveManagers = document.getElementById('btnSaveManagers');
  const btnSyncManagers = document.getElementById('btnSyncManagers');

  // amoCRM Elements
  const amoSubdomainInput = document.getElementById('amoSubdomain');
  const amoReportTimeInput = document.getElementById('amoReportTime');
  const amoIntegrationTokenInput = document.getElementById('amoIntegrationToken');
  const amoReportEnabledInput = document.getElementById('amoReportEnabled');
  const btnSaveAmoCrm = document.getElementById('btnSaveAmoCrm');
  const btnTestAmoCrm = document.getElementById('btnTestAmoCrm');

  const amoManagersLoading = document.getElementById('amoManagersLoading');
  const amoManagersPlaceholder = document.getElementById('amoManagersPlaceholder');
  const amoManagersError = document.getElementById('amoManagersError');
  const amoManagersList = document.getElementById('amoManagersList');
  const amoManagersActions = document.getElementById('amoManagersActions');
  const btnSaveAmoManagers = document.getElementById('btnSaveAmoManagers');
  const btnSyncAmoManagers = document.getElementById('btnSyncAmoManagers');
  
  const toastContainer = document.getElementById('toastContainer');
  const indicatorDot = document.querySelector('.indicator-dot');

  let activeToken = localStorage.getItem('dashboard_token') || localStorage.getItem('dashboard_password') || '';
  let activeSettings = null; // Store fetched settings globally
  
  // Helper to sanitize and normalize server URLs (prevent relative-path issues)
  function cleanUrl(url) {
    if (!url) return '';
    let cleaned = url.trim();
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      cleaned = 'https://' + cleaned;
    }
    if (cleaned.endsWith('/')) {
      cleaned = cleaned.slice(0, -1);
    }
    return cleaned;
  }

  // 1. Resolve and Save Backend Server URL (for Vercel cross-origin support)
  let savedApiUrl = localStorage.getItem('api_server_url') || '';
  if (savedApiUrl) {
    savedApiUrl = cleanUrl(savedApiUrl);
  } else {
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
    let url = cleanUrl(apiUrlInput.value);
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
      let url = cleanUrl(loginApiUrlInput.value);
      loginApiUrlInput.value = url;
      apiUrlInput.value = url;
      localStorage.setItem('api_server_url', url);
      showToast('Сервер API', 'Адрес сервера обновлен.', 'success');
    });
  }

  function getEndpoint(path) {
    const rawBase = apiUrlInput.value.trim() || window.location.origin;
    const base = cleanUrl(rawBase);
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
          if (activeSettings.APPS_SCRIPT_URL) fetchSheetsMain(false, activeSettings.SHEET_PROD, activeSettings.SHEET_OTMEN, activeSettings.SHEET_RNP);
          if (activeSettings.APPS_SCRIPT_URL_OP1) fetchSheetsOp1(false, activeSettings.SHEET_OP1);
          
          // Auto-fetch Binotel managers on load
          fetchAndRenderManagers(false);
          
          // Auto-fetch amoCRM managers on load
          fetchAndRenderAmoManagers(false);
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
    
    // Binotel Fields
    binotelApiKeyInput.value = settings.BINOTEL_API_KEY || '';
    binotelApiSecretInput.value = settings.BINOTEL_API_SECRET || '';
    binotelCompanyIdInput.value = settings.BINOTEL_COMPANY_ID || '';

    // amoCRM Fields
    amoSubdomainInput.value = settings.AMO_SUBDOMAIN || '';
    amoReportTimeInput.value = settings.AMO_REPORT_TIME || '20:00';
    amoIntegrationTokenInput.value = settings.AMO_INTEGRATION_TOKEN || '';
    amoReportEnabledInput.checked = settings.AMO_REPORT_ENABLED !== 'false';
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
  async function fetchSheetsMain(showNotice = true, savedProd = '', savedOtmen = '', savedRnp = '') {
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
        populateDropdown(selectSheetRnp, sheets, 'рнп', savedRnp);
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
    fetchSheetsMain(true, activeSettings ? activeSettings.SHEET_PROD : '', activeSettings ? activeSettings.SHEET_OTMEN : '', activeSettings ? activeSettings.SHEET_RNP : '');
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
      SHEET_PROD: selectSheetProd.value || (activeSettings ? activeSettings.SHEET_PROD : ''),
      SHEET_OTMEN: selectSheetOtmen.value || (activeSettings ? activeSettings.SHEET_OTMEN : ''),
      SHEET_OP1: selectSheetOp1.value || (activeSettings ? activeSettings.SHEET_OP1 : ''),
      SHEET_RNP: selectSheetRnp.value || (activeSettings ? activeSettings.SHEET_RNP : ''),
      
      // Preserve Binotel keys when saving other settings
      BINOTEL_API_KEY: activeSettings ? activeSettings.BINOTEL_API_KEY : '',
      BINOTEL_API_SECRET: activeSettings ? activeSettings.BINOTEL_API_SECRET : '',
      BINOTEL_COMPANY_ID: activeSettings ? activeSettings.BINOTEL_COMPANY_ID : '',
      BINOTEL_ACTIVE_MANAGERS: activeSettings ? activeSettings.BINOTEL_ACTIVE_MANAGERS : '',

      // amoCRM settings
      AMO_SUBDOMAIN: amoSubdomainInput.value.trim(),
      AMO_REPORT_TIME: amoReportTimeInput.value.trim(),
      AMO_INTEGRATION_TOKEN: amoIntegrationTokenInput.value.trim(),
      AMO_REPORT_ENABLED: amoReportEnabledInput.checked ? 'true' : 'false',
      AMO_ACTIVE_MANAGERS: activeSettings ? activeSettings.AMO_ACTIVE_MANAGERS : ''
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

  // 9. Fetch and Render Binotel Employees List
  async function fetchAndRenderManagers(showNotice = false) {
    const key = binotelApiKeyInput.value.trim();
    const secret = binotelApiSecretInput.value.trim();
    const company = binotelCompanyIdInput.value.trim();

    if (!key || !secret || !company) {
      managersPlaceholder.classList.remove('hidden');
      managersLoading.classList.add('hidden');
      managersError.classList.add('hidden');
      managersList.classList.add('hidden');
      managersActions.classList.add('hidden');
      return;
    }

    managersPlaceholder.classList.add('hidden');
    managersLoading.classList.remove('hidden');
    managersError.classList.add('hidden');
    managersList.classList.add('hidden');
    managersActions.classList.add('hidden');

    if (showNotice) {
      showToast('Binotel', 'Загрузка списка менеджеров...', 'info');
    }

    try {
      const response = await fetch(getEndpoint('/api/binotel/managers'), {
        headers: { 'Authorization': activeToken }
      });
      
      const data = await response.json();
      managersLoading.classList.add('hidden');

      if (data && data.success) {
        managersList.innerHTML = '';
        if (!data.managers || data.managers.length === 0) {
          managersList.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">Сотрудники не найдены в этой компании.</div>';
        } else {
          data.managers.forEach(emp => {
            const div = document.createElement('div');
            div.className = 'manager-item';
            div.innerHTML = `
              <div class="manager-info">
                <span class="manager-name" title="${emp.name}">${emp.name}</span>
                <span class="manager-email" title="${emp.email}">${emp.email}</span>
                ${emp.internalNumber ? `<span class="manager-internal">вн. ${emp.internalNumber}</span>` : ''}
              </div>
              <label class="switch">
                <input type="checkbox" class="manager-checkbox" data-email="${emp.email}" ${emp.active ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            `;
            managersList.appendChild(div);
          });
        }
        managersList.classList.remove('hidden');
        managersActions.classList.remove('hidden');
        if (showNotice) {
          showToast('Готово!', `Загружено ${data.managers.length} сотрудников из Binotel.`, 'success');
        }
      } else {
        if (data.error === 'credentials_missing') {
          managersPlaceholder.classList.remove('hidden');
        } else {
          managersError.classList.remove('hidden');
          if (showNotice) {
            showToast('Ошибка Binotel API', data.message || 'Не удалось связаться с Binotel.', 'error');
          }
        }
      }
    } catch (err) {
      console.error(err);
      managersLoading.classList.add('hidden');
      managersError.classList.remove('hidden');
      if (showNotice) {
        showToast('Ошибка сети', 'Не удалось получить данные с сервера.', 'error');
      }
    }
  }

  // 10. Save Binotel Keys Action
  btnSaveBinotel.addEventListener('click', async () => {
    const key = binotelApiKeyInput.value.trim();
    const secret = binotelApiSecretInput.value.trim();
    const company = binotelCompanyIdInput.value.trim();

    if (!key || !secret || !company) {
      showToast('Внимание', 'Заполните API Key, API Secret и Company ID для сохранения.', 'error');
      return;
    }

    setLoadingState(btnSaveBinotel, true);

    const payload = {
      ...activeSettings,
      BINOTEL_API_KEY: key,
      BINOTEL_API_SECRET: secret,
      BINOTEL_COMPANY_ID: company
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
        showToast('Успешно', 'Авторизационные данные Binotel сохранены в БД!', 'success');
        activeSettings = payload;
        await fetchAndRenderManagers(true);
      } else {
        throw new Error(data.error || 'Неизвестная ошибка сервера');
      }
    } catch (err) {
      showToast('Ошибка сохранения', err.message, 'error');
    } finally {
      setLoadingState(btnSaveBinotel, false);
    }
  });

  // 11. Save whitelist active managers
  btnSaveManagers.addEventListener('click', async () => {
    const checkboxes = managersList.querySelectorAll('.manager-checkbox');
    const activeEmails = [];
    checkboxes.forEach(cb => {
      if (cb.checked) {
        activeEmails.push(cb.getAttribute('data-email'));
      }
    });

    setLoadingState(btnSaveManagers, true);

    try {
      const response = await fetch(getEndpoint('/api/binotel/managers'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': activeToken
        },
        body: JSON.stringify({ activeEmails })
      });
      const data = await response.json();

      if (data && data.success) {
        showToast('Сохранено', 'Список активных менеджеров сохранен в базу данных!', 'success');
        if (activeSettings) {
          activeSettings.BINOTEL_ACTIVE_MANAGERS = activeEmails.join(',');
        }
      } else {
        throw new Error(data.error || 'Неизвестная ошибка');
      }
    } catch (err) {
      showToast('Ошибка сохранения', err.message, 'error');
    } finally {
      setLoadingState(btnSaveManagers, false);
    }
  });

  btnSyncManagers.addEventListener('click', () => {
    fetchAndRenderManagers(true);
  });

  // 12. Fetch and Render amoCRM Employees List
  async function fetchAndRenderAmoManagers(showNotice = false) {
    const subdomain = amoSubdomainInput.value.trim();
    const token = amoIntegrationTokenInput.value.trim();

    if (!subdomain || !token) {
      amoManagersPlaceholder.classList.remove('hidden');
      amoManagersLoading.classList.add('hidden');
      amoManagersError.classList.add('hidden');
      amoManagersList.classList.add('hidden');
      amoManagersActions.classList.add('hidden');
      return;
    }

    amoManagersPlaceholder.classList.add('hidden');
    amoManagersLoading.classList.remove('hidden');
    amoManagersError.classList.add('hidden');
    amoManagersList.classList.add('hidden');
    amoManagersActions.classList.add('hidden');

    if (showNotice) {
      showToast('amoCRM', 'Загрузка списка сотрудников...', 'info');
    }

    try {
      const response = await fetch(getEndpoint('/api/amocrm/managers'), {
        headers: { 'Authorization': activeToken }
      });
      
      const data = await response.json();
      amoManagersLoading.classList.add('hidden');

      if (data && data.success) {
        amoManagersList.innerHTML = '';
        if (!data.managers || data.managers.length === 0) {
          amoManagersList.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">Сотрудники не найдены.</div>';
        } else {
          data.managers.forEach(emp => {
            const div = document.createElement('div');
            div.className = 'manager-item';
            div.innerHTML = `
              <div class="manager-info">
                <span class="manager-name" title="${emp.name}">${emp.name}</span>
                <span class="manager-email" title="${emp.email}">${emp.email || 'Нет email'}</span>
                <span class="manager-internal">ID: ${emp.id}</span>
              </div>
              <label class="switch">
                <input type="checkbox" class="amo-manager-checkbox" data-id="${emp.id}" ${emp.active ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            `;
            amoManagersList.appendChild(div);
          });
        }
        amoManagersList.classList.remove('hidden');
        amoManagersActions.classList.remove('hidden');
        if (showNotice) {
          showToast('Готово!', `Загружено ${data.managers.length} сотрудников из amoCRM.`, 'success');
        }
      } else {
        if (data.error === 'credentials_missing') {
          amoManagersPlaceholder.classList.remove('hidden');
        } else {
          amoManagersError.classList.remove('hidden');
          if (showNotice) {
            showToast('Ошибка amoCRM API', data.message || 'Не удалось связаться с amoCRM.', 'error');
          }
        }
      }
    } catch (err) {
      console.error(err);
      amoManagersLoading.classList.add('hidden');
      amoManagersError.classList.remove('hidden');
      if (showNotice) {
        showToast('Ошибка сети', 'Не удалось получить данные с сервера.', 'error');
      }
    }
  }

  // 13. Save amoCRM Keys Action
  btnSaveAmoCrm.addEventListener('click', async () => {
    const subdomain = amoSubdomainInput.value.trim();
    const token = amoIntegrationTokenInput.value.trim();
    const time = amoReportTimeInput.value.trim();
    const enabled = amoReportEnabledInput.checked ? 'true' : 'false';

    if (!subdomain || !token) {
      showToast('Внимание', 'Заполните Субдомен и Токен доступа для сохранения.', 'error');
      return;
    }

    setLoadingState(btnSaveAmoCrm, true);

    const payload = {
      ...activeSettings,
      AMO_SUBDOMAIN: subdomain,
      AMO_INTEGRATION_TOKEN: token,
      AMO_REPORT_TIME: time,
      AMO_REPORT_ENABLED: enabled
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
        showToast('Успешно', 'Авторизационные данные amoCRM сохранены!', 'success');
        activeSettings = payload;
        await fetchAndRenderAmoManagers(true);
      } else {
        throw new Error(data.error || 'Неизвестная ошибка сервера');
      }
    } catch (err) {
      showToast('Ошибка сохранения', err.message, 'error');
    } finally {
      setLoadingState(btnSaveAmoCrm, false);
    }
  });

  // 14. Test amoCRM Connection Action
  btnTestAmoCrm.addEventListener('click', async () => {
    const subdomain = amoSubdomainInput.value.trim();
    const token = amoIntegrationTokenInput.value.trim();

    if (!subdomain || !token) {
      showToast('Внимание', 'Пожалуйста, заполните поля Субдомен и Токен перед тестом.', 'error');
      return;
    }

    setLoadingState(btnTestAmoCrm, true);

    try {
      const response = await fetch(getEndpoint('/api/test-amocrm'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': activeToken
        },
        body: JSON.stringify({ AMO_SUBDOMAIN: subdomain, AMO_INTEGRATION_TOKEN: token })
      });
      const data = await response.json();

      if (data && data.success) {
        showToast('Успех!', data.message || 'Подключение к amoCRM выполнено успешно!', 'success');
      } else {
        throw new Error(data.error || 'Ошибка подключения.');
      }
    } catch (err) {
      showToast('Ошибка amoCRM', err.message, 'error');
    } finally {
      setLoadingState(btnTestAmoCrm, false);
    }
  });

  // 15. Save whitelist active amoCRM managers
  btnSaveAmoManagers.addEventListener('click', async () => {
    const checkboxes = amoManagersList.querySelectorAll('.amo-manager-checkbox');
    const activeIds = [];
    checkboxes.forEach(cb => {
      if (cb.checked) {
        activeIds.push(cb.getAttribute('data-id'));
      }
    });

    setLoadingState(btnSaveAmoManagers, true);

    try {
      const response = await fetch(getEndpoint('/api/amocrm/managers'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': activeToken
        },
        body: JSON.stringify({ activeIds })
      });
      const data = await response.json();

      if (data && data.success) {
        showToast('Сохранено', 'Список активных менеджеров amoCRM сохранен в базу данных!', 'success');
        if (activeSettings) {
          activeSettings.AMO_ACTIVE_MANAGERS = activeIds.join(',');
        }
      } else {
        throw new Error(data.error || 'Неизвестная ошибка');
      }
    } catch (err) {
      showToast('Ошибка сохранения', err.message, 'error');
    } finally {
      setLoadingState(btnSaveAmoManagers, false);
    }
  });

  btnSyncAmoManagers.addEventListener('click', () => {
    fetchAndRenderAmoManagers(true);
  });

  // --- amoCRM Deduplication & Filtering ---
  const dropZone = document.getElementById('dropZone');
  const dedupFileInput = document.getElementById('dedupFile');
  const uploadText = document.getElementById('uploadText');
  const btnRunDedup = document.getElementById('btnRunDedup');
  const btnClearFile = document.getElementById('btnClearFile');
  const dedupPhoneColumnInput = document.getElementById('dedupPhoneColumn');
  
  const dedupResults = document.getElementById('dedupResults');
  const statTotalRows = document.getElementById('statTotalRows');
  const statCrmContacts = document.getElementById('statCrmContacts');
  const statCrmDupes = document.getElementById('statCrmDupes');
  const statFileDupes = document.getElementById('statFileDupes');
  const statInvalidFormat = document.getElementById('statInvalidFormat');
  const statCleanLeads = document.getElementById('statCleanLeads');
  
  const btnDownloadClean = document.getElementById('btnDownloadClean');
  const btnDownloadLog = document.getElementById('btnDownloadLog');

  let selectedFile = null;
  let cleanFileId = null;
  let errorLogId = null;

  // Clicking on drop zone triggers file input
  if (dropZone) {
    dropZone.addEventListener('click', () => {
      dedupFileInput.click();
    });

    // Handle file selection
    dedupFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileSelected(e.target.files[0]);
      }
    });

    // Drag & Drop handlers
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleFileSelected(e.dataTransfer.files[0]);
      }
    });
  }

  function handleFileSelected(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      showToast('Ошибка файла', 'Допускаются только файлы Excel (.xlsx, .xls) или CSV (.csv).', 'error');
      return;
    }

    selectedFile = file;
    uploadText.textContent = `Выбран файл: ${file.name} (${(file.size / 1024).toFixed(1)} КБ)`;
    btnRunDedup.disabled = false;
    btnClearFile.classList.remove('hidden');
    
    // Hide previous results on new selection
    dedupResults.classList.add('hidden');
    cleanFileId = null;
    errorLogId = null;
  }

  if (btnClearFile) {
    btnClearFile.addEventListener('click', () => {
      resetDedupForm();
    });
  }

  function resetDedupForm() {
    selectedFile = null;
    dedupFileInput.value = '';
    uploadText.textContent = 'Перетащите файл сюда или кликните для выбора';
    btnRunDedup.disabled = true;
    btnClearFile.classList.add('hidden');
    dedupResults.classList.add('hidden');
    cleanFileId = null;
    errorLogId = null;
  }

  // Running the Deduplication process
  if (btnRunDedup) {
    btnRunDedup.addEventListener('click', async () => {
      if (!selectedFile) return;

      setLoadingState(btnRunDedup, true);
      showToast('Дедупликация', 'Начался процесс выгрузки из amoCRM и дедупликации...', 'info');

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('phoneColumn', dedupPhoneColumnInput.value.trim());

      try {
        const response = await fetch(getEndpoint('/api/amocrm/deduplicate'), {
          method: 'POST',
          headers: {
            'Authorization': activeToken
          },
          body: formData
        });

        const data = await response.json();

        if (response.ok && data.success) {
          showToast('Успех!', 'Файл успешно очищен от дубликатов!', 'success');
          
          // Populate stats
          statTotalRows.textContent = data.stats.total_rows;
          statCrmContacts.textContent = data.stats.crm_contacts_count;
          statCrmDupes.textContent = data.stats.crm_duplicates;
          statFileDupes.textContent = data.stats.file_duplicates;
          statInvalidFormat.textContent = data.stats.invalid_format;
          statCleanLeads.textContent = data.stats.clean_leads;
          
          cleanFileId = data.cleanFileId;
          errorLogId = data.errorLogId;

          // Show results
          dedupResults.classList.remove('hidden');
        } else {
          throw new Error(data.error || 'Произошла ошибка при обработке.');
        }
      } catch (err) {
        showToast('Ошибка дедупликации', err.message, 'error');
      } finally {
        setLoadingState(btnRunDedup, false);
      }
    });
  }

  // Download cleaned file action
  if (btnDownloadClean) {
    btnDownloadClean.addEventListener('click', () => {
      if (!cleanFileId) return;
      const url = getEndpoint(`/api/amocrm/download/${cleanFileId}`);
      downloadProtectedFile(url, 'clean_import.xlsx');
    });
  }

  // View/Download error log action
  if (btnDownloadLog) {
    btnDownloadLog.addEventListener('click', () => {
      if (!errorLogId) return;
      const url = getEndpoint(`/api/amocrm/log/${errorLogId}`);
      downloadProtectedFile(url, 'dedup_errors.log');
    });
  }

  async function downloadProtectedFile(url, filename) {
    try {
      showToast('Скачивание', 'Подготовка файла...', 'info');
      const response = await fetch(url, {
        headers: { 'Authorization': activeToken }
      });
      
      if (!response.ok) {
        const errText = await response.json();
        throw new Error(errText.error || 'Ошибка скачивания');
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      showToast('Ошибка', `Не удалось скачать файл: ${err.message}`, 'error');
    }
  }

  // Trigger Auth check immediately
  checkAuthAndLoad();
});

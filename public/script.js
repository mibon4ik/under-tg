document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const settingsForm = document.getElementById('settingsForm');
  
  const botTokenInput = document.getElementById('botToken');
  const chatIdInput = document.getElementById('chatId');
  const appsScriptUrlInput = document.getElementById('appsScriptUrl');
  const appsScriptUrlOp1Input = document.getElementById('appsScriptUrlOp1');
  const timezoneInput = document.getElementById('timezone');
  
  const btnSave = document.getElementById('btnSave');
  const btnTestTelegram = document.getElementById('btnTestTelegram');
  const btnTestSheets = document.getElementById('btnTestSheets');
  
  const toastContainer = document.getElementById('toastContainer');
  const indicatorDot = document.querySelector('.indicator-dot');

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
    showToast('Сервер API', 'Адрес сервера обновлен. Перезагрузка настроек...', 'success');
    loadSettings();
  });

  // Helper to construct fully qualified API URL
  function getEndpoint(path) {
    const base = apiUrlInput.value.trim() || window.location.origin;
    return `${base}${path}`;
  }

  // 2. Fetch and Load Settings from Backend
  async function loadSettings() {
    indicatorDot.classList.remove('active');
    try {
      const response = await fetch(getEndpoint('/api/settings'));
      const data = await response.json();
      
      if (data && data.success) {
        const settings = data.settings;
        botTokenInput.value = settings.BOT_TOKEN || '';
        chatIdInput.value = settings.CHAT_ID || '';
        appsScriptUrlInput.value = settings.APPS_SCRIPT_URL || '';
        appsScriptUrlOp1Input.value = settings.APPS_SCRIPT_URL_OP1 || '';
        timezoneInput.value = settings.TIMEZONE || 'Asia/Almaty';
        
        indicatorDot.classList.add('active');
        showToast('Настройки загружены', 'Конфигурация успешно получена с сервера Railway.', 'success');
      } else {
        throw new Error(data.error || 'Ошибка формата ответа');
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
      showToast(
        'Ошибка соединения', 
        `Не удалось подключиться к API бэкенда. Проверьте правильность адреса сервера и запущен ли бот.`, 
        'error'
      );
    }
  }

  loadSettings();

  // 3. Save Configuration Action
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoadingState(btnSave, true);

    const payload = {
      BOT_TOKEN: botTokenInput.value.trim(),
      CHAT_ID: chatIdInput.value.trim(),
      APPS_SCRIPT_URL: appsScriptUrlInput.value.trim(),
      APPS_SCRIPT_URL_OP1: appsScriptUrlOp1Input.value.trim(),
      TIMEZONE: timezoneInput.value.trim()
    };

    try {
      const response = await fetch(getEndpoint('/api/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data && data.success) {
        showToast('Успешно сохранено', 'Настройки сохранены на бэкенде и применены мгновенно в памяти!', 'success');
      } else {
        throw new Error(data.error || 'Неизвестная ошибка');
      }
    } catch (err) {
      showToast('Ошибка сохранения', `Не удалось сохранить настройки: ${err.message}`, 'error');
    } finally {
      setLoadingState(btnSave, false);
    }
  });

  // 4. Test Telegram Connection Action
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ BOT_TOKEN: token, CHAT_ID: chat })
      });
      const data = await response.json();

      if (data && data.success) {
        showToast('Успех!', 'Тестовое сообщение успешно доставлено во все указанные чаты!', 'success');
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

  // 5. Test Google Sheets Connection Action
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
        headers: { 'Content-Type': 'application/json' },
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
});

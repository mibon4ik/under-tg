/**
 * Google Apps Script версия для автоматического Telegram-отчета продаж
 * 
 * Данный скрипт решает 2 задачи:
 * 1. Работает как API Web App (для Node.js бэкенда на Railway). Возвращает все строки 
 *    из листов "Продления" и "Отмены" по запросу бэкенда без использования Google API ключей и Service Accounts.
 * 2. Может работать автономно (по триггеру внутри таблиц), если вы не хотите использовать внешний сервер Railway.
 * 
 * ИНСТРУКЦИЯ ПО РАЗВЕРТЫВАНИЮ WEB APP API:
 * 1. В вашей Google Таблице выберите "Расширения" -> "Apps Script" (Extensions -> Apps Script).
 * 2. Удалите стандартный шаблон кода и вставьте содержимое этого файла.
 * 3. Нажмите кнопку "Сохранить" (Save, иконка дискеты).
 * 4. Нажмите синюю кнопку "Начало развертывания" -> "Новое развертывание" (Deploy -> New Deployment).
 * 5. Выберите тип развертывания: "Веб-приложение" (Web App, иконка шестеренки).
 * 6. Настройте конфигурацию:
 *    - Описание: "under-tg-sales-api"
 *    - Запуск от имени: "Вы" (Me, ваш аккаунт)
 *    - Кто имеет доступ: "Все" (Anyone - это критически важно для доступа с Railway!)
 * 7. Нажмите кнопку "Развернуть" (Deploy). 
 * 8. Предоставьте разрешения скрипту (Authorize access), выберите ваш Google-аккаунт, нажмите Advanced -> Go to ... (unsafe) и подтвердите разрешения.
 * 9. Скопируйте полученный **URL веб-приложения** (URL Web App, оканчивающийся на `/exec`).
 * 10. Вставьте этот URL в настройки проекта на Railway (переменная `APPS_SCRIPT_URL` в `.env`).
 * 
 * ИНСТРУКЦИЯ ДЛЯ АВТОНОМНОГО ЗАПУСКА ВНУТРИ ТАБЛИЦ (БЕЗ RAILWAY):
 * Если хотите использовать чисто Apps Script:
 * 1. Перейдите в "Настройки проекта" (иконка шестеренки слева) -> "Свойства сценария" (Script Properties) и добавьте:
 *    - `BOT_TOKEN` : токен вашего Telegram-бота.
 *    - `CHAT_ID`   : ID чатов через запятую.
 *    - `TIMEZONE`  : часовой пояс (например, Asia/Almaty).
 * 2. Перейдите во вкладку "Триггеры" (иконка часов) -> "Добавить триггер":
 *    - Запускаемая функция: `dailySalesReportFlow`
 *    - Источник: по времени
 *    - Тип: по дням
 *    - Время суток: с 21:00 до 22:00.
 */

/**
 * -----------------------------------------------------------------------------
 *  1. WEB APP ENDPOINT (doGet)
 *  Exposes spreadsheet data as JSON for the Node.js Railway backend
 * -----------------------------------------------------------------------------
 */
function doGet(e) {
  try {
    var p = e && e.parameter ? e.parameter : {};
    var action = p.action || '';
    var date = p.date || '';
    var sheetProd = p.sheetProd || '';
    var sheetOtmen = p.sheetOtmen || '';
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      return crmJson_({ ok: false, error: 'spreadsheet_not_found' });
    }
    
    // Возвращаем список всех листов в таблице
    if (action === 'listSheets') {
      var sheetsList = ss.getSheets().map(function(sh) {
        return sh.getName();
      });
      return crmJson_({ ok: true, sheets: sheetsList });
    }
    
    var result = {};
    
    // Если переданы конкретные листы из настроек веб-панели
    if (sheetProd || sheetOtmen) {
      if (sheetProd) {
        var shP = ss.getSheetByName(sheetProd);
        if (shP) {
          var lastRowP = shP.getLastRow();
          var lastColP = shP.getLastColumn();
          if (lastRowP > 0 && lastColP > 0) {
            result[sheetProd] = shP.getRange(1, 1, lastRowP, lastColP).getDisplayValues();
          } else {
            result[sheetProd] = [];
          }
        }
      }
      if (sheetOtmen) {
        var shO = ss.getSheetByName(sheetOtmen);
        if (shO) {
          var lastRowO = shO.getLastRow();
          var lastColO = shO.getLastColumn();
          if (lastRowO > 0 && lastColO > 0) {
            result[sheetOtmen] = shO.getRange(1, 1, lastRowO, lastColO).getDisplayValues();
          } else {
            result[sheetOtmen] = [];
          }
        }
      }
    } else {
      // Иначе ищем автоматически по месяцу
      var months = {
        '01': 'Январь', '02': 'Февраль', '03': 'Март', '04': 'Апрель',
        '05': 'Май', '06': 'Июнь', '07': 'Июль', '08': 'Август',
        '09': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь'
      };
      
      var targetDate = date || Utilities.formatDate(new Date(), 'Asia/Almaty', 'dd.MM.yyyy');
      var parts = targetDate.split('.');
      var monthIndex = parts[1] || '05';
      var monthName = months[monthIndex] || 'Май';
      
      var sheets = ss.getSheets();
      var lowerMonth = monthName.toLowerCase();
      
      sheets.forEach(function(sh) {
        var name = sh.getName();
        var lowerName = name.toLowerCase();
        
        if (lowerName.indexOf(lowerMonth) !== -1) {
          if (lowerName.indexOf('продлен') !== -1 || lowerName.indexOf('отмен') !== -1) {
            var lastRowSh = sh.getLastRow();
            var lastColSh = sh.getLastColumn();
            if (lastRowSh > 0 && lastColSh > 0) {
              result[name] = sh.getRange(1, 1, lastRowSh, lastColSh).getDisplayValues();
            } else {
              result[name] = [];
            }
          }
        }
      });
    }
    
    return crmJson_({
      ok: true,
      date: date || Utilities.formatDate(new Date(), 'Asia/Almaty', 'dd.MM.yyyy'),
      data: result
    });
  } catch (err) {
    return crmJson_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

/**
 * Вспомогательный метод для выгрузки JSON-ответа
 */
function crmJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * -----------------------------------------------------------------------------
 *  2. AUTONOMOUS RUNNING LOGIC
 *  Runs locally in Google Spreadsheet using native time triggers
 * -----------------------------------------------------------------------------
 */

/**
 * Основная функция-триггер для ежедневного автоматического отчета.
 */
function dailySalesReportFlow() {
  const properties = PropertiesService.getScriptProperties();
  const timezone = properties.getProperty('TIMEZONE') || 'Asia/Almaty';
  
  // Получаем текущую дату в часовом поясе Almaty
  const todayStr = Utilities.formatDate(new Date(), timezone, 'dd.MM.yyyy');
  
  generateAndSendReport(todayStr);
}

/**
 * Ручной запуск отчета из редактора Apps Script для тестирования.
 * Запускает отчет за текущий день.
 */
function testReportCurrentDay() {
  const properties = PropertiesService.getScriptProperties();
  const timezone = properties.getProperty('TIMEZONE') || 'Asia/Almaty';
  const todayStr = Utilities.formatDate(new Date(), timezone, 'dd.MM.yyyy');
  
  Logger.log('Запуск ручного теста за дату: ' + todayStr);
  generateAndSendReport(todayStr);
}

/**
 * Генерирует отчет по продажам за определенную дату и отправляет в Telegram.
 * @param {string} targetDateStr - Дата в формате "dd.MM.yyyy"
 */
function generateAndSendReport(targetDateStr) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      throw new Error('Не удалось получить активную Google Таблицу. Скрипт должен быть привязан к таблице.');
    }

    const aggregated = aggregateSalesData(spreadsheet, targetDateStr);
    const message = buildReportMessage(aggregated, targetDateStr);

    Logger.log('\n--- СФОРМИРОВАННЫЙ ОТЧЕТ ---\n' + message + '\n----------------------------');

    sendTelegramNotification(message);
  } catch (error) {
    Logger.log('ОШИБКА: ' + error.message);
  }
}

/**
 * Агрегирует данные с указанных листов таблицы за заданную дату.
 */
function aggregateSalesData(spreadsheet, targetDateStr) {
  const activeSheets = [];
  
  let totalGross = 0;
  let totalSalesCount = 0;
  let totalDvdCount = 0;

  // Инициализация категорий
  const categories = {
    'УЛИЦА': { name: 'УЛИЦА', gross: 0, sales: 0, entered: 0, dvd: 0, avgCheck: 0, order: 1, type: 'street' },
    'Продления МВМ': { name: 'Продления МВМ', gross: 0, sales: 0, avgCheck: 0, order: 2, type: 'standard' },
    'Продления Повторка': { name: 'Продления Повторка', gross: 0, sales: 0, avgCheck: 0, order: 3, type: 'standard' },
    'Сарафанка': { name: 'Сарафанка', gross: 0, sales: 0, avgCheck: 0, order: 4, type: 'standard' },
    'Форсировка': { name: 'Форсировка', gross: 0, sales: 0, avgCheck: 0, order: 5, type: 'standard' },
    'Доплата / Предоплата': { name: 'Доплата / Предоплата', gross: 0, sales: 0, avgCheck: 0, order: 6, type: 'standard' },
    'Отмены': { name: 'Отмены', gross: 0, sales: 0, avgCheck: 0, order: 7, type: 'standard' }
  };

  // Динамическое определение имен листов на основе месяца даты отчета
  const months = {
    '01': 'Январь', '02': 'Февраль', '03': 'Март', '04': 'Апрель',
    '05': 'Май', '06': 'Июнь', '07': 'Июль', '08': 'Август',
    '09': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь'
  };
  const dateParts = targetDateStr.split('.');
  const monthIndex = dateParts[1] || '05';
  const monthName = months[monthIndex] || 'Май';
  
  const sheets = spreadsheet.getSheets();
  const lowerMonth = monthName.toLowerCase();
  
  sheets.forEach(function(sheet) {
    const sheetName = sheet.getName();
    const lowerName = sheetName.toLowerCase();
    
    // Ищем листы текущего месяца с нужными ключевыми словами
    if (lowerName.indexOf(lowerMonth) !== -1) {
      var isTargetSheet = false;
      if (lowerName.indexOf('продлен') !== -1 || lowerName.indexOf('отмен') !== -1) {
        isTargetSheet = true;
      }
      
      if (!isTargetSheet) return;
      
      const range = sheet.getDataRange();
      if (!range) return;

      const values = range.getValues();
      if (values.length <= 1) return; // Пустой лист или только шапка

      let sheetHasDataForDay = false;
      const normalizedSheetName = sheetName.toLowerCase();

      // Цикл по всем строкам (пропускаем заголовок i = 0)
      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        if (!row || row.length < 11) continue;

        // H - Дата (Индекс 7)
        const dateCell = row[7];
        if (!dateCell) continue;

        // Нормализуем дату в формат dd.MM.yyyy для сравнения
        let dateStr = '';
        if (dateCell instanceof Date) {
          // Если ячейка является объектом Date
          dateStr = Utilities.formatDate(dateCell, 'GMT', 'dd.MM.yyyy');
        } else {
          // Если это строка
          dateStr = String(dateCell).trim();
        }

        if (dateStr !== targetDateStr) continue;

        // J - ВАЛ (Индекс 9)
        const grossVal = parseCellNumber(row[9]);
        if (grossVal <= 0) continue;

        sheetHasDataForDay = true;
        totalGross += grossVal;
        totalSalesCount++;

        // K - ДОГОВОР (Индекс 10)
        const contractStr = normalizeString(row[10]);
        const isDvd = (contractStr === 'оферта отправлена');
        if (isDvd) {
          totalDvdCount++;
        }

        // Определяем категорию на основе имени листа и источника лида
        let categoryKey = null;

        if (normalizedSheetName.indexOf('отмен') !== -1) {
          // Правило: Все строки на листе Отмены относятся к категории Отмены
          categoryKey = 'Отмены';
        } else {
          // Обычные категории активных продаж с листа Продлений
          const leadSource = normalizeString(row[3]); // D - ОТКУДА ЛИД (Индекс 3)

          if (leadSource === 'улица') {
            categoryKey = 'УЛИЦА';
          } else if (leadSource.indexOf('мвм') !== -1) {
            categoryKey = 'Продления МВМ';
          } else if (leadSource.indexOf('повторка') !== -1) {
            categoryKey = 'Продления Повторка';
          } else if (leadSource.indexOf('сарафанка') !== -1) {
            categoryKey = 'Сарафанка';
          } else if (leadSource.indexOf('форсировка') !== -1) {
            categoryKey = 'Форсировка';
          } else if (leadSource.indexOf('доплат') !== -1 || leadSource.indexOf('предоплат') !== -1) {
            categoryKey = 'Доплата / Предоплата';
          }
        }

        if (categoryKey) {
          const cat = categories[categoryKey];
          cat.gross += grossVal;
          cat.sales++;

          if (cat.type === 'street') {
            cat.entered++;
            if (isDvd) {
              cat.dvd++;
            }
          }
        }
      }

      if (sheetHasDataForDay) {
        activeSheets.push(sheetName);
      }
    }
  });

  // Расчет среднего чека
  const overallAvgCheck = totalSalesCount > 0 ? (totalGross / totalSalesCount) : 0;

  for (const key in categories) {
    const cat = categories[key];
    cat.avgCheck = cat.sales > 0 ? (cat.gross / cat.sales) : 0;
  }

  // Если не нашли активных листов, возвращаем дефолтные имена для красивого заголовка
  var fallbackSheets = [
    'Общие продажи ' + monthName + ' (Продления)',
    'Общие продажи ' + monthName + ' (Отмены)'
  ];

  return {
    activeSheets: activeSheets.length > 0 ? activeSheets : fallbackSheets,
    totalGross: totalGross,
    totalSalesCount: totalSalesCount,
    averageCheck: overallAvgCheck,
    totalDvdCount: totalDvdCount,
    categories: categories
  };
}

/**
 * Формирует строковый текст отчета по строгому шаблону.
 */
function buildReportMessage(data, targetDateStr) {
  const sheetsStr = data.activeSheets.join(' / ');

  let msg = 'ОТЧЕТ ПРОДАЖ\n\n';
  msg += 'Дата: ' + targetDateStr + '\n';
  msg += 'Листы: ' + sheetsStr + '\n\n';
  msg += 'Общий вал: ' + formatCurrency(data.totalGross) + '\n';
  msg += 'Общие продажи: ' + data.totalSalesCount + '\n';
  msg += 'Средний чек: ' + formatCurrency(data.averageCheck) + '\n';

  // Сортировка категорий по установленному порядку
  const sortedKeys = Object.keys(data.categories).sort(function(a, b) {
    return data.categories[a].order - data.categories[b].order;
  });

  sortedKeys.forEach(function(key) {
    const cat = data.categories[key];
    // Пропускаем пустые категории
    if (cat.sales === 0 && cat.gross === 0) return;

    msg += '\n━━━━━━━━━━━━━━\n\n';
    msg += cat.name + '\n\n';
    msg += 'Вал: ' + formatCurrency(cat.gross) + '\n';

    if (cat.type === 'street') {
      msg += 'Продажи: ' + cat.sales + '\n';
      msg += 'Кол-во зашедших: ' + cat.entered + '\n';
      msg += 'Продажи ДВД: ' + cat.dvd + '\n';
    } else {
      msg += 'Продажи: ' + cat.sales + '\n';
    }

    msg += 'Средний чек: ' + formatCurrency(cat.avgCheck) + '\n';
  });

  msg += '\n━━━━━━━━━━━━━━\n\n';
  msg += 'ДВД отправлено: ' + data.totalDvdCount + '\n\n';
  msg += 'Отчет сформирован автоматически';

  return msg;
}

/**
 * Отправляет сообщение в Telegram получателям.
 */
function sendTelegramNotification(text) {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty('BOT_TOKEN');
  const chatIdsStr = properties.getProperty('CHAT_ID');

  if (!token) {
    throw new Error('Настройка BOT_TOKEN не задана в Свойствах сценария.');
  }
  if (!chatIdsStr) {
    throw new Error('Настройка CHAT_ID не задана в Свойствах сценария.');
  }

  const chatIds = chatIdsStr.split(',').map(function(id) {
    return id.trim();
  }).filter(function(id) {
    return id.length > 0;
  });

  chatIds.forEach(function(chatId) {
    const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
    const payload = {
      'chat_id': chatId,
      'text': text
    };

    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };

    try {
      const response = UrlFetchApp.fetch(url, options);
      const resCode = response.getResponseCode();
      if (resCode !== 200) {
        Logger.log('Ошибка при отправке в чат ' + chatId + ': ' + response.getContentText());
      } else {
        Logger.log('Отчет успешно отправлен в чат: ' + chatId);
      }
    } catch (e) {
      Logger.log('Сетевая ошибка при отправке Telegram: ' + e.message);
    }
  });
}

/**
 * Парсит значения ячеек в чистые числа.
 */
function parseCellNumber(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;

  let str = String(val).trim();
  if (!str) return 0;

  // Очистка от пробелов и неразрывных пробелов
  str = str.replace(/[\s\u00A0]/g, '');
  // Заменяем запятую на точку в качестве десятичного разделителя
  str = str.replace(/,/g, '.');

  // Если точек несколько, убираем разделители тысяч
  const parts = str.split('.');
  if (parts.length > 2) {
    const last = parts.pop();
    str = parts.join('') + '.' + last;
  }

  // Оставляем только цифры, точки и минусы
  str = str.replace(/[^0-9.-]/g, '');

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Очищает и приводит строки к нижнему регистру для надежного сопоставления.
 */
function normalizeString(val) {
  if (!val) return '';
  return String(val).trim().toLowerCase();
}

/**
 * Форматирует числа как тенге с разделением тысяч пробелом.
 */
function formatCurrency(num) {
  if (num === null || num === undefined || isNaN(num)) {
    return '0 ₸';
  }
  const rounded = Math.round(num);
  // Регулярное выражение для разделения разрядов тысяч пробелом
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return formatted + ' ₸';
}

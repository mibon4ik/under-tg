/**
 * Google Apps Script версия для автоматического Telegram-отчета продаж
 * 
 * ИНСТРУКЦИЯ ПО УСТАНОВКЕ:
 * 1. В вашей Google Таблице выберите "Расширения" -> "Apps Script" (Extensions -> Apps Script).
 * 2. Удалите стандартный шаблон кода и вставьте содержимое этого файла.
 * 3. На панели слева выберите "Настройки проекта" (Project Settings, иконка шестеренки).
 * 4. В разделе "Свойства сценария" (Script Properties) добавьте следующие свойства:
 *    - BOT_TOKEN : Токен вашего Telegram бота (например: 7123456789:ABCdefGh...)
 *    - CHAT_ID   : ID чатов получателей через запятую (например: -1001234567890,987654321)
 *    - TIMEZONE  : Часовой пояс (по умолчанию: Asia/Almaty)
 * 5. Нажмите кнопку "Сохранить" (Save, иконка дискеты).
 * 6. Для автоматизации: перейдите в раздел "Триггеры" (Triggers, иконка часов на панели слева):
 *    - Нажмите "Добавить триггер" (Add Trigger).
 *    - Выберите функцию для запуска: "dailySalesReportFlow".
 *    - Источник мероприятия: "По времени" (Time-driven).
 *    - Тип триггера по времени: "По дням" (Day timer).
 *    - Время суток: "с 21:00 до 22:00" (9pm to 10pm).
 *    - Нажмите "Сохранить".
 */

// Динамическое считывание листов на основе месяца даты отчета (например, "Общие продажи Май (Продления)")

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
    'Отмены': { name: 'Отмены', gross: 0, sales: 0, avgCheck: 0, order: 6, type: 'standard' }
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
  const resolvedSheetsList = [
    'Общие продажи ' + monthName + ' (Продления)',
    'Общие продажи ' + monthName + ' (Отмены)'
  ];

  resolvedSheetsList.forEach(function(sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log('Предупреждение: Лист "' + sheetName + '" не найден.');
      return;
    }

    const range = sheet.getDataRange();
    if (!range) return;

    const values = range.getValues();
    if (values.length <= 1) return; // Пустой лист или только шапка

    let sheetHasDataForDay = false;

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
      const normalizedSheetName = sheetName.toLowerCase();

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
  });

  // Расчет среднего чека
  const overallAvgCheck = totalSalesCount > 0 ? (totalGross / totalSalesCount) : 0;

  for (const key in categories) {
    const cat = categories[key];
    cat.avgCheck = cat.sales > 0 ? (cat.gross / cat.sales) : 0;
  }

  return {
    activeSheets: activeSheets.length > 0 ? activeSheets : resolvedSheetsList,
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

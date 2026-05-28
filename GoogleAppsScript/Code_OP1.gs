/**
/**
 * Google Apps Script версия для автоматического Telegram-отчета продаж (ОТДЕЛ ОП1)
 * 
 * Данный скрипт работает как API Web App (для Node.js бэкенда на Railway).
 * Возвращает все строки из листов вида "Общие продажи Май" по запросу бэкенда.
 * 
 * ИНСТРУКЦИЯ ПО РАЗВЕРТЫВАНИЮ:
 * 1. В вашей Google Таблице ОП1 выберите "Расширения" -> "Apps Script".
 * 2. Удалите стандартный шаблон кода и вставьте содержимое этого файла.
 * 3. Нажмите кнопку "Сохранить" (иконка дискеты).
 * 4. Нажмите синюю кнопку "Начало развертывания" -> "Новое развертывание".
 * 5. Выберите тип развертывания: "Веб-приложение" (Web App).
 * 6. Настройте конфигурацию:
 *    - Описание: "under-tg-sales-op1-api"
 *    - Запуск от имени: "Вы" (Me, ваш аккаунт)
 *    - Кто имеет доступ: "Все" (Anyone)
 * 7. Нажмите кнопку "Развернуть". 
 * 8. Предоставьте разрешения скрипту (Authorize access).
 * 9. Скопируйте полученный URL веб-приложения и вставьте его в настройки на Railway в переменную APPS_SCRIPT_URL_OP1 (и в локальный файл .env).
 */

function doGet(e) {
  try {
    var p = e && e.parameter ? e.parameter : {};
    var action = p.action || '';
    var date = p.date || '';
    
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
    
    var months = {
      '01': 'Январь', '02': 'Февраль', '03': 'Март', '04': 'Апрель',
      '05': 'Май', '06': 'Июнь', '07': 'Июль', '08': 'Август',
      '09': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь'
    };
    
    // Если дата не передана, берем текущую дату по времени Almaty
    var targetDate = date || Utilities.formatDate(new Date(), 'Asia/Almaty', 'dd.MM.yyyy');
    var parts = targetDate.split('.');
    var monthIndex = parts[1] || '05';
    var monthName = months[monthIndex] || 'Май';
    
    var result = {};
    var sheets = ss.getSheets();
    var lowerMonth = monthName.toLowerCase();
    
    sheets.forEach(function(sh) {
      var name = sh.getName();
      var lowerName = name.toLowerCase();
      
      // Ищем листы, содержащие имя месяца, исключая листы продлений/отмен другого отдела
      if (lowerName.indexOf(lowerMonth) !== -1) {
        if (lowerName.indexOf('продлен') === -1 && lowerName.indexOf('отмен') === -1) {
          var range = sh.getDataRange();
          result[name] = range ? range.getDisplayValues() : [];
        }
      }
    });
    
    return crmJson_({
      ok: true,
      date: targetDate,
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

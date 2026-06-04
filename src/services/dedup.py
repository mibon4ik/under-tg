# -*- coding: utf-8 -*-
import os
import sys
import time
import argparse
import json
import re
import requests
import pandas as pd

def normalize_phone(phone):
    """
    Алгоритм нормализации номера к стандарту E.164 (11 цифр, начинается с 7).
    1. Удалить все символы, кроме цифр.
    2. Если длина 11 и начинается с 8 -> заменить первую 8 на 7.
    3. Если длина 11 и начинается с 7 -> оставить без изменений.
    4. Если длина 10 -> добавить 7 в начало.
    5. Остальные форматы считаются невалидными.
    """
    if pd.isna(phone) or phone is None:
        return ""
    
    # Приведение к строке, обработка float (например, 77758071695.0 -> 77758071695)
    phone_str = str(phone).strip()
    if phone_str.endswith('.0'):
        phone_str = phone_str[:-2]
        
    # 1. Удаляем все символы, кроме цифр
    digits = re.sub(r'\D', '', phone_str)
    
    # 2. Длина 11 и начинается с 8
    if len(digits) == 11 and digits.startswith('8'):
        digits = '7' + digits[1:]
    # 3. Длина 11 и начинается с 7 -> оставляем как есть
    # 4. Длина 10 -> добавляем 7 в начало
    elif len(digits) == 10:
        digits = '7' + digits
        
    # Проверка на соответствие E.164 (11 цифр, начинается с 7)
    if len(digits) == 11 and digits.startswith('7'):
        return digits
    else:
        return ""

def fetch_amo_contacts(subdomain, token):
    """
    Выгружает все контакты из amoCRM по API (OAuth 2.0).
    Применяет пагинацию по 250 контактов и соблюдает лимиты.
    Возвращает множество (set) нормализованных рабочих телефонов.
    """
    crm_phones_set = set()
    page = 1
    limit = 250
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    contacts_url = f"https://{subdomain}.amocrm.ru/api/v4/contacts"
    
    # Счётчик для выгрузки
    total_fetched = 0
    sys.stderr.write("Начало выгрузки контактов из amoCRM...\n")
    sys.stderr.flush()
    
    while True:
        params = {
            "limit": limit,
            "page": page
        }
        
        retries = 5
        response = None
        
        for attempt in range(retries):
            try:
                response = requests.get(contacts_url, headers=headers, params=params, timeout=30)
                if response.status_code == 429:
                    # Too Many Requests - спим и пробуем снова
                    sleep_time = 1.5 * (attempt + 1)
                    sys.stderr.write(f"Превышен лимит запросов (429). Повтор через {sleep_time} сек...\n")
                    sys.stderr.flush()
                    time.sleep(sleep_time)
                    continue
                break
            except requests.exceptions.RequestException as e:
                if attempt == retries - 1:
                    raise Exception(f"Ошибка сетевого запроса к amoCRM: {e}")
                time.sleep(2)
        
        if response is None:
            raise Exception("Не удалось получить ответ от amoCRM после нескольких попыток.")
            
        # Обработка пустой страницы или окончания данных
        if response.status_code == 204:
            break
            
        if response.status_code != 200:
            raise Exception(f"Ошибка API amoCRM: HTTP {response.status_code}. Ответ: {response.text}")
            
        data = response.json()
        contacts = data.get("_embedded", {}).get("contacts", [])
        
        if not contacts:
            break
            
        for contact in contacts:
            custom_fields = contact.get("custom_fields_values") or []
            for field in custom_fields:
                if field.get("field_code") == "PHONE":
                    values = field.get("values") or []
                    for val in values:
                        # Фильтруем по WORK (Рабочий телефон)
                        enum_code = str(val.get("enum_code") or "").upper()
                        enum_name = str(val.get("enum") or "").upper() # На всякий случай
                        
                        if enum_code == "WORK" or enum_name == "WORK":
                            raw_phone = val.get("value")
                            norm_phone = normalize_phone(raw_phone)
                            if norm_phone:
                                crm_phones_set.add(norm_phone)
                                
        total_fetched += len(contacts)
        page += 1
        
        # Задержка 0.15 секунд для соблюдения лимитов 7 запросов в секунду
        time.sleep(0.15)
        
    sys.stderr.write(f"Выгрузка завершена. Всего контактов: {total_fetched}. Уникальных рабочих номеров в CRM: {len(crm_phones_set)}\n")
    sys.stderr.flush()
    return crm_phones_set

def process_file(input_path, output_path, crm_phones_set, phone_column, error_log_path):
    """
    Читает XLSX/CSV файл, фильтрует дубликаты и некорректные номера.
    Сохраняет очищенные лиды и записывает ошибки в лог.
    """
    sys.stderr.write(f"Чтение файла импорта: {input_path}\n")
    sys.stderr.flush()
    
    # Определение формата файла по расширению
    _, ext = os.path.splitext(input_path.lower())
    if ext == '.csv':
        # Попытка прочесть с разными кодировками/разделителями
        try:
            df = pd.read_csv(input_path, dtype=str)
        except Exception:
            df = pd.read_csv(input_path, sep=';', dtype=str, encoding='utf-8-sig')
    elif ext in ['.xlsx', '.xls']:
        df = pd.read_excel(input_path, dtype=str)
    else:
        raise Exception(f"Неподдерживаемый формат файла: {ext}")
        
    # Поиск нужного столбца телефона (регистронезависимо)
    target_col = None
    for col in df.columns:
        if str(col).strip().lower() == phone_column.strip().lower():
            target_col = col
            break
            
    if target_col is None:
        # Если точного совпадения нет, поищем столбец, содержащий слово "телефон"
        for col in df.columns:
            if "телефон" in str(col).lower() or "phone" in str(col).lower():
                target_col = col
                break
                
    if target_col is None:
        raise Exception(f"Столбец '{phone_column}' не найден в файле. Доступные столбцы: {', '.join(df.columns)}")
        
    sys.stderr.write(f"Используется столбец для проверки: '{target_col}'\n")
    sys.stderr.flush()
    
    unique_leads = []
    seen_in_file = set()
    
    stats = {
        "total_rows": len(df),
        "crm_duplicates": 0,
        "file_duplicates": 0,
        "invalid_format": 0,
        "clean_leads": 0
    }
    
    errors_list = []
    
    # Обработка каждой строки
    for index, row in df.iterrows():
        raw_val = row[target_col]
        row_num = index + 2  # С учетом заголовка (1-indexed)
        
        # Если ячейка пустая
        if pd.isna(raw_val) or str(raw_val).strip() == "":
            stats["invalid_format"] += 1
            errors_list.append(f"Строка {row_num}: Номер телефона пуст")
            continue
            
        norm_phone = normalize_phone(raw_val)
        
        if not norm_phone:
            stats["invalid_format"] += 1
            errors_list.append(f"Строка {row_num}: Некорректный формат телефона '{raw_val}'")
            continue
            
        # Проверка 1: Есть ли в базе CRM
        if norm_phone in crm_phones_set:
            stats["crm_duplicates"] += 1
            errors_list.append(f"Строка {row_num}: Номер '{raw_val}' ({norm_phone}) уже есть в amoCRM")
            continue
            
        # Проверка 2: Встречался ли номер в файле выше
        if norm_phone in seen_in_file:
            stats["file_duplicates"] += 1
            errors_list.append(f"Строка {row_num}: Номер '{raw_val}' ({norm_phone}) дублируется внутри файла")
            continue
            
        # Добавляем в обработанные
        seen_in_file.add(norm_phone)
        unique_leads.append(row)
        
    stats["clean_leads"] = len(unique_leads)
    
    # Запись логов ошибок
    with open(error_log_path, 'w', encoding='utf-8') as f:
        f.write("=== ЛОГ ОШИБОК И ПРОПУЩЕННЫХ НОМЕРОВ ===\n")
        f.write(f"Файл: {os.path.basename(input_path)}\n")
        f.write(f"Всего строк: {stats['total_rows']}\n")
        f.write(f"Успешно очищено: {stats['clean_leads']}\n")
        f.write(f"Дублей в CRM: {stats['crm_duplicates']}\n")
        f.write(f"Дублей в файле: {stats['file_duplicates']}\n")
        f.write(f"Невалидных номеров: {stats['invalid_format']}\n")
        f.write("----------------------------------------\n\n")
        for err in errors_list:
            f.write(err + "\n")
            
    # Сохранение очищенного файла
    if unique_leads:
        clean_df = pd.DataFrame(unique_leads)
        # Сохраняем в Excel
        clean_df.to_excel(output_path, index=False)
    else:
        # Если чистых строк не осталось, пишем пустую структуру с заголовками
        clean_df = pd.DataFrame(columns=df.columns)
        clean_df.to_excel(output_path, index=False)
        
    sys.stderr.write(f"Очищенный файл успешно сохранен: {output_path}\n")
    sys.stderr.write(f"Лог ошибок сохранен: {error_log_path}\n")
    sys.stderr.flush()
    
    return stats

def main():
    parser = argparse.ArgumentParser(description="amoCRM Deduplicator & Import Filter")
    parser.add_argument("--file", required=True, help="Путь к входному XLSX/CSV файлу")
    parser.add_argument("--output", required=True, help="Путь для сохранения очищенного XLSX")
    parser.add_argument("--subdomain", required=True, help="Субдомен amoCRM")
    parser.add_argument("--token", required=True, help="Long-lived Access Token amoCRM")
    parser.add_argument("--phone-col", default="Рабочий телефон", help="Название столбца телефона")
    parser.add_argument("--error-log", default="dedup_errors.log", help="Путь к файлу логов ошибок")
    
    args = parser.parse_args()
    
    try:
        # 1. Загрузка контактов из amoCRM
        crm_phones_set = fetch_amo_contacts(args.subdomain, args.token)
        
        # 2. Обработка файла
        stats = process_file(
            input_path=args.file,
            output_path=args.output,
            crm_phones_set=crm_phones_set,
            phone_column=args.phone_col,
            error_log_path=args.error_log
        )
        
        # Добавляем в статистику количество контактов в базе CRM
        stats["crm_contacts_count"] = len(crm_phones_set)
        
        # 3. Вывод итогового JSON результата в stdout для Node.js
        print(json.dumps({
            "success": True,
            "stats": stats
        }, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()

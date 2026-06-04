# -*- coding: utf-8 -*-
import unittest
from unittest.mock import patch, MagicMock
import pandas as pd
import tempfile
import os

from dedup import normalize_phone, process_file

class TestAmoDeduplication(unittest.TestCase):

    def test_normalize_phone_valid(self):
        # 1. Удаление спецсимволов и стандартные форматы
        self.assertEqual(normalize_phone("+7 (775) 807-16-95"), "77758071695")
        self.assertEqual(normalize_phone("7-775-807-1695"), "77758071695")
        self.assertEqual(normalize_phone(" 7 775 807 16 95 "), "77758071695")
        
        # 2. Начало с 8 -> замена на 7
        self.assertEqual(normalize_phone("87758071695"), "77758071695")
        self.assertEqual(normalize_phone("8 (775) 807 16 95"), "77758071695")
        
        # 3. Длина 10 -> автодобавление 7
        self.assertEqual(normalize_phone("7758071695"), "77758071695")
        self.assertEqual(normalize_phone("(775)8071695"), "77758071695")
        
        # 4. Длина 11 с 7 -> без изменений
        self.assertEqual(normalize_phone("77758071695"), "77758071695")

    def test_normalize_phone_invalid(self):
        # Короткие номера
        self.assertEqual(normalize_phone("775807"), "")
        self.assertEqual(normalize_phone("123"), "")
        
        # Длинные номера
        self.assertEqual(normalize_phone("8775807169542"), "")
        
        # Невалидное начало (не 7 и не 8 для 11 цифр)
        self.assertEqual(normalize_phone("97758071695"), "")
        
        # Пустые значения
        self.assertEqual(normalize_phone(""), "")
        self.assertEqual(normalize_phone(None), "")
        self.assertEqual(normalize_phone(pd.NA), "")

    def test_process_file_deduplication(self):
        # Создаем временный входной файл XLSX
        data = {
            "Рабочий телефон": [
                "+77758071695",  # 1. Дубль с CRM
                "87071234567",   # 2. Уникальный
                "7758071695",    # 3. Дубль с CRM (в другом формате)
                "87071234567",   # 4. Дубль внутри файла
                "некорректный",  # 5. Ошибка формата
                "87479998877"    # 6. Уникальный
            ],
            "Имя клиента": ["Иван", "Алексей", "Мария", "Алексей 2", "Петр", "Ольга"],
            "Филиал": ["Алматы", "Астана", "Алматы", "Астана", "Караганда", "Шымкент"]
        }
        df = pd.DataFrame(data)
        
        # Временные файлы для теста
        with tempfile.TemporaryDirectory() as tmpdir:
            input_file = os.path.join(tmpdir, "input.xlsx")
            output_file = os.path.join(tmpdir, "output.xlsx")
            log_file = os.path.join(tmpdir, "errors.log")
            
            df.to_excel(input_file, index=False)
            
            # База CRM: есть контакты с номерами 77758071695 (Иван/Мария)
            crm_phones = {"77758071695"}
            
            # Запускаем обработку
            stats = process_file(
                input_path=input_file,
                output_path=output_file,
                crm_phones_set=crm_phones,
                phone_column="Рабочий телефон",
                error_log_path=log_file
            )
            
            # Проверяем статистику
            self.assertEqual(stats["total_rows"], 6)
            self.assertEqual(stats["crm_duplicates"], 2)  # строки 1 и 3
            self.assertEqual(stats["file_duplicates"], 1) # строка 4
            self.assertEqual(stats["invalid_format"], 1)  # строка 5
            self.assertEqual(stats["clean_leads"], 2)      # строки 2 и 6
            
            # Проверяем, что выходной файл содержит ровно 2 строки
            clean_df = pd.read_excel(output_file)
            self.assertEqual(len(clean_df), 2)
            
            # Проверяем сохраненные имена
            clean_names = list(clean_df["Имя клиента"])
            self.assertIn("Алексей", clean_names)
            self.assertIn("Ольга", clean_names)
            self.assertNotIn("Иван", clean_names)
            
            # Проверяем, что лог ошибок создан и не пуст
            self.assertTrue(os.path.exists(log_file))
            with open(log_file, "r", encoding="utf-8") as f:
                logs = f.read()
                self.assertIn("дублируется внутри файла", logs)
                self.assertIn("уже есть в amoCRM", logs)
                self.assertIn("Некорректный формат телефона", logs)

if __name__ == "__main__":
    unittest.main()
